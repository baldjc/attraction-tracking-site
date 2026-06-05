/**
 * POST /api/ai-tools/idea-validation
 *
 * Wave 2 — Idea Validation Mode. Takes a member-typed video idea and checks
 * it against their latest validated facts library. Returns one of three
 * verdicts (supports / partial / contradicts) with cited fact ids.
 *
 * Cost budget: ≤ $0.05 per call (Sonnet, short system prompt cached, only
 * headline-safe facts sent in the user message).
 *
 * The system prompt is loaded from `idea-validation-prompt.ts` as a stable
 * constant so Anthropic prompt caching (`cache_control: { type: "ephemeral" }`)
 * hits on every call after the first.
 */
import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveUserFromSession } from "@/lib/session-utils";
import { getFeatureFlags } from "@/lib/feature-flags";
import { getCostCapStatus, isHardCapExempt, logUsage } from "@/lib/ai-tool-cost";
import {
  loadLatestValidatedUpload,
  loadHeadlineSafeFacts,
  loadMarketConfigSummary,
} from "@/lib/content-engine-context";
import { parseJsonResponse } from "@/lib/content-engine-validation";
import { IDEA_VALIDATION_SYSTEM_PROMPT } from "@/lib/idea-validation-prompt";
import {
  buildFocusConstraintBlock,
  parsePropertyTypeFocus,
  type PropertyTypeFocus,
} from "@/lib/property-type-focus";

export const runtime = "nodejs";
export const maxDuration = 60;

const SONNET_MODEL = "claude-sonnet-4-20250514";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface ValidationResponse {
  mode: "supports" | "partial" | "contradicts";
  reasoning: string;
  citedFacts: Array<{ id: string; supports: boolean; note: string }>;
  sharperFraming?: string;
  relatedAngles?: Array<{ angle: string; citedFactIds: string[] }>;
}

export async function POST(req: NextRequest) {
  // Impersonation-aware — resolve to the impersonated member so idea
  // validation reads the member's validated upload/facts and attributes
  // cost-cap usage to the member, not the admin account.
  const resolved = await resolveUserFromSession();
  if (!resolved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = resolved.id;
  const userRole = resolved.role;

  // Flag gate — admin/editor bypass via getFeatureFlags' isStaff check.
  const flags = await getFeatureFlags({ userId, userRole });
  if (!flags.tool_idea_validation) {
    return NextResponse.json({ error: "Not enabled" }, { status: 404 });
  }

  // Cost cap pre-check (v2 helper, $20 hard / $15 soft). Admin impersonating a
  // member is exempt from the HARD block (tokens still logged); real,
  // non-impersonated members stay fully capped.
  const cap = await getCostCapStatus(userId);
  if (cap.hardBlocked && !isHardCapExempt(resolved)) {
    return NextResponse.json(
      {
        error: "monthly_cost_cap_reached",
        message: `You've hit your $${cap.capUsd.toFixed(2)} monthly AI budget. It resets on the 1st of next month.`,
      },
      { status: 402 },
    );
  }

  let body: { idea?: string; propertyTypeFocus?: PropertyTypeFocus | string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const idea = body.idea?.trim();
  const propertyTypeFocus = parsePropertyTypeFocus(body.propertyTypeFocus ?? null);
  if (!idea || idea.length < 10) {
    return NextResponse.json(
      { error: "idea_too_short", message: "Tell me your idea in a sentence or two." },
      { status: 400 },
    );
  }
  if (idea.length > 2000) {
    return NextResponse.json(
      { error: "idea_too_long", message: "Trim the idea to under 2,000 characters." },
      { status: 400 },
    );
  }

  // Load the member's latest validated upload + its headline-safe facts. If
  // they haven't uploaded yet there's nothing to validate against.
  const upload = await loadLatestValidatedUpload(userId);
  if (!upload) {
    return NextResponse.json(
      {
        error: "no_validated_upload",
        message: "Upload market data first — Idea Validation needs a validated facts library to check against.",
      },
      { status: 409 },
    );
  }
  const config = await loadMarketConfigSummary(userId);

  // Cap the facts SENT to Claude at 50 to stay inside the $0.05 budget.
  // Validator typically produces 80-200 headline-safe facts per upload. We load
  // a wide candidate set ordered NEIGHBOURHOOD-first (so every metric family is
  // represented even if the take cap bites in a wide market), then round-robin
  // across families down to 50 so families that sort LATE in the canonical enum
  // order (SP_LP / sale-to-list, FAILURE_RATE) aren't starved. Without both the
  // neighbourhood-first ordering AND the round-robin, a market with many
  // neighbourhoods would fill every slot with MOI/PSF/MEDIAN/DOM facts and the
  // model would never see a sale-to-list ratio — wrongly reporting "no SP/LP
  // data" for ideas about bidding intensity.
  const candidateFacts = await loadHeadlineSafeFacts(
    upload.id,
    upload.monthYear,
    { limit: 500, orderByNeighbourhoodFirst: true },
  );
  const facts = balanceFactsByFamily(candidateFacts, 50);
  if (facts.length === 0) {
    return NextResponse.json(
      {
        error: "no_headline_safe_facts",
        message: "Your latest upload didn't produce any headline-safe facts. Re-run validation or upload a fresher month.",
      },
      { status: 409 },
    );
  }

  // ── Anthropic call ──────────────────────────────────────────────────
  const systemBlocks = [
    {
      type: "text",
      text: IDEA_VALIDATION_SYSTEM_PROMPT,
      cache_control: { type: "ephemeral" as const },
    },
  ];

  const userMessage = buildUserMessage({
    idea,
    facts,
    marketName: config?.marketName ?? "your market",
    propertyTypeFocus,
  });

  let resp: Anthropic.Messages.Message;
  try {
    resp = await anthropic.messages.create({
      model: SONNET_MODEL,
      max_tokens: 2000,
      system: systemBlocks as unknown as Anthropic.Messages.TextBlockParam[],
      messages: [{ role: "user", content: userMessage }],
    });
  } catch (err) {
    const msg = (err as { message?: string })?.message ?? String(err);
    console.error("[idea-validation] anthropic error:", msg);
    return NextResponse.json(
      { error: "claude_call_failed", message: "The validator is unavailable right now. Try again in a moment." },
      { status: 502 },
    );
  }

  const usage = resp.usage as unknown as {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  await logUsage(
    userId,
    "idea_validation",
    usage.input_tokens,
    usage.output_tokens,
  );

  const text = resp.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();

  let parsed: ValidationResponse;
  try {
    parsed = parseJsonResponse<ValidationResponse>(text);
  } catch (err) {
    console.error(
      "[idea-validation] failed to parse response as JSON:",
      (err as Error).message,
      "raw:",
      text.slice(0, 500),
    );
    return NextResponse.json(
      { error: "parse_failed", message: "The validator returned an unexpected shape. Try again." },
      { status: 502 },
    );
  }

  // Light shape check — surface a 502 rather than passing garbage to the UI.
  if (!parsed || !["supports", "partial", "contradicts"].includes(parsed.mode)) {
    return NextResponse.json(
      { error: "invalid_mode", message: "Validator returned an unknown mode." },
      { status: 502 },
    );
  }

  // Belt-and-braces: cross-reference cited fact ids against the headline-
  // safe set we sent. Strip any hallucinated ids so the UI never tries to
  // link to a fact that doesn't exist.
  const knownIds = new Set(facts.map((f) => f.id));
  const originalCited = Array.isArray(parsed.citedFacts) ? parsed.citedFacts : [];
  const survivingCited = originalCited.filter((c) => knownIds.has(c.id));
  parsed.citedFacts = survivingCited;
  const droppedHallucinatedCount = originalCited.length - survivingCited.length;

  if (Array.isArray(parsed.relatedAngles)) {
    parsed.relatedAngles = parsed.relatedAngles.map((a) => ({
      ...a,
      citedFactIds: (a.citedFactIds ?? []).filter((id) => knownIds.has(id)),
    }));
  }

  // ── Recompute verdict from surviving cited facts ────────────────────
  // The model's `mode` is built from its pre-filter reasoning chain, so if
  // any of its evidence got dropped by the hallucination filter the verdict
  // can be wildly wrong (e.g. claiming "contradicts" because of an invented
  // MOI number that we just filtered out). Re-derive the verdict from the
  // surviving citedFacts' `supports` booleans instead.
  let supportingCount = 0;
  let contradictingCount = 0;
  for (const c of survivingCited) {
    if (c.supports === true) supportingCount += 1;
    else if (c.supports === false) contradictingCount += 1;
  }

  let recomputedMode: ValidationResponse["mode"] | null;
  if (supportingCount === 0 && contradictingCount === 0) {
    recomputedMode = null;
  } else if (supportingCount >= 2 && contradictingCount === 0) {
    recomputedMode = "supports";
  } else if (supportingCount >= 1 && contradictingCount >= 1) {
    recomputedMode = "partial";
  } else if (supportingCount === 0 && contradictingCount >= 1) {
    recomputedMode = "contradicts";
  } else {
    // supportingCount === 1 && contradictingCount === 0 — single supporting
    // fact is too thin to call "supports" outright; treat as partial so the
    // member still gets sharper framing.
    recomputedMode = "partial";
  }

  const requestId = resp.id;

  if (recomputedMode === null) {
    console.warn(
      `[idea-validation] ${requestId}: no valid cited facts after hallucination filter (dropped=${droppedHallucinatedCount}, claimedMode=${parsed.mode}) — returning 422.`,
    );
    return NextResponse.json(
      {
        error: "no_valid_facts",
        message:
          "Your facts library didn't contain enough evidence to validate this idea. Try a different angle or upload fresher data.",
      },
      { status: 422 },
    );
  }

  let verdictRecomputed = false;
  if (recomputedMode !== parsed.mode) {
    verdictRecomputed = true;
    console.warn(
      `[idea-validation] ${requestId}: verdict overridden ${parsed.mode} → ${recomputedMode} ` +
        `(supporting=${supportingCount}, contradicting=${contradictingCount}, droppedHallucinated=${droppedHallucinatedCount})`,
    );
    parsed.mode = recomputedMode;

    // When the verdict flips because hallucinated evidence got filtered out,
    // the model's sharperFraming and relatedAngles were built on reasoning
    // that no longer applies. Drop them — except in the "partial" case where
    // sharper framing is genuinely useful (verdict is still mixed).
    if (recomputedMode !== "partial") {
      delete parsed.sharperFraming;
      delete parsed.relatedAngles;
    }
  }

  return NextResponse.json({
    ...parsed,
    upload: { id: upload.id, monthYear: upload.monthYear, label: upload.label },
    factsConsidered: facts.length,
    verdictRecomputed,
  });
}

/**
 * Round-robin facts across metric families so a hard cap doesn't starve
 * families that sort late in the canonical enum order (SP_LP, FAILURE_RATE).
 * Each family keeps its incoming order (the query sorts by neighbourhood).
 */
function balanceFactsByFamily<T extends { metricFamily: string }>(
  facts: T[],
  cap: number,
): T[] {
  if (facts.length <= cap) return facts;
  const byFamily = new Map<string, T[]>();
  for (const f of facts) {
    const arr = byFamily.get(f.metricFamily);
    if (arr) arr.push(f);
    else byFamily.set(f.metricFamily, [f]);
  }
  const groups = [...byFamily.values()];
  const picked: T[] = [];
  for (let i = 0; picked.length < cap; i++) {
    let progressed = false;
    for (const g of groups) {
      if (i < g.length) {
        picked.push(g[i]);
        progressed = true;
        if (picked.length >= cap) break;
      }
    }
    if (!progressed) break;
  }
  return picked;
}

function buildUserMessage(args: {
  idea: string;
  facts: ReadonlyArray<unknown>;
  marketName: string;
  propertyTypeFocus: PropertyTypeFocus;
}): string {
  return [
    `Market: ${args.marketName}`,
    "",
    "Member's video idea:",
    args.idea,
    "",
    buildFocusConstraintBlock(args.propertyTypeFocus),
    "",
    `Validated facts library (${args.facts.length} headline-safe facts). Cite by \`id\`:`,
    "```json",
    JSON.stringify(args.facts, null, 2),
    "```",
    "",
    "Return your verdict as raw JSON only — no markdown fence, no prose.",
  ].join("\n");
}

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
import { auth } from "@/lib/auth";
import { getFeatureFlags } from "@/lib/feature-flags";
import { getCostCapStatus, logUsage } from "@/lib/ai-tool-cost";
import {
  loadLatestValidatedUpload,
  loadHeadlineSafeFacts,
  loadMarketConfigSummary,
} from "@/lib/content-engine-context";
import { parseJsonResponse } from "@/lib/content-engine-validation";
import { IDEA_VALIDATION_SYSTEM_PROMPT } from "@/lib/idea-validation-prompt";

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
  const session = await auth();
  const userId = session?.user?.id;
  const userRole = session?.user?.role ?? null;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Flag gate — admin/editor bypass via getFeatureFlags' isStaff check.
  const flags = await getFeatureFlags({ userId, userRole });
  if (!flags.tool_idea_validation) {
    return NextResponse.json({ error: "Not enabled" }, { status: 404 });
  }

  // Cost cap pre-check (v2 helper, $20 hard / $15 soft).
  const cap = await getCostCapStatus(userId);
  if (cap.hardBlocked) {
    return NextResponse.json(
      {
        error: "monthly_cost_cap_reached",
        message: `You've hit your $${cap.capUsd.toFixed(2)} monthly AI budget. It resets on the 1st of next month.`,
      },
      { status: 402 },
    );
  }

  let body: { idea?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const idea = body.idea?.trim();
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

  // Cap facts at 50 to stay inside the $0.05 budget. Validator typically
  // produces 80-200 headline-safe facts per upload; the relevance heuristic
  // here (slice top-N by canonical ordering) is intentionally simple — the
  // member's idea is short and Claude does the matching, so we'd be guessing
  // at relevance anyway. If we see the cap bite in practice we can swap in
  // a neighbourhood-match heuristic.
  const facts = await loadHeadlineSafeFacts(upload.id, upload.monthYear, {
    limit: 50,
  });
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
  if (Array.isArray(parsed.citedFacts)) {
    parsed.citedFacts = parsed.citedFacts.filter((c) => knownIds.has(c.id));
  }
  if (Array.isArray(parsed.relatedAngles)) {
    parsed.relatedAngles = parsed.relatedAngles.map((a) => ({
      ...a,
      citedFactIds: (a.citedFactIds ?? []).filter((id) => knownIds.has(id)),
    }));
  }

  return NextResponse.json({
    ...parsed,
    upload: { id: upload.id, monthYear: upload.monthYear, label: upload.label },
    factsConsidered: facts.length,
  });
}

function buildUserMessage(args: {
  idea: string;
  facts: Array<Record<string, unknown>>;
  marketName: string;
}): string {
  return [
    `Market: ${args.marketName}`,
    "",
    "Member's video idea:",
    args.idea,
    "",
    `Validated facts library (${args.facts.length} headline-safe facts). Cite by \`id\`:`,
    "```json",
    JSON.stringify(args.facts, null, 2),
    "```",
    "",
    "Return your verdict as raw JSON only — no markdown fence, no prose.",
  ].join("\n");
}

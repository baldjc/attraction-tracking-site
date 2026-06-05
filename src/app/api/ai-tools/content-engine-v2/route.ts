/**
 * POST /api/ai-tools/content-engine-v2
 *
 * Wave 2 — Content Engine v2 idea generation. Returns a JSON batch of 5
 * idea cards anchored on the member's validated facts library, with
 * optional Story Lead or validated-idea context.
 *
 * Cost budget: ≤ $0.25 per batch (Sonnet, full Content Engine Mode prompt
 * cached, dynamic context kept compact).
 *
 * Server-side validation gate (`content-engine-validation.ts`) runs on
 * every card before we return — failures trigger a re-prompt loop (max 2
 * retries) where Claude is told exactly which cards failed and why.
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
  loadStoryLead,
  type CompactFact,
  type MarketConfigSummary,
  type StoryLeadDetail,
} from "@/lib/content-engine-context";
import {
  ROTATION_SLOTS,
  matchesHood,
  parseJsonResponse,
  validateIdeaCard,
  type IdeaCard,
  type RotationSlotKey,
} from "@/lib/content-engine-validation";
import { CONTENT_ENGINE_MODE_PROMPT } from "@/lib/content-engine-mode-prompt";
import {
  buildFocusConstraintBlock,
  parsePropertyTypeFocus,
  type PropertyTypeFocus,
} from "@/lib/property-type-focus";

export const runtime = "nodejs";
export const maxDuration = 120;

const SONNET_MODEL = "claude-sonnet-4-20250514";
const MAX_REPROMPTS = 2;
const DEFAULT_IDEA_COUNT = 5;
const FACTS_LIMIT = 120;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface RequestBody {
  rotationSlot?: RotationSlotKey;
  storyLeadId?: string;
  validatedIdea?: string;
  count?: number;
  /** Wave 4 — property-type lock from the wizard (Any|Detached|…). */
  propertyTypeFocus?: PropertyTypeFocus | string | null;
}

interface BatchResponse {
  ideas: IdeaCard[];
}

export async function POST(req: NextRequest) {
  // Impersonation-aware — resolve to the impersonated member so idea
  // generation reads the member's validated upload/facts and attributes
  // cost-cap usage to the member, not the admin account.
  const resolved = await resolveUserFromSession();
  if (!resolved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = resolved.id;
  const userRole = resolved.role;

  const flags = await getFeatureFlags({ userId, userRole });
  if (!flags.tool_content_engine_v2) {
    return NextResponse.json({ error: "Not enabled" }, { status: 404 });
  }

  // Admin impersonating a member is exempt from the HARD block (tokens still
  // logged); real, non-impersonated members stay fully capped.
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

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Optional rotation slot validation — falls through to Claude's INTAKE
  // step when unspecified (the cached prompt knows how to pick a rotation
  // order for batch generation).
  if (
    body.rotationSlot &&
    !ROTATION_SLOTS.includes(body.rotationSlot)
  ) {
    return NextResponse.json(
      { error: "invalid_rotation_slot", allowed: ROTATION_SLOTS },
      { status: 400 },
    );
  }
  const count = Math.min(Math.max(body.count ?? DEFAULT_IDEA_COUNT, 1), 10);
  const propertyTypeFocus = parsePropertyTypeFocus(body.propertyTypeFocus ?? null);

  // Load the per-member context. All three are required-or-empty: no upload
  // → 409, no config → 409, no headline-safe facts → 409. Each error tells
  // the wizard exactly which prerequisite to send the member to.
  const upload = await loadLatestValidatedUpload(userId);
  if (!upload) {
    return NextResponse.json(
      {
        error: "no_validated_upload",
        message: "Upload market data first — Content Engine v2 needs a validated facts library.",
      },
      { status: 409 },
    );
  }
  const config = await loadMarketConfigSummary(userId);
  if (!config) {
    return NextResponse.json(
      {
        error: "no_market_config",
        message: "Configure your market (avatar, sub-personas, keyword kit) before generating ideas.",
      },
      { status: 409 },
    );
  }
  const allFacts = await loadHeadlineSafeFacts(upload.id, upload.monthYear, {
    limit: FACTS_LIMIT,
  });
  // Wave 4 beta — Finding 10: server-side property-type data filter.
  // When the wizard locked a non-Any focus, prune facts whose
  // propertyType is a different SPECIFIC type BEFORE the LLM call so
  // Claude can't drift into Detached numbers on a Row/Townhouse video.
  // We keep:
  //   - facts whose propertyType matches the lock (e.g. "Row/Townhouse")
  //   - city/neighbourhood rollups (propertyType === null)
  //   - "All" rollups (propertyType === "All")
  // The prompt-side HARD CONSTRAINT block (buildFocusConstraintBlock)
  // backstops this — but pre-filtering means the LLM never even sees
  // the wrong-type rows, removing a class of failure modes.
  const facts =
    propertyTypeFocus === "Any"
      ? allFacts
      : allFacts.filter(
          (f) =>
            f.propertyType === null ||
            f.propertyType === "All" ||
            f.propertyType === propertyTypeFocus,
        );
  if (facts.length < 3) {
    return NextResponse.json(
      {
        error: "no_headline_safe_facts",
        message:
          propertyTypeFocus === "Any"
            ? "Your latest upload doesn't have enough headline-safe facts (need ≥3). Re-run validation or upload a fresher month."
            : `Your latest upload doesn't have enough headline-safe facts for ${propertyTypeFocus} (need ≥3 after the property-type filter). Try a different focus or upload a fresher month.`,
      },
      { status: 409 },
    );
  }

  let storyLead: StoryLeadDetail | null = null;
  if (body.storyLeadId) {
    storyLead = await loadStoryLead(userId, body.storyLeadId);
    if (!storyLead) {
      return NextResponse.json(
        { error: "story_lead_not_found" },
        { status: 404 },
      );
    }
  }

  // Wave 4 beta — Finding 8 HARD ANCHOR. When a Story Lead is selected
  // we derive the set of fact IDs that the lead actually anchors (its
  // named neighbourhood(s), parsed out of pattern + dataThreads with
  // word-boundary matching so e.g. "Bridgeland" doesn't pull in
  // "Bridgeland-Riverside" rows and vice-versa) and trim the LLM's
  // fact pool to ONLY those facts (plus city-wide rollups whose
  // neighbourhood is empty/All). The validator (below) backstops this
  // server-side so even prompt-drift can't slip an off-scope cite past
  // the gate.
  let storyLeadFactIds: Set<string> | null = null;
  let storyLeadHoodFactIds: Set<string> | null = null;
  let factsForLlm: CompactFact[] = facts;
  if (storyLead) {
    const leadHoods = extractLeadNeighbourhoods(storyLead, config.neighbourhoods);
    if (leadHoods.length > 0) {
      const marketLower = config.marketName.toLowerCase();
      // Partition facts into:
      //   - hoodScoped: facts whose neighbourhood EXACTLY matches one of
      //     the lead-named hoods (after lowercasing) — these anchor the
      //     story.
      //   - cityRollup: city/All rows — kept as supplemental context.
      // Anything else (other hoods) is excluded entirely.
      const hoodScoped: CompactFact[] = [];
      const cityRollup: CompactFact[] = [];
      for (const f of facts) {
        const hood = (f.neighbourhood ?? "").trim().toLowerCase();
        if (!hood || hood === "all" || hood === "city" || hood === marketLower) {
          cityRollup.push(f);
        } else if (leadHoods.includes(hood)) {
          hoodScoped.push(f);
        }
      }
      // Only enforce the lock if there's at least one hood-scoped fact
      // — otherwise the validator's "cite ≥1 hood fact" rule would
      // 422-storm every batch on a thin upload for that hood. Fall
      // back to prompt-only enforcement in that edge case.
      if (hoodScoped.length >= 1 && hoodScoped.length + cityRollup.length >= 3) {
        factsForLlm = [...hoodScoped, ...cityRollup];
        storyLeadFactIds = new Set(factsForLlm.map((f) => f.id));
        storyLeadHoodFactIds = new Set(hoodScoped.map((f) => f.id));
      }
    }
  }

  const headlineSafeIds = new Set(factsForLlm.map((f) => f.id));

  // ── Generate + validate + (up to 2) re-prompts ──────────────────────
  const systemBlocks = [
    {
      type: "text",
      text: CONTENT_ENGINE_MODE_PROMPT,
      cache_control: { type: "ephemeral" as const },
    },
  ];

  // Accumulate token usage across all attempts so the cost-cap log captures
  // the full batch (initial + re-prompts), not just the last call.
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let validIdeas: IdeaCard[] = [];
  let perCardErrors: Array<{ index: number; errors: string[] }> = [];
  let lastRawIdeas: unknown[] = [];

  for (let attempt = 0; attempt <= MAX_REPROMPTS; attempt++) {
    const userMessage =
      attempt === 0
        ? buildInitialUserMessage({
            rotationSlot: body.rotationSlot,
            count,
            config,
            facts: factsForLlm,
            storyLead,
            validatedIdea: body.validatedIdea,
            monthYear: upload.monthYear,
            propertyTypeFocus,
          })
        : buildRetryUserMessage({
            previousIdeas: lastRawIdeas,
            perCardErrors,
            count,
            propertyTypeFocus,
          });

    let resp: Anthropic.Messages.Message;
    try {
      resp = await anthropic.messages.create({
        model: SONNET_MODEL,
        max_tokens: 8000,
        system: systemBlocks as unknown as Anthropic.Messages.TextBlockParam[],
        messages: [{ role: "user", content: userMessage }],
      });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? String(err);
      console.error("[content-engine-v2] anthropic error:", msg);
      // Always charge for whatever has been spent so far — admins are
      // exempt, members shouldn't pay nothing for a partially-spent batch.
      if (totalInputTokens || totalOutputTokens) {
        await logUsage(userId, "content_engine_v2", totalInputTokens, totalOutputTokens);
      }
      return NextResponse.json(
        { error: "claude_call_failed", message: "Idea generation is unavailable right now. Try again in a moment." },
        { status: 502 },
      );
    }

    const usage = resp.usage as unknown as {
      input_tokens: number;
      output_tokens: number;
    };
    totalInputTokens += usage.input_tokens;
    totalOutputTokens += usage.output_tokens;

    const text = resp.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();

    let parsed: BatchResponse;
    try {
      parsed = parseJsonResponse<BatchResponse>(text);
    } catch (err) {
      console.error(
        `[content-engine-v2] attempt=${attempt} parse failed:`,
        (err as Error).message,
        "raw:",
        text.slice(0, 500),
      );
      // Keep trying — but if we just exhausted retries, surface a 502.
      if (attempt === MAX_REPROMPTS) {
        await logUsage(userId, "content_engine_v2", totalInputTokens, totalOutputTokens);
        return NextResponse.json(
          { error: "parse_failed", message: "Idea generator returned an unparseable response after retries." },
          { status: 502 },
        );
      }
      perCardErrors = [{ index: -1, errors: ["response wasn't valid JSON — re-emit the full {ideas: [...]} payload"] }];
      lastRawIdeas = [];
      continue;
    }

    const rawIdeas = Array.isArray(parsed.ideas) ? parsed.ideas : [];
    lastRawIdeas = rawIdeas;

    // Run the validation gate per-card.
    validIdeas = [];
    perCardErrors = [];
    for (let i = 0; i < rawIdeas.length; i++) {
      const result = validateIdeaCard(
        rawIdeas[i],
        headlineSafeIds,
        config.neighbourhoods,
        storyLeadFactIds,
        storyLeadHoodFactIds,
        body.rotationSlot ?? null,
      );
      if (result.ok) {
        validIdeas.push(rawIdeas[i] as IdeaCard);
      } else {
        perCardErrors.push({ index: i, errors: result.errors });
      }
    }

    if (validIdeas.length >= count) {
      // Trim to requested count and return.
      validIdeas = validIdeas.slice(0, count);
      break;
    }
    // Otherwise loop with a re-prompt that names each failed card's errors.
    console.warn(
      `[content-engine-v2] attempt=${attempt} valid=${validIdeas.length}/${count}, retrying with ${perCardErrors.length} failures`,
    );
  }

  await logUsage(userId, "content_engine_v2", totalInputTokens, totalOutputTokens);

  if (validIdeas.length === 0) {
    return NextResponse.json(
      {
        error: "validation_gate_failed",
        message:
          "Couldn't generate ideas that pass the title rules after 2 retries. Try again with a different rotation slot or refresh your facts library.",
        perCardErrors,
      },
      { status: 422 },
    );
  }

  return NextResponse.json({
    ideas: validIdeas,
    upload: { id: upload.id, monthYear: upload.monthYear, label: upload.label },
    storyLeadId: storyLead?.id ?? null,
    factsConsidered: facts.length,
    requestedCount: count,
    returnedCount: validIdeas.length,
    partial: validIdeas.length < count,
  });
}

// ──────────────────────────────────────────────────────────────────────
// User-message builders
// ──────────────────────────────────────────────────────────────────────

/**
 * Initial generation request. Packs the rotation slot, member's market
 * config (avatar / sub-personas / keyword kit / neighbourhoods), the
 * headline-safe facts library, and optionally the selected Story Lead and/or
 * validated idea into a single user message. The OUTPUT FORMAT override at
 * the bottom is what flips Claude from the system prompt's markdown-card
 * format into the JSON the wizard UI expects.
 */
function buildInitialUserMessage(args: {
  rotationSlot?: RotationSlotKey;
  count: number;
  config: MarketConfigSummary;
  facts: CompactFact[];
  storyLead: StoryLeadDetail | null;
  validatedIdea?: string;
  monthYear: string;
  propertyTypeFocus: PropertyTypeFocus;
}): string {
  const lines: string[] = [];
  lines.push(`Market: ${args.config.marketName}`);
  lines.push(`Latest validated month: ${args.monthYear}`);
  lines.push(`Idea count requested: ${args.count}`);
  if (args.rotationSlot) {
    lines.push(`Rotation slot: ${args.rotationSlot}`);
    lines.push("");
    lines.push("## THEME PIN — HARD CONSTRAINT");
    lines.push(
      `The member pinned this batch to a single theme. EVERY idea card's \`rotationSlot\` MUST be exactly \`${args.rotationSlot}\` — not "most", not "a mix", **every single card**. Do NOT rotate through any other slot (${ROTATION_SLOTS.filter((s) => s !== args.rotationSlot).join(", ")} are all FORBIDDEN for this batch). Vary the angle, framework, sub-personas, and neighbourhoods across cards, but keep \`rotationSlot\` fixed to \`${args.rotationSlot}\`. The server-side validation gate rejects any card whose rotationSlot differs and you will be re-prompted.`,
    );
  } else {
    lines.push("Rotation slot: choose appropriately per the rotation order in the system prompt.");
  }
  lines.push("");

  lines.push("Member's MarketConfig (avatar, sub-personas, keyword kit, neighbourhood vocab, MOI thresholds):");
  lines.push("```json");
  lines.push(
    JSON.stringify(
      {
        primaryAvatar: args.config.primaryAvatar,
        subPersonas: args.config.subPersonas,
        keywordKit: args.config.keywordKit,
        neighbourhoods: args.config.neighbourhoods,
        moiThresholds: args.config.moiThresholds,
      },
      null,
      2,
    ),
  );
  lines.push("```");
  lines.push("");

  if (args.storyLead) {
    lines.push("## STORY LEAD — HARD ANCHOR (Wave 4 beta Finding 8)");
    lines.push(
      `EVERY idea card in this batch MUST anchor on the Story Lead below — not "at least one", not "most", **every single card**. The lead's \`pattern\` is the spine of the entire batch; each card is one angle on it (different rotation slots, different sub-personas, different framing, but always the same underlying data thread).`,
    );
    lines.push("");
    lines.push("Rules:");
    lines.push(
      "  - Every title must reference the lead's geographic scope (the neighbourhood(s) named in `pattern` / `dataThreads`).",
    );
    lines.push(
      "  - Every `clarityPremise` must restate the lead's `pattern` (paraphrased — don't copy verbatim).",
    );
    lines.push(
      "  - Every `citedFactIds` array must include at least one fact whose `neighbourhood` matches a hood named in the lead.",
    );
    lines.push(
      "  - If a rotation slot doesn't fit this lead, SKIP it — return fewer cards rather than drifting off-anchor.",
    );
    lines.push("");
    lines.push("Selected Story Lead:");
    lines.push("```json");
    lines.push(
      JSON.stringify(
        {
          id: args.storyLead.id,
          scanType: args.storyLead.scanType,
          pattern: args.storyLead.pattern,
          whyItMatters: args.storyLead.whyItMatters,
          dataThreads: args.storyLead.dataThreads,
          suggestedRotationSlot: args.storyLead.suggestedRotationSlot,
          suggestedSubPersonas: args.storyLead.suggestedSubPersonas,
          suggestedFramework: args.storyLead.suggestedFramework,
          tactileType: args.storyLead.tactileType,
        },
        null,
        2,
      ),
    );
    lines.push("```");
    lines.push("");
  }

  if (args.validatedIdea) {
    lines.push("Member-validated idea to develop into a full card (Idea Validation Mode upstream judged this defensible by the data):");
    lines.push(`> ${args.validatedIdea}`);
    lines.push("");
  }

  lines.push(`Validated facts library (${args.facts.length} headline-safe facts — cite by \`id\`):`);
  lines.push("```json");
  lines.push(JSON.stringify(args.facts, null, 2));
  lines.push("```");
  lines.push("");

  lines.push(buildFocusConstraintBlock(args.propertyTypeFocus));
  lines.push("");

  lines.push("## GEOGRAPHIC SCOPE LOCK (Wave 4 beta Finding 9)");
  lines.push(
    "Every title MUST satisfy ONE of the following geographic patterns. Single-neighbourhood deep-dives (e.g. \"Saddle Ridge Just Got Interesting\") are REJECTED by the validator — they belong in dedicated Listing Teardown / Story videos, not the standard rotation slots.",
  );
  lines.push("");
  lines.push("Allowed patterns:");
  lines.push("  1. **Multi-hood list** — names 2+ neighbourhoods, OR uses a list-count (3/5/7/10) of neighbourhoods.");
  lines.push("     e.g. \"Bridgeland vs Beltline: 2.13 MOI Gap\", \"These 5 Calgary Neighbourhoods Hit 0.5 MOI\"");
  lines.push("  2. **City-wide with data anchor** — names the city + a $/%/MOI/year-month anchor.");
  lines.push("     e.g. \"Calgary's April 2026 Sale-to-List Hit 98.4%\", \"Calgary Crossed 4.0 MOI in March 2026\"");
  lines.push("  3. **Single hood + data anchor** — names ONE neighbourhood AND a $/%/MOI/year-month anchor.");
  lines.push("     e.g. \"Mahogany Apartments Just Hit 4.33 MOI\", \"Do Not Buy In Saddle Ridge — 3.91 MOI Warning\"");
  lines.push("");
  lines.push(
    "FORBIDDEN: a title that names exactly ONE neighbourhood with NO data anchor and NO second hood. The validator rejects these even if they technically have a \"named anchor\" — single-hood scope locks the video to too narrow an audience for the rotation slots.",
  );
  lines.push("");

  lines.push("## TITLE RULES — INVIOLABLE");
  lines.push("");
  lines.push("Every `title` MUST satisfy all three rules below. The server-side validation gate enforces them verbatim — cards that fail are rejected and you'll be re-prompted.");
  lines.push("");
  lines.push("**Rule 1 — Named Anchor (REQUIRED).** Every title must contain at least one of:");
  lines.push("  - a neighbourhood name from the `neighbourhoods` array in the MarketConfig above (NOT the market/city name on its own)");
  lines.push("  - a dollar amount: `$750K`, `$1.2M`, `$750,000`");
  lines.push("  - a percent: `9.8%`, `49.4%`");
  lines.push("  - an MOI mention: `4.5 MOI`, `1.94 MOI`");
  lines.push("  - a year-month: `April 2026`, `Apr 2026`, `2026-04`");
  lines.push("");
  lines.push("⚠️  The market name on its own (e.g. \"Calgary\") does NOT count as an anchor. \"Calgary's market\" / \"Calgary Apartments\" / \"In Calgary\" all FAIL. You need a neighbourhood, $, %, MOI, or year-month in addition to (or instead of) the city.");
  lines.push("");
  lines.push("**Rule 2 — Avatar-Segment Ban.** The title must NOT contain any of these phrases (or hyphen/space/plural variants): `first-time buyer(s)`, `first-time home buyer(s)`, `move-up family/families/buyer(s)`, `downsizer(s)`, `empty nester(s)`, `relocator(s)`, `aspirational buyer(s)`, `move-down(s)`, `curious owner(s)`. Avatar segments belong in the body — not the headline.");
  lines.push("");
  lines.push("**Rule 3 — Bare Numbers.** If the title contains a bare integer (not embedded in $, %, MOI, or a year-month), it must be one of: **3, 5, 7, 10**. Numbers like \"20-Month\", \"Under 1 Month\", \"7 Days\" with bare integers other than 3/5/7/10 will FAIL.");
  lines.push("");
  lines.push("### Worked examples (use these as the bar)");
  lines.push("");
  lines.push("PASS:");
  lines.push("  ✅ \"Mahogany Apartments Just Hit 4.33 MOI\"  — neighbourhood + MOI anchor");
  lines.push("  ✅ \"These 5 Calgary Neighbourhoods Hit 0.5 MOI\"  — list-count 5 + MOI anchor");
  lines.push("  ✅ \"Bridgeland vs Beltline: 2.13 MOI Gap in April 2026\"  — neighbourhoods + MOI + year-month");
  lines.push("");
  lines.push("FAIL:");
  lines.push("  ❌ \"Something Strange Is Happening In Calgary Apartments\"  — \"Calgary\" alone is not an anchor; no neighbourhood/$/%/MOI/year-month");
  lines.push("  ❌ \"These 7 Calgary Neighbourhoods Are Under 1 Month Supply\"  — \"Under 1\" is a bare integer that's not 3/5/7/10, and no anchor (Calgary doesn't count, no neighbourhood named)");
  lines.push("  ❌ \"Do Not Buy In These Calgary Neighbourhoods Right Now\"  — \"Calgary\" alone fails; needs a specific neighbourhood (e.g. \"Do Not Buy In Saddle Ridge — 3.91 MOI Warning\")");
  lines.push("");
  lines.push("**Before you emit each card, silently check the title against these three rules. If it would fail, rewrite it.**");
  lines.push("");
  lines.push("## OUTPUT FORMAT OVERRIDE");
  lines.push(
    "Ignore the markdown card format from the system prompt. Return ONLY raw JSON (no markdown fence, no prose around it) with this exact schema:",
  );
  lines.push("```json");
  lines.push(
    JSON.stringify(
      {
        ideas: [
          {
            title: "string — ≤60 chars, contains a named anchor, no avatar-segment language, numbers must be 3/5/7/10 if present",
            rotationSlot: `one of: ${ROTATION_SLOTS.join(" | ")}`,
            titlePromise: "string — 1 sentence the body must pay off in the first 30s",
            thumbnailCallouts: ["1-3 words each", "emotional, not echoing title", "..."],
            clarityPremise: "string — 1-2 sentences",
            citedFactIds: ["fact-id-1", "fact-id-2", "fact-id-3"],
            visualPeak: "string — specific drone shot / screen-share / B-roll",
            subPersonas: ["primary", "first_time_buyer", "..."],
            framework: "string — e.g. 'Warning + Named Anchor'",
            tactileType: "place-list | defect-list | data-drop | market-mechanic | comparison | hybrid",
            estimatedRuntime: "5-8 min | 12-16 min | 18-25 min",
            whyItWorks: "string — 1 line",
          },
        ],
      },
      null,
      2,
    ),
  );
  lines.push("```");
  lines.push("");
  lines.push(
    `Generate exactly ${args.count} idea cards. Every citedFactIds entry MUST be a real \`id\` from the facts library above — do not invent ids. Run your own Step 8 validation gate before responding.`,
  );

  return lines.join("\n");
}

/**
 * Retry prompt. Names which cards failed and why, asks Claude to re-emit
 * the WHOLE batch (corrected). Sent only when the validation gate rejected
 * one or more cards from the previous attempt.
 */
function buildRetryUserMessage(args: {
  previousIdeas: unknown[];
  perCardErrors: Array<{ index: number; errors: string[] }>;
  count: number;
  propertyTypeFocus: PropertyTypeFocus;
}): string {
  const lines: string[] = [];
  lines.push(
    `Your previous batch had ${args.perCardErrors.length} card(s) that failed the validation gate. Re-emit the FULL batch of ${args.count} cards with the failures fixed. Keep the cards that passed unchanged where you can.`,
  );
  lines.push("");
  lines.push(buildFocusConstraintBlock(args.propertyTypeFocus));
  lines.push("");
  lines.push("Per-card failures:");
  for (const f of args.perCardErrors) {
    if (f.index === -1) {
      lines.push(`  - global: ${f.errors.join("; ")}`);
    } else {
      lines.push(`  - idea[${f.index}]: ${f.errors.join("; ")}`);
    }
  }
  lines.push("");
  lines.push("Previous batch (for reference):");
  lines.push("```json");
  lines.push(JSON.stringify({ ideas: args.previousIdeas }, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("Return ONLY the corrected JSON batch — no markdown fence, no prose. Same schema as before.");
  return lines.join("\n");
}

/**
 * Wave 4 beta (Finding 8) — derive the set of neighbourhoods a Story
 * Lead actually anchors. We scan the lead's pattern + dataThreads
 * narrative text for word-boundary matches against the member's
 * MarketConfig vocab. Returns the matched hood names lowercased; an
 * empty array means "couldn't narrow scope — fall back to prompt-only
 * enforcement" (the caller handles that).
 */
function extractLeadNeighbourhoods(
  lead: StoryLeadDetail,
  vocab: string[],
): string[] {
  const parts: string[] = [];
  if (typeof lead.pattern === "string") parts.push(lead.pattern);
  if (typeof lead.whyItMatters === "string") parts.push(lead.whyItMatters);
  const dt = lead.dataThreads;
  if (Array.isArray(dt)) {
    for (const t of dt) if (typeof t === "string") parts.push(t);
  } else if (dt && typeof dt === "object") {
    for (const v of Object.values(dt as Record<string, unknown>)) {
      if (typeof v === "string") parts.push(v);
      else if (Array.isArray(v)) {
        for (const x of v) if (typeof x === "string") parts.push(x);
      }
    }
  }
  const blob = parts.join(" \n ").toLowerCase();
  if (!blob) return [];
  const matched = new Set<string>();
  for (const hood of vocab) {
    const t = hood?.trim().toLowerCase();
    if (!t) continue;
    // Use the shared hyphen-aware boundary matcher so "Bridgeland"
    // doesn't false-match inside "Bridgeland-Riverside" (and vice
    // versa). Same logic the title validator uses.
    if (matchesHood(blob, hood)) matched.add(t);
  }
  return Array.from(matched);
}

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
import { auth } from "@/lib/auth";
import { getFeatureFlags } from "@/lib/feature-flags";
import { getCostCapStatus, logUsage } from "@/lib/ai-tool-cost";
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
  parseJsonResponse,
  validateIdeaCard,
  type IdeaCard,
  type RotationSlotKey,
} from "@/lib/content-engine-validation";
import { CONTENT_ENGINE_MODE_PROMPT } from "@/lib/content-engine-mode-prompt";

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
}

interface BatchResponse {
  ideas: IdeaCard[];
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  const userRole = session?.user?.role ?? null;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const flags = await getFeatureFlags({ userId, userRole });
  if (!flags.tool_content_engine_v2) {
    return NextResponse.json({ error: "Not enabled" }, { status: 404 });
  }

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
  const facts = await loadHeadlineSafeFacts(upload.id, upload.monthYear, {
    limit: FACTS_LIMIT,
  });
  if (facts.length < 3) {
    return NextResponse.json(
      {
        error: "no_headline_safe_facts",
        message: "Your latest upload doesn't have enough headline-safe facts (need ≥3). Re-run validation or upload a fresher month.",
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

  const headlineSafeIds = new Set(facts.map((f) => f.id));

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
            facts,
            storyLead,
            validatedIdea: body.validatedIdea,
            monthYear: upload.monthYear,
          })
        : buildRetryUserMessage({
            previousIdeas: lastRawIdeas,
            perCardErrors,
            count,
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
      const result = validateIdeaCard(rawIdeas[i], headlineSafeIds, config.neighbourhoods);
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
}): string {
  const lines: string[] = [];
  lines.push(`Market: ${args.config.marketName}`);
  lines.push(`Latest validated month: ${args.monthYear}`);
  lines.push(`Idea count requested: ${args.count}`);
  if (args.rotationSlot) {
    lines.push(`Rotation slot: ${args.rotationSlot}`);
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
    lines.push("Selected Story Lead to anchor on (build at least one idea on this cluster):");
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
}): string {
  const lines: string[] = [];
  lines.push(
    `Your previous batch had ${args.perCardErrors.length} card(s) that failed the validation gate. Re-emit the FULL batch of ${args.count} cards with the failures fixed. Keep the cards that passed unchanged where you can.`,
  );
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

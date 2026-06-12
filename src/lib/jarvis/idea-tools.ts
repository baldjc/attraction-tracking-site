// Jarvis (AI Content Manager) — "Browse all content ideas" front-door tools.
//
// Task #60. Three conversational paths the member can take INSTEAD of the
// standalone Content Engine wizard, all running inside the Jarvis chat and all
// flowing into the existing build_script step:
//
//   1. browse_story_leads  — surface the member's ranked market story leads.
//   2. list_themes         — offer the 5 rotation-slot "themes" to explore.
//   3. generate_theme_ideas— generate validated idea cards for one theme.
//   4. validate_idea       — check a member's own idea against their facts.
//
// Every loader is MEMBER-SCOPED (latest validated upload + that member's
// MarketConfig/facts) — there is NO global/Calgary seed anywhere. The browse
// paths default to GROUPED / comparison ideas (allowSingleNeighbourhood=false);
// a single-neighbourhood deep dive only appears when the member asks for one.
//
// Each executor returns a structured `IdeasState` (rendered as selectable cards
// in the chat) PLUS a short `summary` the model relays. Tapping a card sends its
// `prompt` as the next member message — the same natural-language hand-off the
// dashboard seed uses — so the model runs the normal pre-draft proposal +
// build_script flow. No new build short-circuit; buildable cards embed the exact
// MarketFact ids for build_script.linkedFactIds.

import Anthropic from "@anthropic-ai/sdk";
import prisma from "@/lib/prisma";
import {
  loadLatestValidatedUpload,
  loadHeadlineSafeFacts,
  loadMarketConfigSummary,
  balanceFactsByFamily,
} from "@/lib/content-engine-context";
import {
  ROTATION_SLOTS,
  ROTATION_SLOT_LABELS,
  parseJsonResponse,
  type RotationSlotKey,
} from "@/lib/content-engine-validation";
import { runIdeaGenerationLoop } from "@/lib/content-engine-generate";
import {
  buildFocusConstraintBlock,
  parsePropertyTypeFocus,
  type PropertyTypeFocus,
} from "@/lib/property-type-focus";
import { IDEA_VALIDATION_SYSTEM_PROMPT } from "@/lib/idea-validation-prompt";
import type { IdeaCardItem, IdeasState } from "@/lib/jarvis/types";

const SONNET_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_THEME_IDEA_COUNT = 5;
const THEME_FACTS_LIMIT = 120;
const VALIDATE_FACTS_CAP = 50;

let cachedClient: Anthropic | null = null;
function client(): Anthropic {
  if (!cachedClient) {
    cachedClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return cachedClient;
}

/**
 * Common result envelope. `ideasState` is non-null only when there are cards to
 * render; `summary` is what the model relays to the member. `inputTokens` /
 * `outputTokens` are returned (never billed here) so the orchestrator can
 * attribute cost to the member's account exactly like the wizard routes do.
 */
export interface IdeaToolResult {
  ok: boolean;
  ideasState: IdeasState | null;
  summary: string;
  inputTokens?: number;
  outputTokens?: number;
}

/** Truncate a string for a card title/hook without splitting mid-word badly. */
function clip(s: string, max: number): string {
  const t = (s ?? "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
}

/**
 * The grounding pass redacts any $/%/decimal token not in the fact ledger. Card
 * titles/hooks render via IdeasState (exempt from grounding), but the model's
 * prose may echo those numbers — so the orchestrator whitelists this text via
 * allowText. Concatenate everything a card surfaces.
 */
export function ideasAllowText(state: IdeasState | null): string {
  if (!state) return "";
  const parts: string[] = [];
  if (state.heading) parts.push(state.heading);
  if (state.note) parts.push(state.note);
  for (const it of state.items) {
    parts.push(it.title);
    if (it.hook) parts.push(it.hook);
    if (it.themeLabel) parts.push(it.themeLabel);
  }
  return parts.filter(Boolean).join("\n");
}

/**
 * Build the natural-language hand-off message a buildable card sends when the
 * member taps it. Embeds the exact MarketFact ids so the model calls get_facts
 * (to load them into the ledger for grounding) then build_script with those
 * linkedFactIds. When `factIds` is empty (legacy story leads with no persisted
 * PKs) it falls back to neighbourhood-scoped language so the model derives the
 * facts itself via get_facts.
 */
function buildScriptHandoffPrompt(args: {
  title: string;
  themeLabel?: string;
  rotationSlot?: string | null;
  premise?: string;
  factIds: string[];
  neighbourhoods?: string[];
}): string {
  const lines: string[] = [];
  lines.push(`Let's build a script for this idea: "${args.title}".`);
  if (args.themeLabel) lines.push(`Theme: ${args.themeLabel}.`);
  if (args.premise) lines.push(`Angle: ${args.premise}`);
  lines.push("");
  if (args.factIds.length > 0) {
    lines.push(
      "Anchor it on these exact market facts of mine — call get_facts to load " +
        "them into context, then call build_script with linkedFactIds set to " +
        `exactly these ids: ${args.factIds.join(", ")}.`,
    );
  } else if (args.neighbourhoods && args.neighbourhoods.length > 0) {
    lines.push(
      "Use get_facts for " +
        args.neighbourhoods.join(", ") +
        " to pull my real numbers, then build the script anchored on those facts.",
    );
  } else {
    lines.push(
      "Use get_facts to pull my real numbers, then build the script anchored on those facts.",
    );
  }
  if (args.rotationSlot) {
    lines.push(`Use the ${args.rotationSlot} rotation slot.`);
  }
  return lines.join("\n");
}

// ── Path 1: browse story leads ──────────────────────────────────────────────

/**
 * Surface the member's ranked market story leads from their latest validated
 * upload. Read-only (no LLM, no cost). Thesis lead first, then displayOrder.
 */
export async function browseStoryLeads(userId: string): Promise<IdeaToolResult> {
  const upload = await loadLatestValidatedUpload(userId);
  if (!upload) {
    return {
      ok: false,
      ideasState: null,
      summary:
        "The member has no validated market-data upload yet, so there are no " +
        "story leads. Tell them to upload and validate their market data first.",
    };
  }

  const leads = await prisma.marketStoryLead.findMany({
    where: { userId, uploadId: upload.id },
    orderBy: [
      { isThesisLead: "desc" },
      { displayOrder: "asc" },
      { createdAt: "asc" },
    ],
    select: {
      id: true,
      label: true,
      pattern: true,
      whyItMatters: true,
      suggestedRotationSlot: true,
      anchorFactId: true,
      supportingFactIds: true,
    },
  });

  if (leads.length === 0) {
    return {
      ok: false,
      ideasState: null,
      summary:
        `The member's latest upload (${upload.monthYear}) produced no story ` +
        "leads. Suggest they explore ideas by theme instead, or re-run their " +
        "market-data validation.",
    };
  }

  const items: IdeaCardItem[] = leads.map((lead) => {
    const slot = lead.suggestedRotationSlot as RotationSlotKey | null;
    const themeLabel = slot ? ROTATION_SLOT_LABELS[slot] ?? undefined : undefined;
    const factIds = [
      ...(lead.anchorFactId ? [lead.anchorFactId] : []),
      ...(lead.supportingFactIds ?? []),
    ];
    const title = clip(lead.label || lead.pattern, 110);
    return {
      id: `lead-${lead.id}`,
      kind: "story_lead",
      title,
      themeLabel,
      hook: clip(lead.whyItMatters, 180),
      citedFactCount: factIds.length,
      prompt: buildScriptHandoffPrompt({
        title: lead.label || clip(lead.pattern, 110),
        themeLabel,
        rotationSlot: slot,
        premise: clip(lead.pattern, 240),
        factIds,
      }),
    };
  });

  return {
    ok: true,
    ideasState: {
      kind: "ideas",
      path: "story_leads",
      heading: `Your top market stories (${upload.monthYear})`,
      items,
    },
    summary:
      `Showed the member ${items.length} ranked story lead${items.length === 1 ? "" : "s"} ` +
      `from their ${upload.monthYear} data as selectable cards. Tell them to pick ` +
      "one to turn into a script, or ask to explore by theme. Do NOT build a " +
      "script yourself yet — selecting a card hands the chosen idea back to you.",
  };
}

// ── Path 2: list themes (chooser) ───────────────────────────────────────────

/** One-line description of each rotation-slot theme, member-facing. */
const THEME_HOOKS: Record<RotationSlotKey, string> = {
  market_update: "The latest numbers across your market, framed for buyers/sellers.",
  neighbourhood_fact: "Compare neighbourhoods head-to-head on a real stat.",
  contrarian_take: "Challenge a common assumption with your own data.",
  do_not: "A clear warning grounded in what the numbers actually show.",
  should_you: "Answer a buy/sell/wait question your audience is asking.",
};

/**
 * The 5 rotation-slot themes as a chooser. No DB, no LLM. Tapping a theme card
 * asks Jarvis to generate ideas for that theme (generate_theme_ideas).
 */
export function listThemes(): IdeaToolResult {
  const items: IdeaCardItem[] = ROTATION_SLOTS.map((slot) => {
    const label = ROTATION_SLOT_LABELS[slot];
    return {
      id: `theme-${slot}`,
      kind: "theme_option",
      title: label,
      themeLabel: label,
      hook: THEME_HOOKS[slot],
      prompt: `Show me content ideas for the "${label}" theme.`,
    };
  });
  return {
    ok: true,
    ideasState: {
      kind: "ideas",
      path: "themes",
      heading: "Explore by theme",
      items,
    },
    summary:
      "Showed the member the 5 content themes as selectable cards. Tell them to " +
      "pick a theme and you'll generate idea cards for it. Do NOT generate ideas " +
      "until they choose.",
  };
}

// ── Path 3: generate idea cards for a theme ─────────────────────────────────

/**
 * Generate validated idea cards for a single rotation-slot theme, mirroring the
 * Content Engine v2 route's assembly but with grouped/comparison-by-default
 * (allowSingleNeighbourhood=false). Member-scoped; charges via returned tokens.
 */
export async function generateThemeIdeas(
  userId: string,
  args: {
    rotationSlot: RotationSlotKey;
    count?: number;
    propertyTypeFocus?: PropertyTypeFocus | string | null;
    allowSingleNeighbourhood?: boolean;
  },
): Promise<IdeaToolResult> {
  const count = Math.min(Math.max(args.count ?? DEFAULT_THEME_IDEA_COUNT, 1), 10);
  const propertyTypeFocus = parsePropertyTypeFocus(args.propertyTypeFocus ?? null);

  const upload = await loadLatestValidatedUpload(userId);
  if (!upload) {
    return {
      ok: false,
      ideasState: null,
      summary:
        "The member has no validated upload, so there are no facts to build " +
        "ideas from. Tell them to upload and validate their market data first.",
    };
  }
  const config = await loadMarketConfigSummary(userId);
  if (!config) {
    return {
      ok: false,
      ideasState: null,
      summary:
        "The member hasn't configured their market yet (avatar, sub-personas, " +
        "neighbourhood vocab). Tell them to finish market setup first.",
    };
  }

  const allFacts = await loadHeadlineSafeFacts(upload.id, upload.monthYear, {
    limit: THEME_FACTS_LIMIT,
  });
  // Same server-side property-type prefilter as the wizard route.
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
    return {
      ok: false,
      ideasState: null,
      summary:
        `The member's latest upload (${upload.monthYear}) doesn't have enough ` +
        "headline-safe facts to generate ideas (need at least 3). Suggest a " +
        "fresher upload or a different focus.",
    };
  }

  const headlineSafeIds = new Set(facts.map((f) => f.id));
  const result = await runIdeaGenerationLoop({
    count,
    rotationSlot: args.rotationSlot,
    config,
    factsForLlm: facts,
    headlineSafeIds,
    storyLead: null,
    storyLeadFactIds: null,
    storyLeadHoodFactIds: null,
    monthYear: upload.monthYear,
    propertyTypeFocus,
    // Browse front door — grouped / comparison ideas by default; single-hood
    // deep dives only when the member explicitly asks for one.
    allowSingleNeighbourhood: args.allowSingleNeighbourhood ?? false,
  });

  const themeLabel = ROTATION_SLOT_LABELS[args.rotationSlot];

  if (!result.ok) {
    return {
      ok: false,
      ideasState: null,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      summary:
        `Couldn't generate ${themeLabel} ideas that pass the title rules right ` +
        "now. Suggest the member try another theme or refresh their facts.",
    };
  }

  const items: IdeaCardItem[] = result.ideas.map((card, i) => {
    const ids = (card.citedFactIds ?? []).filter((s) => typeof s === "string");
    return {
      id: `idea-${i}-${Date.now()}`,
      kind: "theme_idea",
      title: clip(card.title, 120),
      themeLabel,
      hook: clip(card.clarityPremise || card.titlePromise || "", 200),
      citedFactCount: ids.length,
      prompt: buildScriptHandoffPrompt({
        title: card.title,
        themeLabel,
        rotationSlot: card.rotationSlot,
        premise: clip(card.clarityPremise || card.titlePromise || "", 240),
        factIds: ids,
      }),
    };
  });

  return {
    ok: true,
    ideasState: {
      kind: "ideas",
      path: "theme_ideas",
      heading: `${themeLabel} ideas (${upload.monthYear})`,
      note: result.partial
        ? "Fewer cards than asked — these are the ones that cleared the comparison/title rules."
        : undefined,
      items,
    },
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    summary:
      `Showed the member ${items.length} ${themeLabel} idea card${items.length === 1 ? "" : "s"} ` +
      "(grouped/comparison by default), each anchored on their real facts. Tell " +
      "them to pick one to build, or ask for a different theme. Do NOT build a " +
      "script yourself yet — selecting a card hands the chosen idea back to you.",
  };
}

// ── Path 4: validate a member's own idea ────────────────────────────────────

interface ValidationResponse {
  mode: "supports" | "partial" | "contradicts";
  reasoning: string;
  citedFacts: Array<{ id: string; supports: boolean; note: string }>;
  sharperFraming?: string;
  relatedAngles?: Array<{ angle: string; citedFactIds: string[] }>;
}

/** Mirror of the idea-validation route's user-message wrapper. */
function buildValidationUserMessage(args: {
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

/**
 * Validate a member-typed idea against their latest validated facts. Replicates
 * the idea-validation route core: load facts → balance across families → cached
 * system prompt → parse → strip hallucinated cites → RECOMPUTE the verdict from
 * surviving supporting/contradicting facts. Returns a single validation card
 * that is buildable when the verdict supports/partially-supports the idea.
 */
export async function validateIdea(
  userId: string,
  rawIdea: string,
  rawFocus?: PropertyTypeFocus | string | null,
): Promise<IdeaToolResult> {
  const idea = (rawIdea ?? "").trim();
  const propertyTypeFocus = parsePropertyTypeFocus(rawFocus ?? null);
  if (idea.length < 10) {
    return {
      ok: false,
      ideasState: null,
      summary:
        "The idea is too short to validate. Ask the member to describe it in a " +
        "sentence or two.",
    };
  }
  if (idea.length > 2000) {
    return {
      ok: false,
      ideasState: null,
      summary: "The idea is too long to validate — ask them to trim it under 2,000 characters.",
    };
  }

  const upload = await loadLatestValidatedUpload(userId);
  if (!upload) {
    return {
      ok: false,
      ideasState: null,
      summary:
        "The member has no validated facts library to check the idea against. " +
        "Tell them to upload and validate their market data first.",
    };
  }
  const config = await loadMarketConfigSummary(userId);

  const candidateFacts = await loadHeadlineSafeFacts(upload.id, upload.monthYear, {
    limit: 500,
    orderByNeighbourhoodFirst: true,
  });
  const facts = balanceFactsByFamily(candidateFacts, VALIDATE_FACTS_CAP);
  if (facts.length === 0) {
    return {
      ok: false,
      ideasState: null,
      summary:
        "The member's latest upload produced no headline-safe facts to validate " +
        "against. Suggest re-running validation or uploading a fresher month.",
    };
  }

  const systemBlocks = [
    {
      type: "text",
      text: IDEA_VALIDATION_SYSTEM_PROMPT,
      cache_control: { type: "ephemeral" as const },
    },
  ];
  const userMessage = buildValidationUserMessage({
    idea,
    facts,
    marketName: config?.marketName ?? "your market",
    propertyTypeFocus,
  });

  let resp: Anthropic.Messages.Message;
  try {
    resp = await client().messages.create({
      model: SONNET_MODEL,
      max_tokens: 2000,
      system: systemBlocks as unknown as Anthropic.Messages.TextBlockParam[],
      messages: [{ role: "user", content: userMessage }],
    });
  } catch (err) {
    const msg = (err as { message?: string })?.message ?? String(err);
    console.error("[jarvis validate_idea] anthropic error:", msg);
    return {
      ok: false,
      ideasState: null,
      summary: "The validator is unavailable right now. Ask the member to try again in a moment.",
    };
  }

  const usage = resp.usage as unknown as {
    input_tokens: number;
    output_tokens: number;
  };
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;

  const text = resp.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();

  let parsed: ValidationResponse;
  try {
    parsed = parseJsonResponse<ValidationResponse>(text);
  } catch (err) {
    console.error(
      "[jarvis validate_idea] parse failed:",
      (err as Error).message,
      "raw:",
      text.slice(0, 300),
    );
    return {
      ok: false,
      ideasState: null,
      inputTokens,
      outputTokens,
      summary: "The validator returned an unexpected shape. Ask the member to try again.",
    };
  }

  if (!parsed || !["supports", "partial", "contradicts"].includes(parsed.mode)) {
    return {
      ok: false,
      ideasState: null,
      inputTokens,
      outputTokens,
      summary: "The validator returned an unknown verdict. Ask the member to try again.",
    };
  }

  // Strip hallucinated cited ids against the facts we actually sent.
  const knownIds = new Set(facts.map((f) => f.id));
  const originalCited = Array.isArray(parsed.citedFacts) ? parsed.citedFacts : [];
  const survivingCited = originalCited.filter((c) => knownIds.has(c.id));

  // Recompute verdict from surviving supporting/contradicting facts.
  let supportingCount = 0;
  let contradictingCount = 0;
  for (const c of survivingCited) {
    if (c.supports === true) supportingCount += 1;
    else if (c.supports === false) contradictingCount += 1;
  }
  let mode: ValidationResponse["mode"] | null;
  if (supportingCount === 0 && contradictingCount === 0) mode = null;
  else if (supportingCount >= 2 && contradictingCount === 0) mode = "supports";
  else if (supportingCount >= 1 && contradictingCount >= 1) mode = "partial";
  else if (supportingCount === 0 && contradictingCount >= 1) mode = "contradicts";
  else mode = "partial";

  if (mode === null) {
    return {
      ok: false,
      ideasState: null,
      inputTokens,
      outputTokens,
      summary:
        "The member's facts library didn't contain enough evidence to validate " +
        "this idea. Suggest a different angle or fresher data.",
    };
  }

  const supportingIds = survivingCited
    .filter((c) => c.supports === true)
    .map((c) => c.id);

  const verdictLabel =
    mode === "supports"
      ? "Your data backs this"
      : mode === "partial"
        ? "Partly supported"
        : "Your data pushes back";
  const buildable = mode === "supports" || mode === "partial";

  const item: IdeaCardItem = {
    id: `validation-${resp.id}`,
    kind: "validation",
    title: clip(parsed.sharperFraming || idea, 130),
    themeLabel: verdictLabel,
    hook: clip(parsed.reasoning || "", 220),
    citedFactCount: survivingCited.length,
    prompt: buildable
      ? buildScriptHandoffPrompt({
          title: parsed.sharperFraming || idea,
          premise: clip(parsed.reasoning || "", 240),
          factIds: supportingIds.length > 0 ? supportingIds : survivingCited.map((c) => c.id),
        })
      : `Let's reshape this idea so it fits what my data actually shows: "${clip(idea, 120)}". ` +
        "Suggest a sharper angle grounded in my real facts, then we can build it.",
  };

  const summary =
    mode === "supports"
      ? `The member's data SUPPORTS this idea (${supportingCount} supporting facts). ` +
        "Showed a validation card they can build straight from. Encourage them to build it."
      : mode === "partial"
        ? "The member's data PARTIALLY supports this idea. Showed a validation card with a " +
          "sharper framing — they can build the reframed version or refine further."
        : "The member's data CONTRADICTS this idea. Showed a card explaining why; the card " +
          "offers to reshape it. Gently steer them to a defensible angle — do NOT build the " +
          "original as-is.";

  return {
    ok: true,
    inputTokens,
    outputTokens,
    ideasState: {
      kind: "ideas",
      path: "validation",
      heading: verdictLabel,
      items: [item],
    },
    summary,
  };
}

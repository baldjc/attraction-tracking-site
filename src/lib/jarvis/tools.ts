// Jarvis (AI Content Manager) — tool schemas, executors, fact ledger, and the
// grounding pass. The orchestrator (orchestrator.ts) wires these into Claude's
// agentic tool loop.

import type Anthropic from "@anthropic-ai/sdk";
import prisma from "@/lib/prisma";
import { EXCLUDE_LEGACY_FAILURE_RATE } from "@/lib/market-status-buckets";
import {
  loadLatestValidatedUpload,
  loadHeadlineSafeFacts,
  loadTextureOnlyFacts,
  loadMarketConfigSummary,
} from "@/lib/content-engine-context";
import { getSourceOfTruthMetrics } from "@/lib/aggregated-metrics";
import { getNeighbourhoodContext } from "@/lib/get-neighbourhood-context";
import {
  METRIC_NAME_LABELS,
  ROTATION_SLOTS,
  type RotationSlotKey,
} from "@/lib/content-engine-validation";
import {
  buildScript,
  buildPropertyTypeLock,
  type CitedFact,
  type PlanContext,
  type BuildScriptResult,
} from "@/lib/tools/scriptBuilder";
import type { LedgerFact } from "@/lib/jarvis/types";

// ── Tool schemas (Anthropic tool-use) ───────────────────────────────────────

export const JARVIS_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_facts",
    description:
      "Look up the member's own validated market facts (months of inventory, " +
      "sale-to-list ratio, days on market, prices, etc). Returns a list of " +
      "facts, each with a stable id you MUST reuse when citing it or linking " +
      "it to a script. Only facts returned here are real — never invent a " +
      "number that isn't in a get_facts result.",
    input_schema: {
      type: "object",
      properties: {
        neighbourhood: {
          type: "string",
          description:
            "Optional. Filter to one neighbourhood (exact name). Omit for all.",
        },
        metric: {
          type: "string",
          description:
            "Optional. Case-insensitive substring of the metric label, e.g. " +
            "'inventory', 'sale-to-list', 'days on market', 'price'.",
        },
      },
    },
  },
  {
    name: "build_script",
    description:
      "Draft a full talking-head video script from the member's facts using " +
      "the platform's locked FACT→CLARITY arc engine. Provide a title, a " +
      "rotation slot, a one-line title promise, and the ids of the facts " +
      "(from get_facts) to anchor it on. The drafted script streams to the " +
      "member live. This does NOT save anything.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Working video title." },
        rotationSlot: {
          type: "string",
          enum: ROTATION_SLOTS as unknown as string[],
          description:
            "One of: market_update, neighbourhood_fact, contrarian_take, " +
            "do_not, should_you.",
        },
        titlePromise: {
          type: "string",
          description:
            "The single promise the first 30 seconds must pay off.",
        },
        linkedFactIds: {
          type: "array",
          items: { type: "string" },
          description:
            "Fact ids from get_facts to anchor the script on (at least one).",
        },
        clarityPremise: {
          type: "string",
          description: "Optional. The CLARITY beat's core takeaway.",
        },
      },
      required: ["title", "rotationSlot", "titlePromise", "linkedFactIds"],
    },
  },
  {
    name: "save_script",
    description:
      "Save the most recently proposed script as a DRAFT. GATED: this only " +
      "works after the member has explicitly approved the exact draft using " +
      "the Approve & save → Yes, save it buttons. Do NOT call this on your " +
      "own initiative or because the member said 'sounds good' — direct them " +
      "to the Approve & save button instead.",
    input_schema: {
      type: "object",
      properties: {
        proposalMessageId: {
          type: "string",
          description: "Id of the assistant message that proposed the script.",
        },
      },
      required: ["proposalMessageId"],
    },
  },
];

// ── get_facts executor ──────────────────────────────────────────────────────

export interface GetFactsArgs {
  neighbourhood?: string;
  metric?: string;
}

/**
 * Which fact tier executeGetFacts ended up serving:
 *  - "headline_safe": durable facts safe to headline a video / cite directly.
 *  - "texture_only":  no headline-safe facts matched, so we fell back to
 *    `supporting_texture_only` rows — real numbers, but background colour only.
 *  - "none":          the member has facts/an upload but nothing matched (or
 *    the upload validated with zero usable facts).
 *  - "no_upload":     no validated upload exists yet.
 */
export type GetFactsState =
  | "headline_safe"
  | "texture_only"
  | "none"
  | "no_upload";

export interface GetFactsResult {
  facts: LedgerFact[];
  monthYear: string | null;
  /** Honest machine-readable tier of what `facts` actually contains. */
  state: GetFactsState;
  /**
   * True only when `facts` are texture-only fallbacks. The orchestrator must
   * not present these as headline claims — use them as supporting colour, with
   * the caveat surfaced to the member.
   */
  textureOnly?: boolean;
  note?: string;
}

const TEXTURE_CAVEAT =
  "Supporting texture only — thin sample / not durable enough to headline. " +
  "Use as background colour, not as a standalone market claim.";

function toLedger(
  rows: { id: string; metricName: string; neighbourhood: string; value: string; monthYear: string; caveat?: string }[],
  source: string,
  withCaveat: boolean,
): LedgerFact[] {
  return rows.slice(0, 60).map((f) => ({
    id: f.id,
    label: METRIC_NAME_LABELS[f.metricName] ?? f.metricName,
    neighbourhood: f.neighbourhood,
    value: f.value,
    monthYear: f.monthYear,
    source,
    ...(withCaveat ? { caveat: f.caveat ?? TEXTURE_CAVEAT } : {}),
  }));
}

/**
 * Load the member's latest validated upload's facts, optionally filtered by
 * neighbourhood / metric label substring, and report HONESTLY which of three
 * fact states applies:
 *
 *   1. No validated upload at all          → state "no_upload".
 *   2. Headline-safe facts match the query → state "headline_safe".
 *   3. No headline-safe matches but
 *      texture-only facts exist            → state "texture_only" (fallback,
 *                                            flagged textureOnly + caveat).
 *   …and if nothing at all matches         → state "none".
 *
 * This replaces the old behaviour where a validated-but-zero-headline-safe
 * upload (e.g. the status-bucketing bug) returned a bare empty list that the
 * orchestrator surfaced as a flat "No matching facts" — indistinguishable from
 * "you haven't uploaded anything". Each fact still carries its id + source so
 * the orchestrator can cite and ground on it. Grounding (groundAssistantText)
 * is intentionally untouched — texture facts are real numbers, so they stay
 * citable; the textureOnly flag governs HOW the assistant may use them, not
 * whether their digits are allowed.
 */
export async function executeGetFacts(
  userId: string,
  args: GetFactsArgs,
): Promise<GetFactsResult> {
  const upload = await loadLatestValidatedUpload(userId);
  if (!upload) {
    return {
      facts: [],
      monthYear: null,
      state: "no_upload",
      note: "No validated market-data upload yet — upload market data first.",
    };
  }

  const hood = args.neighbourhood?.trim().toLowerCase();
  const metric = args.metric?.trim().toLowerCase();
  const source = `Market data — ${upload.monthYear}`;

  const matches = (f: { neighbourhood: string; metricName: string }) => {
    if (hood && f.neighbourhood.toLowerCase() !== hood) return false;
    if (metric) {
      const label = (METRIC_NAME_LABELS[f.metricName] ?? f.metricName).toLowerCase();
      if (!label.includes(metric) && !f.metricName.toLowerCase().includes(metric)) {
        return false;
      }
    }
    return true;
  };

  // State 2: headline-safe facts.
  const headline = await loadHeadlineSafeFacts(upload.id, upload.monthYear, {
    limit: 400,
    orderByNeighbourhoodFirst: true,
  });
  const headlineMatched = headline.filter(matches);
  if (headlineMatched.length > 0) {
    return {
      facts: toLedger(headlineMatched, source, false),
      monthYear: upload.monthYear,
      state: "headline_safe",
    };
  }

  // State 3: no headline-safe match → fall back to texture-only facts.
  const texture = await loadTextureOnlyFacts(upload.id, upload.monthYear, {
    limit: 400,
    orderByNeighbourhoodFirst: true,
  });
  const textureMatched = texture.filter(matches);
  if (textureMatched.length > 0) {
    const filterNote =
      hood || metric
        ? "No headline-safe facts match that filter. "
        : "This upload validated, but none of its facts are durable enough to headline. ";
    return {
      facts: toLedger(textureMatched, source, true),
      monthYear: upload.monthYear,
      state: "texture_only",
      textureOnly: true,
      note:
        filterNote +
        "Returning supporting texture-only facts instead — use these as " +
        "background colour, not as standalone market claims, and tell the " +
        "member they're softer numbers.",
    };
  }

  // Nothing matched at all.
  const hasAnyFacts = headline.length > 0 || texture.length > 0;
  const note = hasAnyFacts
    ? "No facts match that filter — try a broader query (drop the neighbourhood or metric)."
    : "This upload validated but produced no usable facts. The member may need to re-upload or have the data re-validated.";
  return {
    facts: [],
    monthYear: upload.monthYear,
    state: "none",
    note,
  };
}

// ── build_script executor ───────────────────────────────────────────────────

export interface BuildScriptArgs {
  title: string;
  rotationSlot: string;
  titlePromise: string;
  linkedFactIds: string[];
  clarityPremise?: string;
}

export type RunBuildScriptResult =
  | { ok: false; code: string; message: string }
  | {
      ok: true;
      result: BuildScriptResult;
      title: string;
      rotationSlot: RotationSlotKey;
      linkedFactIds: string[];
    };

/**
 * Construct BuildScriptParams from the LLM's ideaCard + the member's live
 * context (mirrors the script-builder-v2 route's loaders) and run the shared
 * buildScript() core. Streams draft tokens via `onToken`. Talking-head only;
 * no campaign / binge-target assignment (Jarvis is a lightweight drafter).
 */
export async function runBuildScript(args: {
  userId: string;
  ideaCard: BuildScriptArgs;
  onToken: (text: string) => void;
  signal?: AbortSignal;
}): Promise<RunBuildScriptResult> {
  const { userId, ideaCard, onToken, signal } = args;

  const rotationSlot = ideaCard.rotationSlot as RotationSlotKey;
  if (!ROTATION_SLOTS.includes(rotationSlot)) {
    return {
      ok: false,
      code: "bad_rotation_slot",
      message: `rotationSlot must be one of: ${ROTATION_SLOTS.join(", ")}.`,
    };
  }
  const linkedFactIds = Array.from(
    new Set((ideaCard.linkedFactIds ?? []).filter((s) => typeof s === "string")),
  );
  if (linkedFactIds.length < 1) {
    return {
      ok: false,
      code: "no_facts",
      message: "Link at least one fact id (from get_facts) to build a script.",
    };
  }

  // Cited facts — ownership-filtered, ordered to match linkedFactIds.
  const factRows = await prisma.marketFact.findMany({
    where: { ...EXCLUDE_LEGACY_FAILURE_RATE, id: { in: linkedFactIds }, userId },
    select: {
      id: true,
      neighbourhood: true,
      metricName: true,
      metricValue: true,
      metricValueString: true,
      dateContext: true,
      marketType: true,
      trajectory: true,
      viewerCaveat: true,
      uploadId: true,
      upload: { select: { monthYear: true } },
    },
  });
  if (factRows.length < 1) {
    return {
      ok: false,
      code: "facts_not_found",
      message: "None of those fact ids are in your facts library — run get_facts again.",
    };
  }
  const orderIndex = new Map(linkedFactIds.map((id, i) => [id, i]));
  factRows.sort(
    (a, b) =>
      (orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
  const citedFacts: CitedFact[] = factRows.map((f) => ({
    id: f.id,
    neighbourhood: f.neighbourhood,
    metricName: f.metricName,
    metricLabel: METRIC_NAME_LABELS[f.metricName] ?? f.metricName,
    metricValueString:
      f.metricValueString ?? (f.metricValue !== null ? String(f.metricValue) : ""),
    monthYear: toMonthYearUtc(f.dateContext) || (f.upload?.monthYear ?? ""),
    marketType: f.marketType,
    trajectory: f.trajectory,
    caveat: f.viewerCaveat,
  }));

  const marketConfig = await loadMarketConfigSummary(userId);
  if (!marketConfig) {
    return {
      ok: false,
      code: "incomplete_setup",
      message: "Finish market setup (onboarding) before building scripts.",
    };
  }
  if (
    !marketConfig.primaryAvatar ||
    (typeof marketConfig.primaryAvatar === "object" &&
      Object.keys(marketConfig.primaryAvatar as Record<string, unknown>).length === 0)
  ) {
    return {
      ok: false,
      code: "incomplete_setup",
      message: "Add your avatar in onboarding (Step 3) before building a script.",
    };
  }

  const neighbourhoodsInScript = Array.from(
    new Set(citedFacts.map((f) => f.neighbourhood).filter(Boolean)),
  );
  const neighbourhoodContext = await getNeighbourhoodContext(
    userId,
    neighbourhoodsInScript,
    "full",
  );
  const uploadIdsForSot = Array.from(
    new Set(factRows.map((f) => f.uploadId).filter(Boolean)),
  );
  const sourceOfTruthMetrics = await getSourceOfTruthMetrics({
    userId,
    uploadIds: uploadIdsForSot,
    neighbourhoods: neighbourhoodsInScript,
  });
  const propertyTypeByHood = buildPropertyTypeLock(citedFacts, null);

  const memberRecord = await prisma.user.findUnique({
    where: { id: userId },
    select: { fullName: true },
  });
  const memberFullName = memberRecord?.fullName?.trim() || null;
  const otherMembers = await prisma.user.findMany({
    where: { id: { not: userId }, fullName: { not: null } },
    select: { fullName: true },
  });
  const forbiddenIdentities = otherMembers
    .map((u) => (u.fullName ?? "").trim())
    .filter((n) => n.length > 0 && n.split(/\s+/).length >= 2);

  const planContext: PlanContext = {
    id: `jarvis-${Date.now()}`,
    title: ideaCard.title,
    rotationSlot,
    titlePromise: ideaCard.titlePromise,
    visualPeak: null,
    thumbnailCallouts: [],
    subPersonas: null,
    tactileType: null,
    framework: null,
    clarityPremise: ideaCard.clarityPremise ?? null,
    estimatedRuntime: null,
  };

  const result = await buildScript({
    planContext,
    citedFacts,
    marketConfig,
    neighbourhoodContext,
    sourceOfTruthMetrics,
    propertyTypeByHood,
    shootType: "talking_head",
    assignedCampaign: null,
    assignedBingeVideo: null,
    regenerationBrief: null,
    memberFullName,
    forbiddenIdentities,
    bingeTargetConfigured: false,
    bingeTargetTitle: null,
    signal,
    callbacks: { onToken },
  });

  return {
    ok: true,
    result,
    title: ideaCard.title,
    rotationSlot,
    linkedFactIds: factRows.map((f) => f.id),
  };
}

// ── Fact ledger + grounding ─────────────────────────────────────────────────

/**
 * Numeric anchors the assistant is allowed to state: every digit-run inside a
 * ledger fact's value string (e.g. "4.14", "98.2", "615000" from "$615,000").
 */
function ledgerNumberSet(ledger: LedgerFact[]): Set<string> {
  const set = new Set<string>();
  for (const f of ledger) {
    const matches = f.value.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
    for (const m of matches) set.add(m.replace(/,/g, ""));
  }
  return set;
}

/**
 * Redact ungrounded stats from assistant prose. We only police the high-risk
 * tokens a model invents as fake market stats — currency ($…), percentages
 * (…%), and bare decimals (e.g. 4.14) — leaving ordinary integers (years,
 * counts, list numbers) alone. Any such token whose digits aren't present in
 * the fact ledger is replaced with "[unverified]".
 */
export function groundAssistantText(text: string, ledger: LedgerFact[]): string {
  const allowed = ledgerNumberSet(ledger);
  const norm = (s: string) => s.replace(/[^\d.]/g, "").replace(/\.$/, "");
  return text.replace(
    /\$\s?\d[\d,]*(?:\.\d+)?[kKmM]?|\d[\d,]*(?:\.\d+)?\s?%|\b\d[\d,]*\.\d+\b/g,
    (token) => {
      const digits = norm(token);
      if (!digits) return token;
      if (allowed.has(digits)) return token;
      // Also allow when the token's integer/fraction parts each appear (e.g.
      // "$615,000" → "615000" vs a ledger "615000").
      const compact = digits.replace(/\./g, "");
      if (allowed.has(compact)) return token;
      return "[unverified]";
    },
  );
}

function toMonthYearUtc(d: Date | null | undefined): string {
  if (!d) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

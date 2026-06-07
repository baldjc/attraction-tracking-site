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
import {
  getSourceOfTruthMetrics,
  pooled90dToSourceOfTruth,
  formatValue,
  sotValuesWithinRounding,
  resolveCanonicalSotValue,
  type MetricFamily,
} from "@/lib/aggregated-metrics";
import { aggregatePooled90dFromDb } from "@/lib/csv-aggregate";
import { canonicalVariantKeys } from "@/lib/market-config";
import { loadMemberMetricSettings } from "@/lib/member-metric-settings-server";
import { detectMetricFamily } from "@/lib/story-lead-fact-resolver";
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
  {
    name: "clean_knowledge_base",
    description:
      "Propose a Knowledge Base cleanup (a 'merge run') that collapses " +
      "fragmented neighbourhood/subdivision names (e.g. dozens of " +
      "'Woodbridge Ph 5B', 'Woodbridge 1' variants → one 'Woodbridge') so " +
      "more areas clear the statistical sample floor and the member's facts " +
      "stop being shattered across near-duplicate names. This is the ONLY way " +
      "the Knowledge Base is ever edited — members never hand-edit it. " +
      "Calling this runs a DRY-RUN only: it computes a before/after report " +
      "(names collapsed, areas that would clear the floor, a review queue of " +
      "lower-confidence near-duplicates that are NEVER auto-applied) and " +
      "returns a mergeRunId. It changes NOTHING. Present the report to the " +
      "member and let them apply it with the Review merges → Yes, clean it up " +
      "buttons. Use when the member asks to clean up / merge / de-duplicate " +
      "their areas, or complains that a neighbourhood has too few sales.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "apply_merge",
    description:
      "Apply a previously proposed Knowledge Base cleanup (merge run). " +
      "GATED: this only works after the member has explicitly approved the " +
      "exact run using the Review merges → Yes, clean it up buttons. Do NOT " +
      "call this on your own initiative or because the member said 'sounds " +
      "good' — direct them to the Review merges button instead.",
    input_schema: {
      type: "object",
      properties: {
        mergeRunId: {
          type: "string",
          description:
            "Id of the dry-run merge run (from clean_knowledge_base) to apply.",
        },
      },
      required: ["mergeRunId"],
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

const SOT_RECONCILED_CAVEAT =
  "Reconciled to the Source-of-Truth aggregate (the canonical value the " +
  "script writer uses). The raw per-fact value differed; cite this one so the " +
  "chat and the script agree.";

// Extract the first signed decimal number from a formatted value string
// ("6.71 months" → 6.71, "$615,000" → 615000, "96.7%" → 96.7). Returns null
// when the string carries no number (so non-numeric facts are skipped).
function parseLeadingNumber(value: string): number | null {
  const m = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number.parseFloat(m[0]) : null;
}

// Rounding-tolerant equality used to decide whether a per-fact value really
// disagrees with its Source-of-Truth aggregate. Shared with the script
// validator via `aggregated-metrics` so chat and the validator never disagree
// about what counts as "the same number".
const sotWithinRounding = sotValuesWithinRounding;

/**
 * Fix 3 — Jarvis chat must read the SAME value from the SAME source the script
 * uses. The script's canonical numbers come from the Source-of-Truth aggregate
 * (`getSourceOfTruthMetrics`), but the per-fact ledger can carry a slightly
 * different per-property-type value (repro: chat said Downtown 6.71 while the
 * script/SoT used 8.8). For each matched ledger fact whose (neighbourhood,
 * metric family) maps to an UNAMBIGUOUS SoT value, if the per-fact value
 * disagrees beyond rounding we override the displayed value with the SoT value
 * (formatted the same way the script renders it) and attach a caveat. We only
 * reconcile when the SoT value is unambiguous for that (hood, family) — a
 * single distinct value across property types, or an explicit "All" rollup —
 * so we never force a detached number onto an apartment fact.
 */
async function reconcileLedgerToSourceOfTruth(
  userId: string,
  uploadId: string,
  facts: LedgerFact[],
): Promise<LedgerFact[]> {
  const neighbourhoods = Array.from(new Set(facts.map((f) => f.neighbourhood)));
  if (neighbourhoods.length === 0) return facts;

  let sotRows: Awaited<ReturnType<typeof getSourceOfTruthMetrics>>;
  try {
    sotRows = await getSourceOfTruthMetrics({
      userId,
      uploadIds: [uploadId],
      neighbourhoods,
    });
  } catch {
    // Never let reconciliation break fact retrieval — fall back to raw values.
    return facts;
  }
  if (sotRows.length === 0) return facts;

  // Group SoT rows by `${hoodLower}|${family}` so we can decide whether the
  // canonical value for that pair is unambiguous.
  const groups = new Map<string, typeof sotRows>();
  for (const r of sotRows) {
    const key = `${r.neighbourhood.toLowerCase()}|${r.metricFamily}`;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }

  // A (neighbourhood, family) pair is only canonical when EVERY SoT row for it
  // agrees on one value within rounding. SoT carries multiple metric-key
  // variants per family (e.g. MOI = moiStrict / moiInclusive / rolling3) and
  // multiple property types — and the ledger fact only tells us its family, not
  // which variant or property type it is. So if the variants/types disagree we
  // cannot know which one this fact represents; forcing any single value would
  // risk overriding the fact with the WRONG canonical. In that ambiguous case
  // we leave the raw value untouched. We only override when the family resolves
  // to a single unambiguous value.
  const canonicalFor = (
    hood: string,
    family: string,
  ): { value: number; family: MetricFamily } | null => {
    const list = groups.get(`${hood.toLowerCase()}|${family}`);
    if (!list || list.length === 0) return null;
    // Fix 1 — pick the SAME canonical variant the script cites. For
    // multi-variant families (MOI), resolveCanonicalSotValue selects the
    // board-aligned variant (moiInclusive) at the "All" scope even when the
    // strict/inclusive/rolling variants disagree — so chat shows 8.8, not the
    // raw ledger 6.71. Single-variant families still require unambiguity.
    const value = resolveCanonicalSotValue(list, family as MetricFamily);
    if (value === null) return null;
    return { value, family: list[0].metricFamily };
  };

  return facts.map((f) => {
    const family = detectMetricFamily(f.label);
    if (family === "OTHER") return f;
    const canonical = canonicalFor(f.neighbourhood, family);
    if (!canonical) return f;
    const sotStr = formatValue(canonical.family, canonical.value);
    const sotNum = parseLeadingNumber(sotStr);
    const factNum = parseLeadingNumber(f.value);
    if (sotNum === null || factNum === null) return f;
    if (sotWithinRounding(factNum, sotNum)) return f;
    return {
      ...f,
      value: sotStr,
      caveat: f.caveat ? `${f.caveat} ${SOT_RECONCILED_CAVEAT}` : SOT_RECONCILED_CAVEAT,
    };
  });
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
      facts: await reconcileLedgerToSourceOfTruth(
        userId,
        upload.id,
        toLedger(headlineMatched, source, false),
      ),
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
      facts: await reconcileLedgerToSourceOfTruth(
        userId,
        upload.id,
        toLedger(textureMatched, source, true),
      ),
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

// ── clean_knowledge_base executor (propose / dry-run only) ──────────────────

export interface CleanKnowledgeBaseResult {
  mergeRunId: string | null;
  rawCount: number;
  canonicalCount: number;
  collapsed: number;
  fuzzyAppliedCount: number;
  reviewQueueCount: number;
  floorClearing: { before: number; after: number };
  topMerges: { canonical: string; variantCount: number }[];
  note: string;
}

/**
 * Propose (dry-run) a Knowledge Base cleanup for the member. Computes the
 * deterministic + conservative fuzzy merge plan and persists it as a DRY_RUN
 * merge run — it mutates NOTHING in the KB. Returns a compact summary the
 * orchestrator can relay so the member can apply it via the gated confirm tap.
 */
export async function executeCleanKnowledgeBase(
  userId: string,
): Promise<CleanKnowledgeBaseResult> {
  const { buildMergeRunReport } = await import("@/lib/kb-merge/merge-run");
  const { mergeRunId, report } = await buildMergeRunReport(userId, {
    source: "jarvis",
    applyFuzzy: true,
    skipIfNoop: true,
  });
  if (!mergeRunId) {
    return {
      mergeRunId: null,
      rawCount: report.rawCount,
      canonicalCount: report.canonicalCount,
      collapsed: 0,
      fuzzyAppliedCount: 0,
      reviewQueueCount: 0,
      floorClearing: {
        before: report.floorClearing.before,
        after: report.floorClearing.after,
      },
      topMerges: [],
      note:
        "The Knowledge Base is already clean — no fragmented names to collapse " +
        "and nothing to review. Nothing to apply.",
    };
  }
  return {
    mergeRunId,
    rawCount: report.rawCount,
    canonicalCount: report.canonicalCount,
    collapsed: report.collapsed,
    fuzzyAppliedCount: report.fuzzyAppliedCount,
    reviewQueueCount: report.reviewQueueCount,
    floorClearing: {
      before: report.floorClearing.before,
      after: report.floorClearing.after,
    },
    topMerges: report.topMerges.slice(0, 10).map((m) => ({
      canonical: m.canonical,
      variantCount: m.variantCount,
    })),
    note:
      "Dry-run only — nothing changed yet. The member must approve it with " +
      "Review merges → Yes, clean it up before anything is applied.",
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
      /**
       * Whether a binge/next-video target was wired into this draft. The
       * lightweight Jarvis drafter never assigns one (interim until full binge
       * support lands), so the orchestrator uses this to nudge Jarvis to ASK the
       * member which recent video to point viewers to instead of shipping a
       * generic forward-looking close.
       */
      bingeTargetConfigured: boolean;
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

  // ── TRUE pooled trailing-90-day re-aggregation (parity with the
  // script-builder-v2 route) ──────────────────────────────────────────────
  // The Jarvis script tool is the path members actually use for market-update
  // scripts, so the trend feature has to be wired here too — otherwise the
  // 90-day numbers are computed elsewhere but never reach this generator's
  // context, and the draft cites only the current month. Appended onto the
  // SAME `sourceOfTruthMetrics` array so the pooled rows are simultaneously
  // RENDERED for the writer AND become validator anchors (no schema /
  // script-content-rules change). The anchor is the latest cited upload (max
  // calendar monthYear); it defines the 90-day window's leading month.
  //
  // Scope note: ONLY the 90-day read is injected here — year-ago endpoints are
  // intentionally NOT added, so a "$X a year ago" claim can never appear
  // without an explicit, separately-reviewed change. Bounded + best-effort:
  // any failure (missing prior months, storage stall, config gap) simply omits
  // the 90-day rows; the script falls back to the monthly context with no error
  // surfaced to the member.
  const anchorUpload = factRows
    .map((f) => ({ uploadId: f.uploadId, monthYear: f.upload?.monthYear ?? "" }))
    .filter((u) => u.uploadId && /^\d{4}-\d{2}$/.test(u.monthYear))
    .reduce<{ uploadId: string; monthYear: string } | null>(
      (best, u) => (!best || u.monthYear > best.monthYear ? u : best),
      null,
    );
  if (anchorUpload) {
    try {
      const pooled = await aggregatePooled90dFromDb(anchorUpload.uploadId);
      // Pin the 90-day MOI to the member's monthly MOI variant so the two
      // periods are comparable. "Default" defers to the board-canonical variant
      // (e.g. NTREIS → strict), so a hardcoded inclusive 90-day MOI would
      // mismatch a strict current-month MOI.
      const [memberSettings, mlsRow] = await Promise.all([
        loadMemberMetricSettings(userId),
        prisma.marketConfig.findUnique({
          where: { userId },
          select: { mlsSource: true },
        }),
      ]);
      const moiVariantKey = canonicalVariantKeys(
        mlsRow?.mlsSource ?? null,
        memberSettings,
      ).moiMetricKey;
      const pooledRows = pooled90dToSourceOfTruth(
        pooled,
        neighbourhoodsInScript,
        moiVariantKey,
      );
      sourceOfTruthMetrics.push(...pooledRows);
      console.log(
        `[jarvis:sot] 90d complete=${pooled.complete} window=${pooled.windowMonths.join(",")} moiVariant=${moiVariantKey} metrics=${pooledRows.length}`,
      );
    } catch (err) {
      console.warn(
        `[jarvis:sot] 90d pooled aggregation failed (omitting): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

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
    bingeTargetConfigured: false,
  };
}

// ── Fact ledger + grounding ─────────────────────────────────────────────────

/**
 * Every digit-run inside a value/source string, normalised to a comparable key
 * (commas stripped, decimals kept): e.g. "$615,000" → "615000", "98.2%" →
 * "98.2", "4.14 MOI" → "4.14". Used to build the set of numbers the assistant
 * is allowed to state.
 */
export function extractNumberKeys(text: string): string[] {
  const matches = text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  return matches.map((m) => m.replace(/,/g, ""));
}

/**
 * Numeric anchors the assistant is allowed to state: every digit-run inside a
 * ledger fact's value string (e.g. "4.14", "98.2", "615000" from "$615,000").
 */
function ledgerNumberSet(ledger: LedgerFact[]): Set<string> {
  const set = new Set<string>();
  for (const f of ledger) for (const k of extractNumberKeys(f.value)) set.add(k);
  return set;
}

/**
 * Ground ungrounded stats out of assistant prose. We only police the high-risk
 * tokens a model invents as fake market stats — currency ($…), percentages
 * (…%), and bare decimals (e.g. 4.14) — leaving ordinary integers (years,
 * counts, list numbers) alone.
 *
 * Allowed numbers come from the thread's fact ledger AND `groundedSourceText` —
 * the cited values from a script proposal's "## Sources" footnote. The script
 * step resolves and cites source-of-truth aggregates (median sale price,
 * sale-to-list, …) that never enter the get_facts ledger; passing its sources
 * here keeps the conversational summary/hooks in agreement with the script
 * instead of redacting the very metrics the script grounds and cites.
 *
 * A token we cannot trace is OMITTED (removed), never replaced with a visible
 * placeholder — members must never see a literal "[unverified]" token. On
 * removal we tidy the leftover spacing/punctuation so the prose stays readable.
 */
export function groundAssistantText(
  text: string,
  ledger: LedgerFact[],
  groundedSourceText = "",
): string {
  const allowed = ledgerNumberSet(ledger);
  for (const k of extractNumberKeys(groundedSourceText)) allowed.add(k);
  const norm = (s: string) => s.replace(/[^\d.]/g, "").replace(/\.$/, "");
  let removed = false;
  const out = text.replace(
    /\$\s?\d[\d,]*(?:\.\d+)?[kKmM]?|\d[\d,]*(?:\.\d+)?\s?%|\b\d[\d,]*\.\d+\b/g,
    (token) => {
      const digits = norm(token);
      if (!digits) return token;
      if (allowed.has(digits)) return token;
      // Also allow when the token's integer/fraction parts each appear (e.g.
      // "$615,000" → "615000" vs a ledger "615000").
      const compact = digits.replace(/\./g, "");
      if (allowed.has(compact)) return token;
      removed = true;
      return "";
    },
  );
  if (!removed) return out;
  // Tidy the holes left by removed tokens: drop now-empty parens, collapse
  // INTERNAL double spaces (the `(?=\S)` lookahead leaves end-of-line trailing
  // spaces alone so Markdown hard breaks survive), and pull punctuation back.
  return out
    .replace(/\(\s*\)/g, "")
    .replace(/ {2,}(?=\S)/g, " ")
    .replace(/[ \t]+([.,;:!?])/g, "$1");
}

function toMonthYearUtc(d: Date | null | undefined): string {
  if (!d) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

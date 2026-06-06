// Wave 1 Phase 2A — Fact Validator orchestration.
//
// Pipeline: load CSV + config → aggregate (csv-aggregate.ts, no Claude) →
// build user message → single Anthropic call with system-prompt caching →
// parse markdown → persist MarketFact + MarketStoryLead → mark upload validated.
//
// Cost cap is checked BEFORE the Anthropic call. If hard-blocked, the upload
// is marked `failed` with a friendly message and no Claude tokens are spent.
//
// Fire-and-forget contract: `validateUploadAsync(uploadId, userId)` enqueues
// `runValidation` onto a per-user serial chain and returns immediately.
// Callers (the validate API route + the auto-trigger inside the upload route)
// MUST NOT await this — the upload route returns 200/202 instantly while
// the background work runs.
//
// Why per-user serial (Fix 5): a single backfill POST creates up to 25
// MarketDataUpload rows, each kicking validateUploadAsync. The previous
// implementation fired them all into the microtask queue in parallel, and
// each runValidation fans out to 5 concurrent Anthropic chunks — that's
// 125 in-flight Sonnet calls per user, which trips the per-key rate limit
// and cascades every upload to status=failed. Serializing per user keeps
// fan-out at 5 chunks at a time, well under the limit, and preserves
// ordering so earlier months land in the DB before later months query them.

import Anthropic from "@anthropic-ai/sdk";
import Decimal from "decimal.js-light";
import prisma from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { buildFactValidatorSystemPrompt } from "@/lib/fact-validator-prompt";
import {
  aggregateUploadFromDb,
  type AggregatedTable,
  type AggregatedGroup,
} from "@/lib/csv-aggregate";
import {
  failureRate as failureRateRatio,
  saleShare as saleShareRatio,
  absorptionRate as absorptionRateRatio,
  EXCLUDE_LEGACY_FAILURE_RATE,
} from "@/lib/market-status-buckets";
import {
  parseValidatorOutput,
  parseFactsChunk,
  parseSummaryAndLeadsChunk,
  type ParsedFact,
  type ParsedStoryLead,
  type ParsedMetricFamily,
} from "@/lib/fact-validator-parser";
import { getCostCapStatus } from "@/lib/ai-tool-cost";
import { scheduleBackfillCompletionEmail } from "@/lib/backfill-email";
import {
  parseDataThreadStrings,
  matchThreadToFacts,
  type ResolverFact,
} from "@/lib/story-lead-fact-resolver";
import { persistAggregatedMetrics } from "@/lib/aggregated-metrics";
import type { MarketConfigShape } from "@/lib/market-config";
import { loadMemberMetricSettings } from "@/lib/member-metric-settings-server";
import {
  DEFAULT_METHODOLOGY,
  settingsEqual,
  sampleFloorFor,
  type MemberMethodologySettings,
} from "@/lib/member-metric-settings";

const SONNET_MODEL = "claude-sonnet-4-20250514";
// Sonnet pricing: $3 / 1M input, $12 / 1M output.
// Cached input is billed at 10% of the base input price ($0.30 / 1M).
const SONNET_INPUT_COST_PER_TOKEN = 0.000003;
const SONNET_OUTPUT_COST_PER_TOKEN = 0.000012;
const SONNET_CACHE_WRITE_PER_TOKEN = 0.00000375; // 1.25x base for cache writes
const SONNET_CACHE_READ_PER_TOKEN = 0.0000003; // 0.1x base for cache reads

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─────────────────────────────────────────────────────────────────────────────
// Telemetry — structured per-phase logs with elapsed-ms markers.
//
// Added 2026-05-28 to diagnose a regression where the May 2026 upload returned
// 12 facts vs ~430 for Feb/Mar. The format `[mdv telemetry] phase=… ms=… …`
// is grep-friendly and stable across phases so a single re-run produces a
// timeline-shaped log block we can diff against a known-good month.
// ─────────────────────────────────────────────────────────────────────────────

function mdv(
  phase: string,
  uploadId: string,
  startedAt: number,
  fields: Record<string, string | number | boolean | null | undefined> = {},
): void {
  const ms = Date.now() - startedAt;
  const tail = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v == null ? "null" : v}`)
    .join(" ");
  console.log(
    `[mdv telemetry] phase=${phase} ms=${ms} uploadId=${uploadId}${tail ? " " + tail : ""}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Fire-and-forget entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-user serial queue. Each user's chain is a single Promise that links
 * the next runValidation onto the previous one's `.then`, so at most one
 * Anthropic-bound runValidation per user runs at a time. Cleared when the
 * chain settles to avoid an ever-growing Map.
 *
 * TODO: in-memory only — doesn't survive container restart, and won't
 * serialize across replicas. Production-scale autoscaling will need a real
 * queue (BullMQ on Redis, Inngest, or a Postgres-backed job table) so a
 * deploy mid-backfill doesn't drop in-flight work.
 */
const userQueues = new Map<string, Promise<void>>();

/**
 * Schedules `runValidation(uploadId)` on a per-user serial chain without
 * awaiting. Safe to call from a route handler that returns 202 immediately.
 * Any error is caught + logged + persisted to MarketDataUpload.status='failed'
 * — and crucially, swallowed so it doesn't break the chain for subsequent
 * uploads queued behind it.
 */
export function validateUploadAsync(uploadId: string, userId: string): void {
  const prev = userQueues.get(userId) ?? Promise.resolve();
  const next = prev.then(async () => {
    try {
      await runValidation(uploadId);
    } catch (err) {
      console.error('[validateUploadAsync] outer catch for', uploadId, err);
      // Defensive — runValidation should already mark failed on its own.
      // This catches anything thrown before the try/catch inside runValidation.
      try {
        await markUploadFailed(uploadId, err);
      } catch (err2) {
        console.error(
          '[validateUploadAsync] markFailed also threw for',
          uploadId,
          ':',
          err2,
        );
      }
      // Intentionally swallow so the chain keeps draining for this user.
    }
  });
  userQueues.set(userId, next);
  // GC: drop the entry only if it's still the tail of this user's chain.
  // (Another caller may have pushed onto it between set + finally.)
  // Also debounce-schedule the batch-completion email so a multi-month
  // backfill gets a single "X validated, Y failed" summary email after
  // the queue settles. The scheduler itself swallows the single-upload
  // case and the still-in-flight case — see backfill-email.ts.
  next.finally(() => {
    if (userQueues.get(userId) === next) {
      userQueues.delete(userId);
      try {
        scheduleBackfillCompletionEmail(userId);
      } catch (err) {
        console.error('[validateUploadAsync] backfill email schedule threw', err);
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// User message construction
// ─────────────────────────────────────────────────────────────────────────────

// Anthropic Sonnet 4 hard cap is 200K input tokens. The system prompt (cached)
// is ~35K chars ≈ 8K tokens. We budget ~120K tokens for the user message to
// leave headroom for (a) config + prior facts + the trailing TASK block AND
// (b) a ≥16K output budget after dynamic max_tokens clamping in callValidator
// (see MIN_USEFUL_OUTPUT). Dense tabular data tokenises at ~2 chars/token in
// practice, so the GROUPS block must stay under ~240K chars to keep input
// below ~120K tokens. We give it 480K with the explicit understanding that
// real-world char-to-token ratios drift; the dynamic max_tokens floor in
// callValidator is the hard backstop that throws if we still overrun.
//
// 2026-05-28: lowered from 600_000 → 480_000 after the May 2026 regression.
// At 600K chars the May upload's facts chunks pushed input to ~185K tokens,
// collapsing the output budget below the ~24K typically needed to emit a
// full neighbourhood × metric-family JSON array — chunks truncated and the
// parser salvaged only fragments (12 facts vs ~430 in Mar). Don't raise this
// back without also raising MIN_USEFUL_OUTPUT in callValidator.
const GROUPS_CHAR_BUDGET = 480_000;

// Per-call GROUPS char budget. The 480K selection budget above governs how
// aggressively low-signal groups are dropped; this tighter budget governs how
// much serialized GROUPS data we allow into a SINGLE validator call. Dense
// numeric tabular data tokenises closer to ~1 char/token than the ~2 the
// selection budget assumes, so a 480K-char chunk can blow past the 200K-token
// context window (this is exactly the May 2026 NTREIS failure: inputTokens
// ≈486K). At ~100K chars a single call's GROUPS block stays well under ~120K
// tokens, leaving ample room for the ~12K-token system prompt, config, prior
// facts, the 4K safety buffer, and the 16K minimum output budget enforced in
// callValidator. Chunks larger than this are split into multiple parallel
// calls (see splitChunkByBudget); the SUMMARY+LEADS call serializes with this
// budget directly so it self-limits to one call.
const PER_CALL_GROUPS_CHAR_BUDGET = 100_000;

// Max FACTS calls in flight at once. Even after the smart coverage cap consolidates
// the long tail, a wide market whose kept-head groups nearly all funnel into one
// chunk (e.g. NTREIS, where most rows carry no propertyType so everything lands in
// `rollups`) still fans out into several budget-sized sub-chunks. Firing them all
// via an unbounded Promise.all storms Anthropic with 529 `overloaded_error`s
// (the backoff comment in callValidator notes even 5 concurrent calls hit this)
// and balloons peak memory from many simultaneous 64K-token streams. We cap the
// fan-out here: head coverage is preserved (every sub-chunk still runs), we just
// run them in waves of this size. With the 1 SUMMARY+LEADS call running
// alongside, total in-flight stays ~= the 5 the rest of the pipeline is tuned
// for.
const FACT_CALL_CONCURRENCY = 4;

/**
 * Map over `items` running at most `limit` async tasks concurrently, preserving
 * input order in the results array. Used to bound the FACTS-call fan-out so a
 * wide market doesn't fire dozens of Anthropic calls simultaneously.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const worker = async (): Promise<void> => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

/**
 * Sample-size thresholds for low-signal group filtering, scaled to market
 * size. Big-metro uploads (Dallas, Toronto, etc.) blow past 12-15K rows and
 * produce 5-10x more segmented groups than Calgary-sized markets — keeping
 * the n>=5 floor would put us back over the 200K-token context window. The
 * thresholds escalate iteratively in selectGroupsForSerialization() until
 * the serialized payload fits GROUPS_CHAR_BUDGET, so a tighter starting
 * floor just trims the obvious noise sooner without changing the algorithm.
 */
function getMinSampleThresholds(rowCount: number): number[] {
  if (rowCount >= 15_000) return [20, 50, 100];
  if (rowCount >= 10_000) return [10, 20, 50, 100];
  return [5, 10, 20, 50, 100];
}

function isRollupGroup(g: AggregatedGroup): boolean {
  // Always-include groups: top-of-tree rollups the validator needs as anchor
  // context. (1) Citywide overall and citywide × propertyType, (2) per-
  // neighbourhood overall — i.e. groups with priceTier === null AND
  // (neighbourhood === "All Neighbourhoods" OR propertyType === null).
  if (g.priceTier !== null) return false;
  return g.neighbourhood === "All Neighbourhoods" || g.propertyType === null;
}

function formatGroupLine(g: AggregatedGroup): string {
  const round = (n: number | null, digits = 2): string =>
    n == null ? "n/a" : Number(n.toFixed(digits)).toString();
  const parts = [
    `- neighbourhood: ${g.neighbourhood}`,
    `  propertyType: ${g.propertyType ?? "n/a"}`,
    `  priceTier: ${g.priceTier ?? "n/a"}`,
    `  sampleSize: ${g.sampleSize}`,
    `  active=${g.activeCount} pending=${g.pendingCount} sold=${g.soldCount} offMarket=${g.offMarketCount}`,
    `  moi_strict: ${round(g.moiStrict)}`,
    `  moi_inclusive: ${round(g.moiInclusive)}`,
    `  medianPrice: ${round(g.medianPrice, 0)}`,
    `  medianSqft: ${round(g.medianSqft, 0)}`,
    `  psf: ${round(g.psf, 2)}`,
    `  dom_median: ${round(g.domMedian, 1)}`,
    `  dom_average: ${round(g.domAverage, 1)}`,
    `  sp_lp_ratio: ${round(g.spLpRatio, 4)}`,
    `  failure_rate_pct: ${round(g.failureRate, 2)}`,
    `  yoy_median_price_pct: ${round(g.yoy.medianPriceDelta, 2)}`,
    `  yoy_median_sqft_pct: ${round(g.yoy.medianSqftDelta, 2)}`,
    `  yoy_psf_pct: ${round(g.yoy.psfDelta, 2)}`,
    `  yoy_moi_strict_pct: ${round(g.yoy.moiStrictDelta, 2)}`,
    `  rolling90d_medianPrice: ${round(g.rolling90d.medianPrice, 0)}`,
    `  rolling90d_psf: ${round(g.rolling90d.psf, 2)}`,
    `  rolling90d_moi_strict: ${round(g.rolling90d.moiStrict, 2)}`,
    `  composition_shift_flag: ${g.compositionShiftFlag}`,
  ];
  if (g.rollupNotes.length > 0) {
    parts.push(`  rollup_notes: ${g.rollupNotes.join(" | ")}`);
  }
  if (g.usageHint) {
    parts.push(`  usage_hint: ${g.usageHint}`);
  }
  return parts.join("\n");
}

function selectGroupsForSerialization(
  groups: AggregatedGroup[],
  rowCount: number,
  charBudget: number = GROUPS_CHAR_BUDGET,
  prune: boolean = true,
): { kept: AggregatedGroup[]; threshold: number; droppedCount: number } {
  // FACTS path (prune=false): the caller has already packed these groups to fit
  // `charBudget` (see splitChunkByBudget), so we must NOT drop the small-sample
  // long tail — that pruning is exactly what starved wide markets (e.g. NTREIS)
  // of facts. Keep every group when it fits; only fall through to the bounded
  // last-resort below if a batch somehow overruns (defensive — shouldn't happen
  // because batches are pre-sized).
  if (!prune) {
    const allChars = groups.reduce((a, g) => a + formatGroupLine(g).length + 1, 0);
    if (allChars <= charBudget) {
      return { kept: groups, threshold: 0, droppedCount: 0 };
    }
    // else: fall through to the deterministic budget-bounded last resort.
  }

  // Always keep rollups. Among non-rollups, drop low-signal groups using an
  // iteratively-escalating sample-size threshold until total serialized chars
  // fit within budget. Calgary uploads commonly produce ~2000 raw groups; the
  // n≥5 cut typically gets it down to ~200-400 groups (<300K chars).
  // Big-market rowCount auto-raises the starting floor (see
  // getMinSampleThresholds) so Dallas/Toronto don't waste a pass at n=5.
  // (prune=true is the SUMMARY+LEADS path, which is a single call and cannot be
  // split, so it must self-limit by dropping low-signal groups.)
  const rollups = groups.filter(isRollupGroup);
  const segmented = groups.filter((g) => !isRollupGroup(g));
  const rollupChars = rollups.reduce((a, g) => a + formatGroupLine(g).length + 1, 0);
  for (const threshold of getMinSampleThresholds(rowCount)) {
    const survivors = segmented.filter((g) => g.soldCount >= threshold);
    const chars = survivors.reduce(
      (a, g) => a + formatGroupLine(g).length + 1,
      rollupChars,
    );
    if (chars <= charBudget) {
      const kept = [...rollups, ...survivors];
      return {
        kept,
        threshold,
        droppedCount: groups.length - kept.length,
      };
    }
  }
  // Last resort: rollups only. For very wide markets (many neighbourhoods) the
  // rollups alone can still exceed charBudget, which would push the SUMMARY+
  // LEADS call past the 200K context window — the callValidator invariant would
  // then throw "Input too large for 200K context" and the whole upload fails.
  // Enforce the budget deterministically here so the GROUPS block is *always*
  // within charBudget: keep citywide anchors first, then per-neighbourhood
  // overall rollups by descending sampleSize until the budget is hit.
  if (rollupChars <= charBudget) {
    return {
      kept: rollups,
      threshold: Infinity,
      droppedCount: groups.length - rollups.length,
    };
  }
  const rollupPriority = (g: AggregatedGroup): number => {
    if (g.neighbourhood === "All Neighbourhoods" && g.propertyType === null) return 0;
    if (g.neighbourhood === "All Neighbourhoods") return 1;
    return 2;
  };
  const orderedRollups = [...rollups].sort((a, b) => {
    const pa = rollupPriority(a);
    const pb = rollupPriority(b);
    if (pa !== pb) return pa - pb;
    if (b.sampleSize !== a.sampleSize) return b.sampleSize - a.sampleSize;
    return a.neighbourhood.localeCompare(b.neighbourhood);
  });
  const bounded: AggregatedGroup[] = [];
  let used = 0;
  for (const g of orderedRollups) {
    const cost = formatGroupLine(g).length + 1;
    if (used + cost > charBudget) continue;
    bounded.push(g);
    used += cost;
  }
  return {
    kept: bounded,
    threshold: Infinity,
    droppedCount: groups.length - bounded.length,
  };
}

function serializeTable(
  table: AggregatedTable,
  groupSubset?: AggregatedGroup[],
  chunkLabel?: string,
  charBudget: number = GROUPS_CHAR_BUDGET,
  prune: boolean = true,
): string {
  // When `groupSubset` is provided we serialize only that slice (chunked-mode).
  // Otherwise we use the whole table (legacy single-call path / SUMMARY+LEADS).
  const sourceGroups = groupSubset ?? table.groups;
  const { kept, threshold, droppedCount } = selectGroupsForSerialization(
    sourceGroups,
    table.meta.totalRowsParsed,
    charBudget,
    prune,
  );

  const meta = table.meta;
  const header = [
    `Market: ${meta.marketName}${meta.mlsSource ? ` (${meta.mlsSource})` : ""}`,
    `Month: ${meta.monthYear}`,
    `CSV: ${meta.csvFileName}`,
    `Total rows parsed: ${meta.totalRowsParsed}`,
    `Total Sold rows: ${meta.totalSold}`,
    `Empty-zone rows: ${meta.emptyZoneCount}`,
    `Unknown-status rows: ${meta.unknownStatusCount}`,
    `Date range: ${meta.dateRangeMin ?? "n/a"} → ${meta.dateRangeMax ?? "n/a"}`,
    `YoY comparison month: ${meta.yoyComparisonMonthYear ?? "none available"}`,
    `90-day rolling priors: ${meta.rolling90dMonthYears.join(", ") || "none available"}`,
    chunkLabel ? `Chunk scope: ${chunkLabel}` : null,
    `Groups in scope total: ${sourceGroups.length}`,
    `Groups included below: ${kept.length} (rollups + segmented with soldCount >= ${
      Number.isFinite(threshold) ? threshold : "rollups only"
    })`,
    `Groups omitted (low sample size): ${droppedCount}`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");

  const groupLines = kept.map(formatGroupLine);

  return [
    "=== AGGREGATED INPUT (pre-computed by server; no Claude work needed for these numbers) ===",
    header,
    "",
    "=== GROUPS ===",
    ...groupLines,
  ].join("\n");
}

function serializeConfig(config: MarketConfigShape): string {
  return [
    "=== MARKET CONFIG ===",
    `marketName: ${config.marketName}`,
    `mlsSource: ${config.mlsSource}`,
    `priceTiers: ${JSON.stringify(config.priceTiers)}`,
    `moiThresholds: ${JSON.stringify(config.moiThresholds)}`,
    `highEndException: ${JSON.stringify(config.highEndException)}`,
    `neighbourhoodVocab: ${JSON.stringify(config.neighbourhoodVocab.slice(0, 200))}`,
    `subPersonasEnabled: ${JSON.stringify(
      config.subPersonas.filter((p) => p.enabled).map((p) => p.label),
    )}`,
  ].join("\n");
}

async function serializePriorFacts(userId: string, uploadId: string): Promise<string> {
  // Pull headline-safe facts from the 3 most recent prior uploads — keep token
  // cost low by capping at ~120 rows total. The validator uses these only for
  // trajectory context, not as authoritative numbers.
  const priorUploads = await prisma.marketDataUpload.findMany({
    where: {
      userId,
      id: { not: uploadId },
      status: "validated",
    },
    orderBy: { validatedAt: "desc" },
    take: 3,
    select: { id: true, monthYear: true },
  });
  if (priorUploads.length === 0) return "=== PRIOR FACTS ===\n(none — this is the first validated upload)";

  const facts = await prisma.marketFact.findMany({
    where: {
      uploadId: { in: priorUploads.map((u) => u.id) },
      usageClass: "headline_safe",
      ...EXCLUDE_LEGACY_FAILURE_RATE,
    },
    take: 120,
    orderBy: { createdAt: "desc" },
    select: {
      uploadId: true,
      neighbourhood: true,
      metricName: true,
      metricValue: true,
      sampleSize: true,
      dateContext: true,
      marketType: true,
      trajectory: true,
    },
  });
  const byUpload = new Map<string, string>(priorUploads.map((u) => [u.id, u.monthYear]));
  const lines = facts.map(
    (f) =>
      `- ${byUpload.get(f.uploadId) ?? "?"} ${f.neighbourhood} ${f.metricName}=${
        f.metricValue ?? "n/a"
      } n=${f.sampleSize ?? "n/a"} type=${f.marketType ?? "n/a"} traj=${f.trajectory ?? "n/a"}`,
  );
  return ["=== PRIOR FACTS (3 most recent validated uploads, headline-safe only) ===", ...lines].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Chunk partitioning
// ─────────────────────────────────────────────────────────────────────────────

type ChunkName = "detached" | "attached" | "apartment" | "rollups";

interface FactsChunk {
  name: ChunkName;
  /** Human-readable label injected into the mode marker. */
  label: string;
  /** Property-type label stamped onto every MarketFact row from this chunk. */
  propertyTypeColumn: string | null;
  groups: AggregatedGroup[];
}

/** True if the property-type string belongs to the attached rollup family. */
function isAttachedType(pt: string): boolean {
  return /semi.?detached|row|townhouse|duplex/i.test(pt);
}
/** True if the property-type string is an apartment/condo. */
function isApartmentType(pt: string): boolean {
  return /apartment|condo/i.test(pt);
}
/** True if the property-type string is detached (not semi). */
function isDetachedType(pt: string): boolean {
  if (isAttachedType(pt)) return false;
  return /detached/i.test(pt);
}

/**
 * Property-type label stamped onto every MarketFact row produced by a given
 * chunk name. Single source of truth shared by buildChunks() (live validation)
 * and reconstructFromRawValidatorOutput() (persistence-only retry, which
 * rebuilds FactsBundles from a prior attempt's stored rawValidatorOutput
 * WITHOUT re-running the AI). Keep these two in lockstep — if a chunk's
 * property-type label changes here it must change for the reuse path too.
 */
function propertyTypeColumnForChunkName(name: string): string | null {
  switch (name) {
    case "detached":
      return "Detached";
    case "attached":
      return "Semi-Detached";
    case "apartment":
      return "Apartment";
    default:
      // rollups + any unrecognized/safety-net chunk carry no property type.
      return null;
  }
}

/**
 * Partition the aggregator output into 4 disjoint chunks. Every group lands in
 * exactly one chunk:
 *   - rollups: neighbourhood === "All Neighbourhoods" OR propertyType === null
 *   - detached / attached / apartment: neighbourhood-level groups for that type
 *   - any segmented group whose propertyType doesn't match the three above
 *     (e.g. "Land", "Other") falls through into `rollups` so we don't drop it.
 */
function buildChunks(groups: AggregatedGroup[]): FactsChunk[] {
  const detached: AggregatedGroup[] = [];
  const attached: AggregatedGroup[] = [];
  const apartment: AggregatedGroup[] = [];
  const rollups: AggregatedGroup[] = [];
  for (const g of groups) {
    if (g.neighbourhood === "All Neighbourhoods" || g.propertyType === null) {
      rollups.push(g);
      continue;
    }
    const pt = g.propertyType;
    if (isDetachedType(pt)) detached.push(g);
    else if (isAttachedType(pt)) attached.push(g);
    else if (isApartmentType(pt)) apartment.push(g);
    else rollups.push(g); // safety net for unrecognized types
  }
  return [
    { name: "detached", label: "Detached (neighbourhood-level)", propertyTypeColumn: propertyTypeColumnForChunkName("detached"), groups: detached },
    {
      name: "attached",
      label: "Attached: Semi-Detached + Row/Townhouse + Full Duplex (neighbourhood-level)",
      propertyTypeColumn: propertyTypeColumnForChunkName("attached"),
      groups: attached,
    },
    { name: "apartment", label: "Apartment / Condo (neighbourhood-level)", propertyTypeColumn: propertyTypeColumnForChunkName("apartment"), groups: apartment },
    {
      name: "rollups",
      label: "Citywide rollups + per-neighbourhood overalls (across all property types)",
      propertyTypeColumn: propertyTypeColumnForChunkName("rollups"),
      groups: rollups,
    },
  ];
}

/**
 * Split a single facts chunk into one or more sub-chunks, each whose serialized
 * GROUPS block fits within `charBudget`. We first drop low-signal groups via
 * the same selection the serializer uses (so we don't waste calls on groups
 * that would be filtered out anyway), then greedily pack the survivors into
 * batches. Each sub-chunk keeps the parent's name + propertyTypeColumn so the
 * merge step concatenates their facts exactly as before — the only change is
 * that a chunk that used to overflow the context window now lands as N parallel
 * calls instead of one doomed call.
 */
function splitChunkByBudget(
  chunk: FactsChunk,
  table: AggregatedTable,
  charBudget: number,
): FactsChunk[] {
  // Pack ALL groups in this chunk (NO sample-size pruning) into budget-bounded
  // batches, each of which becomes its own parallel validator call. This is the
  // core fix for the low fact-yield on wide markets: previously we pre-pruned
  // the small-sample long tail here (and again at serialize time), so most
  // neighbourhoods in a wide market (e.g. NTREIS Dallas) never reached the
  // model and produced zero facts. Covering the kept head across N
  // parallel calls trades a few extra calls for the floor on facts/sold yield.
  const groups = chunk.groups;
  if (groups.length === 0) return [chunk];

  const batches: AggregatedGroup[][] = [];
  let current: AggregatedGroup[] = [];
  let currentChars = 0;
  for (const g of groups) {
    const len = formatGroupLine(g).length + 1;
    // Start a new batch when adding this group would overflow the budget — but
    // never emit an empty batch (a single group larger than the budget still
    // gets its own batch rather than being dropped).
    if (current.length > 0 && currentChars + len > charBudget) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(g);
    currentChars += len;
  }
  if (current.length > 0) batches.push(current);

  if (batches.length <= 1) {
    // Fits in one call — hand back all groups unpruned.
    return [{ ...chunk, groups }];
  }
  return batches.map((batchGroups, i) => ({
    ...chunk,
    label: `${chunk.label} — part ${i + 1} of ${batches.length}`,
    groups: batchGroups,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Smart coverage cap (cost control)
// ─────────────────────────────────────────────────────────────────────────────
//
// Full neighbourhood coverage is prohibitively expensive on wide markets: a
// 25-month NTREIS backfill at one validator call per micro-neighbourhood ran
// $325–500. Instead of validating every neighbourhood individually we keep the
// HIGH-VOLUME head (the neighbourhoods that make up ~COVERAGE_TARGET of all sold
// volume) at full per-neighbourhood granularity, and roll the LONG TAIL — many
// tiny-volume neighbourhoods that together account for the remaining ~15% — into
// a handful of synthetic (propertyType × priceTier) "All other neighbourhoods"
// buckets. The tail still reaches the model (≈full sold coverage), but as a few
// supporting-texture rollup rows instead of hundreds of individual calls.
//
// Two markets stress this differently. SPARSE markets (e.g. NTREIS/Dallas) have
// thousands of micro-neighbourhoods, each with only a row or two — the head is
// bounded by neighbourhood count. DENSE markets (e.g. CREB/Calgary) have few
// neighbourhoods but pack many (propertyType × priceTier) groups into each, so
// the real cost driver is the GROUP count fed to the validator, not the
// neighbourhood count. We therefore cap on BOTH: neighbourhood count (for sparse
// markets) AND total head detail-group count (for dense markets). Sparse markets
// stay well under the detail-group ceiling and keep their full head unchanged.

/** Fraction of total sold volume the kept (head) neighbourhoods must cover. */
const COVERAGE_TARGET = 0.85;
/** Never cap below this many individual neighbourhoods (protects small markets). */
const MIN_KEPT_NEIGHBOURHOODS = 40;
/** Never keep more than this many individual neighbourhoods (hard cost ceiling). */
const MAX_KEPT_NEIGHBOURHOODS = 150;
/**
 * Hard ceiling on the number of granular (propertyType × priceTier) head groups
 * fed to the validator. This is the dominant cost driver on dense markets: each
 * detail group costs ~output tokens for one or more facts. Calgary at full head
 * fed ~1,170 detail groups → $5.33; capping to this keeps it ≤$3 while sparse
 * markets (≈380–410 detail groups) never reach the ceiling and are untouched.
 */
const MAX_HEAD_DETAIL_GROUPS = 550;

/**
 * Aggregate several AggregatedGroups into one synthetic group. Counts, MOI and
 * failure rate are EXACT (sums; MOI uses sold-per-month = sold count, identical
 * to the aggregator). Medians/ratios are SAMPLE-WEIGHTED APPROXIMATIONS (we no
 * longer have the raw per-listing values to pool a true median), so the result
 * is flagged usageHint = "supporting-texture-only". YoY / rolling / composition
 * are dropped (null/false) because they can't be derived from sums.
 */
function aggregateGroups(
  groups: AggregatedGroup[],
  identity: { neighbourhood: string; propertyType: string | null; priceTier: string | null },
): AggregatedGroup {
  let active = 0, pending = 0, sold = 0, offMarket = 0;
  for (const g of groups) {
    active += g.activeCount;
    pending += g.pendingCount;
    sold += g.soldCount;
    offMarket += g.offMarketCount;
  }
  // Sample-weighted mean of a per-group metric, weighting by that group's sold
  // count (its sample size). Groups with a null metric contribute nothing.
  const weighted = (pick: (g: AggregatedGroup) => number | null): number | null => {
    let num = 0, den = 0;
    for (const g of groups) {
      const v = pick(g);
      if (v == null) continue;
      const w = Math.max(g.soldCount, 1);
      num += v * w;
      den += w;
    }
    return den > 0 ? num / den : null;
  };
  const distinctHoods = new Set(groups.map((g) => g.neighbourhood)).size;
  // failure_rate = offMarket / sold (a ratio that can exceed 1.0), guarded by
  // sample-size floors. Stored as a percentage (ratio * 100) like the per-group
  // rows. failureRateRatio() returns null when under the sold/offMarket floors.
  const rollupFailureRatio = failureRateRatio(sold, offMarket);
  const rollupSaleShareRatio = saleShareRatio(sold, offMarket);
  const rollupAbsorptionRatio = absorptionRateRatio(sold, active);
  // Off-market sub-splits aren't carried on the per-group inputs to this rollup
  // (the cap pools many neighbourhoods), so the failure-rate VARIANTS can't be
  // reconstructed exactly here — leave them null (this is supporting-texture
  // only and never headline). The "all off-market" failureRate stays exact.
  const expired = groups.reduce((s, g) => s + g.expiredCount, 0);
  const terminated = groups.reduce((s, g) => s + g.terminatedCount, 0);
  const withdrawn = groups.reduce((s, g) => s + g.withdrawnCount, 0);
  const rollupExpiredOnlyRatio = failureRateRatio(sold, expired);
  const rollupExpiredPlusWithdrawnRatio = failureRateRatio(
    sold,
    expired + withdrawn,
  );
  return {
    neighbourhood: identity.neighbourhood,
    propertyType: identity.propertyType,
    priceTier: identity.priceTier,
    sampleSize: sold,
    activeCount: active,
    pendingCount: pending,
    soldCount: sold,
    offMarketCount: offMarket,
    moiStrict: sold > 0 ? active / sold : null,
    moiInclusive: sold > 0 ? (active + pending) / sold : null,
    moiInclusiveRolling3: sold > 0 ? (active + pending) / sold : null,
    medianPrice: weighted((g) => g.medianPrice),
    medianSqft: weighted((g) => g.medianSqft),
    psf: weighted((g) => g.psf),
    domMedian: weighted((g) => g.domMedian),
    domAverage: weighted((g) => g.domAverage),
    spLpRatio: weighted((g) => g.spLpRatio),
    failureRate: rollupFailureRatio == null ? null : rollupFailureRatio * 100,
    failureRateExpiredOnly:
      rollupExpiredOnlyRatio == null ? null : rollupExpiredOnlyRatio * 100,
    failureRateExpiredPlusWithdrawn:
      rollupExpiredPlusWithdrawnRatio == null
        ? null
        : rollupExpiredPlusWithdrawnRatio * 100,
    saleShare: rollupSaleShareRatio == null ? null : rollupSaleShareRatio * 100,
    absorptionRate:
      rollupAbsorptionRatio == null ? null : rollupAbsorptionRatio * 100,
    avgSalePrice: weighted((g) => g.avgSalePrice),
    benchmarkPrice: null,
    expiredCount: expired,
    terminatedCount: terminated,
    withdrawnCount: withdrawn,
    yoy: {
      medianPriceDelta: null,
      medianSqftDelta: null,
      psfDelta: null,
      moiStrictDelta: null,
    },
    rolling90d: { medianPrice: null, psf: null, moiStrict: null },
    compositionShiftFlag: false,
    rollupNotes: [
      `Synthetic long-tail rollup of ${distinctHoods} low-volume neighbourhood(s) below the coverage cap. Counts/MOI/failure-rate are exact sums; medians are sample-weighted approximations; no YoY.`,
    ],
    usageHint: "supporting-texture-only",
  };
}

/**
 * Apply the smart coverage cap to the base chunks. Ranks neighbourhoods by sold
 * volume (from the neighbourhood-overall cut), keeps the head that covers
 * COVERAGE_TARGET of sold volume (bounded by MIN/MAX), keeps every "All
 * Neighbourhoods" citywide anchor, and rolls the tail into synthetic buckets:
 *   - in each property-type chunk: one bucket per priceTier present in the tail
 *     (plus a null-tier overall bucket), all stamped "All other neighbourhoods";
 *   - in the rollups chunk: one "All other neighbourhoods" overall bucket.
 * Returns chunks unchanged when the market is small enough that the head would
 * already include (almost) every neighbourhood.
 */
function applyCoverageCap(
  baseChunks: FactsChunk[],
  table: AggregatedTable,
): { chunks: FactsChunk[]; keptCount: number; tailCount: number } {
  // Rank neighbourhoods by sold volume using the neighbourhood-overall cut.
  const nbhdSold = new Map<string, number>();
  for (const g of table.groups) {
    if (
      g.neighbourhood !== "All Neighbourhoods" &&
      g.propertyType === null &&
      g.priceTier === null
    ) {
      nbhdSold.set(g.neighbourhood, g.soldCount);
    }
  }
  const ranked = Array.from(nbhdSold.entries()).sort((a, b) => b[1] - a[1]);
  const totalNbhds = ranked.length;
  const totalSold = ranked.reduce((a, [, s]) => a + s, 0);

  // Per-neighbourhood granular (propertyType × priceTier) group count. This —
  // not raw neighbourhood count — is the dominant validator cost on dense
  // markets, so we also cap the cumulative head detail-group count below.
  const detailByNbhd = new Map<string, number>();
  for (const g of table.groups) {
    if (g.neighbourhood === "All Neighbourhoods") continue;
    if (g.propertyType === null && g.priceTier === null) continue; // overall cut
    detailByNbhd.set(g.neighbourhood, (detailByNbhd.get(g.neighbourhood) ?? 0) + 1);
  }

  // No cap needed when the market is small: keeping the head would already
  // cover (nearly) all neighbourhoods, so leave chunks untouched.
  if (totalNbhds <= MIN_KEPT_NEIGHBOURHOODS || totalSold <= 0) {
    return { chunks: baseChunks, keptCount: totalNbhds, tailCount: 0 };
  }

  // Walk the ranking until cumulative sold reaches COVERAGE_TARGET, clamped to
  // [MIN_KEPT, MAX_KEPT] neighbourhoods AND to MAX_HEAD_DETAIL_GROUPS granular
  // groups (the dense-market cost ceiling). Both ceilings only bind once the
  // MIN_KEPT floor is met.
  let cum = 0;
  let detail = 0;
  let keptCount = 0;
  for (const [n, s] of ranked) {
    const d = detailByNbhd.get(n) ?? 0;
    // Stop before exceeding the detail-group budget (dense markets).
    if (keptCount >= MIN_KEPT_NEIGHBOURHOODS && detail + d > MAX_HEAD_DETAIL_GROUPS) {
      break;
    }
    keptCount += 1;
    cum += s;
    detail += d;
    if (cum / totalSold >= COVERAGE_TARGET && keptCount >= MIN_KEPT_NEIGHBOURHOODS) {
      break;
    }
    if (keptCount >= MAX_KEPT_NEIGHBOURHOODS) break;
  }
  keptCount = Math.max(MIN_KEPT_NEIGHBOURHOODS, Math.min(keptCount, MAX_KEPT_NEIGHBOURHOODS));

  // If the head ends up covering essentially everything, skip the cap.
  if (keptCount >= totalNbhds) {
    return { chunks: baseChunks, keptCount: totalNbhds, tailCount: 0 };
  }

  const keptSet = new Set(ranked.slice(0, keptCount).map(([n]) => n));
  const tailCount = totalNbhds - keptCount;

  const cappedChunks = baseChunks.map((chunk): FactsChunk => {
    if (chunk.name === "rollups") {
      // Keep all citywide anchors + kept-neighbourhood overalls. Roll the
      // neighbourhood-overall tail (propertyType null) into one synthetic bucket.
      const kept: AggregatedGroup[] = [];
      const tail: AggregatedGroup[] = [];
      for (const g of chunk.groups) {
        if (g.neighbourhood === "All Neighbourhoods" || keptSet.has(g.neighbourhood)) {
          kept.push(g);
        } else if (g.propertyType === null && g.priceTier === null) {
          tail.push(g);
        }
        // Other tail groups (rare safety-net types) are represented by the
        // property-chunk rollups below; dropping them here avoids double count.
      }
      if (tail.length > 0) {
        kept.push(
          aggregateGroups(tail, {
            neighbourhood: "All other neighbourhoods",
            propertyType: null,
            priceTier: null,
          }),
        );
      }
      return { ...chunk, groups: kept };
    }

    // Property-type chunk: keep the head neighbourhoods, bucket the tail by
    // priceTier (string | null) into synthetic rollups.
    const kept: AggregatedGroup[] = [];
    const tailByTier = new Map<string | null, AggregatedGroup[]>();
    for (const g of chunk.groups) {
      if (keptSet.has(g.neighbourhood)) {
        kept.push(g);
        continue;
      }
      const tier = g.priceTier;
      const arr = tailByTier.get(tier);
      if (arr) arr.push(g);
      else tailByTier.set(tier, [g]);
    }
    for (const [tier, tailGroups] of tailByTier.entries()) {
      kept.push(
        aggregateGroups(tailGroups, {
          neighbourhood: "All other neighbourhoods",
          propertyType: chunk.propertyTypeColumn,
          priceTier: tier,
        }),
      );
    }
    return { ...chunk, groups: kept };
  });

  return { chunks: cappedChunks, keptCount, tailCount };
}

// ─────────────────────────────────────────────────────────────────────────────
// User-message builders (one per call mode)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Member-selected methodology guidance, injected into every validator call so
 * the LLM frames its prose under the member's chosen variants. Returns "" when
 * the member is on the Default preset — that keeps an untouched member's prompt
 * (and therefore prose + prompt-cache key) byte-identical to today's behaviour.
 *
 * The block surfaces the chosen variants as PRIMARY METRICS (headline-safe) and
 * labels every alternate as SUPPORTING TEXTURE ONLY, disables the failure-rate
 * family entirely when the member opted out, and states the neighbourhood
 * sample floor that gates fact emission.
 */
function buildMethodologyBlock(settings: MemberMethodologySettings): string {
  if (settingsEqual(settings, DEFAULT_METHODOLOGY)) return "";

  const lines: string[] = [
    "=== METHODOLOGY (member-selected — OVERRIDES default framing) ===",
    "The member has chosen how their derived stats should be framed. Treat the",
    "variants named PRIMARY below as the only headline-safe framing; every other",
    'variant of the same family is "supporting texture only" — never headline it.',
    "",
  ];

  // Months of Inventory
  const moiPrimary =
    settings.moiVariant === "active_only_single"
      ? "moi_strict (Active ÷ Sold, single month)"
      : settings.moiVariant === "active_plus_pending_rolling3"
        ? "moi_inclusive_rolling3 ((Active+Pending) ÷ trailing-3-month avg Sold)"
        : "moi_inclusive ((Active+Pending) ÷ Sold, single month)";
  lines.push(`MONTHS OF INVENTORY — PRIMARY: ${moiPrimary}.`);
  lines.push(
    "  All other MOI variants: supporting texture only — do NOT headline.",
  );

  // Days on Market
  if (settings.domVariant === "both") {
    lines.push(
      "DAYS ON MARKET — PRIMARY: report BOTH median and average DOM together in one fact (state which is which).",
    );
  } else {
    const domPrimary =
      settings.domVariant === "median" ? "dom_median" : "dom_average";
    lines.push(`DAYS ON MARKET — PRIMARY: ${domPrimary}.`);
    lines.push(
      "  The other DOM variant: supporting texture only — do NOT headline.",
    );
  }

  // Failure rate
  if (settings.failureRateVariant === "disabled") {
    lines.push(
      "FAILURE RATE — DISABLED: emit ZERO failure_rate facts. Skip the failure_rate family entirely; do not mention listing-failure or sale-share statistics.",
    );
  } else {
    const frPrimary =
      settings.failureRateVariant === "expired_only"
        ? "failure_rate over EXPIRED listings only"
        : settings.failureRateVariant === "expired_plus_withdrawn"
          ? "failure_rate over EXPIRED + WITHDRAWN listings"
          : "failure_rate over ALL off-market listings";
    lines.push(`FAILURE RATE — PRIMARY: ${frPrimary}.`);
    lines.push(
      "  Use the matching pre-computed failure_rate value from the GROUPS block; other failure-rate denominators are supporting texture only.",
    );
  }

  // Sale price
  const spPrimary =
    settings.salePriceVariant === "average"
      ? "average sale price (mean closing price)"
      : settings.salePriceVariant === "benchmark"
        ? "benchmark/HPI price when present, else fall back to median sale price"
        : "median sale price";
  lines.push(`SALE PRICE — PRIMARY: ${spPrimary}.`);
  lines.push(
    "  Other price measures: supporting texture only — do NOT headline.",
  );

  // Sample size floor
  const floor = sampleFloorFor(settings.sampleSizeVariant);
  lines.push(
    `SAMPLE SIZE — A neighbourhood needs at least ${floor.sold} closed sales (and ${floor.offMarket} off-market listings for failure/sale-share) before any of its facts may be headline-safe. Below the floor, emit the fact as supporting-texture-only or skip it.`,
  );

  return lines.join("\n");
}

/**
 * The methodology snapshot stamped onto every persisted MarketFact row so the
 * re-validate endpoint can detect rows framed under a now-stale methodology and
 * admin tooling has an audit trail. Stored as plain JSON (the five variants).
 */
function methodologyVariantJson(
  settings: MemberMethodologySettings,
): Prisma.InputJsonValue {
  return {
    moiVariant: settings.moiVariant,
    domVariant: settings.domVariant,
    failureRateVariant: settings.failureRateVariant,
    salePriceVariant: settings.salePriceVariant,
    sampleSizeVariant: settings.sampleSizeVariant,
  };
}

function buildFactsChunkMessage(
  table: AggregatedTable,
  config: MarketConfigShape,
  priorFactsBlock: string,
  chunk: FactsChunk,
  methodologyBlock: string,
): string {
  const hasRollupTail = chunk.groups.some((g) => g.usageHint);
  const modeMarker = [
    "=== MODE: FACTS_LIBRARY_ONLY ===",
    `Scope for this call: ${chunk.label}.`,
    "Emit ONLY the `## VALIDATED FACTS LIBRARY` section — a single ```json``` fenced code block containing a JSON array of fact objects.",
    "Do NOT emit `## SUMMARY` or `## STORY LEADS` in this call. Those are produced by a separate parallel call over the full dataset.",
    "Cover EVERY neighbourhood that appears in the GROUPS block below — do not curate which neighbourhoods to include. Apply the per-neighbourhood × metric-family classification rules from the system prompt to each one. Small-sample neighbourhoods are NOT to be skipped: emit a fact for them and classify it as supporting-texture-only (per the sample-size hygiene rules) rather than omitting it.",
    ...(hasRollupTail
      ? [
          'Some GROUPS below carry `usage_hint: supporting-texture-only`. Each such group is the "All other neighbourhoods" bucket — a synthetic rollup of many low-volume neighbourhoods below the coverage cap. Its counts / MOI / failure-rate are exact sums, but its medians (price, sqft, psf, DOM, SP/LP) are SAMPLE-WEIGHTED APPROXIMATIONS, not true pooled medians, and it has no YoY. Emit facts for these buckets, but you MUST set `usageClass` to "supporting-texture-only" (never "headline-safe") and state in `usage_notes` that the value is a multi-neighbourhood rollup with approximate medians.',
        ]
      : []),
  ].join("\n");
  return [
    modeMarker,
    "",
    // prune=false: every group in this (already budget-sized) chunk is
    // serialized — the long tail is covered, never silently dropped.
    serializeTable(table, chunk.groups, chunk.label, GROUPS_CHAR_BUDGET, false),
    "",
    serializeConfig(config),
    ...(methodologyBlock ? ["", methodologyBlock] : []),
    "",
    priorFactsBlock,
    "",
    "=== TASK ===",
    "Output ONLY this — nothing else, no prose before or after:",
    "## VALIDATED FACTS LIBRARY",
    "```json",
    "[ /* fact objects per the OUTPUT FORMAT in the system prompt */ ]",
    "```",
    "Use the pre-computed numbers in the GROUPS block verbatim — do not recompute them. Your job is to classify, label, triangulate, and emit facts for every neighbourhood × applicable metric family in scope.",
  ].join("\n");
}

function buildSummaryAndLeadsMessage(
  table: AggregatedTable,
  config: MarketConfigShape,
  priorFactsBlock: string,
  methodologyBlock: string,
): string {
  const modeMarker = [
    "=== MODE: SUMMARY_AND_LEADS_ONLY ===",
    "Scope for this call: the full dataset (all property types, all neighbourhoods).",
    "Emit ONLY `## SUMMARY` and `## STORY LEADS`. Do NOT emit `## VALIDATED FACTS LIBRARY` — facts are produced by four separate parallel calls, one per property-type slice.",
    "The SUMMARY block's `Validated facts: N` count refers to the merged total across those four chunks — quote it as `(see facts library)` or estimate based on group coverage.",
  ].join("\n");
  return [
    modeMarker,
    "",
    summarySerializeTable(table),
    "",
    serializeConfig(config),
    ...(methodologyBlock ? ["", methodologyBlock] : []),
    "",
    priorFactsBlock,
    "",
    "=== TASK ===",
    "Output ONLY these two H2 sections, in this exact order:",
    "  ## SUMMARY",
    "  ## STORY LEADS",
    "Do NOT include `## VALIDATED FACTS LIBRARY`. Use the pre-computed numbers in the GROUPS block — do not recompute them.",
  ].join("\n");
}

// The SUMMARY+LEADS call needs a holistic view of the whole table, so it can't
// be split across calls the way facts chunks can. Instead we serialize it with
// the tighter per-call budget so selection drops enough low-signal groups to
// keep this single call under the context window.
function summarySerializeTable(table: AggregatedTable): string {
  return serializeTable(table, undefined, undefined, PER_CALL_GROUPS_CHAR_BUDGET);
}

/** Legacy single-call builder kept for backward-compat / debug paths. */
function buildUserMessage(
  table: AggregatedTable,
  config: MarketConfigShape,
  priorFactsBlock: string,
): string {
  return [
    serializeTable(table),
    "",
    serializeConfig(config),
    "",
    priorFactsBlock,
    "",
    "=== TASK ===",
    "Apply your FACT VALIDATOR MODE instructions to the data above. Output the three sections in the exact format the system prompt defines:",
    "  ## SUMMARY",
    "  ## STORY LEADS",
    "  ## VALIDATED FACTS LIBRARY",
    "Use the pre-computed numbers in the GROUPS block — do not recompute them. Your job is to classify, label, triangulate, and curate.",
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Anthropic call (system caching + structured cost capture)
// ─────────────────────────────────────────────────────────────────────────────

interface AnthropicCall {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreateTokens: number;
  cacheReadTokens: number;
  costUsd: Decimal;
}

/**
 * Wraps callValidator with a single-shot retry for transient SDK stream
 * cuts ("terminated" / "aborted"). The inner callValidator already does
 * exponential backoff for 429/503/529/overloaded_error etc., but stream
 * disconnects from a long-running `messages.stream().finalMessage()` surface
 * as a bare `terminated` / `aborted` Error with no status code, which slips
 * through that loop. We retry exactly once with a 2s pause — enough to ride
 * out a transient network/SDK glitch; never enough to thrash if Anthropic
 * is genuinely down.
 *
 * 4xx errors (real bad-request / auth) and unrecognised errors are NOT
 * retried — those need a real fix, not a re-fire.
 */
async function callValidatorWithStreamCutRetry(
  systemPrompt: string,
  userMessage: string,
  retryNote?: string,
): Promise<AnthropicCall> {
  try {
    return await callValidator(systemPrompt, userMessage, retryNote);
  } catch (err) {
    const e = err as { status?: number; name?: string; message?: string };
    const msg = e?.message ?? String(err);
    // Only retry if the error is a true SDK-level stream abort — no HTTP
    // status code present (i.e. didn't come back as a structured API error
    // like 400/401/403), and the message/name matches a known abort
    // signature. This avoids accidentally retrying a semantic 4xx whose
    // body just happens to contain "aborted" or "terminated" as text.
    const isStreamCut =
      e?.status == null &&
      (/^(?:terminated|aborted)$/i.test(msg) ||
        /\bAbortError\b/.test(e?.name ?? "") ||
        /\b(?:stream (?:disconnect|interrupt|terminated|aborted)|premature close|socket hang up)\b/i.test(
          msg,
        ));
    if (!isStreamCut) throw err;
    console.warn(
      `[callValidator] one-shot retry after stream cut: ${msg.slice(0, 200)}`,
    );
    await new Promise((r) => setTimeout(r, 2_000));
    return await callValidator(systemPrompt, userMessage, retryNote);
  }
}

async function callValidator(
  systemPrompt: string,
  userMessage: string,
  retryNote?: string,
): Promise<AnthropicCall> {
  // Anthropic SDK types: cache_control isn't typed on all message variants,
  // so we cast the system block to `any` to attach it. The HTTP wire format
  // accepts it identically. `systemPrompt` is the market-resolved Fact Validator
  // prompt, built once per upload in runValidation so all calls share the same
  // string → the ephemeral prompt cache is written once and read by the rest.
  const systemBlocks = [
    {
      type: "text",
      text: systemPrompt,
      cache_control: { type: "ephemeral" as const },
    },
  ];

  const messages: Anthropic.Messages.MessageParam[] = [
    { role: "user", content: userMessage },
  ];
  if (retryNote) {
    messages.push({
      role: "user",
      content: `Your previous response didn't match the required structure (no parseable facts or story leads). Re-emit your output with the three required H2 sections (## SUMMARY, ## STORY LEADS, ## VALIDATED FACTS LIBRARY) in the exact format defined in the system prompt's OUTPUT FORMAT section. ${retryNote}`,
    });
  }

  // Streaming required: at 32K max_tokens the projected duration can exceed
  // Anthropic's 10-minute synchronous-call ceiling. `messages.stream(...)`
  // accumulates deltas internally; `finalMessage()` returns the same shape as
  // `messages.create(...)` would, including `usage`.
  //
  // Retry-with-backoff on transient errors. 5 concurrent chunked calls
  // routinely hit Anthropic 529 `overloaded_error`; we retry up to 4 times
  // with exponential backoff (~1s/3s/9s/27s) before giving up.
  const TRANSIENT_STATUSES = new Set([408, 429, 500, 502, 503, 504, 529]);
  // Streaming errors from the SDK arrive with status=undefined and the real
  // error shape nested: err.error.error.type for the inner Anthropic type. The
  // SDK also stuffs the full JSON into err.message. We match on both the
  // nested type AND a permissive regex over the message string.
  const TRANSIENT_TYPES = new Set([
    "overloaded_error",
    "rate_limit_error",
    "api_error",
    "service_unavailable",
    "timeout",
  ]);
  const isTransient = (err: unknown): boolean => {
    const e = err as {
      status?: number;
      error?: { type?: string; error?: { type?: string } };
      message?: string;
    };
    if (e?.status && TRANSIENT_STATUSES.has(e.status)) return true;
    if (e?.error?.type && TRANSIENT_TYPES.has(e.error.type)) return true;
    if (e?.error?.error?.type && TRANSIENT_TYPES.has(e.error.error.type)) return true;
    const msg = e?.message ?? "";
    if (
      /overloaded|rate.?limit|temporar|ECONN|ETIMEDOUT|fetch failed|api_error|internal server error|service unavailable|stream (?:disconnect|interrupt)|\b(?:502|503|504|529)\b/i.test(
        msg,
      )
    ) {
      return true;
    }
    return false;
  };

  // Dynamic max_tokens. A fixed 40K ceiling collided with Anthropic's 200K
  // context limit on large summary chunks (input ≈170–185K + 40K out > 200K
  // → 400 invalid_request_error). We size the output budget to whatever fits
  // alongside the actual input, with a 4K safety buffer, floor 8K, cap 64K.
  //
  // We use Anthropic's count_tokens endpoint rather than a chars/4 heuristic
  // because our payloads are dense tabular numeric data that tokenises at
  // ~2 chars/token, not the ~4 typical of English prose. A heuristic miss of
  // 2x is the difference between "fits in 200K" and "400 invalid_request".
  // count_tokens adds ~100ms per call, negligible vs. the multi-minute
  // streaming response that follows. On failure (e.g. transient network),
  // fall back to a deliberately pessimistic chars/2 estimate so we still
  // leave headroom.
  const CONTEXT_WINDOW = 200_000;
  const SAFETY_BUFFER = 4_000;
  const MODEL_OUTPUT_CAP = 64_000;
  // 2026-05-28: raised from 4_000 → 16_000 after the May 2026 regression.
  // A 4K floor is far below the ~24K output a full per-property-type facts
  // chunk needs for a mid-size market (Calgary: ~150 neighbourhoods × 3-5
  // metric families = ~600 JSON objects ≈ 28K tokens). At 4K, runs silently
  // truncated and the parser salvaged only the first dozen facts. 16K is
  // chosen so a single H2 section can land coherently for either FACTS or
  // SUMMARY+LEADS; if we can't get 16K, the GROUPS block must shrink
  // upstream (lower GROUPS_CHAR_BUDGET, or split chunks finer in
  // buildChunks()).
  const MIN_USEFUL_OUTPUT = 16_000;
  let inputTokenEstimate: number;
  try {
    const ct = await anthropic.messages.countTokens({
      model: SONNET_MODEL,
      system: systemBlocks as unknown as Anthropic.Messages.TextBlockParam[],
      messages,
    });
    inputTokenEstimate = ct.input_tokens;
  } catch (err) {
    // Pessimistic fallback: ~2 chars/token for the dense user message + an
    // explicit system-prompt estimate from its actual length (not a flat
    // constant), plus 2K for retryNote / wire overhead. Used only when
    // count_tokens itself fails — rare, but the estimate must not undershoot.
    const systemPromptEst = Math.ceil(systemPrompt.length / 3);
    inputTokenEstimate =
      Math.ceil(userMessage.length / 2) + systemPromptEst + 2_000;
    console.warn(
      `[callValidator] count_tokens failed, using pessimistic estimate=${inputTokenEstimate}: ${
        (err as { message?: string })?.message ?? String(err)
      }`,
    );
  }

  // Strict invariant: input + max_tokens + buffer <= 200K. If the input
  // alone (with buffer + MIN_USEFUL_OUTPUT) already overflows, do NOT just
  // clamp max_tokens to 8K — that re-creates the 400 we set out to fix.
  // Fail fast with a clear, actionable error so the operator knows the
  // payload needs more chunking upstream.
  const remaining = CONTEXT_WINDOW - inputTokenEstimate - SAFETY_BUFFER;
  if (remaining < MIN_USEFUL_OUTPUT) {
    throw new Error(
      `Input too large for 200K context: inputTokens=${inputTokenEstimate}, remaining=${remaining} < min ${MIN_USEFUL_OUTPUT}. Reduce chunk size in buildChunks() / buildSummaryAndLeadsMessage().`,
    );
  }
  const dynamicMaxTokens = Math.min(MODEL_OUTPUT_CAP, remaining);
  console.log(
    `[callValidator] max_tokens=${dynamicMaxTokens} (inputTokens=${inputTokenEstimate}, msgChars=${userMessage.length})`,
  );

  let resp: Anthropic.Messages.Message | null = null;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const stream = anthropic.messages.stream(
        {
          model: SONNET_MODEL,
          max_tokens: dynamicMaxTokens,
          system: systemBlocks as unknown as Anthropic.Messages.TextBlockParam[],
          messages,
        },
        { headers: { "anthropic-beta": "output-128k-2025-02-19" } },
      );
      resp = await stream.finalMessage();
      break;
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || attempt === 4) throw err;
      const delayMs = 1000 * Math.pow(3, attempt) + Math.floor(Math.random() * 500);
      console.warn(
        `[callValidator] transient error attempt=${attempt + 1}, retrying in ${delayMs}ms: ${
          (err as { message?: string })?.message ?? String(err)
        }`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  if (!resp) throw lastErr ?? new Error("callValidator failed with no response");

  // Surface max_tokens ceiling hits — they cause truncated output and dropped
  // facts. The parser has salvage logic for truncated JSON arrays, but the
  // 2026-05-28 May regression showed truncation silently degraded fact counts
  // from ~430 to 12. Log at ERROR level so it shows up in the deployment-log
  // ERROR filter, not just warnings.
  const stopReason = (resp as { stop_reason?: string }).stop_reason;
  if (stopReason === "max_tokens") {
    console.error(
      `[mdv telemetry] phase=callValidator.truncated max_tokens=${dynamicMaxTokens} outputTokens=${
        (resp.usage as { output_tokens?: number })?.output_tokens ?? "?"
      } inputTokens=${inputTokenEstimate} msgChars=${userMessage.length} — output truncated mid-emit; downstream parser will salvage what it can`,
    );
  }

  const text = resp.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();

  const usage = resp.usage as unknown as {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const cacheCreateTokens = usage.cache_creation_input_tokens ?? 0;
  const cacheReadTokens = usage.cache_read_input_tokens ?? 0;

  const costUsd = new Decimal(inputTokens)
    .mul(SONNET_INPUT_COST_PER_TOKEN)
    .add(new Decimal(outputTokens).mul(SONNET_OUTPUT_COST_PER_TOKEN))
    .add(new Decimal(cacheCreateTokens).mul(SONNET_CACHE_WRITE_PER_TOKEN))
    .add(new Decimal(cacheReadTokens).mul(SONNET_CACHE_READ_PER_TOKEN));

  return { text, inputTokens, outputTokens, cacheCreateTokens, cacheReadTokens, costUsd };
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────────────────────────────────────

function mapFactToPrisma(
  fact: ParsedFact,
  uploadId: string,
  userId: string,
  propertyTypeColumn: string | null = null,
  methodologyVariant: Prisma.InputJsonValue = Prisma.JsonNull as unknown as Prisma.InputJsonValue,
): Prisma.MarketFactCreateManyInput {
  // Aggregate `notes` from extraNotes + any prompt-emitted text we didn't pull
  // into a column. Keeps every raw scrap accessible for audit.
  const notes = fact.extraNotes ?? null;
  return {
    userId,
    uploadId,
    methodologyVariant,
    neighbourhood: fact.neighbourhood,
    // In chunked mode we know which property-type slice the fact came from, so
    // we stamp the column. Rollup chunk + legacy single-call path pass null.
    propertyType: propertyTypeColumn,
    priceTier: null,
    metricName: fact.metricName,
    metricFamily: fact.metricFamily as ParsedMetricFamily,
    metricValue: fact.metricValue,
    metricValueString: fact.metricValueString,
    sampleSize: fact.sampleSize,
    timeWindow: fact.timeWindow,
    dateContext: null,
    sourceUrl: fact.sourceUrl,
    sourceTitle: fact.sourceTitle,
    notes,
    marketType: fact.marketType ?? undefined,
    trajectory: fact.trajectory ?? undefined,
    usageClass: fact.usageClass,
    moiStrict: fact.moiStrict,
    moiInclusive: fact.moiInclusive,
    domMedian: fact.domMedian,
    domAverage: fact.domAverage,
    crebAligned: fact.crebAligned ?? null,
    crebDeltaEstimate: fact.crebDeltaEstimate,
    viewerCaveat: fact.viewerCaveat,
    inventoryGapWithCreb: fact.inventoryGapWithCreb,
    failureRateFormula: fact.failureRateFormula,
    usageNotes: fact.usageNotes,
    // v2 = offMarket/sold methodology. Legacy rows (offMarket/(offMarket+sold))
    // were backfilled to "legacy_v1" and are excluded from failure_rate
    // citation queries. Stamp every new fact v2; the filter keys on the family.
    methodologyVersion: "v2",
  };
}

function mapLeadToPrisma(
  lead: ParsedStoryLead,
  uploadId: string,
  userId: string,
): Parameters<typeof prisma.marketStoryLead.create>[0]["data"] {
  return {
    userId,
    uploadId,
    scanType: lead.scanType,
    pattern: lead.pattern,
    dataThreads: lead.dataThreads,
    whyItMatters: lead.whyItMatters,
    suggestedRotationSlot: lead.rotationSlot ?? undefined,
    suggestedSubPersonas: lead.subPersonas,
    suggestedFramework: lead.suggestedFramework,
    tactileType: lead.tactileType,
    label: lead.label,
    isThesisLead: lead.isThesisLead,
    displayOrder: lead.displayOrder,
  };
}

/**
 * A bundle of facts + the property-type column they should be stamped with.
 * Used by the chunked persist path so each chunk's facts get the right
 * propertyType in the MarketFact row.
 */
interface FactsBundle {
  facts: ParsedFact[];
  propertyTypeColumn: string | null;
}

/**
 * Persistence-only retry support. Rebuild the parsed FactsBundles + story leads
 * from a prior attempt's stored `rawValidatorOutput`, WITHOUT calling the AI.
 *
 * runValidation persists the concatenated raw chunk texts BEFORE the DB write,
 * in this exact shape (see the `concatenatedRaw` builder):
 *   --- CHUNK DETACHED ---\n<text>\n\n--- CHUNK ATTACHED ---\n<text> ...
 *   \n\n--- SUMMARY+LEADS ---\n<text>
 * So when the AI step succeeded but the save failed (the P2028 bug), the blob is
 * already on the row. We split on those headers, re-parse each segment with the
 * same chunk parsers used live, and recover each chunk's property-type via
 * propertyTypeColumnForChunkName — yielding identical FactsBundles to the
 * original run at $0 AI cost.
 */
function reconstructFromRawValidatorOutput(raw: string): {
  factsBundles: FactsBundle[];
  storyLeads: ParsedStoryLead[];
} {
  const factsBundles: FactsBundle[] = [];
  let storyLeads: ParsedStoryLead[] = [];
  // Group 1 = chunk name (CHUNK <NAME>); undefined for the SUMMARY+LEADS header.
  const headerRe = /^--- (?:CHUNK (\w+)|SUMMARY\+LEADS) ---$/gm;
  const matches = [...raw.matchAll(headerRe)];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const bodyStart = (m.index ?? 0) + m[0].length;
    const bodyEnd =
      i + 1 < matches.length ? (matches[i + 1].index ?? raw.length) : raw.length;
    const body = raw.slice(bodyStart, bodyEnd).trim();
    const chunkName = m[1];
    if (chunkName === undefined) {
      storyLeads = parseSummaryAndLeadsChunk(body).storyLeads;
    } else {
      factsBundles.push({
        facts: parseFactsChunk(body),
        propertyTypeColumn: propertyTypeColumnForChunkName(chunkName.toLowerCase()),
      });
    }
  }
  return { factsBundles, storyLeads };
}

async function persistResults(
  uploadId: string,
  userId: string,
  factsBundles: FactsBundle[],
  leads: ParsedStoryLead[],
  costUsd: Decimal,
  inputTokens: number,
  outputTokens: number,
  factYieldPct: number,
  methodologyVariant: Prisma.InputJsonValue,
): Promise<void> {
  const allFactRows = factsBundles.flatMap((b) =>
    b.facts.map((f) =>
      mapFactToPrisma(f, uploadId, userId, b.propertyTypeColumn, methodologyVariant),
    ),
  );

  // Idempotent replace. Because the bulk inserts below run OUTSIDE a transaction
  // (see why immediately after), a persist that dies mid-way can leave facts/
  // leads on the row while the upload stays "failed". Retries (member retry +
  // admin re-validate, incl. the $0 reuse path) re-enter here — and MarketFact/
  // MarketStoryLead carry no upload-scoped uniqueness — so without this clear a
  // retry would APPEND a second copy and validate the upload with doubled
  // counts. Deleting first makes every run a clean replace regardless of caller
  // or how the prior attempt failed. (Admin re-validate also deletes up front;
  // a second delete here is harmless.)
  await prisma.marketFact.deleteMany({ where: { uploadId } });
  await prisma.marketStoryLead.deleteMany({ where: { uploadId } });

  // Bulk inserts run OUTSIDE any interactive transaction. For large markets
  // (Phil's metros routinely yield 300-400+ facts) wrapping these in a single
  // interactive transaction blew past Prisma's default 5s timeout and threw
  // P2028 ("expired transaction") AFTER the ~$2 of AI work had already been
  // spent — so every retry re-burned the cost and failed at the same wall.
  // These bulk writes don't need to be atomic with the status flip: if a fact
  // insert fails mid-batch the upload stays pre-"validated" and a re-validate
  // simply re-writes them (cheap, and — when rawValidatorOutput is reused —
  // with no new AI cost). createMany is a single statement, so it is not
  // subject to the interactive-transaction budget.
  if (allFactRows.length > 0) {
    await prisma.marketFact.createMany({ data: allFactRows });
  }
  if (leads.length > 0) {
    // Story Lead → Video carry-over: persist the source MarketFact PKs on each
    // lead at generation time so "Use as Video" can hand over real fact ids
    // instead of re-deriving them from the display dataThreads strings later.
    // createMany doesn't return ids, so requery the just-inserted facts and run
    // the SAME pure resolver the route uses. Best-effort: a parse miss just
    // leaves the lead textual (it still routes through the runtime resolver).
    const insertedFacts = await prisma.marketFact.findMany({
      where: { uploadId },
      select: {
        id: true,
        neighbourhood: true,
        metricFamily: true,
        metricValue: true,
        dateContext: true,
        createdAt: true,
      },
    });
    const resolverFacts: ResolverFact[] = insertedFacts.map((f) => ({
      id: f.id,
      neighbourhood: f.neighbourhood,
      metricFamily: String(f.metricFamily),
      value: f.metricValue,
      date: f.dateContext ?? f.createdAt,
    }));
    const knownHoods = [
      ...new Set(
        insertedFacts
          .map((f) => f.neighbourhood)
          .filter((h): h is string => !!h && h.trim().length > 0),
      ),
    ];

    // createMany doesn't take Json fields cleanly on all providers — do
    // individual creates for the small N (3-8 leads per validation).
    for (const lead of leads) {
      const threads = parseDataThreadStrings(lead.dataThreads, knownHoods);
      const matchedIds: string[] = [];
      const seen = new Set<string>();
      for (const thread of threads) {
        const m = matchThreadToFacts(thread, resolverFacts);
        if (m && !seen.has(m.factId)) {
          seen.add(m.factId);
          matchedIds.push(m.factId);
        }
      }
      const data = mapLeadToPrisma(lead, uploadId, userId);
      data.anchorFactId = matchedIds[0] ?? null;
      data.supportingFactIds = matchedIds.slice(1);
      await prisma.marketStoryLead.create({ data });
    }
  }

  // Only the small, fast, must-be-atomic pair stays in a transaction: flip the
  // upload to "validated" and record AI usage together so we never mark an
  // upload validated without billing it (or vice-versa). On a persistence-only
  // retry costUsd is 0 (no AI call was made) — skip the usage row so we don't
  // double-charge for an upload whose AI step already succeeded earlier.
  await prisma.$transaction(async (tx) => {
    await tx.marketDataUpload.update({
      where: { id: uploadId },
      data: {
        status: "validated",
        validatedAt: new Date(),
        validationCostUsd: costUsd.toNumber(),
        factYieldPct,
        validationError: null,
      },
    });
    if (costUsd.greaterThan(0)) {
      await tx.aIToolUsage.create({
        data: {
          userId,
          toolType: "fact_validator",
          inputTokens,
          outputTokens,
          costUsd: costUsd.toString(),
        },
      });
    }
  });
}

/**
 * WS2B — auto-seed the member's neighbourhood vocabulary from their uploaded
 * MLS data. After a market-data upload validates, every distinct subdivision /
 * neighbourhood that appeared in the CSV is merged into
 * `MarketConfig.neighbourhoodVocab`, so members outside the originally
 * Calgary-tuned default vocab build an adaptive, market-specific list from
 * their own uploads instead of starting with a too-narrow list. Case /
 * whitespace / punctuation variants collapse to a single entry. Non-fatal: a
 * failure here never blocks validation (the caller wraps it in try/catch).
 */
async function seedNeighbourhoodVocabFromUpload(
  userId: string,
  neighbourhoods: string[],
): Promise<void> {
  const normKey = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  const cleaned = neighbourhoods
    .map((n) => n.trim().replace(/\s+/g, " "))
    .filter((n) => {
      const key = normKey(n);
      return key.length > 0 && key !== "unknown" && key !== "all neighbourhoods";
    });
  if (cleaned.length === 0) return;

  const cfg = await prisma.marketConfig.findUnique({
    where: { userId },
    select: { neighbourhoodVocab: true },
  });
  if (!cfg) return;
  const existing = Array.isArray(cfg.neighbourhoodVocab)
    ? (cfg.neighbourhoodVocab as unknown[]).filter(
        (v): v is string => typeof v === "string",
      )
    : [];

  // Dedupe by normalized key; keep the first-seen display form (existing
  // entries win over new ones so a member's curated casing is preserved).
  const seen = new Map<string, string>();
  for (const name of [...existing, ...cleaned]) {
    const key = normKey(name);
    if (!key) continue;
    if (!seen.has(key)) seen.set(key, name.trim());
  }
  const merged = Array.from(seen.values()).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );

  // Skip the write when nothing new appeared.
  const existingKeys = new Set(existing.map(normKey));
  const changed =
    merged.length !== existing.length ||
    merged.some((m) => !existingKeys.has(normKey(m)));
  if (!changed) return;

  await prisma.marketConfig.update({
    where: { userId },
    data: { neighbourhoodVocab: merged },
  });
  console.log(
    `[neighbourhood-vocab-seed] userId=${userId} added=${
      merged.length - existing.length
    } total=${merged.length}`,
  );
}

export async function markUploadFailed(uploadId: string, err: unknown): Promise<void> {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
  await prisma.marketDataUpload.update({
    where: { id: uploadId },
    data: {
      status: "failed",
      validationError: message.slice(0, 4000),
    },
  });
}

async function persistRawValidatorOutput(uploadId: string, text: string): Promise<void> {
  try {
    await prisma.marketDataUpload.update({
      where: { id: uploadId },
      data: { rawValidatorOutput: text },
    });
  } catch (e) {
    // Never let raw-output persistence block validation. Log + continue.
    console.error('[runValidation] failed to persist rawValidatorOutput', e);
  }
}

async function markUploadValidating(uploadId: string): Promise<void> {
  await prisma.marketDataUpload.update({
    where: { id: uploadId },
    data: { status: "validating" },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main orchestrator
// ─────────────────────────────────────────────────────────────────────────────

export async function runValidation(uploadId: string): Promise<void> {
  const t0 = Date.now();
  mdv("validation.start", uploadId, t0);
  console.log('[runValidation] start', uploadId);
  // Resolve userId first (cheap) so we can run cost-cap BEFORE any heavy work.
  const upload = await prisma.marketDataUpload.findUnique({
    where: { id: uploadId },
    select: { id: true, userId: true, status: true, rawValidatorOutput: true },
  });
  if (!upload) throw new Error(`Upload ${uploadId} not found`);

  // Idempotency: a validated upload should not be re-run by accident.
  if (upload.status === "validated") return;

  // Persistence-only retry: if a prior attempt already produced validator
  // output (the AI step succeeded but the save died — the P2028 bug), reuse
  // that stored output and skip the AI calls entirely. This is what keeps Phil
  // from being charged ~$2 again on every retry of an upload that already paid
  // for its AI pass. The admin re-validate route clears rawValidatorOutput when
  // it wants a genuine full re-run (e.g. re-validating an already-`validated`
  // upload against an improved engine), so a populated blob here unambiguously
  // means "reuse it".
  const priorRaw = upload.rawValidatorOutput?.trim() ?? "";
  const reuseAiOutput = priorRaw.length > 0;

  // Snapshot the member's chosen methodology ONCE at the start of the run, so
  // every parallel call and every persisted fact row sees a consistent view
  // even if the member edits settings mid-validation. Defaults to the Default
  // preset when the member has never touched their settings — in that case
  // buildMethodologyBlock() returns "" and the prompts are byte-identical to
  // today's, so an untouched member sees no change in output.
  const methodologySnapshot = await loadMemberMetricSettings(upload.userId);
  const methodologyBlock = buildMethodologyBlock(methodologySnapshot);

  try {
    // Cost cap FIRST. Don't even aggregate if we're hard-blocked. Skipped on a
    // persistence-only retry — there is no AI spend to cap, and a member at
    // their cap must still be able to recover an upload that already paid.
    if (!reuseAiOutput) {
      const cap = await getCostCapStatus(upload.userId);
      if (cap.hardBlocked) {
        await prisma.marketDataUpload.update({
          where: { id: uploadId },
          data: {
            status: "failed",
            validationError:
              "Monthly AI cost cap reached. Validation paused — try again next month, or contact admin if you need a higher cap.",
          },
        });
        return;
      }
    }

    await markUploadValidating(uploadId);
    mdv("validation.marked_validating", uploadId, t0);
    console.log('[runValidation] step: marked validating', uploadId);

    // Aggregate (pure compute, no Claude).
    const { table, userId, configSnapshot } = await aggregateUploadFromDb(uploadId);
    mdv("aggregate.complete", uploadId, t0, {
      groups: table.groups.length,
      rowsParsed: table.meta.totalRowsParsed,
      totalSold: table.meta.totalSold,
      monthYear: table.meta.monthYear,
    });
    console.log('[runValidation] step: aggregated, groups=' + table.groups.length, uploadId);

    // Wave 1: persist deterministic source-of-truth metrics BEFORE the
    // Sonnet calls run. Script Builder v2 reads these as ground truth so
    // it can't fabricate or misattribute stats. Idempotent — safe to
    // re-run on a re-validated upload. Wrapped in try/catch so a persist
    // failure can never block validation itself; the backfill script can
    // always recompute them later from the same CSV.
    try {
      const written = await persistAggregatedMetrics(uploadId, userId, table);
      console.log(
        `[aggregated-metric-persist] uploadId=${uploadId} count=${written}`,
      );
    } catch (err) {
      console.error(
        '[runValidation] persistAggregatedMetrics failed (non-fatal)',
        uploadId,
        err,
      );
    }

    // WS2B — grow the member's neighbourhood vocab from this upload's distinct
    // subdivisions. Sourced from the aggregation (every neighbourhood that
    // appeared in the CSV), not from extracted facts, so the vocab captures the
    // full market even when fact extraction is sparse. Non-fatal.
    try {
      const distinctHoods = Array.from(
        new Set(table.groups.map((g) => g.neighbourhood)),
      );
      await seedNeighbourhoodVocabFromUpload(userId, distinctHoods);
    } catch (err) {
      console.error(
        '[runValidation] seedNeighbourhoodVocabFromUpload failed (non-fatal)',
        uploadId,
        err,
      );
    }

    // Two paths converge on the same persist tail below. Both populate these
    // accumulators: the full-AI path from live Claude calls, the reuse path
    // from a prior attempt's stored output (no AI cost).
    let factsBundles: FactsBundle[];
    let storyLeads: ParsedStoryLead[];
    let totalCost: Decimal;
    let totalInputTokens: number;
    let totalOutputTokens: number;
    let wallMs: number;
    // Raw validator text used only for the "no parseable output" failure detail.
    let rawForDebug: string;

    if (reuseAiOutput) {
      // Persistence-only retry: rebuild facts + leads from the already-paid-for
      // AI output stored on the upload. Skips every Claude call → $0 cost. This
      // is the path that stops re-charging Phil for an upload whose AI step
      // already succeeded but whose save died on the old P2028 transaction bug.
      const reconstructed = reconstructFromRawValidatorOutput(priorRaw);
      factsBundles = reconstructed.factsBundles;
      storyLeads = reconstructed.storyLeads;
      totalCost = new Decimal(0);
      totalInputTokens = 0;
      totalOutputTokens = 0;
      wallMs = Date.now() - t0;
      rawForDebug = priorRaw;
      const reusedFacts = factsBundles.reduce((a, b) => a + b.facts.length, 0);
      mdv("validate.reuse_prior_output", uploadId, t0, {
        facts: reusedFacts,
        leads: storyLeads.length,
        rawChars: priorRaw.length,
      });
      console.log(
        `[runValidation] step: REUSED prior validator output — facts=${reusedFacts} leads=${storyLeads.length} rawChars=${priorRaw.length} (no AI cost)`,
        uploadId,
      );
    } else {
    const priorFactsBlock = await serializePriorFacts(userId, uploadId);

    // Build the market-resolved system prompt ONCE so every call below shares
    // an identical string → the ephemeral prompt cache is written by the first
    // call and read by the other parallel calls. Calgary (mlsSource "CREB") is
    // a near no-op; other markets get their name/board substituted in.
    const systemPrompt = buildFactValidatorSystemPrompt({
      marketName: configSnapshot.marketName,
      mlsSource: configSnapshot.mlsSource,
      sourceAuthority: configSnapshot.sourceAuthority,
      statusCodes: configSnapshot.statusCodes,
      propertyTypeVocab: configSnapshot.propertyTypeVocab,
      priceTiers: configSnapshot.priceTiers,
      moiThresholds: configSnapshot.moiThresholds,
      moiHighEndExceptionFloor: configSnapshot.moiHighEndExceptionFloor,
    });

    // Build the facts chunks + 1 summary/leads chunk. Each is an independent
    // Claude call sharing an identical system prompt → prompt cache is shared
    // (first call writes, subsequent reads). The base layout is one chunk per
    // property-type slice + rollups, but very wide markets may split a slice
    // into several sub-chunks below, so the total call count is dynamic.
    const baseChunks = buildChunks(table.groups);
    // Smart coverage cap (cost control): keep the high-volume head at full
    // per-neighbourhood granularity and roll the long tail into a few synthetic
    // supporting-texture buckets. This is what keeps a 25-month wide-market
    // backfill affordable without dropping the tail entirely. Small markets
    // (incl. Calgary's head) pass through largely unchanged → no fact-yield
    // regression.
    const capped = applyCoverageCap(baseChunks, table);
    mdv("coverage.cap", uploadId, t0, {
      keptNeighbourhoods: capped.keptCount,
      tailNeighbourhoods: capped.tailCount,
    });
    console.log(
      `[runValidation] coverage cap: kept=${capped.keptCount} tailRolled=${capped.tailCount}`,
      uploadId,
    );
    // Token-aware split: a single property-type slice for a very wide market
    // (e.g. NTREIS Dallas) can serialize past the 200K-token context window.
    // Expand any oversized base chunk into multiple parallel sub-chunks that
    // each fit PER_CALL_GROUPS_CHAR_BUDGET. Same name/propertyTypeColumn → the
    // merge step downstream is unchanged.
    const chunks = capped.chunks.flatMap((c) =>
      splitChunkByBudget(c, table, PER_CALL_GROUPS_CHAR_BUDGET),
    );
    const chunkLogStr = chunks.map((c) => `${c.name}=${c.groups.length}`).join(' ');
    mdv("chunks.built", uploadId, t0, {
      detached: chunks.find((c) => c.name === "detached")?.groups.length ?? 0,
      attached: chunks.find((c) => c.name === "attached")?.groups.length ?? 0,
      apartment: chunks.find((c) => c.name === "apartment")?.groups.length ?? 0,
      rollups: chunks.find((c) => c.name === "rollups")?.groups.length ?? 0,
    });
    console.log('[runValidation] step: chunks built —', chunkLogStr, uploadId);

    // Fan out the FACTS calls with bounded concurrency (see
    // FACT_CALL_CONCURRENCY). Each chunk still runs — coverage is unchanged —
    // but we cap simultaneous in-flight calls so wide markets don't storm
    // Anthropic with 529s or OOM on many concurrent 64K-token streams.
    const factCallPromise = mapWithConcurrency(
      chunks,
      FACT_CALL_CONCURRENCY,
      async (chunk) => {
        const msg = buildFactsChunkMessage(table, configSnapshot, priorFactsBlock, chunk, methodologyBlock);
        mdv("validate.chunk.start", uploadId, t0, {
          chunk: chunk.name,
          groups: chunk.groups.length,
          msgChars: msg.length,
        });
        console.log(`[runValidation] firing facts chunk=${chunk.name} msgLen=${msg.length} groups=${chunk.groups.length}`, uploadId);
        const call = await callValidatorWithStreamCutRetry(systemPrompt, msg);
        return { chunk, call };
      },
    );
    const summaryCallPromise = (async () => {
      const msg = buildSummaryAndLeadsMessage(table, configSnapshot, priorFactsBlock, methodologyBlock);
      mdv("validate.chunk.start", uploadId, t0, {
        chunk: "summary+leads",
        msgChars: msg.length,
      });
      console.log(`[runValidation] firing summary+leads msgLen=${msg.length}`, uploadId);
      return callValidatorWithStreamCutRetry(systemPrompt, msg);
    })();

    const [factResults, summaryCall] = await Promise.all([
      factCallPromise,
      summaryCallPromise,
    ]);
    wallMs = Date.now() - t0;
    mdv("validate.all_calls_returned", uploadId, t0, { wallMs });
    console.log(`[runValidation] step: all ${chunks.length + 1} calls returned in ${wallMs}ms`, uploadId);

    // Parse each chunk + merge.
    factsBundles = factResults.map(({ chunk, call }) => {
      const facts = parseFactsChunk(call.text);
      mdv("validate.chunk.complete", uploadId, t0, {
        chunk: chunk.name,
        facts: facts.length,
        inputTokens: call.inputTokens,
        outputTokens: call.outputTokens,
        cacheRead: call.cacheReadTokens,
        textLen: call.text.length,
        costUsd: call.costUsd.toFixed(4),
      });
      console.log(
        `[runValidation] chunk=${chunk.name} facts=${facts.length} cost=$${call.costUsd.toFixed(4)} in=${call.inputTokens} out=${call.outputTokens} cacheRead=${call.cacheReadTokens} textLen=${call.text.length}`,
        uploadId,
      );
      return { facts, propertyTypeColumn: chunk.propertyTypeColumn };
    });
    const parsedSummary = parseSummaryAndLeadsChunk(summaryCall.text);
    const summary = parsedSummary.summary;
    storyLeads = parsedSummary.storyLeads;
    mdv("validate.chunk.complete", uploadId, t0, {
      chunk: "summary+leads",
      leads: storyLeads.length,
      summaryLen: summary.length,
      inputTokens: summaryCall.inputTokens,
      outputTokens: summaryCall.outputTokens,
      cacheRead: summaryCall.cacheReadTokens,
      textLen: summaryCall.text.length,
      costUsd: summaryCall.costUsd.toFixed(4),
    });
    console.log(
      `[runValidation] summary+leads leads=${storyLeads.length} summaryLen=${summary.length} cost=$${summaryCall.costUsd.toFixed(4)} in=${summaryCall.inputTokens} out=${summaryCall.outputTokens} cacheRead=${summaryCall.cacheReadTokens} textLen=${summaryCall.text.length}`,
      uploadId,
    );

    // Persist concatenated raw outputs so debug tooling still has ground truth.
    const concatenatedRaw = [
      ...factResults.map(
        ({ chunk, call }) => `--- CHUNK ${chunk.name.toUpperCase()} ---\n${call.text}`,
      ),
      `--- SUMMARY+LEADS ---\n${summaryCall.text}`,
    ].join('\n\n');
    rawForDebug = concatenatedRaw;
    await persistRawValidatorOutput(uploadId, concatenatedRaw);

    // Roll up cost + token counters across all 5 calls.
    totalCost = factResults
      .reduce((acc, { call }) => acc.add(call.costUsd), new Decimal(0))
      .add(summaryCall.costUsd);
    totalInputTokens =
      factResults.reduce((a, { call }) => a + call.inputTokens, 0) + summaryCall.inputTokens;
    totalOutputTokens =
      factResults.reduce((a, { call }) => a + call.outputTokens, 0) + summaryCall.outputTokens;
    } // end full-AI validation branch

    const totalFacts = factsBundles.reduce((a, b) => a + b.facts.length, 0);
    mdv("parse.complete", uploadId, t0, {
      totalFacts,
      leads: storyLeads.length,
      totalCostUsd: totalCost.toFixed(4),
      totalInputTokens,
      totalOutputTokens,
    });
    console.log(
      `[runValidation] step: parsed all chunks — totalFacts=${totalFacts} leads=${storyLeads.length} totalCost=$${totalCost.toFixed(4)} wallMs=${wallMs}`,
      uploadId,
    );

    // Fact-yield floor: facts extracted per SOLD row. The contract is ≥10% of
    // sold rows should yield a fact; below that the validator is starving the
    // long tail and the upload's market data is effectively un-mined. We always
    // log the yield as telemetry and persist it on the upload; below the floor
    // we additionally emit an ERROR line so the deployment ERROR filter surfaces
    // it. totalSold can be 0 for degenerate uploads — guard the division.
    const FACT_YIELD_FLOOR = 0.1;
    const totalSold = table.meta.totalSold;
    const factYieldPct = totalSold > 0 ? totalFacts / totalSold : 0;
    mdv("validation.fact_yield", uploadId, t0, {
      totalFacts,
      totalSold,
      factYieldPct: Number(factYieldPct.toFixed(4)),
    });
    if (totalSold > 0 && factYieldPct < FACT_YIELD_FLOOR) {
      console.error(
        `[mdv telemetry] phase=validation.low_fact_yield uploadId=${uploadId} totalFacts=${totalFacts} totalSold=${totalSold} factYieldPct=${(
          factYieldPct * 100
        ).toFixed(2)}% floor=${FACT_YIELD_FLOOR * 100}% — validator under-extracted; long-tail coverage or prompt may need review.`,
      );
    }

    // Cost guard (warn-only): log if we're materially over the ~$2.60 estimate.
    if (totalCost.toNumber() > 4) {
      console.warn(
        `[runValidation] COST WARNING uploadId=${uploadId} totalCost=$${totalCost.toFixed(4)} exceeds soft cap of $4 — review aggregator group counts.`,
      );
    }

    // Final failure check: nothing parseable from any of the 5 calls.
    if (totalFacts === 0 && storyLeads.length === 0) {
      mdv("validation.failed_no_output", uploadId, t0, {
        totalInputTokens,
        totalOutputTokens,
        totalCostUsd: totalCost.toFixed(4),
      });
      await prisma.marketDataUpload.update({
        where: { id: uploadId },
        data: {
          status: "failed",
          validationCostUsd: totalCost.toNumber(),
          validationError:
            `The validator returned no parseable facts or story leads.\n\n` +
            `--- RAW VALIDATOR OUTPUT (first 8000 chars) ---\n${rawForDebug.slice(0, 8000)}`,
        },
      });
      // Only bill when this attempt actually made AI calls. A persistence-only
      // reuse run has totalCost 0 and must not write a usage row.
      if (totalCost.greaterThan(0)) {
        await prisma.aIToolUsage.create({
          data: {
            userId,
            toolType: "fact_validator",
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            costUsd: totalCost.toString(),
          },
        });
      }
      return;
    }

    mdv("db.write.start", uploadId, t0, {
      facts: totalFacts,
      leads: storyLeads.length,
    });
    await persistResults(
      uploadId,
      userId,
      factsBundles,
      storyLeads,
      totalCost,
      totalInputTokens,
      totalOutputTokens,
      Number(factYieldPct.toFixed(4)),
      methodologyVariantJson(methodologySnapshot),
    );
    mdv("db.write.complete", uploadId, t0);
    mdv("validation.complete", uploadId, t0, {
      totalFacts,
      leads: storyLeads.length,
      totalCostUsd: totalCost.toFixed(4),
      wallMs,
    });
    console.log(
      `[runValidation] step: persisted — facts=${totalFacts} leads=${storyLeads.length} cost=$${totalCost.toFixed(4)} wallMs=${wallMs}`,
      uploadId,
    );

    // KB Merge & Clean — auto-on-upload (best-effort). The aggregation above
    // already folded raw subdivisions into confirmed/deterministic canonical
    // areas; this surfaces any NEW conservative fuzzy near-duplicates as a
    // DRY_RUN for the member to review (never auto-applied). Failure here must
    // not fail the validation — the data is already persisted.
    try {
      const { buildMergeRunReport } = await import("@/lib/kb-merge/merge-run");
      const { mergeRunId } = await buildMergeRunReport(userId, {
        source: "upload",
        uploadId,
        skipIfNoop: true,
      });
      if (mergeRunId) {
        console.log(
          `[runValidation] step: KB merge dry-run queued mergeRunId=${mergeRunId}`,
          uploadId,
        );
      }
    } catch (mergeErr) {
      console.error(
        "[runValidation] KB merge dry-run failed (non-fatal)",
        uploadId,
        mergeErr,
      );
    }
  } catch (err) {
    console.error('[runValidation] threw for', uploadId, err);
    await markUploadFailed(uploadId, err);
    throw err;
  }
}

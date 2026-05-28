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
import { FACT_VALIDATOR_SYSTEM_PROMPT } from "@/lib/fact-validator-prompt";
import {
  aggregateUploadFromDb,
  type AggregatedTable,
  type AggregatedGroup,
} from "@/lib/csv-aggregate";
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
import { persistAggregatedMetrics } from "@/lib/aggregated-metrics";
import type { MarketConfigShape } from "@/lib/market-config";

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
    `  active=${g.activeCount} pending=${g.pendingCount} sold=${g.soldCount} expired=${g.expiredCount} terminated=${g.terminatedCount} withdrawn=${g.withdrawnCount}`,
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
  return parts.join("\n");
}

function selectGroupsForSerialization(
  groups: AggregatedGroup[],
  rowCount: number,
): { kept: AggregatedGroup[]; threshold: number; droppedCount: number } {
  // Always keep rollups. Among non-rollups, drop low-signal groups using an
  // iteratively-escalating sample-size threshold until total serialized chars
  // fit within budget. Calgary uploads commonly produce ~2000 raw groups; the
  // n≥5 cut typically gets it down to ~200-400 groups (<300K chars).
  // Big-market rowCount auto-raises the starting floor (see
  // getMinSampleThresholds) so Dallas/Toronto don't waste a pass at n=5.
  const rollups = groups.filter(isRollupGroup);
  const segmented = groups.filter((g) => !isRollupGroup(g));
  const rollupChars = rollups.reduce((a, g) => a + formatGroupLine(g).length + 1, 0);
  for (const threshold of getMinSampleThresholds(rowCount)) {
    const survivors = segmented.filter((g) => g.soldCount >= threshold);
    const chars = survivors.reduce(
      (a, g) => a + formatGroupLine(g).length + 1,
      rollupChars,
    );
    if (chars <= GROUPS_CHAR_BUDGET) {
      const kept = [...rollups, ...survivors];
      return {
        kept,
        threshold,
        droppedCount: groups.length - kept.length,
      };
    }
  }
  // Last resort: rollups only.
  return {
    kept: rollups,
    threshold: Infinity,
    droppedCount: groups.length - rollups.length,
  };
}

function serializeTable(
  table: AggregatedTable,
  groupSubset?: AggregatedGroup[],
  chunkLabel?: string,
): string {
  // When `groupSubset` is provided we serialize only that slice (chunked-mode).
  // Otherwise we use the whole table (legacy single-call path / SUMMARY+LEADS).
  const sourceGroups = groupSubset ?? table.groups;
  const { kept, threshold, droppedCount } = selectGroupsForSerialization(
    sourceGroups,
    table.meta.totalRowsParsed,
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
    { name: "detached", label: "Detached (neighbourhood-level)", propertyTypeColumn: "Detached", groups: detached },
    {
      name: "attached",
      label: "Attached: Semi-Detached + Row/Townhouse + Full Duplex (neighbourhood-level)",
      propertyTypeColumn: "Semi-Detached",
      groups: attached,
    },
    { name: "apartment", label: "Apartment / Condo (neighbourhood-level)", propertyTypeColumn: "Apartment", groups: apartment },
    {
      name: "rollups",
      label: "Citywide rollups + per-neighbourhood overalls (across all property types)",
      propertyTypeColumn: null,
      groups: rollups,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// User-message builders (one per call mode)
// ─────────────────────────────────────────────────────────────────────────────

function buildFactsChunkMessage(
  table: AggregatedTable,
  config: MarketConfigShape,
  priorFactsBlock: string,
  chunk: FactsChunk,
): string {
  const modeMarker = [
    "=== MODE: FACTS_LIBRARY_ONLY ===",
    `Scope for this call: ${chunk.label}.`,
    "Emit ONLY the `## VALIDATED FACTS LIBRARY` section — a single ```json``` fenced code block containing a JSON array of fact objects.",
    "Do NOT emit `## SUMMARY` or `## STORY LEADS` in this call. Those are produced by a separate parallel call over the full dataset.",
    "Cover EVERY neighbourhood that appears in the GROUPS block below — do not curate which neighbourhoods to include. Apply the per-neighbourhood × metric-family classification rules from the system prompt to each one.",
  ].join("\n");
  return [
    modeMarker,
    "",
    serializeTable(table, chunk.groups, chunk.label),
    "",
    serializeConfig(config),
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
    serializeTable(table),
    "",
    serializeConfig(config),
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
  userMessage: string,
  retryNote?: string,
): Promise<AnthropicCall> {
  try {
    return await callValidator(userMessage, retryNote);
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
    return await callValidator(userMessage, retryNote);
  }
}

async function callValidator(
  userMessage: string,
  retryNote?: string,
): Promise<AnthropicCall> {
  // Anthropic SDK types: cache_control isn't typed on all message variants,
  // so we cast the system block to `any` to attach it. The HTTP wire format
  // accepts it identically.
  const systemBlocks = [
    {
      type: "text",
      text: FACT_VALIDATOR_SYSTEM_PROMPT,
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
    const systemPromptEst = Math.ceil(FACT_VALIDATOR_SYSTEM_PROMPT.length / 3);
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
): Prisma.MarketFactCreateManyInput {
  // Aggregate `notes` from extraNotes + any prompt-emitted text we didn't pull
  // into a column. Keeps every raw scrap accessible for audit.
  const notes = fact.extraNotes ?? null;
  return {
    userId,
    uploadId,
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

async function persistResults(
  uploadId: string,
  userId: string,
  factsBundles: FactsBundle[],
  leads: ParsedStoryLead[],
  costUsd: Decimal,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  const allFactRows = factsBundles.flatMap((b) =>
    b.facts.map((f) => mapFactToPrisma(f, uploadId, userId, b.propertyTypeColumn)),
  );
  await prisma.$transaction(async (tx) => {
    if (allFactRows.length > 0) {
      await tx.marketFact.createMany({ data: allFactRows });
    }
    if (leads.length > 0) {
      // createMany doesn't take Json fields cleanly on all providers — do
      // individual creates for the small N (3-8 leads per validation).
      for (const lead of leads) {
        await tx.marketStoryLead.create({ data: mapLeadToPrisma(lead, uploadId, userId) });
      }
    }
    await tx.marketDataUpload.update({
      where: { id: uploadId },
      data: {
        status: "validated",
        validatedAt: new Date(),
        validationCostUsd: costUsd.toNumber(),
        validationError: null,
      },
    });
    await tx.aIToolUsage.create({
      data: {
        userId,
        toolType: "fact_validator",
        inputTokens,
        outputTokens,
        costUsd: costUsd.toString(),
      },
    });
  });
}

async function markUploadFailed(uploadId: string, err: unknown): Promise<void> {
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
    select: { id: true, userId: true, status: true },
  });
  if (!upload) throw new Error(`Upload ${uploadId} not found`);

  // Idempotency: a validated upload should not be re-run by accident.
  if (upload.status === "validated") return;

  try {
    // Cost cap FIRST. Don't even aggregate if we're hard-blocked.
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

    const priorFactsBlock = await serializePriorFacts(userId, uploadId);

    // Build the 4 facts chunks + 1 summary/leads chunk. Each is an independent
    // Claude call. The system prompt is identical across all 5 → prompt cache
    // is shared (first call writes, subsequent reads).
    const chunks = buildChunks(table.groups);
    const chunkLogStr = chunks.map((c) => `${c.name}=${c.groups.length}`).join(' ');
    mdv("chunks.built", uploadId, t0, {
      detached: chunks.find((c) => c.name === "detached")?.groups.length ?? 0,
      attached: chunks.find((c) => c.name === "attached")?.groups.length ?? 0,
      apartment: chunks.find((c) => c.name === "apartment")?.groups.length ?? 0,
      rollups: chunks.find((c) => c.name === "rollups")?.groups.length ?? 0,
    });
    console.log('[runValidation] step: chunks built —', chunkLogStr, uploadId);

    // 5 parallel calls.
    const factCallPromises = chunks.map((chunk) => {
      const msg = buildFactsChunkMessage(table, configSnapshot, priorFactsBlock, chunk);
      mdv("validate.chunk.start", uploadId, t0, {
        chunk: chunk.name,
        groups: chunk.groups.length,
        msgChars: msg.length,
      });
      console.log(`[runValidation] firing facts chunk=${chunk.name} msgLen=${msg.length} groups=${chunk.groups.length}`, uploadId);
      return callValidatorWithStreamCutRetry(msg).then((c) => ({ chunk, call: c }));
    });
    const summaryCallPromise = (async () => {
      const msg = buildSummaryAndLeadsMessage(table, configSnapshot, priorFactsBlock);
      mdv("validate.chunk.start", uploadId, t0, {
        chunk: "summary+leads",
        msgChars: msg.length,
      });
      console.log(`[runValidation] firing summary+leads msgLen=${msg.length}`, uploadId);
      return callValidatorWithStreamCutRetry(msg);
    })();

    const [factResults, summaryCall] = await Promise.all([
      Promise.all(factCallPromises),
      summaryCallPromise,
    ]);
    const wallMs = Date.now() - t0;
    mdv("validate.all_calls_returned", uploadId, t0, { wallMs });
    console.log(`[runValidation] step: all 5 calls returned in ${wallMs}ms`, uploadId);

    // Parse each chunk + merge.
    const factsBundles: FactsBundle[] = factResults.map(({ chunk, call }) => {
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
    const { summary, storyLeads } = parseSummaryAndLeadsChunk(summaryCall.text);
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
    await persistRawValidatorOutput(uploadId, concatenatedRaw);

    // Roll up cost + token counters across all 5 calls.
    const totalCost = factResults
      .reduce((acc, { call }) => acc.add(call.costUsd), new Decimal(0))
      .add(summaryCall.costUsd);
    const totalInputTokens =
      factResults.reduce((a, { call }) => a + call.inputTokens, 0) + summaryCall.inputTokens;
    const totalOutputTokens =
      factResults.reduce((a, { call }) => a + call.outputTokens, 0) + summaryCall.outputTokens;
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
            `All 5 chunked validator calls returned no parseable facts or story leads.\n\n` +
            factResults
              .map(
                ({ chunk, call }) =>
                  `--- CHUNK ${chunk.name.toUpperCase()} (first 1500 chars) ---\n${call.text.slice(0, 1500)}`,
              )
              .join('\n\n')
              .slice(0, 8000),
        },
      });
      await prisma.aIToolUsage.create({
        data: {
          userId,
          toolType: "fact_validator",
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          costUsd: totalCost.toString(),
        },
      });
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
  } catch (err) {
    console.error('[runValidation] threw for', uploadId, err);
    await markUploadFailed(uploadId, err);
    throw err;
  }
}

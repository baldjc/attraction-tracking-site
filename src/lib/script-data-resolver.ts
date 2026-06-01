/**
 * Layer 1 of the three-layer Script Builder data fallback — the ZERO-COST
 * resolver. Given a concrete `ScriptDataNeed`, it answers from data the member
 * already paid to produce:
 *
 *   1. MarketFact   — validator-classified facts (headline-safe or texture).
 *   2. AggregatedMetric — pre-computed rollups (rejected if sampleSize < 10 or
 *      the persisted month doesn't intersect the requested time window).
 *   3. none         — nothing local matches.
 *
 * It NEVER triggers paid work. Deciding to escalate to Layer 2 (paid on-demand
 * CSV extraction) belongs to the member via the Unresolved Facts banner, not to
 * this resolver. Layer 2 (`extractOnDemand`) is what returns
 * `source: "on_demand_extraction"`; this function only ever returns
 * market_fact / aggregated_metric / none.
 *
 * Pure selection logic (`pickMarketFact`, `pickAggregatedMetric`) is split out
 * and exported so it can be unit-tested without a database. `findDataForScriptNeed`
 * takes an injectable `prisma` so tests can feed canned query results.
 */
import prismaDefault from "@/lib/prisma";
import { MetricFamily, FactUsageClass } from "@/generated/prisma/enums";
import { calculateCost } from "@/lib/ai-tool-cost";
import { EXCLUDE_LEGACY_FAILURE_RATE } from "@/lib/market-status-buckets";
import { canonicalVariantKeys } from "@/lib/market-config";

export { MetricFamily };

export type TimeWindow = { startMonth: string; endMonth: string }; // YYYY-MM

export type ScriptDataNeed = {
  memberId: string;
  marketConfigId: string;
  /** undefined/null = market-wide (no neighbourhood filter). */
  neighbourhood?: string | null;
  /** undefined/null = all property types. */
  propertyType?: string | null;
  /** Canonical Prisma enum — NOT the conceptual UI string. Map first. */
  metricFamily: MetricFamily;
  timeWindow: TimeWindow;
};

export type ScriptDataResult =
  | {
      source: "market_fact";
      value: number;
      unit: string;
      factId: string;
      confidence: "headline" | "texture";
    }
  | {
      source: "aggregated_metric";
      value: number;
      unit: string;
      metricId: string;
      sampleSize: number;
    }
  | {
      source: "on_demand_extraction";
      value: number;
      unit: string;
      factId: string;
      costUsd: number;
    }
  | { source: "none"; reason: "no_data" | "sample_too_small" | "cost_cap_hit" };

/**
 * Conceptual metric buckets the UI / Story-Lead layer speaks in, mapped onto
 * the real Prisma `MetricFamily` enum the schema + validator actually store.
 *
 *   median_sale_price -> MEDIAN
 *   dom               -> DOM
 *   sp_lp_ratio       -> SP_LP
 *   moi               -> MOI
 *   sold_count        -> INVENTORY   (see note)
 *   active_count      -> INVENTORY   (see note)
 *   new_listing_count -> INVENTORY   (see note)
 *
 * NOTE FOR THE NEXT ENGINEER: there is intentionally NO `SOLD` / `ACTIVE` /
 * `NEW_LISTING` value in the `MetricFamily` enum. All three listing-count
 * concepts collapse into `INVENTORY` because that is the only count-oriented
 * family the validator tags. So if you go looking for where `new_listing_count`
 * "went", it became `INVENTORY`. If a dedicated enum value is ever added, update
 * THIS map and the validator prompt in lockstep, or facts will be tagged with a
 * family the resolver can't find.
 */
export type ConceptualMetricFamily =
  | "median_sale_price"
  | "dom"
  | "sp_lp_ratio"
  | "moi"
  | "sold_count"
  | "active_count"
  | "new_listing_count";

export const CONCEPTUAL_TO_METRIC_FAMILY: Record<
  ConceptualMetricFamily,
  MetricFamily
> = {
  median_sale_price: MetricFamily.MEDIAN,
  dom: MetricFamily.DOM,
  sp_lp_ratio: MetricFamily.SP_LP,
  moi: MetricFamily.MOI,
  sold_count: MetricFamily.INVENTORY,
  active_count: MetricFamily.INVENTORY,
  new_listing_count: MetricFamily.INVENTORY,
};

export function toMetricFamily(c: ConceptualMetricFamily): MetricFamily {
  return CONCEPTUAL_TO_METRIC_FAMILY[c];
}

/** Best-effort display unit per family (MarketFact has no unit column). */
export function unitForFamily(family: MetricFamily): string {
  switch (family) {
    case MetricFamily.MEDIAN:
    case MetricFamily.BENCHMARK:
    case MetricFamily.AVG:
      return "USD";
    case MetricFamily.PSF:
      return "USD/sqft";
    case MetricFamily.DOM:
      return "days";
    case MetricFamily.MOI:
      return "months";
    case MetricFamily.SP_LP:
      return "ratio";
    case MetricFamily.INVENTORY:
      return "count";
    case MetricFamily.FAILURE_RATE:
    case MetricFamily.ABSORPTION:
      return "percent";
    default:
      return "";
  }
}

const SAMPLE_FLOOR = 10;

// ── Layer 2 cost estimation (shared) ────────────────────────────────────────
// Kept here (pure, no Anthropic import) so the banner, the enrichment
// `skippedNeedingPaid` hint, and the extractor's pre-call gate all agree on the
// number SHOWN vs the number CHARGED. The extractor recomputes the same way
// from its actual filtered row set before deciding to spend.
export const EXTRACTION_PROMPT_OVERHEAD_TOKENS = 1500; // instructions + scope + rules block
export const EXTRACTION_TOKENS_PER_ROW = 25; // ~one serialized CSV row in the prompt
export const EXTRACTION_OUTPUT_TOKENS = 400; // focused JSON answer

export function estimateExtractionTokens(filteredRowCount: number): {
  inputTokens: number;
  outputTokens: number;
} {
  const rows = Math.max(0, Math.floor(filteredRowCount));
  return {
    inputTokens: EXTRACTION_PROMPT_OVERHEAD_TOKENS + rows * EXTRACTION_TOKENS_PER_ROW,
    outputTokens: EXTRACTION_OUTPUT_TOKENS,
  };
}

/** USD estimate for a Layer 2 extraction over `filteredRowCount` CSV rows. */
export function estimateExtractionCostUsd(filteredRowCount: number): number {
  const { inputTokens, outputTokens } = estimateExtractionTokens(filteredRowCount);
  return calculateCost(inputTokens, outputTokens).toNumber();
}

function norm(s?: string | null): string {
  return (s ?? "").trim().toLowerCase();
}

/** `monthYear` (YYYY-MM[...]) intersects the requested window. String-safe. */
export function monthInWindow(
  monthYear: string | null | undefined,
  w: TimeWindow,
): boolean {
  if (!monthYear) return false;
  const m = monthYear.slice(0, 7);
  return m >= w.startMonth && m <= w.endMonth;
}

// ── Pure selection cores (DB-agnostic, unit-tested) ─────────────────────────

export interface ResolverMarketFact {
  id: string;
  neighbourhood: string;
  propertyType: string | null;
  metricValue: number | null;
  usageClass: string;
  dateContext?: Date | null;
  createdAt?: Date | null;
  /** Validator metricName token (e.g. "dom_average"); used for variant preference. */
  metricName?: string | null;
}

/**
 * Pick the best usable MarketFact for a need. Honours scope (neighbourhood +
 * property type), excludes `rejected`/null-value rows, and prefers headline-safe
 * over texture, then most-recent. Returns null when nothing qualifies.
 *
 * `preferMetricName` (Known Issues #4/#5): when a family has two persisted
 * variants (DOM → dom_average/dom_median, MOI → moi_inclusive/moi_strict), the
 * caller passes the market-canonical metricName. If any usable rows carry it,
 * selection is restricted to those so the headline number is the canonical one.
 * If none carry it, the preference is ignored (graceful fallback).
 */
export function pickMarketFact(
  rows: ResolverMarketFact[],
  need: Pick<ScriptDataNeed, "neighbourhood" | "propertyType">,
  preferMetricName?: string,
): { factId: string; value: number; confidence: "headline" | "texture" } | null {
  const wantHood = need.neighbourhood ? norm(need.neighbourhood) : null;
  const wantType = need.propertyType ?? null;

  const usable = rows.filter((r) => {
    if (r.metricValue == null) return false;
    if (r.usageClass === "rejected") return false;
    if (wantHood !== null && norm(r.neighbourhood) !== wantHood) return false;
    if (wantType !== null && wantType !== "All") {
      // A null/"All" fact is a cross-type aggregate — broader than the lock —
      // so it's rejected to honour the never-widen-scope guarantee.
      if (r.propertyType !== wantType) return false;
    }
    return true;
  });
  if (usable.length === 0) return null;

  // Variant preference: restrict to the canonical metricName when present.
  let pool = usable;
  if (preferMetricName) {
    const narrowed = usable.filter((r) => r.metricName === preferMetricName);
    if (narrowed.length > 0) pool = narrowed;
  }

  const rank = (r: ResolverMarketFact) =>
    r.usageClass === "headline_safe" ? 0 : 1;
  const ts = (r: ResolverMarketFact) =>
    (r.dateContext ? r.dateContext.getTime() : 0) ||
    (r.createdAt ? r.createdAt.getTime() : 0);

  pool.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    const tb = ts(b) - ts(a);
    if (tb !== 0) return tb;
    return a.id.localeCompare(b.id);
  });

  const best = pool[0];
  return {
    factId: best.id,
    value: best.metricValue as number,
    confidence: best.usageClass === "headline_safe" ? "headline" : "texture",
  };
}

export interface ResolverAggregatedMetric {
  id: string;
  neighbourhood: string;
  propertyType: string;
  metricValue: number;
  sampleSize: number;
  monthYear: string;
  /** AggregatedMetric.metricKey (e.g. "moiInclusive"); used for variant preference. */
  metricKey?: string;
}

/**
 * Pick the best usable AggregatedMetric for a need. Rejects sampleSize < 10 and
 * rows whose month falls outside the requested window. Prefers most-recent
 * month, then largest sample. Returns null when nothing qualifies.
 *
 * `preferMetricKey` (Known Issues #4/#5): when a family has two persisted
 * variants in the same family (DOM → domAverage/domMedian, MOI →
 * moiInclusive/moiStrict), the caller passes the market-canonical metricKey. If
 * any usable rows carry it, selection is restricted to those so the deterministic
 * headline is the canonical variant. If none carry it, the preference is ignored.
 */
export function pickAggregatedMetric(
  rows: ResolverAggregatedMetric[],
  need: Pick<ScriptDataNeed, "neighbourhood" | "propertyType" | "timeWindow">,
  preferMetricKey?: string,
): { metricId: string; value: number; sampleSize: number } | null {
  const wantHood = need.neighbourhood ? norm(need.neighbourhood) : null;
  const wantType = need.propertyType ?? null;

  const usable = rows.filter((r) => {
    if (r.sampleSize < SAMPLE_FLOOR) return false;
    if (!monthInWindow(r.monthYear, need.timeWindow)) return false;
    if (wantHood !== null && norm(r.neighbourhood) !== wantHood) return false;
    if (wantType !== null && wantType !== "All") {
      // "All" is the city-wide cross-type rollup — acceptable as a fallback for
      // a typed need, but an explicit different type is out of scope.
      if (r.propertyType !== wantType && r.propertyType !== "All") return false;
    }
    return true;
  });
  if (usable.length === 0) return null;

  // Variant preference: restrict to the canonical metricKey when present.
  let pool = usable;
  if (preferMetricKey) {
    const narrowed = usable.filter((r) => r.metricKey === preferMetricKey);
    if (narrowed.length > 0) pool = narrowed;
  }

  pool.sort((a, b) => {
    const m = b.monthYear.localeCompare(a.monthYear);
    if (m !== 0) return m;
    if (b.sampleSize !== a.sampleSize) return b.sampleSize - a.sampleSize;
    return a.id.localeCompare(b.id);
  });

  const best = pool[0];
  return { metricId: best.id, value: best.metricValue, sampleSize: best.sampleSize };
}

// ── DB-bound resolver ───────────────────────────────────────────────────────

export interface ResolverDeps {
  prisma: {
    marketFact: { findMany: (args: unknown) => Promise<ResolverMarketFact[]> };
    aggregatedMetric: {
      findMany: (args: unknown) => Promise<ResolverAggregatedMetric[]>;
    };
    /**
     * Optional: used only to resolve the market's canonical DOM/MOI variant
     * (Known Issues #4/#5). When absent (e.g. unit-test fakes), variant
     * preference is skipped and selection falls back to recency/sample ranking.
     */
    marketConfig?: {
      findUnique: (args: unknown) => Promise<{ mlsSource: string | null } | null>;
    };
  };
}

/**
 * Layer 1 resolution. MarketFact → AggregatedMetric → none. Zero AI cost.
 * `deps.prisma` is injectable for unit tests.
 */
export async function findDataForScriptNeed(
  need: ScriptDataNeed,
  deps: ResolverDeps = { prisma: prismaDefault as unknown as ResolverDeps["prisma"] },
): Promise<ScriptDataResult> {
  const { prisma } = deps;
  const unit = unitForFamily(need.metricFamily);

  // Market-canonical variant preference for the two-variant families (Known
  // Issues #4/#5). Only DOM/MOI have two persisted variants; for every other
  // family these stay undefined and selection is unaffected.
  let preferMetricKey: string | undefined;
  let preferMetricName: string | undefined;
  if (
    need.metricFamily === MetricFamily.DOM ||
    need.metricFamily === MetricFamily.MOI
  ) {
    const mc = await prisma.marketConfig?.findUnique?.({
      where: { id: need.marketConfigId },
      select: { mlsSource: true },
    });
    const v = canonicalVariantKeys(mc?.mlsSource ?? null);
    if (need.metricFamily === MetricFamily.DOM) {
      preferMetricKey = v.domMetricKey;
      preferMetricName = v.domMetricName;
    } else {
      preferMetricKey = v.moiMetricKey;
      preferMetricName = v.moiMetricName;
    }
  }

  // 1. MarketFact (headline-safe or texture; never rejected).
  const facts = await prisma.marketFact.findMany({
    where: {
      userId: need.memberId,
      metricFamily: need.metricFamily,
      usageClass: {
        in: [FactUsageClass.headline_safe, FactUsageClass.supporting_texture_only],
      },
      ...EXCLUDE_LEGACY_FAILURE_RATE,
    },
    select: {
      id: true,
      neighbourhood: true,
      propertyType: true,
      metricValue: true,
      usageClass: true,
      dateContext: true,
      createdAt: true,
      metricName: true,
    },
  });
  const fact = pickMarketFact(facts, need, preferMetricName);
  if (fact) {
    return {
      source: "market_fact",
      value: fact.value,
      unit,
      factId: fact.factId,
      confidence: fact.confidence,
    };
  }

  // 2. AggregatedMetric (sampleSize >= 10, month intersects window).
  const metrics = await prisma.aggregatedMetric.findMany({
    where: { userId: need.memberId, metricFamily: need.metricFamily },
    select: {
      id: true,
      neighbourhood: true,
      propertyType: true,
      metricValue: true,
      sampleSize: true,
      monthYear: true,
      metricKey: true,
    },
  });
  const metric = pickAggregatedMetric(metrics, need, preferMetricKey);
  if (metric) {
    return {
      source: "aggregated_metric",
      value: metric.value,
      unit,
      metricId: metric.metricId,
      sampleSize: metric.sampleSize,
    };
  }

  // 3. Nothing local. Escalation to Layer 2 is the member's call (banner).
  return { source: "none", reason: "no_data" };
}

// Live-preview computation for the "How we calculate your stats" panel.
//
// Pure (no prisma): given the persisted AggregatedMetric rows for a single
// upload, compute the headline number under every methodology variant plus the
// per-sample-threshold qualifying-neighbourhood counts. The route layer fetches
// the rows and caches the result; this module does the math so it is unit-
// testable and free of AI / DB calls.

import {
  canonicalVariantKeys,
} from "@/lib/market-config";
import { SAMPLE_FLOORS, type SampleSizeVariant } from "@/lib/member-metric-settings";
import type { MoiVariant, DomVariant } from "@/lib/member-metric-settings";

/** Minimal shape this module needs from an AggregatedMetric row. */
export interface PreviewMetricRow {
  neighbourhood: string;
  propertyType: string;
  metricFamily: string;
  metricKey: string;
  metricValue: number;
  sampleSize: number;
  monthYear: string;
}

export interface MethodologyPreview {
  uploadId: string;
  monthYear: string;
  /** What the Default preset resolves to on this board (for the preset table). */
  boardDefault: { moi: MoiVariant; dom: DomVariant };
  moi: {
    active_plus_pending_single: number | null;
    active_only_single: number | null;
    active_plus_pending_rolling3: number | null;
  };
  dom: {
    average: number | null;
    median: number | null;
  };
  failureRate: {
    all_off_market: number | null;
    expired_only: number | null;
    expired_plus_withdrawn: number | null;
  };
  salePrice: {
    median: number | null;
    average: number | null;
    /** null when no benchmark column exists in the upload. */
    benchmark: number | null;
    /** true when benchmark was requested-able but absent -> falls back to median. */
    benchmarkFallback: boolean;
  };
  /** Qualifying-neighbourhood counts under each sample-size threshold. */
  sampleSize: Record<SampleSizeVariant, number>;
}

/**
 * Pick the city-wide ("All" propertyType) rows when present, else fall back to
 * all rows. Using the cross-type rollup gives exactly one row per neighbourhood
 * so neither the weighted headline nor the qualifying count double-counts a
 * neighbourhood that has several property-type rows.
 */
function cityWideRows(rows: PreviewMetricRow[]): PreviewMetricRow[] {
  const all = rows.filter((r) => r.propertyType === "All");
  return all.length > 0 ? all : rows;
}

/**
 * Sample-size-weighted mean of `metricKey` rows across neighbourhoods. Returns
 * null when no row carries that key (e.g. benchmark column absent, or a variant
 * that never met its persistence floor for any neighbourhood).
 */
function weightedHeadline(
  rows: PreviewMetricRow[],
  metricKey: string,
): number | null {
  let num = 0;
  let den = 0;
  for (const r of rows) {
    if (r.metricKey !== metricKey) continue;
    const w = r.sampleSize > 0 ? r.sampleSize : 1;
    num += r.metricValue * w;
    den += w;
  }
  if (den === 0) return null;
  return num / den;
}

/**
 * Count neighbourhoods whose closed-sale sample meets a threshold. The sold
 * sample per neighbourhood is the sampleSize attached to its MEDIAN/medianPrice
 * row (== the group's sold count). Neighbourhoods with no median row contribute
 * 0 sold and never qualify.
 */
function qualifyingCount(rows: PreviewMetricRow[], soldFloor: number): number {
  const soldByHood = new Map<string, number>();
  for (const r of rows) {
    if (r.metricFamily === "MEDIAN" && r.metricKey === "medianPrice") {
      const prev = soldByHood.get(r.neighbourhood) ?? 0;
      if (r.sampleSize > prev) soldByHood.set(r.neighbourhood, r.sampleSize);
    }
  }
  let count = 0;
  for (const sold of soldByHood.values()) {
    if (sold >= soldFloor) count += 1;
  }
  return count;
}

/**
 * Compute the full preview payload from one upload's persisted metric rows.
 * `mlsSource` is only used to resolve what the Default preset maps to on this
 * board (the preset table's "Default" column), never to alter the per-variant
 * numbers themselves.
 */
export function computeMethodologyPreview(
  uploadId: string,
  monthYear: string,
  rows: PreviewMetricRow[],
  mlsSource: string | null,
): MethodologyPreview {
  const city = cityWideRows(rows);

  // Board-canonical Default resolution (memberSettings omitted == Default).
  const board = canonicalVariantKeys(mlsSource);
  const boardMoi: MoiVariant =
    board.moiMetricKey === "moiStrict"
      ? "active_only_single"
      : "active_plus_pending_single";
  const boardDom: DomVariant =
    board.domMetricKey === "domMedian" ? "median" : "average";

  const median = weightedHeadline(city, "medianPrice");
  const benchmark = weightedHeadline(city, "benchmarkPrice");

  const sampleSize = Object.fromEntries(
    (Object.keys(SAMPLE_FLOORS) as SampleSizeVariant[]).map((v) => [
      v,
      qualifyingCount(city, SAMPLE_FLOORS[v].sold),
    ]),
  ) as Record<SampleSizeVariant, number>;

  return {
    uploadId,
    monthYear,
    boardDefault: { moi: boardMoi, dom: boardDom },
    moi: {
      active_plus_pending_single: weightedHeadline(city, "moiInclusive"),
      active_only_single: weightedHeadline(city, "moiStrict"),
      active_plus_pending_rolling3: weightedHeadline(city, "moiInclusiveRolling3"),
    },
    dom: {
      average: weightedHeadline(city, "domAverage"),
      median: weightedHeadline(city, "domMedian"),
    },
    failureRate: {
      all_off_market: weightedHeadline(city, "failureRate"),
      expired_only: weightedHeadline(city, "failureRateExpiredOnly"),
      expired_plus_withdrawn: weightedHeadline(
        city,
        "failureRateExpiredPlusWithdrawn",
      ),
    },
    salePrice: {
      median,
      average: weightedHeadline(city, "avgSalePrice"),
      benchmark,
      benchmarkFallback: benchmark == null,
    },
    sampleSize,
  };
}

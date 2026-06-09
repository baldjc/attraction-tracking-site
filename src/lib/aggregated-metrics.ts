// Wave 1 — Deterministic aggregated metrics persistence + read.
//
// Computes per-(neighbourhood, propertyType, metricFamily) ground-truth
// numbers from the in-memory AggregatedTable (output of `csv-aggregate.ts`)
// and persists them to the `AggregatedMetric` table BEFORE the Sonnet
// fact-validator runs. Script Builder v2 later loads these rows as the
// "source of truth" block injected into the Claude prompt, preventing
// the script writer from fabricating or misattributing stats.
//
// Persisted scope: only groups where `priceTier === null` (city-wide +
// neighbourhood-level overall rollups). Tiered subgroups are intentionally
// skipped because the script writer queries on (neighbourhood, propertyType)
// without a price tier, and including them would violate the unique key.
//
// Field-name mapping is anchored to the real `AggregatedGroup` interface
// in `src/lib/csv-aggregate.ts` (verified prior to writing this file —
// the spec's earlier guesses like `moi` / `avgPrice` / `inventoryCount`
// do not exist on the real type).

import prisma from "@/lib/prisma";
import {
  getExcludedNeighbourhoodKeys,
  isExcluded,
} from "@/lib/excluded-neighbourhoods";
import type {
  AggregatedGroup,
  AggregatedTable,
  Pooled90dResult,
} from "@/lib/csv-aggregate";

export type MetricFamily =
  | "MOI"
  | "BENCHMARK"
  | "PSF"
  | "MEDIAN"
  | "DOM"
  | "SP_LP"
  | "AVG"
  | "INVENTORY"
  | "FAILURE_RATE"
  | "ABSORPTION"
  | "OTHER";

/**
 * Per-family minimum sample sizes required to persist (and surface to the
 * script writer as ground truth). Below threshold, the deterministic
 * number is too noisy to publish as "the number" and we skip it — the
 * validator's prose facts will still carry caveats for low-N callouts.
 *
 * Per direction:  INVENTORY=1  FAILURE_RATE=5  AVG=5  MOI=5  ABSORPTION=5  OTHER=10.
 * MOI floor is consolidated to n≥5 (Known Issue #3): below 5, a deterministic
 * MOI row is too noisy to publish as headline ground truth, so we persist NO
 * MOI row — the value still rides on the in-memory `AggregatedGroup` for the
 * validator's supporting-texture prose. This matches the helper floors in
 * `market-status-buckets.ts` (MIN_SOLD_SAMPLE = 5), so there is one MOI floor.
 * Conventional minimums (MEDIAN/DOM/SP_LP/PSF/BENCHMARK/ABSORPTION) stay at 5.
 */
const SAMPLE_THRESHOLDS: Record<MetricFamily, number> = {
  MEDIAN: 5,
  MOI: 5,
  DOM: 5,
  SP_LP: 5,
  PSF: 5,
  BENCHMARK: 5,
  AVG: 5,
  INVENTORY: 1,
  FAILURE_RATE: 5,
  ABSORPTION: 5,
  OTHER: 10,
};

export interface MetricRow {
  neighbourhood: string;
  propertyType: string;
  priceTier: string | null;
  metricFamily: MetricFamily;
  metricKey: string;
  metricValue: number;
  sampleSize: number;
  monthYear: string;
  yoyDelta: number | null;
  rolling90dValue: number | null;
  compositionShiftFlag: boolean;
}

/**
 * Walk an AggregatedGroup and yield one MetricRow per supported family
 * where the value is finite and the sampleSize meets the family-specific
 * floor. Skips tiered subgroups (priceTier !== null).
 *
 * Exported for unit testing (the persistence path is otherwise DB-bound).
 */
export function rowsFromGroup(
  group: AggregatedGroup,
  monthYear: string,
): MetricRow[] {
  if (group.priceTier !== null) return [];

  const propertyType = group.propertyType ?? "All";
  const out: MetricRow[] = [];

  const push = (
    metricFamily: MetricFamily,
    metricKey: string,
    value: number | null,
    sampleSize: number,
    extras: {
      yoyDelta?: number | null;
      rolling90dValue?: number | null;
    } = {},
  ) => {
    if (value == null || !Number.isFinite(value)) return;
    if (sampleSize < SAMPLE_THRESHOLDS[metricFamily]) return;
    out.push({
      neighbourhood: group.neighbourhood,
      propertyType,
      priceTier: null,
      metricFamily,
      metricKey,
      metricValue: value,
      sampleSize,
      monthYear,
      yoyDelta: extras.yoyDelta ?? null,
      rolling90dValue: extras.rolling90dValue ?? null,
      compositionShiftFlag: group.compositionShiftFlag,
    });
  };

  // Sample size for price/sale-driven metrics is the count of Sold rows
  // (== `group.sampleSize`). Inventory uses activeCount. Failure-rate uses
  // the union of completed-closed and removed-without-sale rows.
  const soldN = group.sampleSize;

  push("MEDIAN", "medianPrice", group.medianPrice, soldN, {
    yoyDelta: group.yoy.medianPriceDelta,
    rolling90dValue: group.rolling90d.medianPrice,
  });
  push("MOI", "moiStrict", group.moiStrict, soldN, {
    yoyDelta: group.yoy.moiStrictDelta,
    rolling90dValue: group.rolling90d.moiStrict,
  });
  // moi_inclusive ((Active + Pending) ÷ Sold) — CREB-aligned view. Its own row
  // (Known Issue #5) so the CREB-canonical number has a durable ground truth.
  // No dedicated YoY/rolling fields exist for inclusive on AggregatedGroup.
  push("MOI", "moiInclusive", group.moiInclusive, soldN);
  // moi_active_plus_pending_rolling3 — smoothed trailing-3-month MOI variant.
  // Sample size is this month's sold count (the gating month); the rolling
  // average is computed across available prior months in csv-aggregate.
  push("MOI", "moiInclusiveRolling3", group.moiInclusiveRolling3, soldN);
  push("DOM", "domMedian", group.domMedian, soldN);
  // dom_average — CREB-aligned view (Known Issue #4). Its own row so the
  // market-canonical DOM number is persisted, not just dom_median.
  push("DOM", "domAverage", group.domAverage, soldN);
  push("SP_LP", "spLpRatio", group.spLpRatio, soldN);
  push("PSF", "psf", group.psf, soldN, {
    yoyDelta: group.yoy.psfDelta,
    rolling90dValue: group.rolling90d.psf,
  });

  // Inventory == count of Active listings in the snapshot. Sample size
  // is the active count itself (it IS the measurement).
  push("INVENTORY", "activeCount", group.activeCount, group.activeCount);

  // failure_rate = offMarket / sold (a ratio that can exceed 1.0). The sample
  // size we attach is sold + offMarket — the listings that actually fed the
  // ratio — so downstream confidence gating sees the real N.
  const failN = group.soldCount + group.offMarketCount;
  push("FAILURE_RATE", "failureRate", group.failureRate, failN);
  // sale_share = Sold / (Sold + offMarket) — bounded companion to failure_rate
  // (Known Issue #2). Reuses the FAILURE_RATE family (same two counts), stored
  // ×100 so the shared formatter renders "%". metricKey disambiguates the row.
  push("FAILURE_RATE", "saleShare", group.saleShare, failN);
  // failure_rate VARIANTS over narrower off-market denominators. Sample size is
  // sold + the SUBSET of off-market that fed each ratio, so confidence gating
  // sees the real N for the variant a member may select at citation time.
  push(
    "FAILURE_RATE",
    "failureRateExpiredOnly",
    group.failureRateExpiredOnly,
    group.soldCount + group.expiredCount,
  );
  push(
    "FAILURE_RATE",
    "failureRateExpiredPlusWithdrawn",
    group.failureRateExpiredPlusWithdrawn,
    group.soldCount + group.expiredCount + group.withdrawnCount,
  );

  // average sale price — mean closing price (AVG family) for the average
  // sale-price methodology variant. benchmark_price (BENCHMARK family) has no
  // source column yet, so group.benchmarkPrice is null and push() skips it;
  // the benchmark variant falls back to median at citation time.
  push("AVG", "avgSalePrice", group.avgSalePrice, soldN);
  push("BENCHMARK", "benchmarkPrice", group.benchmarkPrice, soldN);

  // absorption_rate = Sold / Active — share of standing inventory that cleared
  // (Known Issue #1). Own ABSORPTION family + floor; sample size is the sold
  // count (the numerator's measurement). Stored ×100 (percentage).
  push("ABSORPTION", "absorptionRate", group.absorptionRate, soldN);

  return out;
}

/**
 * Persist deterministic aggregations for an upload. Idempotent: deletes
 * any prior rows for the same (userId, uploadId) first so a re-run of
 * the validator (or backfill on an already-processed upload) leaves a
 * clean set. Chunks the createMany into 500-row batches.
 *
 * Returns the count of rows written.
 */
export async function persistAggregatedMetrics(
  uploadId: string,
  userId: string,
  table: AggregatedTable,
): Promise<number> {
  const monthYear = table.meta.monthYear;
  // Persistent exclusion list — skip metrics for any neighbourhood the member
  // removed, so a re-upload never resurrects junk. Rollup labels are never
  // excluded (the delete endpoint refuses them), so aggregates are safe.
  const excludedKeys = await getExcludedNeighbourhoodKeys(userId);
  const allRows: MetricRow[] = [];
  for (const group of table.groups) {
    if (isExcluded(excludedKeys, group.neighbourhood)) continue;
    allRows.push(...rowsFromGroup(group, monthYear));
  }

  // Atomic replace. If the create fails mid-way, the prior delete still
  // commits — but that's acceptable for this table (it's a deterministic
  // projection, can always be rebuilt from the CSV via the backfill).
  await prisma.aggregatedMetric.deleteMany({
    where: { userId, uploadId },
  });

  if (allRows.length === 0) return 0;

  const CHUNK = 500;
  let written = 0;
  for (let i = 0; i < allRows.length; i += CHUNK) {
    const slice = allRows.slice(i, i + CHUNK).map((r) => ({
      userId,
      uploadId,
      neighbourhood: r.neighbourhood,
      propertyType: r.propertyType,
      priceTier: r.priceTier,
      metricFamily: r.metricFamily,
      metricKey: r.metricKey,
      metricValue: r.metricValue,
      sampleSize: r.sampleSize,
      monthYear: r.monthYear,
      yoyDelta: r.yoyDelta,
      rolling90dValue: r.rolling90dValue,
      compositionShiftFlag: r.compositionShiftFlag,
    }));
    const res = await prisma.aggregatedMetric.createMany({
      data: slice,
      skipDuplicates: true,
    });
    written += res.count;
  }
  return written;
}

// ─────────────────────────────────────────────────────────────────────────────
// Read side — Script Builder v2 source-of-truth block.
// ─────────────────────────────────────────────────────────────────────────────

export interface SourceOfTruthMetric {
  neighbourhood: string;
  propertyType: string;
  metricFamily: MetricFamily;
  metricKey: string;
  metricValue: number;
  sampleSize: number;
  monthYear: string;
  yoyDelta: number | null;
  rolling90dValue: number | null;
  compositionShiftFlag: boolean;
}

/**
 * Fetch source-of-truth metrics for the (userId, uploadIds, neighbourhoods)
 * combination cited in a script. Always also includes the "All Neighbourhoods"
 * rollup so the writer can anchor city-wide comparisons.
 *
 * `neighbourhoods` is an inclusive filter — if empty, returns ALL rows for
 * the supplied uploadIds (used by debug / backfill probes).
 */
export async function getSourceOfTruthMetrics(args: {
  userId: string;
  uploadIds: string[];
  neighbourhoods?: string[];
}): Promise<SourceOfTruthMetric[]> {
  const { userId, uploadIds, neighbourhoods } = args;
  if (uploadIds.length === 0) return [];

  const nbhdFilter =
    neighbourhoods && neighbourhoods.length > 0
      ? {
          neighbourhood: {
            in: Array.from(
              new Set([...neighbourhoods, "All Neighbourhoods"]),
            ),
          },
        }
      : {};

  const rows = await prisma.aggregatedMetric.findMany({
    where: {
      userId,
      uploadId: { in: uploadIds },
      ...nbhdFilter,
    },
    orderBy: [
      { neighbourhood: "asc" },
      { propertyType: "asc" },
      { metricFamily: "asc" },
    ],
  });
  return rows.map((r) => ({
    neighbourhood: r.neighbourhood,
    propertyType: r.propertyType,
    metricFamily: r.metricFamily as MetricFamily,
    metricKey: r.metricKey,
    metricValue: r.metricValue,
    sampleSize: r.sampleSize,
    monthYear: r.monthYear,
    yoyDelta: r.yoyDelta,
    rolling90dValue: r.rolling90dValue,
    compositionShiftFlag: r.compositionShiftFlag,
  }));
}

/**
 * Format a tolerant numeric value for the source-of-truth block. Currency
 * (MEDIAN/PSF) gets `$` and thousands separators; ratios/rates get `%`;
 * MOI gets "months"; DOM gets "days"; everything else is bare numeric.
 */
export function formatValue(family: MetricFamily, value: number): string {
  switch (family) {
    case "MEDIAN":
    case "AVG":
    case "BENCHMARK":
      return `$${Math.round(value).toLocaleString("en-US")}`;
    case "PSF":
      return `$${value.toFixed(2)}/sqft`;
    case "MOI":
      return `${value.toFixed(1)} months`;
    case "DOM":
      return `${Math.round(value)} days`;
    case "SP_LP":
      // spLpRatio is stored as a ratio (e.g. 0.994). Render as %.
      return value <= 2
        ? `${(value * 100).toFixed(1)}%`
        : `${value.toFixed(1)}%`;
    case "FAILURE_RATE":
      // Stored as a percentage. failure_rate (offMarket/sold * 100) can exceed
      // 100%; sale_share (sold/(sold+offMarket) * 100) is bounded 0–100%.
      return `${value.toFixed(1)}%`;
    case "ABSORPTION":
      // Stored as a percentage (sold/active * 100) — share of standing
      // inventory that cleared in the period.
      return `${value.toFixed(1)}%`;
    case "INVENTORY":
      return `${Math.round(value)} active`;
    default:
      return value.toString();
  }
}

/**
 * Rounding-tolerant equality for source-of-truth comparisons: values agree when
 * their absolute difference is ≤ 0.05 OR their relative difference is ≤ 0.5%.
 * Mirrors the script validator's `no_sot_disagreement` tolerance so Jarvis chat
 * and the validator never disagree about what counts as "the same number".
 */
export function sotValuesWithinRounding(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  if (diff <= 0.05) return true;
  const rel = diff / Math.max(Math.abs(a), Math.abs(b), 1e-9);
  return rel <= 0.005;
}

/**
 * Resolve the UNAMBIGUOUS canonical value for a set of source-of-truth values
 * that share one (neighbourhood, metric family). A family carries multiple
 * metric-key variants (e.g. MOI = moiStrict / moiInclusive / rolling3) and
 * multiple property types; a ledger fact only tells us its family, not which
 * variant/type it is. So we only return a canonical value when EVERY supplied
 * value agrees within rounding — otherwise the canonical is ambiguous and the
 * caller must leave the raw value untouched rather than risk overriding it with
 * the wrong variant. Returns `null` for an empty set or any disagreement.
 */
export function resolveUnambiguousSotValue(
  values: readonly number[],
): number | null {
  if (values.length === 0) return null;
  const first = values[0];
  return values.every((v) => sotValuesWithinRounding(v, first)) ? first : null;
}

/**
 * Fix 1 — ONE canonical variant per family. Some families carry several
 * metric-key variants (MOI = moiStrict / moiInclusive / rolling3; DOM =
 * domMedian / domAverage) that legitimately DISAGREE. The script writer and the
 * Jarvis chat summary must both cite the SAME one, or the chat says "Downtown
 * 6.71" while the script/Sources say "8.8". This map names the board-aligned
 * canonical metric-key for each multi-variant family — the single source of
 * truth for "which variant do we cite". Families absent from the map have one
 * variant (or no canonical winner) and fall back to `resolveUnambiguousSotValue`.
 *
 * MOI → `moiInclusive`: the CREB-aligned ((Active + Pending) ÷ Sold) view the
 * script already cites (the "8.8 Downtown | All" number). Keep this in lockstep
 * with the variant the SoT block marks ← CANONICAL and the reviewer checks.
 */
export const CANONICAL_METRIC_KEY: Partial<Record<MetricFamily, string>> = {
  MOI: "moiInclusive",
};

/**
 * Resolve the canonical source-of-truth value for one (neighbourhood, family)
 * — the value BOTH the script and the chat summary must cite.
 *
 * 1. If the family has a CANONICAL_METRIC_KEY, restrict to rows of that variant
 *    and prefer the propertyType="All" rollup (the scope the script cites, e.g.
 *    "Downtown | All"); otherwise accept the keyed rows if they themselves agree.
 * 2. Otherwise (single-variant family) fall back to `resolveUnambiguousSotValue`
 *    across all rows so we never force a detached number onto an apartment fact.
 *
 * Returns `null` only when no canonical can be determined (empty set, or an
 * ambiguous single-variant family).
 */
export function resolveCanonicalSotValue(
  rows: ReadonlyArray<{ metricKey: string; propertyType: string; metricValue: number }>,
  family: MetricFamily,
): number | null {
  if (rows.length === 0) return null;
  const canonicalKey = CANONICAL_METRIC_KEY[family];
  if (canonicalKey) {
    const keyed = rows.filter((r) => r.metricKey === canonicalKey);
    if (keyed.length > 0) {
      // Prefer the "All" property-type rollup — the scope the script cites.
      const all = keyed.find((r) => r.propertyType.toLowerCase() === "all");
      if (all) return all.metricValue;
      // No "All" rollup: accept the canonical variant only if its remaining
      // property-type rows agree (else we can't know which type this fact is).
      return resolveUnambiguousSotValue(keyed.map((r) => r.metricValue));
    }
    // Canonical variant not present for this hood — fall through to the
    // unambiguous-across-everything path below.
  }
  return resolveUnambiguousSotValue(rows.map((r) => r.metricValue));
}

/**
 * Convert a TRUE pooled trailing-90-day re-aggregation into period-labelled
 * `SourceOfTruthMetric` rows. These are appended to the same array that feeds
 * BOTH the rendered SoT block and `validateScript({ sourceOfTruth })`, so every
 * 90-day number is simultaneously shown to the writer AND becomes a validator
 * anchor (no script-content-rules change needed).
 *
 * - Only propertyType-rollup groups (priceTier === null) are emitted — the
 *   script cites neighbourhood × type, never price tier.
 * - MOI matches the MEMBER'S monthly MOI variant (`moiVariantKey`, resolved by
 *   the caller via `canonicalVariantKeys(mlsSource, settings)`), so the 90-day
 *   MOI is directly comparable to the current-month MOI the member actually
 *   cites — strict for a strict member, inclusive for an inclusive one. Both
 *   share the trailing-average-sold denominator; only the numerator differs
 *   (strict = Active; inclusive / inclusive-rolling3 = Active + Pending). The
 *   row is labelled with its resolved metricKey so the variant is explicit.
 * - SAMPLE_THRESHOLDS are applied (median/SP-LP/DOM/MOI on the pooled Sold N,
 *   failure-rate on Sold+offMarket N).
 * - `neighbourhoods` (the cited hoods) scopes output; "All Neighbourhoods" is
 *   always allowed through so citywide trailing context is available.
 *
 * Returns `[]` when the window is incomplete (caller then omits 90-day context).
 */
export function pooled90dToSourceOfTruth(
  result: Pooled90dResult,
  neighbourhoods?: string[],
  moiVariantKey:
    | "moiInclusive"
    | "moiStrict"
    | "moiInclusiveRolling3" = "moiInclusive",
): SourceOfTruthMetric[] {
  if (!result.complete || result.groups.length === 0) return [];

  // windowMonths is anchor-first descending; show oldest→newest as a range.
  const sorted = [...result.windowMonths].sort();
  const periodLabel =
    sorted.length >= 2
      ? `90-day pooled (${sorted[0]}–${sorted[sorted.length - 1]})`
      : "90-day pooled";

  const hoodFilter =
    neighbourhoods && neighbourhoods.length > 0
      ? new Set([...neighbourhoods, "All Neighbourhoods"])
      : null;

  const out: SourceOfTruthMetric[] = [];
  for (const g of result.groups) {
    if (g.priceTier !== null) continue;
    if (hoodFilter && !hoodFilter.has(g.neighbourhood)) continue;
    const propertyType = g.propertyType ?? "All";

    const push = (
      family: MetricFamily,
      metricKey: string,
      value: number | null,
      sampleSize: number,
    ): void => {
      if (value == null || !Number.isFinite(value)) return;
      if (sampleSize < SAMPLE_THRESHOLDS[family]) return;
      out.push({
        neighbourhood: g.neighbourhood,
        propertyType,
        metricFamily: family,
        metricKey,
        metricValue: value,
        sampleSize,
        monthYear: periodLabel,
        yoyDelta: null,
        rolling90dValue: null,
        compositionShiftFlag: false,
      });
    };

    push("MEDIAN", "medianPrice", g.medianPrice, g.sampleSize);
    push("SP_LP", "spLpRatio", g.spLpRatio, g.sampleSize);
    push("DOM", "domMedian", g.domMedian, g.sampleSize);
    // MOI: emit the member's monthly variant so the 90-day MOI is comparable.
    // moiStrict drops Pending from the numerator; moiInclusive and the
    // inclusive-rolling3 variant share the same (Active + Pending) numerator the
    // pooled aggregation already computes (both are inherently trailing-3).
    const moiValue =
      moiVariantKey === "moiStrict" ? g.moiStrict : g.moiInclusive;
    push("MOI", moiVariantKey, moiValue, g.sampleSize);
    push("FAILURE_RATE", "failureRate", g.failureRate, g.failN);
  }
  return out;
}

function formatDelta(value: number | null): string {
  // `yoyDelta` is persisted as a percentage already (csv-aggregate's
  // `pctDelta()` returns `(curr - prev) / prev * 100`), so a stored
  // value of `1.5` means "+1.5%", NOT "+150%". Do not auto-scale
  // — small magnitudes like ±0.4 or ±1.5 are real sub-2% YoY moves.
  if (value == null || !Number.isFinite(value)) return "";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

/**
 * Render the source-of-truth metrics as a compact Markdown block suitable
 * for injection into Claude's user message. Empty rows array → empty string
 * (caller decides whether to emit the section header).
 */
export function renderSourceOfTruthBlock(
  rows: SourceOfTruthMetric[],
): string {
  if (rows.length === 0) return "";

  // Group by (neighbourhood, propertyType, monthYear) so multi-upload
  // requests (e.g. April + March cited together) never merge rows from
  // different months under one header — that would mislabel the
  // deterministic context Claude is told to treat as LAW.
  const byKey = new Map<string, SourceOfTruthMetric[]>();
  for (const r of rows) {
    const k = `${r.neighbourhood}||${r.propertyType}||${r.monthYear}`;
    const arr = byKey.get(k);
    if (arr) arr.push(r);
    else byKey.set(k, [r]);
  }

  const lines: string[] = [];
  for (const [key, group] of byKey) {
    const [neighbourhood, propertyType, monthYear] = key.split("||");
    // A calendar month renders as "(month: 2026-05)"; a derived window (e.g.
    // "90-day pooled (2026-03–2026-05)") renders as "(period: …)" so the writer
    // never mistakes a pooled trailing window for a single month.
    const isCalendarMonth = /^\d{4}-\d{2}$/.test(monthYear);
    lines.push(
      `### ${neighbourhood} | ${propertyType} (${
        isCalendarMonth ? "month" : "period"
      }: ${monthYear})`,
    );
    for (const m of group) {
      // Fix 1 — flag the canonical variant so the writer (and the reviewer)
      // cite the SAME one the chat summary reconciles to. Only multi-variant
      // families (MOI) carry a canonical key; single-variant rows are unmarked.
      const isCanonical = CANONICAL_METRIC_KEY[m.metricFamily] === m.metricKey;
      const parts: string[] = [
        `- **${m.metricFamily}** (${m.metricKey}): ${formatValue(
          m.metricFamily,
          m.metricValue,
        )} [n=${m.sampleSize}]${isCanonical ? " ← CANONICAL (cite this variant)" : ""}`,
      ];
      const yoy = formatDelta(m.yoyDelta);
      if (yoy) parts.push(`YoY ${yoy}`);
      // NOTE: the old inline "90d {rolling90dValue}" annotation was removed on
      // the script path. rolling90dValue is a weighted MEAN of three monthly
      // medians (statistically wrong as a trailing-window figure). The true
      // pooled trailing-90-day numbers are now injected as their own
      // period-labelled SoT rows (see pooled90dToSourceOfTruth) so they are
      // both rendered AND validator-anchored. The legacy field still feeds the
      // separate upload-time fact-validator prompt, so it is left on the type.
      if (m.compositionShiftFlag) parts.push("⚠ composition-shift");
      lines.push(parts.join(" | "));
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

/**
 * Render the source-of-truth metrics with a per-neighbourhood propertyType
 * lock. For each non-citywide neighbourhood in `propertyTypeByHood`, only
 * rows matching the locked type (plus rows with propertyType="All") are
 * emitted; any other per-type rows for that neighbourhood are summarised in
 * a separate "EXCLUDED property types" header so the writer cannot pivot
 * to data the wizard ruled out.
 *
 * The "All Neighbourhoods" rollup is never subject to the lock — its rows
 * pass through unchanged so citywide context is always available.
 *
 * `propertyTypeByHood` maps neighbourhood → locked type ("Detached" |
 * "Row/Townhouse" | "Semi-Detached" | "Apartment" | "All"). Neighbourhoods
 * absent from the map (or mapped to "All") are not filtered.
 */
export function renderSourceOfTruthBlockWithLock(
  rows: SourceOfTruthMetric[],
  propertyTypeByHood: Record<string, string>,
): string {
  if (rows.length === 0) return "";

  // Group by neighbourhood, preserving the original order rows arrive in
  // (callers already sorted by neighbourhood asc).
  const byHood = new Map<string, SourceOfTruthMetric[]>();
  for (const r of rows) {
    const arr = byHood.get(r.neighbourhood);
    if (arr) arr.push(r);
    else byHood.set(r.neighbourhood, [r]);
  }

  const out: string[] = [];
  for (const [hood, hoodRows] of byHood) {
    const isCitywide = hood === "All Neighbourhoods";
    const lock = isCitywide ? null : propertyTypeByHood[hood] ?? null;
    const hasLock = lock != null && lock !== "All";

    const presentTypes = Array.from(
      new Set(hoodRows.map((r) => r.propertyType)),
    );
    const allowedRows = hasLock
      ? hoodRows.filter(
          (r) => r.propertyType === lock || r.propertyType === "All",
        )
      : hoodRows;
    const excludedTypes = hasLock
      ? presentTypes.filter((t) => t !== lock && t !== "All")
      : [];

    const rendered = renderSourceOfTruthBlock(allowedRows);
    if (rendered) out.push(rendered);

    if (hasLock && excludedTypes.length > 0) {
      out.push("");
      out.push(`### ${hood} | EXCLUDED property types`);
      out.push(
        `- **${excludedTypes.join(", ")}:** EXCLUDED — this video covers ${hood} ${lock} only. Do NOT write about these property types for ${hood}, even if data appears elsewhere in this message.`,
      );
    }
    out.push("");
  }
  return out.join("\n").trimEnd();
}

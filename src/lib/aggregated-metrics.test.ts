/**
 * Unit tests for deterministic AggregatedMetric row generation (Phase 1 fixes
 * for Known Issues #1–#5) + market-canonical variant selection.
 *
 * Run: `npx tsx --test src/lib/aggregated-metrics.test.ts`
 *
 * Covers:
 *   - rowsFromGroup persists ALL six headline keys above floor:
 *       moiStrict, moiInclusive, domMedian, domAverage, failureRate, saleShare,
 *       absorptionRate (Known Issues #1, #2, #4, #5).
 *   - Calgary worked example: the stored values match hand math.
 *   - MOI sample floor consolidated to n>=5: sold=3 -> NO MOI rows (Issue #3).
 *   - canonicalVariantKeys: CREB -> inclusive/average; US/GENERIC -> strict/average.
 *   - pickAggregatedMetric honours preferMetricKey (canonical variant wins).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { rowsFromGroup, type MetricRow } from "./aggregated-metrics";
import type { AggregatedGroup } from "./csv-aggregate";
import { canonicalVariantKeys } from "./market-config";
import {
  pickAggregatedMetric,
  type ResolverAggregatedMetric,
} from "./script-data-resolver";

// ── A fully-populated AggregatedGroup factory ───────────────────────────────
function group(over: Partial<AggregatedGroup> = {}): AggregatedGroup {
  const base: AggregatedGroup = {
    neighbourhood: "Bridgeland",
    propertyType: "Detached",
    priceTier: null,
    sampleSize: 10, // sold count
    activeCount: 40,
    pendingCount: 8,
    soldCount: 10,
    offMarketCount: 9,
    moiStrict: 4.0, // active/sold = 40/10
    moiInclusive: 4.8, // (active+pending)/sold = 48/10
    moiInclusiveRolling3: 4.8, // single-month: collapses to moiInclusive
    medianPrice: 742000,
    medianSqft: 1800,
    psf: 412,
    domMedian: 22,
    domAverage: 30,
    spLpRatio: 0.99,
    failureRate: 90.0, // offMarket/sold * 100 = 9/10 * 100
    failureRateExpiredOnly: 50.0, // expired/sold * 100 = 5/10 * 100
    failureRateExpiredPlusWithdrawn: 70.0, // (expired+withdrawn)/sold * 100 = 7/10 * 100
    saleShare: 52.6, // sold/(sold+offMarket) * 100 = 10/19 * 100
    absorptionRate: 25.0, // sold/active * 100 = 10/40 * 100
    avgSalePrice: 760000,
    benchmarkPrice: null,
    expiredCount: 5,
    terminatedCount: 2,
    withdrawnCount: 2,
    yoy: {
      medianPriceDelta: null,
      medianSqftDelta: null,
      psfDelta: null,
      moiStrictDelta: null,
    },
    rolling90d: { medianPrice: null, psf: null, moiStrict: null },
    compositionShiftFlag: false,
    rollupNotes: [],
  };
  return { ...base, ...over };
}

function byKey(rows: MetricRow[], key: string): MetricRow | undefined {
  return rows.find((r) => r.metricKey === key);
}

// ── Persistence: all six headline variants are emitted above floor ──────────
test("rowsFromGroup persists both MOI + both DOM + sale_share + absorption", () => {
  const rows = rowsFromGroup(group(), "2026-04");
  const keys = rows.map((r) => r.metricKey);

  // Both MOI variants (Issue #5) under the MOI family.
  assert.ok(keys.includes("moiStrict"), "moiStrict persisted");
  assert.ok(keys.includes("moiInclusive"), "moiInclusive persisted");
  assert.equal(byKey(rows, "moiStrict")!.metricFamily, "MOI");
  assert.equal(byKey(rows, "moiInclusive")!.metricFamily, "MOI");

  // Both DOM variants (Issue #4) under the DOM family.
  assert.ok(keys.includes("domMedian"), "domMedian persisted");
  assert.ok(keys.includes("domAverage"), "domAverage persisted");
  assert.equal(byKey(rows, "domAverage")!.metricFamily, "DOM");

  // sale_share (Issue #2) rides the FAILURE_RATE family.
  const saleShare = byKey(rows, "saleShare");
  assert.ok(saleShare, "saleShare persisted");
  assert.equal(saleShare!.metricFamily, "FAILURE_RATE");

  // absorption_rate (Issue #1) gets its own ABSORPTION family.
  const absorption = byKey(rows, "absorptionRate");
  assert.ok(absorption, "absorptionRate persisted");
  assert.equal(absorption!.metricFamily, "ABSORPTION");
});

// ── Calgary worked example: stored numbers match hand math ──────────────────
test("Calgary worked example — stored values match hand calculation", () => {
  // active=40, pending=8, sold=10, offMarket=9.
  const rows = rowsFromGroup(group(), "2026-04");

  assert.equal(byKey(rows, "moiStrict")!.metricValue, 4.0); // 40 / 10
  assert.equal(byKey(rows, "moiInclusive")!.metricValue, 4.8); // (40+8) / 10
  assert.equal(byKey(rows, "domAverage")!.metricValue, 30);
  assert.equal(byKey(rows, "domMedian")!.metricValue, 22);
  assert.equal(byKey(rows, "failureRate")!.metricValue, 90.0); // 9/10 * 100
  assert.equal(byKey(rows, "saleShare")!.metricValue, 52.6); // 10/19 * 100
  assert.equal(byKey(rows, "absorptionRate")!.metricValue, 25.0); // 10/40 * 100

  // sale_share + absorption sample sizes: failN = sold + offMarket = 19; soldN.
  assert.equal(byKey(rows, "saleShare")!.sampleSize, 19);
  assert.equal(byKey(rows, "absorptionRate")!.sampleSize, 10);
});

// ── MOI floor consolidated to n>=5 (Issue #3) ───────────────────────────────
test("sold=3 yields NO MOI rows (floor consolidated to 5)", () => {
  const rows = rowsFromGroup(
    group({ sampleSize: 3, soldCount: 3 }),
    "2026-04",
  );
  const keys = rows.map((r) => r.metricKey);
  assert.ok(!keys.includes("moiStrict"), "no moiStrict below floor");
  assert.ok(!keys.includes("moiInclusive"), "no moiInclusive below floor");
  // Inventory (floor 1) still rides on activeCount; absorption needs sold>=5.
  assert.ok(!keys.includes("absorptionRate"), "no absorption below floor");
});

// ── canonicalVariantKeys per market ─────────────────────────────────────────
test("canonicalVariantKeys: CREB is inclusive MOI + average DOM", () => {
  const v = canonicalVariantKeys("CREB");
  assert.equal(v.moiMetricKey, "moiInclusive");
  assert.equal(v.moiMetricName, "moi_inclusive");
  assert.equal(v.domMetricKey, "domAverage");
  assert.equal(v.domMetricName, "dom_average");
});

test("canonicalVariantKeys: US board + GENERIC default to strict MOI", () => {
  for (const src of ["NTREIS", "BRIGHT", "ARMLS", "MFRMLS", "unknown-board", null]) {
    const v = canonicalVariantKeys(src);
    assert.equal(v.moiMetricKey, "moiStrict", `${src} MOI strict`);
    assert.equal(v.domMetricKey, "domAverage", `${src} DOM average`);
  }
});

// ── pickAggregatedMetric honours the canonical variant preference ────────────
test("pickAggregatedMetric prefers the canonical metricKey when present", () => {
  const base = {
    neighbourhood: "Bridgeland",
    propertyType: "Detached",
    sampleSize: 24,
    monthYear: "2026-04",
  };
  const rows: ResolverAggregatedMetric[] = [
    { id: "strict", metricValue: 4.0, metricKey: "moiStrict", ...base },
    { id: "incl", metricValue: 4.8, metricKey: "moiInclusive", ...base },
  ];
  const need = {
    neighbourhood: "Bridgeland",
    propertyType: "Detached",
    timeWindow: { startMonth: "2026-01", endMonth: "2026-06" },
  };

  const inclusive = pickAggregatedMetric(rows, need, "moiInclusive");
  assert.equal(inclusive?.metricId, "incl");
  assert.equal(inclusive?.value, 4.8);

  const strict = pickAggregatedMetric(rows, need, "moiStrict");
  assert.equal(strict?.metricId, "strict");

  // No preference -> falls back to recency/sample ranking (id tiebreak).
  const fallback = pickAggregatedMetric(rows, need);
  assert.ok(fallback, "still returns a row without a preference");
});

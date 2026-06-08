/**
 * Regression guard for the citywide "All Neighbourhoods" overall MOI bug.
 *
 * Run: `npx tsx --test src/lib/citywide-moi-pooling.guard.test.ts`
 *
 * Two invariants, mirroring the real Calgary defect (overall MOI surfaced the
 * Detached segment ~2.44 instead of the true all-types pooled ~3.1):
 *
 *  1. POOLING (csv-aggregate): the citywide overall MOI is computed by SUMMING
 *     counts across property types (Active[+Pending] ÷ Sold), never by averaging
 *     per-type ratios — so it equals the count-pooled value and is NOT equal to
 *     any single segment. Inclusive ≥ active-only.
 *
 *  2. LABELLING (fact-validator relabel): a would-be-overall (propertyType=null)
 *     MOI rollup fact carrying a per-type value is snapped back to its real
 *     property type, while the genuine pooled fact stays overall (null).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { aggregateUpload, type AggregatedGroup } from "./csv-aggregate";
import { resolveMoiRollupPropertyType } from "./fact-validator";
import { emptyMarketConfig } from "./market-config";

// Per-type status counts chosen so each segment's inclusive MOI matches a
// distinct target and the count-pooled overall lands at ~3.0 — distinct from
// both the Detached segment (2.45) and the naive average-of-ratios (~3.65).
//   Detached:       active 82, pending 16, sold 40  → strict 2.05, incl 2.45
//   Apartment:      active 30, pending  6, sold  7  → strict 4.29, incl 5.14
//   Row/Townhouse:  active 55, pending 12, sold 20  → strict 2.75, incl 3.35
//   Pooled overall: active 167, pending 34, sold 67 → strict 2.49, incl 3.00
const PLAN: Array<{ type: string; active: number; pending: number; sold: number }> = [
  { type: "Detached", active: 82, pending: 16, sold: 40 },
  { type: "Apartment", active: 30, pending: 6, sold: 7 },
  { type: "Row/Townhouse", active: 55, pending: 12, sold: 20 },
];

function buildCsv(): Buffer {
  const lines = ["PropertyType,Status,Sale Price,Close Date"];
  for (const { type, active, pending, sold } of PLAN) {
    const push = (status: string, n: number) => {
      for (let i = 0; i < n; i++) {
        lines.push(`${type},${status},500000,2026-05-15`);
      }
    };
    push("Active", active);
    push("Pending", pending);
    push("Sold", sold);
  }
  return Buffer.from(lines.join("\n"), "utf8");
}

function makeConfig() {
  return {
    ...emptyMarketConfig(),
    marketName: "Test Market",
    mlsSource: "CREB",
    columnMapping: {
      propertyType: "PropertyType",
      status: "Status",
      salePrice: "Sale Price",
      date: "Close Date",
    },
  };
}

async function aggregate() {
  return aggregateUpload({
    uploadId: "test-upload-moi",
    userId: "test-user-moi",
    monthYear: "2026-05",
    csvFileName: "moi.csv",
    csvBuffer: buildCsv(),
    config: makeConfig(),
  });
}

function citywide(groups: AggregatedGroup[], propertyType: string | null) {
  return groups.find(
    (g) =>
      g.neighbourhood === "All Neighbourhoods" &&
      g.propertyType === propertyType &&
      g.priceTier === null,
  );
}

test("citywide overall MOI is count-pooled, not a single segment nor an average", async () => {
  const { groups } = await aggregate();

  const overall = citywide(groups, null);
  const detached = citywide(groups, "Detached");
  const apartment = citywide(groups, "Apartment");
  const row = citywide(groups, "Row/Townhouse");

  assert.ok(overall, "pooled citywide overall group exists");
  assert.ok(detached && apartment && row, "all three per-type citywide cuts exist");

  // Pooled counts == sum of per-type counts (no row dropped, no double-count).
  const sumA = PLAN.reduce((s, p) => s + p.active, 0);
  const sumP = PLAN.reduce((s, p) => s + p.pending, 0);
  const sumS = PLAN.reduce((s, p) => s + p.sold, 0);
  assert.equal(overall!.activeCount, sumA);
  assert.equal(overall!.pendingCount, sumP);
  assert.equal(overall!.soldCount, sumS);

  // Overall = SUMMED-count ratio, NOT an average of per-type ratios.
  const expectedStrict = sumA / sumS; // ~2.49
  const expectedIncl = (sumA + sumP) / sumS; // ~3.00
  assert.ok(Math.abs(overall!.moiStrict! - expectedStrict) < 1e-6);
  assert.ok(Math.abs(overall!.moiInclusive! - expectedIncl) < 1e-6);

  const avgOfRatios =
    (detached!.moiInclusive! + apartment!.moiInclusive! + row!.moiInclusive!) / 3;
  assert.ok(
    Math.abs(overall!.moiInclusive! - avgOfRatios) > 0.3,
    "overall must NOT equal the naive average of per-type ratios",
  );

  // The reported bug: overall must not silently equal the Detached segment.
  assert.ok(
    Math.abs(overall!.moiInclusive! - detached!.moiInclusive!) > 0.3,
    "overall MOI must differ from the Detached segment",
  );

  // Overall sits between the lowest and highest segment, inclusive ≥ active-only.
  assert.ok(overall!.moiInclusive! > detached!.moiInclusive!);
  assert.ok(overall!.moiInclusive! < apartment!.moiInclusive!);
  assert.ok(overall!.moiInclusive! >= overall!.moiStrict!);

  // Sanity on the per-type targets.
  assert.ok(Math.abs(detached!.moiInclusive! - 2.45) < 0.02);
  assert.ok(Math.abs(apartment!.moiInclusive! - 5.14) < 0.02);
  assert.ok(Math.abs(row!.moiInclusive! - 3.35) < 0.02);
});

test("relabel snaps a per-type citywide MOI fact off the bare overall", async () => {
  const { groups } = await aggregate();
  const candidates = groups.filter(
    (g) => g.neighbourhood === "All Neighbourhoods" && g.priceTier === null,
  );
  const idx = candidates; // resolveMoiRollupPropertyType takes the candidate list

  const detached = citywide(groups, "Detached")!;
  const overall = citywide(groups, null)!;

  // A fact carrying the Detached numbers (the bug) → relabelled "Detached".
  const detachedFact = {
    metricName: "moi_inclusive",
    metricValue: detached.moiInclusive,
    moiStrict: detached.moiStrict,
    moiInclusive: detached.moiInclusive,
  };
  assert.equal(resolveMoiRollupPropertyType(detachedFact, idx), "Detached");

  // The genuine pooled overall fact → stays overall (null).
  const overallFact = {
    metricName: "moi_inclusive",
    metricValue: overall.moiInclusive,
    moiStrict: overall.moiStrict,
    moiInclusive: overall.moiInclusive,
  };
  assert.equal(resolveMoiRollupPropertyType(overallFact, idx), null);

  // Single-value fallback (no strict/inclusive columns) still snaps Apartment.
  const apartment = citywide(groups, "Apartment")!;
  const apartmentFactNoPair = {
    metricName: "moi_inclusive",
    metricValue: apartment.moiInclusive,
    moiStrict: null,
    moiInclusive: null,
  };
  assert.equal(
    resolveMoiRollupPropertyType(apartmentFactNoPair, idx),
    "Apartment",
  );

  // An off-scale value matches nothing → conservatively stays overall (null).
  const noMatch = {
    metricName: "moi_inclusive",
    metricValue: 99,
    moiStrict: 99,
    moiInclusive: 99,
  };
  assert.equal(resolveMoiRollupPropertyType(noMatch, idx), null);
});

test("ambiguous near-equal candidates are NOT relabelled (stay overall)", () => {
  // Pooled overall and a segment whose MOI is within the ambiguity margin of
  // each other. A fact sitting between them must NOT be confidently snapped to
  // the segment — it stays overall (null). "Never guess."
  const candidates = [
    { propertyType: null, moiStrict: 2.7, moiInclusive: 3.1, moiInclusiveRolling3: 3.1 },
    {
      propertyType: "Detached",
      moiStrict: 2.72,
      moiInclusive: 3.14,
      moiInclusiveRolling3: 3.14,
    },
  ];
  const fact = {
    metricName: "moi_inclusive",
    metricValue: 3.12,
    moiStrict: 2.71,
    moiInclusive: 3.12,
  };
  assert.equal(resolveMoiRollupPropertyType(fact, candidates), null);

  // But a segment that is clearly separated from the pooled value still snaps.
  const clear = [
    { propertyType: null, moiStrict: 2.7, moiInclusive: 3.1, moiInclusiveRolling3: 3.1 },
    {
      propertyType: "Apartment",
      moiStrict: 4.76,
      moiInclusive: 5.13,
      moiInclusiveRolling3: 5.13,
    },
  ];
  const aptFact = {
    metricName: "moi_inclusive",
    metricValue: 5.13,
    moiStrict: 4.76,
    moiInclusive: 5.13,
  };
  assert.equal(resolveMoiRollupPropertyType(aptFact, clear), "Apartment");
});

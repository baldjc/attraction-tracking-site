/**
 * Unit tests for the TRUE pooled trailing-90-day re-aggregation and its
 * conversion into period-labelled source-of-truth rows.
 *
 * Run: `npx tsx --test src/lib/pooled-90d.test.ts`
 *
 * The headline invariant (the whole reason this work exists): the pooled median
 * is computed over the COMBINED population of sales across the window — it is NOT
 * the sample-weighted MEAN of the three monthly medians the legacy `rolling90d`
 * field carried. The two diverge on any skewed distribution.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  pool90d,
  type Pooled90dResult,
} from "./csv-aggregate";
import {
  pooled90dToSourceOfTruth,
  renderSourceOfTruthBlock,
  type SourceOfTruthMetric,
} from "./aggregated-metrics";

// Minimal RowAccumulator-shaped factory. We only set the fields pool90d reads;
// the rest default to the empty-accumulator zero state.
type AccLike = Parameters<typeof pool90d>[0] extends Map<string, infer V>
  ? V
  : never;
function acc(partial: {
  soldPrices?: number[];
  soldDoms?: number[];
  soldSpLpRatios?: number[];
  active?: number;
  pending?: number;
  offMarket?: number;
}): AccLike {
  return {
    soldPrices: partial.soldPrices ?? [],
    soldSqfts: [],
    soldPsfs: [],
    soldDoms: partial.soldDoms ?? [],
    soldSpLpRatios: partial.soldSpLpRatios ?? [],
    active: partial.active ?? 0,
    pending: partial.pending ?? 0,
    sold: (partial.soldPrices ?? []).length,
    offMarket: partial.offMarket ?? 0,
    expired: 0,
    terminated: 0,
    withdrawn: 0,
    rollupNotes: new Set<string>(),
  } as AccLike;
}

const KEY = "Downtown||All||"; // neighbourhood||propertyType||priceTier

test("pool90d — pooled median is NOT the weighted-mean-of-medians", () => {
  // Anchor: one $100 sale (median 100). Prior1: five $200 sales (median 200).
  // Prior2: four $300 sales (median 300).
  const anchor = new Map([[KEY, acc({ soldPrices: [100], active: 10 })]]);
  const prior1 = new Map([
    [KEY, acc({ soldPrices: [200, 200, 200, 200, 200] })],
  ]);
  const prior2 = new Map([[KEY, acc({ soldPrices: [300, 300, 300, 300] })]]);

  const [g] = pool90d(anchor, [prior1, prior2]);

  // Weighted mean of monthly medians = (100·1 + 200·5 + 300·4) / 10 = 230.
  // TRUE pooled median over [100,200×5,300×4] (n=10) = (200 + 200) / 2 = 200.
  assert.equal(g.medianPrice, 200);
  assert.notEqual(g.medianPrice, 230);
  assert.equal(g.sampleSize, 10); // pooled Sold N across the 3 months
  assert.equal(g.monthsInWindow, 3);
});

test("pool90d — MOI is inclusive rolling-3: (anchor active+pending) ÷ (pooledSold ÷ months)", () => {
  // anchor active+pending = 10; pooledSold = 10 over 3 months → avg 3.333/mo.
  const anchor = new Map([
    [KEY, acc({ soldPrices: [100], active: 8, pending: 2 })],
  ]);
  const prior1 = new Map([
    [KEY, acc({ soldPrices: [200, 200, 200, 200, 200] })],
  ]);
  const prior2 = new Map([[KEY, acc({ soldPrices: [300, 300, 300, 300] })]]);

  const [g] = pool90d(anchor, [prior1, prior2]);
  // 10 / (10 / 3) = 3.0 exactly.
  assert.ok(g.moiInclusive != null);
  assert.ok(Math.abs((g.moiInclusive as number) - 3) < 1e-9);
});

test("pool90d — anchor defines the group universe (a prior-only group yields no row)", () => {
  const anchor = new Map([[KEY, acc({ soldPrices: [100, 100] })]]);
  const prior1 = new Map([
    ["Suburbia||All||", acc({ soldPrices: [500, 500] })],
  ]);
  const out = pool90d(anchor, [prior1]);
  assert.equal(out.length, 1);
  assert.equal(out[0].neighbourhood, "Downtown");
});

test("pool90d — failure rate pools over combined Sold + offMarket", () => {
  // Clears the floor (sold ≥ 5, offMarket ≥ 3). anchor 2 sold + 3 offMarket;
  // prior 8 sold + 0 offMarket → pooled 10 sold, 3 offMarket → 3/10 = 30%.
  const anchor = new Map([
    [KEY, acc({ soldPrices: [100, 100], offMarket: 3 })],
  ]);
  const prior = new Map([
    [KEY, acc({ soldPrices: [100, 100, 100, 100, 100, 100, 100, 100] })],
  ]);
  const [g] = pool90d(anchor, [prior]);
  assert.ok(g.failureRate != null);
  assert.ok(Math.abs((g.failureRate as number) - 30) < 1e-9);
  assert.equal(g.failN, 13); // 10 sold + 3 offMarket
});

/* ── pooled90dToSourceOfTruth (gating + canonical MOI) ──────────────────── */

function completeResult(): Pooled90dResult {
  const anchor = new Map([
    [KEY, acc({ soldPrices: Array(8).fill(600_000), active: 10, pending: 2 })],
  ]);
  const prior1 = new Map([
    [KEY, acc({ soldPrices: Array(6).fill(610_000) })],
  ]);
  const prior2 = new Map([
    [KEY, acc({ soldPrices: Array(5).fill(620_000) })],
  ]);
  return {
    complete: true,
    anchorMonthYear: "2026-05",
    windowMonths: ["2026-05", "2026-04", "2026-03"],
    groups: pool90d(anchor, [prior1, prior2]),
  };
}

test("pooled90dToSourceOfTruth — incomplete window emits NO rows (no data → no claim)", () => {
  const incomplete: Pooled90dResult = {
    complete: false,
    anchorMonthYear: "2026-05",
    windowMonths: ["2026-05"],
    groups: [],
  };
  assert.deepEqual(pooled90dToSourceOfTruth(incomplete), []);
});

test("pooled90dToSourceOfTruth — MOI row pins the inclusive canonical variant", () => {
  const rows = pooled90dToSourceOfTruth(completeResult());
  const moi = rows.find((r) => r.metricFamily === "MOI");
  assert.ok(moi, "expected an MOI row");
  assert.equal(moi!.metricKey, "moiInclusive");
  // period label, not a calendar month
  assert.ok(/^90-day pooled \(/.test(moi!.monthYear));
});

test("pooled90dToSourceOfTruth — period label spans oldest→newest of the window", () => {
  const rows = pooled90dToSourceOfTruth(completeResult());
  assert.ok(rows.length > 0);
  assert.equal(rows[0].monthYear, "90-day pooled (2026-03–2026-05)");
});

test("pooled90dToSourceOfTruth — applies the MEDIAN sample threshold", () => {
  // 3 pooled sold < MEDIAN threshold (5) → median row suppressed.
  const thin: Pooled90dResult = {
    complete: true,
    anchorMonthYear: "2026-05",
    windowMonths: ["2026-05", "2026-04", "2026-03"],
    groups: pool90d(
      new Map([[KEY, acc({ soldPrices: [600_000], active: 4 })]]),
      [
        new Map([[KEY, acc({ soldPrices: [610_000] })]]),
        new Map([[KEY, acc({ soldPrices: [620_000] })]]),
      ],
    ),
  };
  const rows = pooled90dToSourceOfTruth(thin);
  assert.equal(
    rows.find((r) => r.metricFamily === "MEDIAN"),
    undefined,
  );
});

test("pooled90dToSourceOfTruth — scopes to cited neighbourhoods (+ All Neighbourhoods)", () => {
  const anchor = new Map([
    ["Downtown||All||", acc({ soldPrices: Array(6).fill(600_000) })],
    ["Suburbia||All||", acc({ soldPrices: Array(6).fill(400_000) })],
    ["All Neighbourhoods||All||", acc({ soldPrices: Array(12).fill(500_000) })],
  ]);
  const prior = new Map([
    ["Downtown||All||", acc({ soldPrices: Array(6).fill(605_000) })],
    ["Suburbia||All||", acc({ soldPrices: Array(6).fill(405_000) })],
    ["All Neighbourhoods||All||", acc({ soldPrices: Array(12).fill(505_000) })],
  ]);
  const result: Pooled90dResult = {
    complete: true,
    anchorMonthYear: "2026-05",
    windowMonths: ["2026-05", "2026-04"],
    groups: pool90d(anchor, [prior]),
  };
  const rows = pooled90dToSourceOfTruth(result, ["Downtown"]);
  const hoods = new Set(rows.map((r) => r.neighbourhood));
  assert.ok(hoods.has("Downtown"));
  assert.ok(hoods.has("All Neighbourhoods")); // always allowed through
  assert.ok(!hoods.has("Suburbia")); // not cited → excluded
});

/* ── render: period vs month labelling, no inline 90d annotation ────────── */

function row(over: Partial<SourceOfTruthMetric>): SourceOfTruthMetric {
  return {
    neighbourhood: "Downtown",
    propertyType: "All",
    metricFamily: "MEDIAN",
    metricKey: "medianPrice",
    metricValue: 600_000,
    sampleSize: 8,
    monthYear: "2026-05",
    yoyDelta: null,
    rolling90dValue: null,
    compositionShiftFlag: false,
    ...over,
  };
}

test("renderSourceOfTruthBlock — calendar month renders '(month: …)'", () => {
  const out = renderSourceOfTruthBlock([row({ monthYear: "2026-05" })]);
  assert.match(out, /\(month: 2026-05\)/);
  assert.doesNotMatch(out, /\(period:/);
});

test("renderSourceOfTruthBlock — derived window renders '(period: …)'", () => {
  const out = renderSourceOfTruthBlock([
    row({ monthYear: "90-day pooled (2026-03–2026-05)", metricValue: 612_000 }),
  ]);
  assert.match(out, /\(period: 90-day pooled \(2026-03–2026-05\)\)/);
  // the pooled value is citable
  assert.match(out, /612/);
});

test("renderSourceOfTruthBlock — no inline '90d' annotation even when rolling90dValue set", () => {
  const out = renderSourceOfTruthBlock([
    row({ rolling90dValue: 999_999 }),
  ]);
  assert.doesNotMatch(out, /90d/);
  assert.doesNotMatch(out, /999999|999,999/);
});

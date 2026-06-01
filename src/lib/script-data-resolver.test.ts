/**
 * Unit tests for the Layer 1 zero-cost resolver (`findDataForScriptNeed`) and
 * its pure selection cores.
 *
 * Run: `npx tsx --test src/lib/script-data-resolver.test.ts`
 *
 * Covers the three resolution outcomes the spec requires:
 *   - MarketFact present              -> { source: "market_fact" }
 *   - only AggregatedMetric present   -> { source: "aggregated_metric" }
 *   - neither present                 -> { source: "none", reason: "no_data" }
 * plus the sample-floor / time-window / scope guards on each picker.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  findDataForScriptNeed,
  pickMarketFact,
  pickAggregatedMetric,
  toMetricFamily,
  monthInWindow,
  MetricFamily,
  type ScriptDataNeed,
  type ResolverMarketFact,
  type ResolverAggregatedMetric,
} from "./script-data-resolver";

const need = (over: Partial<ScriptDataNeed> = {}): ScriptDataNeed => ({
  memberId: "m1",
  marketConfigId: "cfg1",
  neighbourhood: "Bridgeland",
  propertyType: "Detached",
  metricFamily: MetricFamily.MEDIAN,
  timeWindow: { startMonth: "2026-01", endMonth: "2026-06" },
  ...over,
});

const mf = (over: Partial<ResolverMarketFact> = {}): ResolverMarketFact => ({
  id: "f1",
  neighbourhood: "Bridgeland",
  propertyType: "Detached",
  metricValue: 750000,
  usageClass: "headline_safe",
  dateContext: new Date("2026-05-01"),
  createdAt: new Date("2026-05-02"),
  ...over,
});

const am = (over: Partial<ResolverAggregatedMetric> = {}): ResolverAggregatedMetric => ({
  id: "a1",
  neighbourhood: "Bridgeland",
  propertyType: "Detached",
  metricValue: 742000,
  sampleSize: 24,
  monthYear: "2026-04",
  ...over,
});

function fakePrisma(opts: {
  facts?: ResolverMarketFact[];
  metrics?: ResolverAggregatedMetric[];
}) {
  return {
    prisma: {
      marketFact: { findMany: async () => opts.facts ?? [] },
      aggregatedMetric: { findMany: async () => opts.metrics ?? [] },
    },
  };
}

// ── findDataForScriptNeed: the three required outcomes ───────────────────────

test("MarketFact present -> market_fact", async () => {
  const res = await findDataForScriptNeed(
    need(),
    fakePrisma({ facts: [mf()], metrics: [am()] }),
  );
  assert.equal(res.source, "market_fact");
  if (res.source === "market_fact") {
    assert.equal(res.factId, "f1");
    assert.equal(res.value, 750000);
    assert.equal(res.confidence, "headline");
    assert.equal(res.unit, "USD");
  }
});

test("only AggregatedMetric present -> aggregated_metric", async () => {
  const res = await findDataForScriptNeed(
    need(),
    fakePrisma({ facts: [], metrics: [am()] }),
  );
  assert.equal(res.source, "aggregated_metric");
  if (res.source === "aggregated_metric") {
    assert.equal(res.metricId, "a1");
    assert.equal(res.value, 742000);
    assert.equal(res.sampleSize, 24);
  }
});

test("neither present -> none/no_data", async () => {
  const res = await findDataForScriptNeed(
    need(),
    fakePrisma({ facts: [], metrics: [] }),
  );
  assert.deepEqual(res, { source: "none", reason: "no_data" });
});

test("texture-only fact still resolves as market_fact with texture confidence", async () => {
  const res = await findDataForScriptNeed(
    need(),
    fakePrisma({ facts: [mf({ usageClass: "supporting_texture_only" })] }),
  );
  assert.equal(res.source, "market_fact");
  if (res.source === "market_fact") assert.equal(res.confidence, "texture");
});

// ── pickMarketFact guards ────────────────────────────────────────────────────

test("pickMarketFact prefers headline-safe over texture", () => {
  const picked = pickMarketFact(
    [
      mf({ id: "tex", usageClass: "supporting_texture_only", metricValue: 1 }),
      mf({ id: "hl", usageClass: "headline_safe", metricValue: 2 }),
    ],
    need(),
  );
  assert.equal(picked?.factId, "hl");
});

test("pickMarketFact rejects out-of-scope neighbourhood and null values", () => {
  assert.equal(
    pickMarketFact([mf({ neighbourhood: "Inglewood" })], need()),
    null,
  );
  assert.equal(pickMarketFact([mf({ metricValue: null })], need()), null);
});

test("pickMarketFact rejects a different property type under a lock", () => {
  assert.equal(
    pickMarketFact([mf({ propertyType: "Apartment" })], need()),
    null,
  );
});

// ── pickAggregatedMetric guards ──────────────────────────────────────────────

test("pickAggregatedMetric rejects sampleSize < 10", () => {
  assert.equal(pickAggregatedMetric([am({ sampleSize: 9 })], need()), null);
});

test("pickAggregatedMetric rejects month outside window", () => {
  assert.equal(
    pickAggregatedMetric([am({ monthYear: "2025-12" })], need()),
    null,
  );
});

test("pickAggregatedMetric accepts an 'All' rollup for a typed need", () => {
  const picked = pickAggregatedMetric([am({ propertyType: "All" })], need());
  assert.equal(picked?.metricId, "a1");
});

// ── helpers ──────────────────────────────────────────────────────────────────

test("monthInWindow is inclusive on both bounds", () => {
  const w = { startMonth: "2026-01", endMonth: "2026-06" };
  assert.equal(monthInWindow("2026-01", w), true);
  assert.equal(monthInWindow("2026-06", w), true);
  assert.equal(monthInWindow("2026-07", w), false);
  assert.equal(monthInWindow("", w), false);
});

test("conceptual count families collapse onto INVENTORY", () => {
  assert.equal(toMetricFamily("sold_count"), MetricFamily.INVENTORY);
  assert.equal(toMetricFamily("active_count"), MetricFamily.INVENTORY);
  assert.equal(toMetricFamily("new_listing_count"), MetricFamily.INVENTORY);
  assert.equal(toMetricFamily("median_sale_price"), MetricFamily.MEDIAN);
});

// ── FAILURE_RATE variant selection (default-unchanged invariant) ─────────────
// AggregatedMetric now persists multiple FAILURE_RATE variant keys for EVERY
// upload (failureRate / failureRateExpiredOnly / failureRateExpiredPlusWithdrawn).
// A default/untouched member (no member_metric_settings row) must still resolve
// to the canonical `failureRate` key, never drift to a coexisting variant.

const failureRateAggregates = (): ResolverAggregatedMetric[] => [
  am({ id: "fr-canonical", metricKey: "failureRate", metricValue: 12, monthYear: "2026-04" }),
  // Newer month + larger sample => would win the tiebreak WITHOUT key narrowing.
  am({
    id: "fr-expired-only",
    metricKey: "failureRateExpiredOnly",
    metricValue: 99,
    monthYear: "2026-06",
    sampleSize: 50,
  }),
];

test("FAILURE_RATE: untouched member resolves the canonical failureRate aggregate, not a coexisting variant", async () => {
  // No marketConfig / memberMetricSettings methods on prisma => optional-chained
  // lookups return undefined => memberSettings is null (the default member).
  const res = await findDataForScriptNeed(
    need({ metricFamily: MetricFamily.FAILURE_RATE }),
    fakePrisma({ facts: [], metrics: failureRateAggregates() }),
  );
  assert.equal(res.source, "aggregated_metric");
  if (res.source === "aggregated_metric") {
    assert.equal(
      res.metricId,
      "fr-canonical",
      "default member must pick the canonical failureRate key even though a newer expired-only variant coexists",
    );
    assert.equal(res.value, 12);
  }
});

test("FAILURE_RATE: member who selected expired_only resolves the expired-only aggregate", async () => {
  const deps = {
    prisma: {
      marketFact: { findMany: async () => [] },
      aggregatedMetric: { findMany: async () => failureRateAggregates() },
      memberMetricSettings: {
        findUnique: async () => ({
          userId: "m1",
          moiVariant: "active_plus_pending_single",
          domVariant: "average",
          failureRateVariant: "expired_only",
          salePriceVariant: "median",
          sampleSizeVariant: "conservative",
        }),
      },
    },
  } as unknown as Parameters<typeof findDataForScriptNeed>[1];

  const res = await findDataForScriptNeed(
    need({ metricFamily: MetricFamily.FAILURE_RATE }),
    deps,
  );
  assert.equal(res.source, "aggregated_metric");
  if (res.source === "aggregated_metric") {
    assert.equal(res.metricId, "fr-expired-only");
    assert.equal(res.value, 99);
  }
});

test("findDataForScriptNeed excludes legacy_v1 failure_rate facts in the query", async () => {
  let capturedWhere: Record<string, unknown> | undefined;
  const capturingDeps = {
    prisma: {
      marketFact: {
        findMany: async (args: { where: Record<string, unknown> }) => {
          capturedWhere = args.where;
          return [];
        },
      },
      aggregatedMetric: { findMany: async () => [] },
    },
  } as unknown as Parameters<typeof findDataForScriptNeed>[1];

  await findDataForScriptNeed(need(), capturingDeps);

  assert.ok(capturedWhere, "findMany should have been called with a where clause");
  const not = (capturedWhere as { NOT?: Record<string, unknown> }).NOT;
  assert.deepEqual(
    not,
    { metricFamily: "FAILURE_RATE", methodologyVersion: "legacy_v1" },
    "the query must exclude FAILURE_RATE rows stamped legacy_v1 while leaving v2 (and every other family) untouched",
  );
});

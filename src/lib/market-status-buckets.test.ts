/**
 * Unit tests for market-agnostic status bucketing + derived-metric math.
 *
 * Run: `npx tsx --test src/lib/market-status-buckets.test.ts`
 *
 * Covers:
 *   - resolveStatusMapping precedence: override -> statusCodes -> defaults (all 3)
 *   - bucketStatus case-insensitivity + unknown fall-through
 *   - countByBucket tallies + unknown-label surfacing
 *   - NTREIS canonical labels bucket correctly
 *   - failure_rate / sale_share worked example (9 off, 10 sold -> 0.9, 0.526)
 *   - sample-size guards
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveStatusMapping,
  validateStatusMapping,
  bucketStatus,
  countByBucket,
  failureRate,
  saleShare,
  absorptionRate,
  monthsOfInventory,
  type StatusMapping,
} from "./market-status-buckets";
import type { StatusCode } from "./market-config";

const sc = (label: string, canonical: StatusCode["canonical"]): StatusCode => ({
  label,
  canonical,
});

// ── resolveStatusMapping — three branches ───────────────────────────────────

test("branch 1: explicit statusMapping override wins over statusCodes + mlsSource", () => {
  const override = {
    sold: ["CLOSED!"],
    offMarket: ["DEAD"],
    active: ["LIVE"],
    pending: ["UC"],
  };
  const m = resolveStatusMapping({
    statusMapping: override,
    statusCodes: [sc("Sold", "sold"), sc("Expired", "expired")],
    mlsSource: "CREB",
  });
  assert.equal(bucketStatus("closed!", m), "sold");
  assert.equal(bucketStatus("DEAD", m), "offMarket");
  assert.equal(bucketStatus("live", m), "active");
  assert.equal(bucketStatus("uc", m), "pending");
  // The statusCodes labels must NOT leak through when an override is present.
  assert.equal(bucketStatus("Sold", m), "unknown");
});

test("branch 2: derived from statusCodes when no override", () => {
  const m = resolveStatusMapping({
    statusMapping: null,
    statusCodes: [
      sc("Closed", "sold"),
      sc("Expired", "expired"),
      sc("Cancelled", "terminated"),
      sc("Withdrawn", "withdrawn"),
      sc("Active", "active"),
      sc("Pending", "pending"),
    ],
    mlsSource: "SOME_UNKNOWN_SOURCE",
  });
  assert.equal(bucketStatus("Closed", m), "sold");
  assert.equal(bucketStatus("Expired", m), "offMarket");
  assert.equal(bucketStatus("Cancelled", m), "offMarket");
  assert.equal(bucketStatus("Withdrawn", m), "offMarket");
  assert.equal(bucketStatus("Active", m), "active");
  assert.equal(bucketStatus("Pending", m), "pending");
});

test("branch 3: falls back to MARKET_SOURCE_DEFAULTS when no override + no statusCodes", () => {
  // CREB defaults: Sold->sold, Expired/Terminated/Withdrawn->offMarket.
  const m = resolveStatusMapping({
    statusMapping: undefined,
    statusCodes: null,
    mlsSource: "CREB",
  });
  assert.equal(bucketStatus("Sold", m), "sold");
  assert.equal(bucketStatus("Expired", m), "offMarket");
  assert.equal(bucketStatus("Active", m), "active");
  assert.equal(bucketStatus("Pending", m), "pending");
});

test("branch 3 via Pillar 9 alias resolves to CREB defaults", () => {
  const m = resolveStatusMapping({ statusCodes: null, mlsSource: "Pillar 9" });
  assert.equal(bucketStatus("Sold", m), "sold");
  assert.equal(bucketStatus("Expired", m), "offMarket");
});

test("NTREIS statusCodes: Closed->sold, Canceled/Withdrawn-Conditional/Temporarily Off Market->offMarket", () => {
  const m = resolveStatusMapping({ statusCodes: null, mlsSource: "NTREIS" });
  assert.equal(bucketStatus("Closed", m), "sold");
  assert.equal(bucketStatus("Canceled", m), "offMarket");
  assert.equal(bucketStatus("Cancelled", m), "offMarket");
  assert.equal(bucketStatus("Withdrawn-Conditional", m), "offMarket");
  assert.equal(bucketStatus("Temporarily Off Market", m), "offMarket");
  assert.equal(bucketStatus("Active Kick Out", m), "active");
  assert.equal(bucketStatus("Pending Continue to Show", m), "pending");
});

// ── validateStatusMapping ───────────────────────────────────────────────────

test("validateStatusMapping rejects malformed / empty, keeps valid labels", () => {
  assert.equal(validateStatusMapping(null), null);
  assert.equal(validateStatusMapping("nope"), null);
  assert.equal(validateStatusMapping([]), null);
  assert.equal(validateStatusMapping({ sold: [], offMarket: [] }), null);
  const ok = validateStatusMapping({
    sold: ["Closed", "  ", 42, "Sold"],
    bogusBucket: ["x"],
  });
  assert.deepEqual(ok, { sold: ["Closed", "Sold"], offMarket: [], active: [], pending: [] });
});

// ── bucketStatus edge cases ─────────────────────────────────────────────────

test("bucketStatus is case/whitespace-insensitive and unknown-safe", () => {
  const m: StatusMapping = { sold: ["Closed"], offMarket: ["Expired"], active: ["Active"], pending: ["Pending"] };
  assert.equal(bucketStatus("  cLoSeD  ", m), "sold");
  assert.equal(bucketStatus("", m), "unknown");
  assert.equal(bucketStatus(null, m), "unknown");
  assert.equal(bucketStatus("Foreclosure", m), "unknown");
});

test("countByBucket tallies buckets and surfaces unknown labels", () => {
  const m: StatusMapping = { sold: ["Closed"], offMarket: ["Expired"], active: ["Active"], pending: ["Pending"] };
  const res = countByBucket(
    ["Closed", "closed", "Expired", "Active", "Mystery", "Mystery", "", null],
    m,
  );
  assert.deepEqual(res.counts, { sold: 2, offMarket: 1, active: 1, pending: 0, unknown: 4 });
  assert.equal(res.unknownLabels.get("Mystery"), 2);
  assert.equal(res.unknownLabels.get("(blank)"), 2);
});

// ── derived metrics (ratios) ────────────────────────────────────────────────

test("worked example: 9 off-market, 10 sold -> failure_rate 0.9, sale_share ~0.526", () => {
  assert.equal(failureRate(10, 9), 0.9);
  const ss = saleShare(10, 9);
  assert.ok(ss != null && Math.abs(ss - 0.5263157894736842) < 1e-9);
});

test("failure_rate can exceed 1.0 (more failures than sales)", () => {
  assert.equal(failureRate(5, 12), 2.4);
});

test("sample-size guards return null below floors", () => {
  assert.equal(failureRate(4, 9), null); // sold < 5
  assert.equal(failureRate(10, 2), null); // offMarket < 3
  assert.equal(saleShare(4, 9), null);
  assert.equal(failureRate(0, 0), null);
});

test("absorption + months-of-inventory guards + math", () => {
  assert.equal(absorptionRate(10, 40), 0.25);
  assert.equal(absorptionRate(4, 40), null); // sold < 5
  assert.equal(absorptionRate(10, 0), null); // no inventory
  assert.equal(monthsOfInventory(40, 10), 4);
  assert.equal(monthsOfInventory(40, 4), null); // sold < 5
  assert.equal(monthsOfInventory(40, 0), null);
});

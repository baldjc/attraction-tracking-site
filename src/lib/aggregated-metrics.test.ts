/**
 * Unit tests for the source-of-truth reconciliation helpers used by Jarvis chat
 * (`reconcileLedgerToSourceOfTruth`) to read the SAME canonical value the script
 * builder uses.
 *
 * Run: `npx tsx --test src/lib/aggregated-metrics.test.ts`
 *
 * The key invariant (Fix 3): a (neighbourhood, metric family) is only canonical
 * when EVERY source-of-truth value for it agrees within rounding. A family
 * carries multiple metric-key variants (MOI = moiStrict / moiInclusive /
 * rolling3) and multiple property types; the ledger fact only knows its family,
 * not which variant — so when the variants disagree the canonical is ambiguous
 * and chat must leave the raw value untouched rather than force the wrong one.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveUnambiguousSotValue,
  sotValuesWithinRounding,
} from "./aggregated-metrics";

test("resolveUnambiguousSotValue — agreeing variants resolve to the canonical value", () => {
  // moiStrict 3.80, moiInclusive 3.81, rolling3 3.79 all agree within rounding.
  assert.equal(resolveUnambiguousSotValue([3.8, 3.81, 3.79]), 3.8);
});

test("resolveUnambiguousSotValue — disagreeing variants are ambiguous (null, no override)", () => {
  // MOI variants spread 3.8 → 4.3 (a real strict-vs-inclusive gap). We cannot
  // know which one the ledger fact represents, so refuse to override.
  assert.equal(resolveUnambiguousSotValue([3.8, 4.3]), null);
});

test("resolveUnambiguousSotValue — DOM-style variant spread is ambiguous too", () => {
  // domMedian 18 vs domAverage 27 — different metric keys in one family.
  assert.equal(resolveUnambiguousSotValue([18, 27]), null);
});

test("resolveUnambiguousSotValue — a single value is trivially canonical", () => {
  assert.equal(resolveUnambiguousSotValue([6.71]), 6.71);
});

test("resolveUnambiguousSotValue — an empty set has no canonical value", () => {
  assert.equal(resolveUnambiguousSotValue([]), null);
});

test("sotValuesWithinRounding — absolute tolerance (≤ 0.05)", () => {
  assert.ok(sotValuesWithinRounding(3.8, 3.83));
  assert.ok(!sotValuesWithinRounding(3.8, 4.3));
});

test("sotValuesWithinRounding — relative tolerance (≤ 0.5%) for large values", () => {
  // $1,000,000 vs $1,004,000 → 0.4% apart, within rounding.
  assert.ok(sotValuesWithinRounding(1_000_000, 1_004_000));
  // $1,000,000 vs $1,010,000 → 1% apart, NOT within rounding.
  assert.ok(!sotValuesWithinRounding(1_000_000, 1_010_000));
});

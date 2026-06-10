/**
 * parseNumber auto-clean tests.
 * Run: `npx tsx --test src/lib/csv-aggregate.parsenumber.test.ts`
 */
import test from "node:test";
import assert from "node:assert/strict";
import { parseNumber } from "./csv-aggregate";

test("plain + currency + comma cells auto-clean", () => {
  assert.equal(parseNumber("450000"), 450000);
  assert.equal(parseNumber("$450,000"), 450000);
  assert.equal(parseNumber("  450,000.50 "), 450000.5);
  assert.equal(parseNumber("$450,000 CAD"), 450000);
  assert.equal(parseNumber("1,234 sq ft"), 1234);
});

test("magnitude suffix k/M/B", () => {
  assert.equal(parseNumber("350k"), 350000);
  assert.equal(parseNumber("1.2M"), 1200000);
  assert.equal(parseNumber("$2.5m"), 2500000);
  assert.equal(parseNumber("1B"), 1000000000);
});

test("parenthesis + unicode-minus negatives", () => {
  assert.equal(parseNumber("(1,234)"), -1234);
  assert.equal(parseNumber("\u22125"), -5); // unicode minus
  assert.equal(parseNumber("\u20131,000"), -1000); // en dash
});

test("empty / junk → null", () => {
  assert.equal(parseNumber(""), null);
  assert.equal(parseNumber(null), null);
  assert.equal(parseNumber(undefined), null);
  assert.equal(parseNumber("-"), null);
  assert.equal(parseNumber("."), null);
  assert.equal(parseNumber("N/A"), null);
});

test("address-like text in a numeric column is not misread as a magnitude", () => {
  // "5B Street" must NOT become 5,000,000,000 — the suffix match is anchored to
  // the whole cell, so trailing words defeat it (it falls through to the lossy
  // strip and yields the leading digit, exactly as before this change).
  assert.notEqual(parseNumber("5B Street"), 5_000_000_000);
});

test("percentages strip to the number", () => {
  assert.equal(parseNumber("97%"), 97);
  assert.equal(parseNumber("0.98"), 0.98);
});

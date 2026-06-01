/**
 * Unit tests for the Story Lead → MarketFact textual resolver (pure core).
 *
 * Run: `npx tsx --test src/lib/story-lead-fact-resolver.test.ts`
 *
 * Covers the confidence banding (exact/close/fuzzy), the two hard scope
 * filters (neighbourhood + metric family never substituted), the wide-band
 * value cutoff, recency-based tie-breaking, and dataThread string parsing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  matchThreadToFacts,
  parseDataThreadStrings,
  detectMetricFamily,
  parseThreadValue,
  type DataThread,
  type ResolverFact,
} from "./story-lead-fact-resolver";

const NOW = new Date("2026-06-01T00:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

const thread = (
  neighbourhood: string,
  metricFamily: string,
  value: number,
): DataThread => ({ neighbourhood, metricFamily, value });

const fact = (
  id: string,
  neighbourhood: string | null,
  metricFamily: string,
  value: number | null,
  date: Date | null,
): ResolverFact => ({ id, neighbourhood, metricFamily, value, date });

test("exact — value within tight tolerance AND recent → all four dimensions", () => {
  const t = thread("Lakeview", "SP_LP", 1.02);
  const facts = [fact("a", "Lakeview", "SP_LP", 1.022, daysAgo(10))];
  const m = matchThreadToFacts(t, facts, { now: NOW });
  assert.ok(m);
  assert.equal(m.factId, "a");
  assert.equal(m.confidence, "exact");
});

test("close — value within tight but stale (not recent) → three dimensions", () => {
  const t = thread("Lakeview", "SP_LP", 1.02);
  const facts = [fact("a", "Lakeview", "SP_LP", 1.022, daysAgo(200))];
  const m = matchThreadToFacts(t, facts, { now: NOW });
  assert.ok(m);
  assert.equal(m.confidence, "close");
});

test("fuzzy — value in the wide band only and stale → two dimensions", () => {
  const t = thread("Lakeview", "SP_LP", 1.02);
  // diff 0.008 is > tight (0.005) but <= wide (0.01).
  const facts = [fact("a", "Lakeview", "SP_LP", 1.028, daysAgo(200))];
  const m = matchThreadToFacts(t, facts, { now: NOW });
  assert.ok(m);
  assert.equal(m.confidence, "fuzzy");
  assert.equal(m.matchedOn.valueWithinTolerance, false);
});

test("no match — neighbourhood differs (never substitutes hood)", () => {
  const t = thread("Lakeview", "SP_LP", 1.02);
  const facts = [fact("a", "Bridgeland", "SP_LP", 1.022, daysAgo(10))];
  assert.equal(matchThreadToFacts(t, facts, { now: NOW }), null);
});

test("no match — metric family differs (never substitutes family)", () => {
  const t = thread("Lakeview", "SP_LP", 1.02);
  const facts = [fact("a", "Lakeview", "MOI", 1.022, daysAgo(10))];
  assert.equal(matchThreadToFacts(t, facts, { now: NOW }), null);
});

test("no match — value beyond the wide band is dropped", () => {
  const t = thread("Lakeview", "SP_LP", 1.02);
  // diff 0.03 is well beyond wide (0.01).
  const facts = [fact("a", "Lakeview", "SP_LP", 1.05, daysAgo(10))];
  assert.equal(matchThreadToFacts(t, facts, { now: NOW }), null);
});

test("multiple candidates — picks the most recent in-tolerance fact", () => {
  const t = thread("Lakeview", "SP_LP", 1.02);
  const facts = [
    fact("old", "Lakeview", "SP_LP", 1.021, daysAgo(60)),
    fact("new", "Lakeview", "SP_LP", 1.022, daysAgo(5)),
  ];
  const m = matchThreadToFacts(t, facts, { now: NOW });
  assert.ok(m);
  assert.equal(m.factId, "new");
});

test("parseDataThreadStrings — bridges a display string to a structured thread", () => {
  const out = parseDataThreadStrings(
    ["Lakeview SP/LP 1.0224"],
    ["Lakeview", "Bridgeland"],
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].neighbourhood, "Lakeview");
  assert.equal(out[0].metricFamily, "SP_LP");
  assert.equal(out[0].value, 1.0224);
});

test("parseDataThreadStrings — longest neighbourhood name wins", () => {
  const out = parseDataThreadStrings(
    ["Upper Mount Royal DOM 21"],
    ["Mount Royal", "Upper Mount Royal"],
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].neighbourhood, "Upper Mount Royal");
  assert.equal(out[0].metricFamily, "DOM");
});

test("parseDataThreadStrings — omits threads with no known neighbourhood", () => {
  const out = parseDataThreadStrings(["Nowheresville SP/LP 1.01"], ["Lakeview"]);
  assert.equal(out.length, 0);
});

test("detectMetricFamily — recognises common metric keywords", () => {
  assert.equal(detectMetricFamily("SP/LP 1.02"), "SP_LP");
  assert.equal(detectMetricFamily("months of inventory"), "MOI");
  assert.equal(detectMetricFamily("days on market"), "DOM");
  assert.equal(detectMetricFamily("totally unknown"), "OTHER");
});

test("parseThreadValue — handles currency, percent, ratio, and commas", () => {
  assert.equal(parseThreadValue("median $1,234,000"), 1234000);
  assert.equal(parseThreadValue("failure rate 12.5%"), 12.5);
  assert.equal(parseThreadValue("SP/LP 1.0224"), 1.0224);
  assert.equal(parseThreadValue("no numbers here"), null);
});

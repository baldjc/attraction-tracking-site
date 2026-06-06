/**
 * Unit tests for Jarvis conversational grounding + cited-source counting.
 *
 * Run: `npx tsx --test src/lib/jarvis/tools.test.ts`
 *
 * Covers the "[unverified] leak" fix: a metric the script grounds and cites in
 * its "## Sources" footnote (e.g. a SoT median sale price or sale-to-list ratio)
 * must survive in the conversational summary/hooks even though it never entered
 * the get_facts ledger — and the literal placeholder "[unverified]" must never
 * reach the member.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { groundAssistantText, extractNumberKeys } from "./tools";
import { countCitedSources } from "../script-content-rules";
import type { LedgerFact } from "./types";

const fact = (value: string): LedgerFact => ({
  id: "f1",
  label: "Months of inventory",
  neighbourhood: "Downtown",
  value,
  monthYear: "2026-05",
  source: "upload",
});

const SOURCES_FOOTNOTE = [
  "## Sources",
  "- $475,000 — Downtown median sale price (SoT)",
  "- 98.0% — Downtown sale-to-list ratio (SoT)",
  "- 4.14 — Downtown months of inventory (fact: f1)",
].join("\n");

test("leak: SoT metric cited by the script survives in prose (not redacted)", () => {
  const prose =
    "Median Sale Price $475,000 and that 98.0% sale-to-list ratio anchor the hook.";
  const out = groundAssistantText(prose, [fact("4.14 MOI")], SOURCES_FOOTNOTE);
  assert.ok(out.includes("$475,000"), "median should remain");
  assert.ok(out.includes("98.0%"), "sale-to-list should remain");
  assert.equal(out.includes("[unverified]"), false);
});

test("leak: with no proposal sources the same metrics would be redacted", () => {
  const prose = "Median Sale Price $475,000 and that 98.0% sale-to-list ratio.";
  const out = groundAssistantText(prose, [fact("4.14 MOI")]);
  // Proves the cause: absent the cited sources, the numbers are stripped...
  assert.equal(out.includes("$475,000"), false);
  assert.equal(out.includes("98.0%"), false);
  // ...but NEVER as a visible placeholder.
  assert.equal(out.includes("[unverified]"), false);
});

test("the literal token [unverified] never renders, even for fabrications", () => {
  const prose = "Prices jumped 23% and homes sold for $1,250,000 over asking.";
  const out = groundAssistantText(prose, [fact("4.14 MOI")], SOURCES_FOOTNOTE);
  assert.equal(out.includes("[unverified]"), false);
  // Fabricated numbers are omitted, not surfaced.
  assert.equal(out.includes("23%"), false);
  assert.equal(out.includes("$1,250,000"), false);
});

test("omission tidies leftover spacing/punctuation", () => {
  const out = groundAssistantText(
    "The median was $999,999 .",
    [fact("4.14 MOI")],
    SOURCES_FOOTNOTE,
  );
  assert.equal(out.includes("[unverified]"), false);
  assert.equal(out.includes("  "), false, "no double spaces");
  assert.ok(out.endsWith("median was."), `unexpected: ${JSON.stringify(out)}`);
});

test("omission preserves Markdown hard breaks (trailing double space)", () => {
  // JarvisChat renders prose via react-markdown; a trailing "  \n" is a hard
  // break. The tidy step must collapse only INTERNAL runs, never end-of-line.
  const prose = "Inventory sits at 4.14 months.  \nPrices jumped 23% though.";
  const out = groundAssistantText(prose, [fact("4.14 MOI")], SOURCES_FOOTNOTE);
  assert.equal(out.includes("[unverified]"), false);
  assert.ok(out.includes("4.14"), "grounded fact survives");
  assert.equal(out.includes("23%"), false, "fabrication omitted");
  assert.ok(out.includes("months.  \n"), `hard break lost: ${JSON.stringify(out)}`);
});

test("ledger facts still ground without any proposal sources", () => {
  const out = groundAssistantText(
    "Inventory sits at 4.14 months.",
    [fact("4.14 MOI")],
  );
  assert.ok(out.includes("4.14"));
  assert.equal(out.includes("[unverified]"), false);
});

test("extractNumberKeys normalises currency/percent/decimal tokens", () => {
  assert.deepEqual(extractNumberKeys("$615,000 and 98.2% and 4.14 MOI"), [
    "615000",
    "98.2",
    "4.14",
  ]);
});

test("countCitedSources counts distinct ## Sources bullets, not linkedFactIds", () => {
  const bullets = Array.from(
    { length: 21 },
    (_, i) => `- value ${i} — Area ${i} (fact: f${i})`,
  );
  const script = ["Body line.", "", "## Sources", ...bullets].join("\n");
  assert.equal(countCitedSources(script), 21);
});

test("countCitedSources dedupes verbatim-repeated bullets", () => {
  const script = [
    "## Sources",
    "- $475,000 — Downtown median (SoT)",
    "- $475,000 — Downtown median (SoT)",
    "- 98.0% — Downtown sale-to-list (SoT)",
  ].join("\n");
  assert.equal(countCitedSources(script), 2);
});

test("countCitedSources returns 0 when there is no footnote", () => {
  assert.equal(countCitedSources("Just a body with no sources heading."), 0);
});

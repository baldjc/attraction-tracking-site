/**
 * Unit tests for the deterministic neighbourhood normalizer (Stage 1 of the
 * Knowledge-Base Merge & Clean feature).
 *
 * Run: `npx tsx --test src/lib/kb-merge/normalize.test.ts`
 *
 * The headline case: ~40 "Woodbridge Ph 5B" / "Woodbridge 1" fragments collapse
 * to a single canonical key, while genuinely different places stay separate.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAreaName,
  isNonAreaKey,
  titleCaseArea,
  pickCanonicalDisplay,
  groupByNormKey,
} from "./normalize";

test("phase/section/number fragments collapse to one key", () => {
  const variants = [
    "Woodbridge",
    "Woodbridge Ph 1",
    "Woodbridge Ph 5B",
    "Woodbridge Phase 02A",
    "Woodbridge Sec 3",
    "Woodbridge Section 12",
    "Woodbridge #8",
    "Woodbridge # 12c",
    "Woodbridge No 3",
    "Woodbridge 1",
    "Woodbridge 61s",
    "Woodbridge Unit 4",
    "Woodbridge Blk 2",
  ];
  const keys = new Set(variants.map(normalizeAreaName));
  assert.equal(keys.size, 1, `expected 1 key, got ${[...keys].join(", ")}`);
  assert.equal([...keys][0], "woodbridge");
});

test("groupByNormKey folds many raws into a single canonical group", () => {
  const raws = Array.from({ length: 40 }, (_, i) => `Woodbridge Ph ${i + 1}`);
  raws.push("Woodbridge");
  const groups = groupByNormKey(raws);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].display, "Woodbridge");
  assert.equal(groups[0].variants.length, 41);
});

test("distinct neighbourhoods are NOT merged by a shared word", () => {
  const groups = groupByNormKey([
    "Windsong Ranch",
    "Craig Ranch",
    "Stonebridge Ranch",
  ]);
  assert.equal(groups.length, 3);
});

test("descriptive prefixes stay separate (deferred to fuzzy)", () => {
  // "Chateaus Of Woodbridge" is a different subdivision than "Woodbridge" —
  // deterministic normalization must not collapse it.
  assert.notEqual(
    normalizeAreaName("Chateaus Of Woodbridge"),
    normalizeAreaName("Woodbridge"),
  );
});

test("isNonAreaKey filters blanks and rollup buckets", () => {
  assert.equal(isNonAreaKey(normalizeAreaName("")), true);
  assert.equal(isNonAreaKey(normalizeAreaName("Unknown")), true);
  assert.equal(isNonAreaKey(normalizeAreaName("All Neighbourhoods")), true);
  assert.equal(isNonAreaKey(normalizeAreaName("Woodbridge")), false);
});

test("titleCaseArea keeps small joining words lowercase (except first)", () => {
  assert.equal(titleCaseArea("estates of north creek"), "Estates of North Creek");
  assert.equal(titleCaseArea("the colony"), "The Colony");
});

test("pickCanonicalDisplay prefers a bare real variant's casing", () => {
  const display = pickCanonicalDisplay("mckinney", [
    "McKinney Ph 2",
    "McKinney",
    "McKinney 14",
  ]);
  assert.equal(display, "McKinney");
});

test("pickCanonicalDisplay falls back to title-case when no bare variant", () => {
  const display = pickCanonicalDisplay("windsong ranch", [
    "Windsong Ranch Ph 1",
    "Windsong Ranch 5",
  ]);
  assert.equal(display, "Windsong Ranch");
});

test("trailing lot number stripped but interior numbers kept", () => {
  // A 4+ digit token is not a phase/lot suffix pattern -> kept.
  assert.equal(normalizeAreaName("Highway 380 Estates"), "highway 380 estates");
  // 1-3 digit trailing token -> stripped.
  assert.equal(normalizeAreaName("Camelot 12"), "camelot");
});

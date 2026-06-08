/**
 * Unit tests for `pickSpread` — the dashboard briefing's "feature N leads
 * across distinct rotation slots" selector.
 *
 * Run: `npx tsx --test src/app/api/member/dashboard/briefing/pick-spread.guard.test.ts`
 *
 * Regression cover for the slot-starvation bug: an earlier version admitted
 * every slotless (null-slot) lead in the first pass without tracking them, so a
 * member whose leads were mostly slotless could fill all 3 featured spots with
 * null-slot leads and starve the distinct slotted leads later in the ordered
 * list. The fix admits at most ONE slotless lead before the fill pass.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { pickSpread, type LeadRow } from "./route";

function lead(id: string, slot: string | null, isThesis = false): LeadRow {
  return {
    id,
    pattern: `pattern ${id}`,
    dataThreads: [`thread ${id}`],
    whyItMatters: `why ${id}`,
    suggestedRotationSlot: slot,
    label: null,
    isThesisLead: isThesis,
    anchorFactId: null,
  };
}

test("prefers distinct non-null slots over repeated slotless leads", () => {
  // Slotless leads come FIRST in the ordered list — the buggy version would
  // have taken l1,l2,l3 (all slotless) and starved the distinct slots below.
  const leads = [
    lead("l1", null),
    lead("l2", null),
    lead("l3", null),
    lead("l4", "market_update"),
    lead("l5", "contrarian_take"),
  ];
  const picked = pickSpread(leads, 3);
  const slots = picked.map((l) => l.suggestedRotationSlot);
  // At most one slotless lead, the rest distinct non-null slots.
  assert.equal(picked.length, 3);
  assert.equal(slots.filter((s) => s === null).length, 1);
  assert.deepEqual(
    new Set(slots.filter((s): s is string => s !== null)),
    new Set(["market_update", "contrarian_take"]),
  );
});

test("dedupes repeated non-null slots, fills from remainder", () => {
  const leads = [
    lead("l1", "contrarian_take"),
    lead("l2", "contrarian_take"),
    lead("l3", "contrarian_take"),
    lead("l4", "market_update"),
  ];
  const picked = pickSpread(leads, 3);
  assert.equal(picked.length, 3);
  // First pass takes one contrarian_take + one market_update (2 distinct);
  // fill pass tops up with a remaining contrarian_take to reach 3.
  assert.equal(picked[0].id, "l1");
  assert.equal(picked[1].id, "l4");
  assert.equal(picked.filter((l) => l.suggestedRotationSlot === "contrarian_take").length, 2);
});

test("thesis-first ordering is preserved (input is pre-ordered)", () => {
  const leads = [
    lead("thesis", "market_update", true),
    lead("l2", "contrarian_take"),
    lead("l3", "do_not"),
  ];
  const picked = pickSpread(leads, 3);
  assert.equal(picked[0].id, "thesis");
  assert.equal(picked.length, 3);
});

test("returns fewer than count when the pool is small", () => {
  const picked = pickSpread([lead("only", null)], 3);
  assert.equal(picked.length, 1);
  assert.equal(picked[0].id, "only");
});

test("returns all leads spread when exactly count distinct slots exist", () => {
  const leads = [
    lead("l1", "neighbourhood_fact"),
    lead("l2", "contrarian_take"),
    lead("l3", "do_not"),
  ];
  const picked = pickSpread(leads, 3);
  assert.deepEqual(
    picked.map((l) => l.suggestedRotationSlot),
    ["neighbourhood_fact", "contrarian_take", "do_not"],
  );
});

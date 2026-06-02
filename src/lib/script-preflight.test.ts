import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateScriptPreflight,
  isNeighbourhoodScoped,
  MODE_FACT_REQUIREMENTS,
} from "./script-preflight";
import { ROTATION_SLOTS } from "./content-engine-validation";

test("isNeighbourhoodScoped: city-wide tokens are not scoped", () => {
  assert.equal(isNeighbourhoodScoped("All Neighbourhoods"), false);
  assert.equal(isNeighbourhoodScoped("all"), false);
  assert.equal(isNeighbourhoodScoped("Citywide"), false);
  assert.equal(isNeighbourhoodScoped(""), false);
});

test("isNeighbourhoodScoped: a real neighbourhood is scoped", () => {
  assert.equal(isNeighbourhoodScoped("Altadore"), true);
});

test("every rotation slot has a fact requirement", () => {
  for (const slot of ROTATION_SLOTS) {
    assert.ok(MODE_FACT_REQUIREMENTS[slot], `${slot} requirement`);
    // Non-regression: the absolute floor must never exceed 1, so the 1–2-fact
    // Low Support population is never blocked by the pre-flight.
    assert.equal(MODE_FACT_REQUIREMENTS[slot].minFacts, 1, `${slot} minFacts`);
  }
});

test("market_update passes with a single city-wide fact", () => {
  const r = evaluateScriptPreflight({
    rotationSlot: "market_update",
    facts: [{ neighbourhood: "All Neighbourhoods" }],
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.uncovered, []);
});

test("market_update fails with zero facts", () => {
  const r = evaluateScriptPreflight({
    rotationSlot: "market_update",
    facts: [],
  });
  assert.equal(r.ok, false);
  assert.ok(r.message);
});

test("neighbourhood_fact passes when a neighbourhood-scoped fact exists", () => {
  const r = evaluateScriptPreflight({
    rotationSlot: "neighbourhood_fact",
    facts: [
      { neighbourhood: "All Neighbourhoods" },
      { neighbourhood: "Altadore" },
    ],
  });
  assert.equal(r.ok, true);
});

test("neighbourhood_fact fails when all facts are city-wide", () => {
  const r = evaluateScriptPreflight({
    rotationSlot: "neighbourhood_fact",
    facts: [
      { neighbourhood: "All Neighbourhoods" },
      { neighbourhood: "All" },
    ],
  });
  assert.equal(r.ok, false);
  assert.ok(r.message?.includes("Neighbourhood Fact"));
  assert.ok(r.uncovered.some((u) => u.includes("neighbourhood-level")));
});

test("a 1-fact neighbourhood plan with a scoped fact is NOT blocked (no Low Support regression)", () => {
  const r = evaluateScriptPreflight({
    rotationSlot: "neighbourhood_fact",
    facts: [{ neighbourhood: "Altadore" }],
  });
  assert.equal(r.ok, true);
});

test("contrarian_take passes with a single city-wide fact (no scope requirement)", () => {
  const r = evaluateScriptPreflight({
    rotationSlot: "contrarian_take",
    facts: [{ neighbourhood: "All Neighbourhoods" }],
  });
  assert.equal(r.ok, true);
});

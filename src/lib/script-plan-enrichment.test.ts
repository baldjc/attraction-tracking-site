/**
 * Scope-invariant tests for Layer-1 enrichment.
 *
 * Run: `npx tsx --test src/lib/script-plan-enrichment.test.ts`
 *
 * The load-bearing guarantee: enrichment may DEEPEN coverage inside the scope
 * the linked facts already establish, but it must NEVER widen scope — no
 * new neighbourhood, and no off-lock property type (unless the lead explicitly
 * spans multiple types).
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  selectEnrichmentFacts,
  evaluateFactGate,
  type EnrichInputFact,
} from "./script-plan-enrichment";

const f = (
  id: string,
  neighbourhood: string | null,
  metricFamily: string,
  propertyType: string | null = null,
): EnrichInputFact => ({ id, neighbourhood, propertyType, metricFamily });

test("never adds a fact from a neighbourhood outside the linked scope", () => {
  const linked = [f("a", "Bridgeland", "MOI", "Detached")];
  const candidates = [
    f("b", "Bridgeland", "SP_LP", "Detached"), // in scope
    f("c", "Mount Pleasant", "MOI", "Detached"), // OUT of scope hood
    f("d", "Inglewood", "DOM", "Detached"), // OUT of scope hood
  ];
  const { added, scopeHoods } = selectEnrichmentFacts(linked, candidates, {
    lockedPropertyType: "Detached",
    leadSpansMultipleTypes: false,
  });
  assert.deepEqual(scopeHoods, ["bridgeland"]);
  for (const a of added) {
    assert.equal((a.neighbourhood ?? "").toLowerCase(), "bridgeland");
  }
  assert.ok(!added.some((a) => a.id === "c" || a.id === "d"));
});

test("strict lock: rejects off-lock type AND null/All aggregates on a named hood", () => {
  const linked = [f("a", "Bridgeland", "MOI", "Detached")];
  const candidates = [
    f("b", "Bridgeland", "SP_LP", "Apartment"), // wrong type — rejected
    f("nullpt", "Bridgeland", "DOM", null), // hood aggregate — broader than lock, rejected
    f("allpt", "Bridgeland", "FAILURE_RATE", "All"), // explicit All — rejected
    f("c", "Bridgeland", "PRICE", "Detached"), // correct type — accepted
  ];
  const { added } = selectEnrichmentFacts(linked, candidates, {
    lockedPropertyType: "Detached",
    leadSpansMultipleTypes: false,
  });
  assert.ok(!added.some((a) => a.id === "b"));
  assert.ok(!added.some((a) => a.id === "nullpt"));
  assert.ok(!added.some((a) => a.id === "allpt"));
  for (const a of added) {
    assert.equal(a.propertyType, "Detached");
  }
});

test("allows any property type when the lead spans multiple types", () => {
  const linked = [f("a", "Bridgeland", "MOI", "Detached")];
  const candidates = [
    f("b", "Bridgeland", "SP_LP", "Apartment"),
    f("c", "Bridgeland", "DOM", "Row/Townhouse"),
  ];
  const { added } = selectEnrichmentFacts(linked, candidates, {
    lockedPropertyType: null,
    leadSpansMultipleTypes: true,
    target: 3,
  });
  // Both are in-scope hood-wise; with span-multi they're eligible.
  assert.equal(added.length, 2);
});

test("prefers breadth (unrepresented metric families) before depth", () => {
  const linked = [f("a", "Bridgeland", "MOI", "Detached")];
  const candidates = [
    f("dup", "Bridgeland", "MOI", "Detached"), // depth (family already present)
    f("new", "Bridgeland", "SP_LP", "Detached"), // breadth (new family)
  ];
  const { added } = selectEnrichmentFacts(linked, candidates, {
    lockedPropertyType: "Detached",
    leadSpansMultipleTypes: false,
    target: 2,
    maxAdds: 1,
  });
  assert.equal(added.length, 1);
  assert.equal(added[0].id, "new");
});

test("no-op when the plan already meets the target", () => {
  const linked = [
    f("a", "Bridgeland", "MOI", "Detached"),
    f("b", "Bridgeland", "SP_LP", "Detached"),
    f("c", "Bridgeland", "DOM", "Detached"),
  ];
  const candidates = [f("d", "Bridgeland", "FAILURE_RATE", "Detached")];
  const { added } = selectEnrichmentFacts(linked, candidates, {
    lockedPropertyType: "Detached",
    leadSpansMultipleTypes: false,
    target: 3,
  });
  assert.equal(added.length, 0);
});

test("never adds more than needed to reach the target", () => {
  const linked = [f("a", "Bridgeland", "MOI", "Detached")];
  const candidates = [
    f("b", "Bridgeland", "SP_LP", "Detached"),
    f("c", "Bridgeland", "DOM", "Detached"),
    f("d", "Bridgeland", "FAILURE_RATE", "Detached"),
    f("e", "Bridgeland", "PRICE", "Detached"),
  ];
  const { added } = selectEnrichmentFacts(linked, candidates, {
    lockedPropertyType: "Detached",
    leadSpansMultipleTypes: false,
    target: 3,
  });
  // need = 3 - 1 = 2
  assert.equal(added.length, 2);
});

test("never re-adds an already-linked fact", () => {
  const linked = [f("a", "Bridgeland", "MOI", "Detached")];
  const candidates = [
    f("a", "Bridgeland", "MOI", "Detached"), // same id as linked
    f("b", "Bridgeland", "SP_LP", "Detached"),
  ];
  const { added } = selectEnrichmentFacts(linked, candidates, {
    lockedPropertyType: "Detached",
    leadSpansMultipleTypes: false,
    target: 3,
  });
  assert.ok(!added.some((x) => x.id === "a"));
});

test("city-wide rollup scope: matches rollup hoods, not named hoods", () => {
  const linked = [f("a", "All", "MOI", null)];
  const candidates = [
    f("b", "All", "SP_LP", null), // in rollup scope
    f("c", "Bridgeland", "DOM", "Detached"), // named hood — out of scope
  ];
  const { added } = selectEnrichmentFacts(linked, candidates, {
    lockedPropertyType: null,
    leadSpansMultipleTypes: false,
    target: 3,
  });
  assert.ok(added.some((x) => x.id === "b"));
  assert.ok(!added.some((x) => x.id === "c"));
});

test("evaluateFactGate: 0 blocks, 1-2 low, >=3 ok", () => {
  assert.equal(evaluateFactGate(0), "block");
  assert.equal(evaluateFactGate(1), "low");
  assert.equal(evaluateFactGate(2), "low");
  assert.equal(evaluateFactGate(3), "ok");
  assert.equal(evaluateFactGate(9), "ok");
});

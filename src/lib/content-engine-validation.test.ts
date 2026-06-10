import { test } from "node:test";
import assert from "node:assert/strict";
import { validateIdeaCard, type RotationSlotKey } from "./content-engine-validation";

const SAFE_IDS = new Set(["f1", "f2", "f3", "f4"]);
const HOODS = ["Bridgeland", "Beltline"];

/**
 * A card that passes every OTHER validation rule, so each test can flip a
 * single field and isolate the behaviour under test. Title uses an MOI +
 * year-month anchor and names no neighbourhood, so it clears the
 * named-anchor and single-hood-scope rules.
 */
function baseCard(overrides: Record<string, unknown> = {}) {
  return {
    title: "Calgary Crossed 4.0 MOI in March 2026",
    rotationSlot: "market_update",
    titlePromise: "Why the inventory shift matters right now.",
    thumbnailCallouts: ["Shift"],
    clarityPremise: "Inventory crossed a key threshold this month.",
    citedFactIds: ["f1", "f2", "f3"],
    visualPeak: "Drone sweep over the downtown skyline.",
    subPersonas: ["primary"],
    framework: "Market Update + Data Anchor",
    tactileType: "data-drop",
    ...overrides,
  };
}

function validate(card: unknown, pin: RotationSlotKey | null = null) {
  return validateIdeaCard(card, SAFE_IDS, HOODS, null, null, pin);
}

test("base card is valid with no pin (sanity)", () => {
  const r = validate(baseCard());
  assert.equal(r.ok, true, `expected clean card, got: ${r.errors.join("; ")}`);
});

test("theme pin — off-theme card is rejected", () => {
  const r = validate(baseCard({ rotationSlot: "contrarian_take" }), "market_update");
  assert.equal(r.ok, false);
  assert.ok(
    r.errors.some((e) => e.includes('must equal the pinned theme "market_update"')),
    `expected pinned-theme rejection, got: ${r.errors.join("; ")}`,
  );
});

test("theme pin — on-theme card passes", () => {
  const r = validate(baseCard({ rotationSlot: "market_update" }), "market_update");
  assert.equal(r.ok, true, `expected on-theme card to pass, got: ${r.errors.join("; ")}`);
});

test("theme pin — enforced for every slot value", () => {
  for (const pin of ["contrarian_take", "do_not", "should_you", "neighbourhood_fact"] as const) {
    const off = validate(baseCard({ rotationSlot: "market_update" }), pin);
    assert.equal(off.ok, false, `${pin}: off-theme card should fail`);
    const on = validate(baseCard({ rotationSlot: pin }), pin);
    assert.equal(on.ok, true, `${pin}: on-theme card should pass — ${on.errors.join("; ")}`);
  }
});

test("no pin — mixed themes are preserved (regression)", () => {
  for (const slot of ["market_update", "contrarian_take", "do_not", "should_you"] as const) {
    const r = validate(baseCard({ rotationSlot: slot }));
    assert.equal(r.ok, true, `slot ${slot} should be accepted when unpinned — ${r.errors.join("; ")}`);
  }
});

test("pin check does not mask a missing rotationSlot", () => {
  const { rotationSlot, ...noSlot } = baseCard();
  void rotationSlot;
  const r = validate(noSlot, "market_update");
  assert.equal(r.ok, false);
  assert.ok(
    r.errors.some((e) => e.includes('missing required field "rotationSlot"')),
    `expected missing-field error, got: ${r.errors.join("; ")}`,
  );
});

test("uncited card is rejected so it can never ship", () => {
  const r = validate(baseCard({ citedFactIds: [] }));
  assert.equal(r.ok, false);
  assert.ok(
    r.errors.some((e) => e.includes("needs ≥3 citedFactIds")),
    `expected cited-facts rejection, got: ${r.errors.join("; ")}`,
  );
});

test("failure-rate framing — bounded ≤100% '%-failed-to-sell' prose now passes", () => {
  // Under the bounded failure rate, "47% of homes failed to sell" is honest.
  const r = validate(
    baseCard({ clarityPremise: "Last month 47% of homes failed to sell." }),
  );
  assert.equal(r.ok, true, `bounded framing should pass — ${r.errors.join("; ")}`);
});

test("failure-rate framing — legacy >100% figure is rejected (safety net)", () => {
  const r = validate(
    baseCard({ clarityPremise: "Last month 131% of homes failed to sell." }),
  );
  assert.equal(r.ok, false);
  assert.ok(
    r.errors.some((e) => e.includes("above 100%")),
    `expected >100% failure-rate framing error, got: ${r.errors.join("; ")}`,
  );
});

test("failure-rate framing — reversed order >100% (verb then percent) is rejected", () => {
  const r = validate(
    baseCard({ visualPeak: "Homes that failed to sell were 115 percent of solds." }),
  );
  assert.equal(r.ok, false);
  assert.ok(
    r.errors.some((e) => e.includes("above 100%")),
    `expected >100% failure-rate framing error, got: ${r.errors.join("; ")}`,
  );
});

test("failure-rate framing — named-metric >100% ('failure rate was 178%') is rejected", () => {
  const r = validate(
    baseCard({ clarityPremise: "Last month the failure rate was 178%." }),
  );
  assert.equal(r.ok, false);
  assert.ok(
    r.errors.some((e) => e.includes("above 100%")),
    `expected >100% named-metric error, got: ${r.errors.join("; ")}`,
  );
});

test("failure-rate framing — named-metric ≤100% ('failure rate of 47%') passes", () => {
  const r = validate(
    baseCard({ clarityPremise: "Last month the failure rate of 47% held steady." }),
  );
  assert.equal(r.ok, true, `bounded named-metric should pass — ${r.errors.join("; ")}`);
});

test("failure-rate framing — 'failure-to-sell rate' noun variant >100% is rejected", () => {
  const r = validate(
    baseCard({ clarityPremise: "The failure-to-sell rate hit 178% last month." }),
  );
  assert.equal(r.ok, false);
  assert.ok(
    r.errors.some((e) => e.includes("above 100%")),
    `expected >100% failure-to-sell rate error, got: ${r.errors.join("; ")}`,
  );
});

test("failure-rate framing — honest sale_share / count framing passes", () => {
  const ok1 = validate(
    baseCard({ clarityPremise: "Only 53% of listings actually sold last month." }),
  );
  assert.equal(ok1.ok, true, `sale_share framing should pass — ${ok1.errors.join("; ")}`);
  const ok2 = validate(
    baseCard({ clarityPremise: "For every 10 homes that sold, 9 failed to sell." }),
  );
  assert.equal(ok2.ok, true, `count framing should pass — ${ok2.errors.join("; ")}`);
});

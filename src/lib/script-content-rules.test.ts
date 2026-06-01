/**
 * Unit tests for the `no_other_member_identity` validator rule.
 *
 * Run: `npx tsx --test src/lib/script-content-rules.test.ts`
 *
 * The rule must catch genuine cross-member identity leaks (the legacy
 * "Jared Chamberlain" presenter) WITHOUT false-positiving on common English
 * words that happen to be surnames ("close", "brown", "smith", ...).
 *
 * `validateScript` runs every rule, so each test filters down to just the
 * `no_other_member_identity` violations — other rules firing on these short
 * fixtures is irrelevant to identity-leak coverage.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { validateScript } from "./script-content-rules";

function identityHits(
  script: string,
  forbiddenIdentities: string[],
  currentMemberName?: string,
): number {
  const { violations } = validateScript(script, {
    forbiddenIdentities,
    currentMemberName,
  });
  return violations.filter((v) => v.rule === "no_other_member_identity").length;
}

test("true positive — full name 'I'm Jared Chamberlain' trips for another member", () => {
  const n = identityHits(
    "Hey everyone, I'm Jared Chamberlain and welcome back to the channel.",
    ["Jared Chamberlain"],
    "Alice Anderson",
  );
  assert.ok(n >= 1, "full other-member name must trip");
});

test("true positive — split context 'with Jared at Chamberlain Real Estate' trips", () => {
  // The full phrase isn't contiguous, so the single-token + context path must
  // catch it (intro cue before 'Jared', brand continuation after 'Chamberlain').
  const n = identityHits(
    "Book a tour with Jared at Chamberlain Real Estate this weekend.",
    ["Jared Chamberlain"],
    "Alice Anderson",
  );
  assert.ok(n >= 1, "split first-name/brand context must trip");
});

test("false positive — common surname words used normally do NOT trip", () => {
  const script =
    "This bungalow is close to the LRT, sits on a brown brick street, " +
    "and backs onto Smith Park where the deal will close fast.";
  const n = identityHits(
    script,
    ["Bob Close", "Sara Brown", "Tom Smith"],
    "Alice Anderson",
  );
  assert.equal(n, 0, "common English words must never trip the identity rule");
});

test("edge — capitalized brand 'Chamberlain Group' still trips (surname + brand)", () => {
  const n = identityHits(
    "Stop by the Chamberlain Group office for a free valuation.",
    ["Jared Chamberlain"],
    "Alice Anderson",
  );
  assert.ok(n >= 1, "capitalized surname + brand continuation is a real hit");
});

test("edge — current member's OWN identity is never flagged", () => {
  // Even when the same name appears in the forbidden list, the current
  // presenter using their own name must not trip.
  const n = identityHits(
    "Hey, I'm Jared Chamberlain, back with this month's market update.",
    ["Jared Chamberlain"],
    "Jared Chamberlain",
  );
  assert.equal(n, 0, "the current presenter's own name is allowed");
});

test("false positive — lowercase common word never matches a surname", () => {
  const n = identityHits(
    "We expect the deal to close before the brown leaves fall.",
    ["Mary Close", "Pat Brown"],
    "Alice Anderson",
  );
  assert.equal(n, 0, "lowercase words can't match a capitalized proper noun");
});

test("edge — mixed-case surname 'McDonald Group' still trips (internal caps preserved)", () => {
  const n = identityHits(
    "Reach the McDonald Group team for off-market listings.",
    ["Ian McDonald"],
    "Alice Anderson",
  );
  assert.ok(n >= 1, "internal-capitalization surnames must still match");
});

test("inert — no forbidden identities means the rule never fires", () => {
  const n = identityHits("I'm Jared Chamberlain and this is the channel.", []);
  assert.equal(n, 0, "rule is inert with an empty forbidden list");
});

function failureFramingHits(script: string): number {
  const { violations } = validateScript(script);
  return violations.filter((v) => v.rule === "failure_rate_framing").length;
}

test("failure_rate_framing — '47% failed to sell' in dialogue trips", () => {
  const n = failureFramingHits(
    "This is the part nobody talks about. Last month, 47% of homes failed to sell in this pocket.",
  );
  assert.ok(n >= 1, "a %-failed-to-sell claim must trip the rule");
});

test("failure_rate_framing — reversed 'failed to sell ... 90 percent' trips", () => {
  const n = failureFramingHits(
    "Here's the reality: homes that failed to sell were 90 percent of what sold.",
  );
  assert.ok(n >= 1, "verb-then-percent ordering must also trip");
});

test("failure_rate_framing — honest sale_share / count framing passes", () => {
  const a = failureFramingHits(
    "Here's the truth: only 53% of listings actually sold last month.",
  );
  assert.equal(a, 0, "sale_share framing must not trip");
  const b = failureFramingHits(
    "Think about it this way. For every 10 homes that sold, 9 failed to sell.",
  );
  assert.equal(b, 0, "count framing must not trip");
});

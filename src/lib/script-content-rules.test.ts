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
import { validateScript, stripToDialogue } from "./script-content-rules";

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

/* ── unanchored_stat — every spoken market number must trace to a fact ── */

function unanchoredHits(
  script: string,
  opts: Parameters<typeof validateScript>[1],
): number {
  const { violations } = validateScript(script, opts);
  return violations.filter((v) => v.rule === "unanchored_stat").length;
}

test("unanchored_stat — a market number with no matching fact is rejected", () => {
  // The only anchor is $615,000. The script cites $812,000, which maps to no
  // fact id → it must be flagged as an untraceable (fabrication-suspect) stat.
  const n = unanchoredHits(
    "The median sale price this month came in at $812,000 across the board.",
    { citedFacts: [{ raw: "$615,000" }] },
  );
  assert.ok(n >= 1, "an untraceable market number must be rejected");
});

test("unanchored_stat — a number that traces to a provided fact passes", () => {
  const n = unanchoredHits(
    "The median sale price this month came in at $615,000 across the board.",
    { citedFacts: [{ raw: "$615,000" }] },
  );
  assert.equal(n, 0, "a number that traces to a fact must not be flagged");
});

/* ── no "...for a second" filler tail (approved "Think about that." stays) ── */

function forASecondHits(script: string): number {
  const { violations } = validateScript(script);
  return violations.filter(
    (v) => v.rule === "no_avatar_pander" && /for a second/i.test(v.snippet ?? ""),
  ).length;
}

test("banned phrase — the '...for a second' filler tail is caught", () => {
  const n = forASecondHits("So here's the real story. Think about that for a second.");
  assert.ok(n >= 1, "the 'for a second' tail must be flagged");
});

test("approved signature — bare 'Think about that.' is never flagged", () => {
  const { violations } = validateScript(
    "So here's the real story. Think about that. It changes how you buy.",
  );
  const flagged = violations.some((v) => v.rule === "no_avatar_pander");
  assert.equal(flagged, false, "the standalone signature must survive");
});

test("false positive guard — literal 'for a second home' is NOT flagged", () => {
  const n = forASecondHits(
    "Plenty of buyers here are shopping for a second home in the river valley.",
  );
  assert.equal(n, 0, "the literal 'a second <noun>' sense must survive");
});

/* ── Sources-footnote dialogue scoping (must not over-exclude) ───────────── */

test("strip scope — exact '## Sources' footnote is excluded from dialogue", () => {
  const { dialogue } = stripToDialogue(
    [
      "We help families move every 53 hours.",
      "",
      "## Sources",
      "- 3.6 months. Citywide MOI (fact: abc123)",
    ].join("\n"),
  );
  assert.ok(
    dialogue.includes("53 hours"),
    "spoken dialogue before the footnote is kept",
  );
  assert.ok(
    !dialogue.includes("abc123"),
    "the footnote's fact ids must be excluded from dialogue scanning",
  );
});

test("strip scope — '## Sources of demand' does NOT terminate dialogue", () => {
  const { dialogue } = stripToDialogue(
    [
      "Inventory is tightening downtown.",
      "",
      "## Sources of demand",
      "Buyers are competing for every listing right now.",
    ].join("\n"),
  );
  assert.ok(
    dialogue.includes("competing for every listing"),
    "dialogue after a non-footnote 'Sources' heading must still be scanned",
  );
});

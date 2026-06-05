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
import {
  validateScript,
  stripToDialogue,
  autoSoftenUnanchoredStats,
} from "./script-content-rules";

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

/* ────────────────────────────────────────────────────────────────────── */
/*  placeholder_number (Fix 4)                                             */
/* ────────────────────────────────────────────────────────────────────── */

function placeholderHits(script: string): number {
  const { violations } = validateScript(script);
  return violations.filter((v) => v.rule === "placeholder_number").length;
}

test("placeholder_number — 'the 0K range' is rejected", () => {
  assert.ok(
    placeholderHits("Right now most listings are stuck in the 0K range downtown.") >= 1,
    "zero-filled placeholder must trip",
  );
});

test("placeholder_number — '$500,000-to-the 600K' jammed range is rejected", () => {
  assert.ok(
    placeholderHits("Prices moved from $500,000-to-the 600K range this spring.") >= 1,
    "jammed 'to-the' range token must trip",
  );
});

test("placeholder_number — filler 'a meaningful amount' is rejected", () => {
  assert.ok(
    placeholderHits("Sellers are dropping prices by a meaningful amount this quarter.") >= 1,
    "filler quantity must trip",
  );
});

test("placeholder_number — dangling 'average sitting.' is rejected", () => {
  assert.ok(
    placeholderHits("Days on market keep climbing, with the average sitting.") >= 1,
    "dangling value verb at sentence end must trip",
  );
});

test("placeholder_number — real value 'sitting close to 49.4%' does NOT trip", () => {
  assert.equal(
    placeholderHits("The failure rate is sitting close to 49.4% across these neighbourhoods."),
    0,
    "a value following the verb must not false-positive",
  );
});

test("placeholder_number — legit '$100K' and 'a significant amount of inventory' do NOT trip", () => {
  assert.equal(
    placeholderHits(
      "Homes around $100K are gone, and there is a significant amount of inventory above $600,000.",
    ),
    0,
    "real values and 'amount OF <noun>' must not false-positive",
  );
});

/* ────────────────────────────────────────────────────────────────────── */
/*  recap_close (Fix 3)                                                    */
/* ────────────────────────────────────────────────────────────────────── */

function recapCloseHits(script: string): number {
  const { violations } = validateScript(script);
  return violations.filter((v) => v.rule === "recap_close").length;
}

test("recap_close — 'to recap' near the end is flagged", () => {
  const script =
    "Inventory is climbing in the northeast and buyers finally have room to negotiate. ".repeat(2) +
    "So to recap, anything above four months of inventory tilts leverage to you. Use it.";
  assert.ok(recapCloseHits(script) >= 1, "recap opener in the close must trip");
});

test("recap_close — closing push-CTA 'book a call' is flagged", () => {
  const script =
    "The northeast is loosening fast and the data is clear for patient buyers. ".repeat(2) +
    "If you are ready to move on this, book a call and let's get started.";
  assert.ok(recapCloseHits(script) >= 1, "closing push-CTA must trip");
});

test("recap_close — a forward/binge hook close does NOT trip", () => {
  const script =
    "The northeast is loosening fast and patient buyers now have the edge. ".repeat(2) +
    "Now, most buyers think the next move is to wait for rates to drop, but the ones who " +
    "regret it got the timing backwards — that's exactly what I break down in this next video.";
  assert.equal(recapCloseHits(script), 0, "a clean forward hook must not false-positive");
});

test("recap_close — mid-body 'the takeaway is' (not in the close) does NOT trip", () => {
  const script =
    "The takeaway is that inventory leads price by a few months. " +
    "Let me show you exactly how that plays out across five neighbourhoods. ".repeat(20) +
    "Now here's the counter-intuitive part the next video covers — watch it right here.";
  assert.equal(recapCloseHits(script), 0, "recap language far from the close must not trip");
});

test("recap_close — recap inside a long structural close (past the 900-char window) is flagged", () => {
  // Body, then a CLOSING marker, a recap opener, then a long (>900 char)
  // forward-hook tail that pushes the recap outside the trailing-char window.
  const script =
    "Inventory in the northeast keeps climbing month over month for buyers. ".repeat(8) +
    "\n## CLOSING\n" +
    "So to recap, four months of inventory tilts the leverage to you. " +
    "But here is what most buyers get backwards about the months ahead. ".repeat(20);
  assert.ok(
    recapCloseHits(script) >= 1,
    "recap after the structural close marker must trip even when far from the end",
  );
});

/* ────────────────────────────────────────────────────────────────────── */
/*  fabricated_credibility_stat (Fix 1)                                    */
/* ────────────────────────────────────────────────────────────────────── */

function fabricatedHits(
  script: string,
  opts: Parameters<typeof validateScript>[1] = {},
): number {
  const { violations } = validateScript(script, opts);
  return violations.filter((v) => v.rule === "fabricated_credibility_stat").length;
}

test("fabricated_credibility_stat — invented 'every 53 hours' with no profile anchor trips", () => {
  assert.ok(
    fabricatedHits("Our team helps a family move every 53 hours, and here's what we're seeing.") >= 1,
    "an unanchored cadence must trip",
  );
});

test("fabricated_credibility_stat — cadence anchored in credentialsText passes", () => {
  assert.equal(
    fabricatedHits(
      "Our team helps a family move every 53 hours, and here's what we're seeing.",
      { credentialsText: ["Team helps a family move every 53 hours on average."] },
    ),
    0,
    "a credentials-anchored cadence must not trip",
  );
});

test("fabricated_credibility_stat — a coincidental neighbourhood number in profileText must NOT anchor a cadence", () => {
  assert.ok(
    fabricatedHits(
      "Our team helps a family move every 53 hours, and here's what we're seeing.",
      { profileText: ["This neighbourhood has 53 active listings right now."] },
    ) >= 1,
    "market/neighbourhood prose must never legitimise an invented personal cadence",
  );
});

test("fabricated_credibility_stat — non-numeric 'every few days' fallback never trips", () => {
  assert.equal(
    fabricatedHits("Our team helps a family move every few days, and here's what we're seeing."),
    0,
    "a non-numeric fallback carries no number and must not trip",
  );
});

test("fabricated_credibility_stat — a matching market stat (sourceOfTruth/citedFacts) must NOT anchor a personal cadence", () => {
  assert.ok(
    fabricatedHits(
      "Our team helps a family move every 53 hours, and here's what we're seeing.",
      {
        sourceOfTruth: [{ metricFamily: "MOI", metricValue: 53 }],
        citedFacts: [{ raw: "53 months of inventory" }],
      },
    ) >= 1,
    "market statistics must never legitimise an invented personal credibility cadence",
  );
});

test("fabricated_credibility_stat — cadence-FIRST phrasing ('Every 53 hours, our team helps...') still trips", () => {
  assert.ok(
    fabricatedHits(
      "Every 53 hours, our team helps a family move into this market.",
      { credentialsText: [] },
    ) >= 1,
    "subject/action after the cadence token must still scope the rule",
  );
});

test("fabricated_credibility_stat — a market cadence ('homes are selling every 12 days') must NOT trip", () => {
  assert.equal(
    fabricatedHits(
      "Homes in this pocket are selling every 12 days right now, the fastest pace in years.",
      { credentialsText: [] },
    ),
    0,
    "an inanimate-subject market cadence is not a personal credibility claim",
  );
});

test("autoSoftenUnanchoredStats — sub-$1k softening must NOT emit a placeholder_number filler", () => {
  // An anchor must exist (else the softener no-ops); $500 is unanchored, so it
  // gets softened. The softened phrase must pass the placeholder_number rule.
  const { script: softened } = autoSoftenUnanchoredStats(
    "Homes in this pocket are around $500 right now.",
    undefined,
    [{ raw: "$612,000" }],
  );
  const hits = validateScript(softened).violations.filter(
    (v) => v.rule === "placeholder_number",
  ).length;
  assert.equal(hits, 0, "softener output must not be a banned filler phrase");
});

test("recap_close — body 'closing costs' must NOT move the close boundary and trip mid-body recap", () => {
  const script =
    "Closing costs are up across the board this spring for buyers in the area. " +
    "The takeaway is that inventory leads price by a few months. " +
    "Let me show you exactly how that plays out across five neighbourhoods. ".repeat(20) +
    "Now here's the counter-intuitive part the next video covers — watch it right here.";
  assert.equal(
    recapCloseHits(script),
    0,
    "an ordinary 'closing costs' phrase must not be treated as the structural close",
  );
});

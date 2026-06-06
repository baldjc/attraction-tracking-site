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

/* ── family-agnostic grounding: EVERY number shape must trace, framework
      constants stay allowed (metric-family-agnostic validator) ── */

test("unanchored_stat — a comparison/temporal stat in an UNREPRESENTED family ('40% longer than 2024') trips", () => {
  // The only anchor is a currency fact — there is NO percent / SP-LP / DOM
  // family in the data at all. Before the family-agnostic fix the per-unit
  // `haveAnchorsOfUnit` gate let this slip (no percent anchor ⇒ rule stayed
  // silent). It must now be caught and re-prompted like an unsourced MOI.
  const n = unanchoredHits(
    "Buyers in this market are taking 40% longer to make an offer than they were back in early 2024.",
    { citedFacts: [{ raw: "$615,000" }] },
  );
  assert.ok(n >= 1, "an unsourced comparison stat in any family must be rejected");
});

test("framework threshold — 'anything below 2.5 months is a sellers market' passes even with an MOI anchor", () => {
  // 8.8 is the member's real MOI anchor; 2.5 is a FRAMEWORK band cutoff, not a
  // market data claim. The per-unit gate is gone, so without the framework
  // exemption the 2.5 (months anchor present, no 2% match) would be flagged.
  const n = unanchoredHits(
    "Here's the rule of thumb: anything below 2.5 months of inventory is a sellers market.",
    { sourceOfTruth: [{ metricFamily: "MOI", metricValue: 8.8 }] },
  );
  assert.equal(n, 0, "framework band cutoffs are definitional, never data claims");
});

test("framework exemption — a CURRENT-STATE data claim ('we are below 2.5 months here') is NOT exempted", () => {
  // A band value framed as the member's OWN current inventory ("we are below
  // 2.5 ... here") is a market DATA claim, not the framework definition. With
  // the real MOI at 8.8, "below 2.5" doesn't match and must be flagged — the
  // exemption only covers definitional phrasing, not first-person state.
  const n = unanchoredHits(
    "We are below 2.5 months of inventory here right now in this sellers market.",
    { sourceOfTruth: [{ metricFamily: "MOI", metricValue: 8.8 }] },
  );
  assert.ok(n >= 1, "a current-state band claim is data, not framework, and must be sourced");
});

test("framework definition — '100% of asking means full price' is allowed unsourced", () => {
  const n = unanchoredHits(
    "When a home sells at 100% of asking, that just means it sold at full price.",
    { sourceOfTruth: [{ metricFamily: "SP_LP", metricValue: 0.99 }] },
  );
  assert.equal(n, 0, "the 100%-of-asking definition is framework, not a SP/LP data claim");
});

test("unanchored_stat — an unsourced industry-norm RANGE ('15-20%') is caught on the leading endpoint", () => {
  // Range extraction must surface the leading "15" (the trailing "20%" already
  // is). Neither maps to a fact ⇒ an industry-norm stat stated as market fact.
  const n = unanchoredHits(
    "Across this market, listing failure rates run somewhere between 15-20% every year.",
    { sourceOfTruth: [{ metricFamily: "MOI", metricValue: 8.8 }] },
  );
  assert.ok(n >= 1, "both endpoints of an unsourced range must be grounded");
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

/* ── voice watch list — "wait a second, let me back up" self-interruption ── */

function backupFillerHits(script: string): number {
  const { violations } = validateScript(script);
  return violations.filter(
    (v) =>
      v.rule === "no_avatar_pander" &&
      /(wait a (?:second|sec)|let me back up|rewind|start over|hold on)/i.test(
        v.snippet ?? "",
      ),
  ).length;
}

test("voice — 'wait a second, let me back up' filler is caught", () => {
  const n = backupFillerHits(
    "So the data is clear. Wait a second, let me back up and explain why.",
  );
  assert.ok(n >= 1, "the self-interruption filler must be flagged");
});

test("voice — close variants (rewind / start over) are caught", () => {
  assert.ok(
    backupFillerHits("Here's the thing. Let me rewind to the beginning.") >= 1,
    "'let me rewind' must trip",
  );
  assert.ok(
    backupFillerHits("Actually, let me start over on that point.") >= 1,
    "'let me start over' must trip",
  );
});

/* ── no_sot_disagreement — canonical source-of-truth wins over per-fact ──── */

function sotDisagreementHits(
  script: string,
  opts: Parameters<typeof validateScript>[1],
): number {
  const { violations } = validateScript(script, opts);
  return violations.filter((v) => v.rule === "no_sot_disagreement").length;
}

test("no_sot_disagreement — a number disagreeing with its SoT is rejected", () => {
  // Real case: Westmount MOI — SoT says 3.8, a per-fact cited value said 4.29,
  // and the script wrote 4.3. unanchored_stat passes (4.3 ≈ cited 4.29), so the
  // canonical-SoT gate must catch the disagreement.
  const n = sotDisagreementHits(
    "Westmount inventory is sitting at 4.3 months of inventory right now.",
    {
      sourceOfTruth: [{ metricFamily: "MOI", metricValue: 3.8 }],
      citedFacts: [{ raw: "4.29 months" }],
    },
  );
  assert.ok(n >= 1, "a number disagreeing with its SoT beyond rounding must be rejected");
});

test("no_sot_disagreement — a number that matches the SoT is not flagged", () => {
  const n = sotDisagreementHits(
    "Westmount inventory is sitting at 3.8 months of inventory right now.",
    {
      sourceOfTruth: [{ metricFamily: "MOI", metricValue: 3.8 }],
      citedFacts: [{ raw: "4.29 months" }],
    },
  );
  assert.equal(n, 0, "a number agreeing with the canonical SoT must pass");
});

test("no_sot_disagreement — neighbourhood-scoped: a wrong figure isn't excused by another hood's matching value", () => {
  // Westmount's canonical MOI is 3.8, but the script writes 4.3 about Westmount.
  // 4.3 happens to equal Downtown's MOI. Without neighbourhood scoping the flat
  // SoT pool would see "some SoT MOI == 4.3" and wrongly pass. With the
  // neighbourhood list supplied, the comparison is scoped to Westmount, so the
  // disagreement is still caught.
  const n = sotDisagreementHits(
    "Westmount inventory is sitting at 4.3 months of inventory right now.",
    {
      neighbourhoods: ["Westmount", "Downtown"],
      sourceOfTruth: [
        { metricFamily: "MOI", metricValue: 3.8, neighbourhood: "Westmount" },
        { metricFamily: "MOI", metricValue: 4.3, neighbourhood: "Downtown" },
      ],
      citedFacts: [{ raw: "4.29 months" }],
    },
  );
  assert.ok(
    n >= 1,
    "a wrong neighbourhood figure must be flagged even when another hood shares that value",
  );
});

test("no_sot_disagreement — neighbourhood-scoped: the correct hood's value still passes", () => {
  // Same SoT pool, but now the script states Downtown's real MOI (4.3) about
  // Downtown — scoping must let it through.
  const n = sotDisagreementHits(
    "Downtown inventory is sitting at 4.3 months of inventory right now.",
    {
      neighbourhoods: ["Westmount", "Downtown"],
      sourceOfTruth: [
        { metricFamily: "MOI", metricValue: 3.8, neighbourhood: "Westmount" },
        { metricFamily: "MOI", metricValue: 4.3, neighbourhood: "Downtown" },
      ],
      citedFacts: [{ raw: "4.29 months" }],
    },
  );
  assert.equal(n, 0, "the right neighbourhood's canonical value must pass");
});

/* ── unsourced_factual_claim — ground specific claims, not just stats ────── */

function unsourcedClaimHits(
  script: string,
  opts: Parameters<typeof validateScript>[1],
): number {
  const { violations } = validateScript(script, opts);
  return violations.filter((v) => v.rule === "unsourced_factual_claim").length;
}

test("unsourced_factual_claim — an invented demographic figure is rejected", () => {
  // The KB profile mentions a $72,000 income; the script asserts a fabricated
  // $95,000 median household income that traces to no source.
  const n = unsourcedClaimHits(
    "Families here earn well — the median household income is $95,000 a year.",
    {
      profileText: [
        "Oliver is an affluent neighbourhood with a median household income of $72,000.",
      ],
    },
  );
  assert.ok(n >= 1, "an unsourced demographic claim must be rejected");
});

test("unsourced_factual_claim — a demographic figure backed by the profile passes", () => {
  const n = unsourcedClaimHits(
    "Families here earn well — the median household income is $72,000 a year.",
    {
      profileText: [
        "Oliver is an affluent neighbourhood with a median household income of $72,000.",
      ],
    },
  );
  assert.equal(n, 0, "a demographic figure that traces to the profile must pass");
});

test("unsourced_factual_claim — an invented dated event (year) is rejected", () => {
  const n = unsourcedClaimHits(
    "The community rec centre opened in 2019 and changed everything here.",
    {
      profileText: [
        "Oliver has a rec centre and a library that anchor the core.",
      ],
    },
  );
  assert.ok(n >= 1, "an unsourced dated-event year must be rejected");
});

test("unsourced_factual_claim — silent when no anchor sources are provided", () => {
  const n = unsourcedClaimHits(
    "The median household income is $95,000 and the centre opened in 2019.",
    {},
  );
  assert.equal(n, 0, "with no anchors the rule cannot judge and stays silent");
});

/* ── unsourced_factual_claim — QUALITATIVE neighbourhood facts ───────────── */

test("qualitative — invented build-era + housing-style claim (no profile) is rejected", () => {
  // The spec's required acceptance test: an invented "built in the 1990s,
  // single-story ranch styles" claim with no profile must be caught — even
  // with no anchor sources at all, because nothing can ground it.
  const n = unsourcedClaimHits(
    "Most homes here were built in the 1990s, single-story ranch styles all the way down the block.",
    {},
  );
  assert.ok(n >= 1, "an unsourced build-era / housing-style claim must be rejected");
});

test("qualitative — a data interpretation ('buyers are being methodical') passes", () => {
  const n = unsourcedClaimHits(
    "What I'm seeing is buyers are being methodical right now, and sellers are learning to price realistically.",
    {},
  );
  assert.equal(n, 0, "data interpretations must not be over-blocked");
});

test("qualitative — framework mechanics (MOI threshold) is not blocked", () => {
  const n = unsourcedClaimHits(
    "Remember, anything below 2.5 months of inventory is a sellers market, but low inventory doesn't equal seller control when behaviour shifts.",
    {},
  );
  assert.equal(n, 0, "framework mechanics must stay allowed");
});

test("qualitative — clearly-experiential framing is not blocked", () => {
  const n = unsourcedClaimHits(
    "I've seen this area appeal to families over the years, and in my experience it tends to draw young families too.",
    {},
  );
  assert.equal(n, 0, "experiential framing with no invented specific must pass");
});

test("qualitative — build era backed by the profile passes", () => {
  const n = unsourcedClaimHits(
    "Most homes here were built in the 1990s with single-story ranch styles.",
    {
      profileText: [
        "Lakeview's housing stock was largely built in the 1990s, dominated by single-story ranch homes.",
      ],
    },
  );
  assert.equal(n, 0, "a build-era / housing-style claim that traces to the profile must pass");
});

test("qualitative — worded demographic comparative (no number) is rejected", () => {
  const n = unsourcedClaimHits(
    "The median household income here runs higher than the regional average.",
    { profileText: ["Oliver is a walkable core anchored by the LRT line."] },
  );
  assert.ok(n >= 1, "an unsourced worded demographic comparative must be rejected");
});

test("qualitative — demographic descriptor in an attribution frame is rejected", () => {
  const n = unsourcedClaimHits(
    "This neighbourhood is home to young families and first-time buyers.",
    { profileText: ["Oliver is a walkable core anchored by the LRT line."] },
  );
  assert.ok(n >= 1, "an unsourced demographic descriptor stated as fact must be rejected");
});

test("qualitative — addressing the audience ('first-time buyers should…') is not blocked", () => {
  const n = unsourcedClaimHits(
    "If you're a first-time buyer, you should watch inventory closely this spring.",
    {},
  );
  assert.equal(n, 0, "audience address (not an area-demographic fact) must pass");
});

test("qualitative — named-institution attribute (school + rating) is rejected", () => {
  const n = unsourcedClaimHits(
    "The schools here are top-rated, and those school ratings drew families in droves.",
    { profileText: ["Oliver is a walkable core anchored by the LRT line."] },
  );
  assert.ok(n >= 1, "an unsourced school-rating claim must be rejected");
});

test("qualitative — named institution backed by the profile passes", () => {
  const n = unsourcedClaimHits(
    "The schools here are highly rated, which keeps drawing families.",
    {
      profileText: [
        "Lakeview is anchored by top-rated schools and a community centre.",
      ],
    },
  );
  assert.equal(n, 0, "a school claim that traces to the profile must pass");
});

test("qualitative — school RATING not grounded by a profile that only lists schools", () => {
  // The profile mentions schools but says nothing about ratings: the invented
  // "top-rated" attribute must still be rejected (institution noun present is
  // not enough — the attribute has to trace to the source too).
  const n = unsourcedClaimHits("The schools here are top-rated.", {
    profileText: ["Lakeview has great parks and schools nearby."],
  });
  assert.ok(
    n >= 1,
    "a rating attribute must not be sourced by a bare mention of schools",
  );
});

test("qualitative — income comparative not grounded by an unrelated median-age line", () => {
  // The profile only carries a median AGE; it must not source a median INCOME
  // comparative (different metric → still unsourced).
  const n = unsourcedClaimHits(
    "The median household income here runs higher than the regional average.",
    { profileText: ["Oliver's median age here is 41."] },
  );
  assert.ok(
    n >= 1,
    "a median-income comparative must not be grounded by a median-age fact",
  );
});

test("qualitative — housing style not grounded by an unrelated 'story'", () => {
  // "single-story" must not be sourced just because the profile happens to use
  // the word "story" in unrelated prose.
  const n = unsourcedClaimHits(
    "Most homes here are single-story ranch styles.",
    { profileText: ["Oliver is quite a story of downtown growth and renewal."] },
  );
  assert.ok(
    n >= 1,
    "a housing-style claim must not be sourced by an unrelated 'story'",
  );
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

test("fabricated_credibility_stat — vague 'every few days' with NO stored cadence trips (Fix 3)", () => {
  // The prompt used to RECOMMEND "every few days" as a fallback, so members with
  // nothing on file (e.g. Phil) invented a soft frequency. With no stored cadence
  // a vague personal cadence is now flagged exactly like an invented numeric one.
  assert.ok(
    fabricatedHits("Our team helps a family move every few days, and here's what we're seeing.") >= 1,
    "a guessed vague cadence with nothing on the profile must trip",
  );
});

test("fabricated_credibility_stat — vague 'every few days' is exempt when a real cadence is stored (Fix 3)", () => {
  // Members WITH a stored cadence (e.g. Chris's 53h) keep working — the presence
  // of any stored cadence on the profile means a vague phrasing isn't a guess.
  assert.equal(
    fabricatedHits(
      "Our team helps a family move every few days, and here's what we're seeing.",
      { credentialsText: ["Team helps a family move every 53 hours on average."] },
    ),
    0,
    "a member with a stored cadence isn't forced off a vague phrasing",
  );
});

test("fabricated_credibility_stat — a market 'every few days' (inanimate subject) must NOT trip (Fix 3)", () => {
  assert.equal(
    fabricatedHits("Homes in this pocket are selling every few days right now."),
    0,
    "an inanimate-subject market cadence is not a personal credibility claim",
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

/* ────────────────────────────────────────────────────────────────────── */
/*  unlisted_market_stat (Fix 2 — source EVERY number family)              */
/* ────────────────────────────────────────────────────────────────────── */

function unlistedHits(
  script: string,
  opts: Parameters<typeof validateScript>[1] = {},
): number {
  const { violations } = validateScript(script, opts);
  return violations.filter((v) => v.rule === "unlisted_market_stat").length;
}

test("unlisted_market_stat — a real failure rate spoken but absent from '## Sources' trips (Fix 2)", () => {
  // FAILURE_RATE is stored as a ratio (1.81); the body speaks "181%". The
  // footnote lists only the median, so the failure rate is unsourced → error.
  const body =
    "The failure rate here is sitting at 181% right now.\n\n" +
    "## Sources\n- $615,000 — Downtown median (fact: mf_price)";
  assert.ok(
    unlistedHits(body, { sourceOfTruth: [{ metricFamily: "FAILURE_RATE", metricValue: 1.81 }] }) >= 1,
    "a real number missing from the Sources footnote must be flagged",
  );
});

test("unlisted_market_stat — the SAME failure rate listed in '## Sources' passes (Fix 2)", () => {
  const body =
    "The failure rate here is sitting at 181% right now.\n\n" +
    "## Sources\n- 181% — Downtown failure rate (fact: mf_fr)";
  assert.equal(
    unlistedHits(body, { sourceOfTruth: [{ metricFamily: "FAILURE_RATE", metricValue: 1.81 }] }),
    0,
    "a sourced number must not be flagged",
  );
});

test("unlisted_market_stat — a real days-on-market number absent from '## Sources' trips (Fix 2)", () => {
  const body =
    "Properties are averaging 21 days on market here.\n\n" +
    "## Sources\n- $615,000 — Downtown median (fact: mf_price)";
  assert.ok(
    unlistedHits(body, { sourceOfTruth: [{ metricFamily: "DOM", metricValue: 21 }] }) >= 1,
    "DOM is a number family that must be sourced too, not just MOI + price",
  );
});

test("unlisted_market_stat — a fabricated number (not in SoT) is NOT double-flagged here (Fix 2)", () => {
  // $999,123 isn't in the SoT — that's unanchored_stat's job, not this rule.
  const body =
    "Inventory is 8.8 months, but homes cost $999,123 here.\n\n" +
    "## Sources\n- 8.8 — Downtown MOI (fact: mf_moi)";
  assert.equal(
    unlistedHits(body, { sourceOfTruth: [{ metricFamily: "MOI", metricValue: 8.8 }] }),
    0,
    "fabrications belong to unanchored_stat; unlisted_market_stat only polices real numbers",
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

/* ────────────────────────────────────────────────────────────────────── */
/*  Profile-aware min_dialogue_length floor (lean vs full).                */
/* ────────────────────────────────────────────────────────────────────── */

/** A grounded body whose dialogue word count is between 1,200 and 2,200. */
function leanGroundedScript(): string {
  const paragraph =
    "In Saddle Ridge the typical detached home is trading around $612,000 right now, " +
    "and the share of active listings that ultimately find a buyer is sitting close to 49.4%. " +
    "That pairing of a $612,000 price level against a 49.4% absorption read is the single " +
    "clearest signal of how balanced this corner of the market has become through the season, " +
    "and it is the kind of grounded read that helps a household plan the next move with confidence.";
  const body = Array.from({ length: 17 }, () => paragraph).join("\n\n");
  return `# Title: The Saddle Ridge Market Read\n\n[VISUAL: drone]\n\n${body}\n`;
}

function dialogueFloorHits(
  script: string,
  opts: Parameters<typeof validateScript>[1] = {},
): number {
  return validateScript(script, opts).violations.filter(
    (v) => v.rule === "min_dialogue_length",
  ).length;
}

test("min_dialogue_length — lean floor (1,200) applies when no profile is present", () => {
  const script = leanGroundedScript();
  assert.equal(
    dialogueFloorHits(script, { neighbourhoods: ["Saddle Ridge"] }),
    0,
    "a ~1,360-word grounded draft must clear the lean floor with no profile",
  );
});

test("min_dialogue_length — full floor (2,200) applies when hasNeighbourhoodProfile is true", () => {
  const script = leanGroundedScript();
  assert.ok(
    dialogueFloorHits(script, {
      neighbourhoods: ["Saddle Ridge"],
      hasNeighbourhoodProfile: true,
    }) >= 1,
    "the same lean draft must trip the full 2,200 floor once a profile is signalled",
  );
});

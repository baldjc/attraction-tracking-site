/**
 * Unit tests for the validator output parser — specifically the Story Leads
 * extraction, which silently dropped EVERY lead when the validator emitted the
 * field labels with markdown emphasis ("**PATTERN:**") instead of the plain
 * "PATTERN:" the prompt documents. A real single-month upload produced 861
 * facts + 8 well-formed leads in the raw output but persisted 0 story leads,
 * leaving new members with an empty dashboard briefing.
 *
 * Run: `npx tsx --test src/lib/fact-validator-parser.test.ts`
 */
import test from "node:test";
import assert from "node:assert/strict";
import { parseSummaryAndLeadsChunk } from "./fact-validator-parser";

const PLAIN = `## SUMMARY

A balanced market with internal variance.

## STORY LEADS

### LEAD #1 — THESIS LEAD: A Split-Personality Market

PATTERN: The city-wide headline masks a violent bifurcation.

DATA THREADS:
- Ottewell: MOI strict 0.50, SP/LP 1.012 — above list; 12 sales
- Steinhauer: MOI strict 0.33 — tightest in dataset; 6 sales

WHY IT MATTERS TO VIEWERS: A relocator told "balanced" walks into the wrong assumption.

SUB-PERSONAS SERVED: Relocator + First-Time Buyer

ROTATION SLOT FIT: Contrarian Take

SUGGESTED FRAMEWORK: Counter-Intuitive Discovery

TACTILE TYPE: comparison

---

### LEAD #2 — Hidden Micro-Seller-Markets

PATTERN: A dozen mature neighbourhoods recorded above-list sale prices.

DATA THREADS:
- Capilano: SP/LP 1.0151, DOM 7 days; 6 sales

WHY IT MATTERS TO VIEWERS: Buyers blindsided in tight pockets.

SUB-PERSONAS SERVED: First-Time Buyer

ROTATION SLOT FIT: Neighbourhood Fact

SUGGESTED FRAMEWORK: Specific Reveal

TACTILE TYPE: place-list
`;

// Same content, but every field label decorated with markdown bold — the form
// that broke the old parser (colon INSIDE the emphasis: "**PATTERN:**").
const BOLDED = `## SUMMARY

A balanced market with internal variance.

## STORY LEADS

---

### LEAD #1 — THESIS LEAD: A Split-Personality Market

**PATTERN:** The city-wide headline masks a violent bifurcation.

**DATA THREADS:**
- Ottewell: MOI strict 0.50, SP/LP 1.012 — above list; 12 sales
- Steinhauer: MOI strict 0.33 — tightest in dataset; 6 sales

**WHY IT MATTERS TO VIEWERS:** A relocator told "balanced" walks into the wrong assumption.

**SUB-PERSONAS SERVED:** Relocator + First-Time Buyer

**ROTATION SLOT FIT:** Contrarian Take

**SUGGESTED FRAMEWORK:** Counter-Intuitive Discovery

**TACTILE TYPE:** comparison

---

### LEAD #2 — Hidden Micro-Seller-Markets

**PATTERN:** A dozen mature neighbourhoods recorded above-list sale prices.

**DATA THREADS:**
- Capilano: SP/LP 1.0151, DOM 7 days; 6 sales

**WHY IT MATTERS TO VIEWERS:** Buyers blindsided in tight pockets.

**SUB-PERSONAS SERVED:** First-Time Buyer

**ROTATION SLOT FIT:** Neighbourhood Fact

**SUGGESTED FRAMEWORK:** Specific Reveal

**TACTILE TYPE:** place-list
`;

// Colon OUTSIDE the emphasis ("**PATTERN**:") + a leading list marker.
const BOLDED_COLON_OUTSIDE = `## STORY LEADS

### LEAD #1 — Edge Formatting

- **PATTERN**: Labels can be bolded with the colon outside the emphasis.

**DATA THREADS**:
- Glenora: MOI 1.2; 8 sales

**WHY IT MATTERS**: Parser must tolerate this too.

**ROTATION SLOT FIT**: Market Update

**TACTILE TYPE**: data-drop
`;

function assertLeadShape(lead: any) {
  assert.ok(lead.pattern.length > 0, "pattern should be populated");
  assert.ok(lead.dataThreads.length > 0, "dataThreads should be populated");
  assert.ok(lead.whyItMatters.length > 0, "whyItMatters should be populated");
}

test("parses plain (unbolded) story-lead labels", () => {
  const { storyLeads } = parseSummaryAndLeadsChunk(PLAIN);
  assert.equal(storyLeads.length, 2);
  storyLeads.forEach(assertLeadShape);
  assert.equal(storyLeads[0].isThesisLead, true);
  assert.equal(storyLeads[1].isThesisLead, false);
  assert.equal(storyLeads[0].label, "A Split-Personality Market");
  assert.equal(storyLeads[0].rotationSlot, "contrarian_take");
  assert.equal(storyLeads[1].rotationSlot, "neighbourhood_fact");
  // Last field of the block must survive (the prior `\Z` bug dropped it).
  assert.equal(storyLeads[0].tactileType, "comparison");
  assert.equal(storyLeads[1].tactileType, "place-list");
});

test("parses markdown-bold story-lead labels (the regression)", () => {
  const { storyLeads } = parseSummaryAndLeadsChunk(BOLDED);
  assert.equal(storyLeads.length, 2);
  storyLeads.forEach(assertLeadShape);
  // No stray "**" bleed into the label or values.
  assert.ok(!storyLeads[0].label?.includes("*"));
  assert.ok(!storyLeads[0].pattern.includes("**"));
  assert.equal(storyLeads[0].tactileType, "comparison");
  assert.equal(storyLeads[0].dataThreads.length, 2);
  assert.equal(storyLeads[0].rotationSlot, "contrarian_take");
});

test("tolerates colon-outside-emphasis and list-marker labels", () => {
  const { storyLeads } = parseSummaryAndLeadsChunk(BOLDED_COLON_OUTSIDE);
  assert.equal(storyLeads.length, 1);
  assertLeadShape(storyLeads[0]);
  assert.equal(storyLeads[0].rotationSlot, "market_update");
  assert.equal(storyLeads[0].tactileType, "data-drop");
});

test("bold and plain formats produce identical structured output", () => {
  const a = parseSummaryAndLeadsChunk(PLAIN).storyLeads;
  const b = parseSummaryAndLeadsChunk(BOLDED).storyLeads;
  assert.deepEqual(
    a.map((l) => ({ p: l.pattern, w: l.whyItMatters, s: l.rotationSlot, t: l.tactileType })),
    b.map((l) => ({ p: l.pattern, w: l.whyItMatters, s: l.rotationSlot, t: l.tactileType })),
  );
});

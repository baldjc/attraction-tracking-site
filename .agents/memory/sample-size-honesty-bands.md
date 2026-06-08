---
name: Sample-size honesty bands (headline / disclose / thin)
description: Three-band sample-size model for market facts and why the per-member hard floor must NOT be hardcoded in the validator system prompt.
---

# Three honesty bands by closed-sale count

Neighbourhood facts are classified by closed-sale count N into three bands, not
a single floor:

- **headline** — N >= `HEADLINE_SOLD_FLOOR` (the single tunable constant in
  `member-metric-settings.ts`, currently 15). Cite normally.
- **disclose** — per-member hard floor (`sampleFloorFor().sold`, default 5) up to
  `HEADLINE_SOLD_FLOOR - 1`. Still headline-eligible (`usageClass` headline_safe)
  but MUST carry a mandatory "based on N sales" disclosure baked into the caveat.
  Do NOT bench it to texture-only.
- **thin** — N < hard floor. `supporting_texture_only` with an honest "only N
  sales" caveat. Never headline, never fabricate.

The pure classifier is `sampleBandFor(sold, headlineFloor, hardMin)`. compute_cut
persists facts for ALL bands (incl. thin); the aggregator only persists N>=5, so
the validator never sees thin facts but compute_cut does.

**Why:** the goal is to be MORE honest, not looser — thin-but-real samples stay
usable with disclosure instead of vanishing silently.

## Gotcha: per-member floor can't live in the cached system prompt

The fact-validator SYSTEM prompt template is resolved/cached **per market**, not
per member, so it cannot interpolate the per-member hard floor. `HEADLINE_SOLD_FLOOR`
is a global constant and is safe to interpolate; the per-member hard floor is NOT.

The per-member floor is emitted only in the **methodology block** (built from
member settings; returns "" for default members, who use the conservative floor
of 5). So the system template and the per-chunk user message must **defer** to
"the SAMPLE SIZE line of the methodology block (default 5 if absent)" for the
disclose/thin boundary — never hardcode 5. Hardcoding 5 there silently breaks
strict (floor 10) / permissive (floor 3) members.

**How to apply:** any time you state the disclose/thin boundary in validator
prose, reference the methodology floor, not a literal. Only `HEADLINE_SOLD_FLOOR`
(the headline boundary) may be a literal/interpolated constant.

## Script-builder prompt is a separate band-enforcement site

`computeCut.ts` emits disclose-band facts as `headline_safe` + a "based on N
sales … state the sample size out loud" caveat, but the **script-builder mode
prompt** ("On-demand computed cuts" section) independently tells the model how to
treat them. That prompt historically benched *everything* below the headline
floor as texture-only — silently contradicting the disclose band. The prompt
must key off the caveat wording: "based on N sales / state the sample size out
loud" = usable (incl. headline) WITH spoken disclosure; "too thin to headline" =
texture only. **How to apply:** any change to the band caveat strings in
computeCut must stay in lockstep with the discriminators in that prompt, or the
generator re-benches usable disclose-band facts.

## Caveat text must avoid property-type words

compute_cut disclosure strings ("Based on N sales in {Month Year}.") must contain
NO property-type words — `scriptBuilder.extractPropertyTypeFromCaveat()` parses
property type out of caveat strings and would misread them. A test guards this.

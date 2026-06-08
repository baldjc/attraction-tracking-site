---
name: Rollups chunk per-type citywide mislabel
description: Why citywide per-property-type facts persist as the bare all-types overall, and the constraints on the deterministic relabel fix.
---

# Rollups chunk collapses per-type citywide facts onto the overall

The validator's chunking routes EVERY "All Neighbourhoods" group — the
type-pooled overall AND each per-property-type citywide cut — into a single
"rollups" chunk whose property-type column is null. So a per-type citywide fact
(e.g. a Detached citywide months-of-inventory) gets persisted with
propertyType=null, i.e. indistinguishable from the genuine all-types overall.
Two "overall" facts then coexist (the real pooled one + a mislabeled segment
one), and anything that loads all headline-safe facts (the dashboard briefing
LLM) can surface the segment figure as the citywide overall.

**Why this matters:** the symptom is a *data-correctness* bug that looks like a
math/pooling bug. The deterministic aggregation (AggregatedMetric) and the
pooled overall are CORRECT — counts are summed, never ratios averaged. The
defect is purely the property-type LABEL stamped at persist time.

**Fix shape (deterministic relabel, post-persist):** snap a would-be-null MOI
rollup fact back to the AggregatedGroup it actually describes, matching on MOI's
two-component (strict, inclusive) signature against same-neighbourhood
priceTier-null groups. The genuine pooled overall (matches the null-type group)
stays null; a per-type cut gets its real label. Require an unambiguous match
(margin between best and 2nd-best candidate) or stay overall — never guess.

**Why MOI-only:** MOI's (strict, inclusive) pair is a distinctive signature that
makes value-matching safe. Single-value families (median price, DOM, SP/LP) have
high cross-type value-collision risk, so value-matching them would risk a
confident WRONG relabel — worse than the status quo. If a sibling family ever
shows the same null-stamping, fix it STRUCTURALLY (carry propertyType through the
chunk) rather than widening the value-match heuristic.

**How to apply:** the relabel runs at the single persist tail, so it covers both
the live AI path and the $0 raw-output reuse/reconstruct path (both converge
there). The briefing fact chip must also include the property-type segment in
its label so a per-type cut never DISPLAYS as the bare overall. The idea-engine
prompt already JSON-serializes each fact's propertyType, so a correctly-labeled
fact is enough for the LLM to distinguish overall from segment.

---
name: Neighbourhood area codes vs names
description: When neighbourhood vocab / auto-populate shows numeric values, it's MLS area codes in the mapped column, not a mapping bug.
---

# Numeric "neighbourhoods" = MLS area codes, not a bug

Some MLS exports (e.g. Edmonton / RAE) only have a numeric area-code column
(RAE calls it "Community": values like `100001`, `550900`; rare text like
`WIHKWE`) and **no human-readable neighbourhood-name column at all**. When a
member maps that column as their neighbourhood field, every downstream surface
(Knowledge Base auto-populate, `neighbourhoodVocab`, script citations) shows the
codes.

**Why this is NOT a mapping/hardcoded-column bug:** the auto-populate route
(`/api/member/knowledge-base/discovered-neighbourhoods`) reads *distinct*
`market_facts.neighbourhood`, which is populated from the member's mapped column
during CSV aggregation. So the mapping IS honored — the data itself is codes.

**There is no code→name reference table in the codebase.** Translating codes to
names requires either the member re-exporting with a name column
(Subdivision/Area/Community Name) or sourcing an external area-code→name dataset
(accuracy-sensitive; only do this if the member can't re-export).

**Detection heuristic in use:** flag "codes" format when `>90%` of discovered
neighbourhood values match `/^\d+$/` (tolerates a few text outliers, ignores
empty sets). Shipped as a warn + educate banner — no retroactive rewrite of
existing vocab/facts.

**How to apply:** if a member reports numeric/garbled neighbourhood names, don't
chase the column mapping — check whether their export only has an area-code
column. The fix is education (re-export with a name column), not a code change.
The script-generator "skip/substitute coded neighbourhood narrative" behavior
is a deferred follow-up, not yet implemented.

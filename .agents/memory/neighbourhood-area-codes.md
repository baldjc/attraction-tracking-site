---
name: Neighbourhood area codes vs names
description: Numeric neighbourhood vocab can be MLS area codes in the mapped column (not a mapping bug) — BUT the same MLS may also offer a names-based export; check the actual file before concluding.
---

# Numeric "neighbourhoods" = MLS area codes, not a bug — but format-dependent

**RAE has BOTH export formats — verified 2026-06-10.** An older Edmonton / RAE
export put numeric area codes in the `Community` column (values like `100001`,
`550900`; rare text like `WIHKWE`), which is where a member's 587 all-numeric
`neighbourhoodVocab` codes came from. But RAE's **"Market Stats – Combined"**
report puts **real neighbourhood NAMES in that same `Community` column**
(verified: 9,301 rows, 0 numeric, 293 distinct names — "Abbottsfield",
"Strathcona", "Wîhkwêntôwin", "Granville (Edmonton)"…). So a member already
mapped `neighbourhood → Community` will get **names** the moment they upload the
Combined export — **no remap needed**; the stale numeric vocab is just leftover
from the old format and should be cleared (KB-scope reset blanks the vocab).

**Lesson:** before telling a member "your MLS only exports codes, re-export with
names," get the ACTUAL CSV they have now — the right report type may already
carry names in the column they're already mapped to. Don't conclude "no name
column exists" from one export.

Some MLS exports genuinely only have a numeric area-code column and **no
human-readable neighbourhood-name column at all**. When a member maps that
column as their neighbourhood field, every downstream surface (Knowledge Base
auto-populate, `neighbourhoodVocab`, script citations) shows the codes.

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

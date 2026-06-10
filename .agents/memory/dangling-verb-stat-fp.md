---
name: Dangling-verb stat false positives
description: How to keep the placeholder_number dangling-verb pattern from flagging clean real-estate idioms
---

The `placeholder_number` rule in `src/lib/script-content-rules.ts` includes a
"dangling value verb" pattern meant to catch a stat that the model jammed into a
value verb with no figure ("Days on market average sitting.", "pricing averaging.").

**Rule:** that pattern must fire ONLY when the verb (`sitting|hovering|averaging`)
immediately follows a quantitative noun (`average|pricing|inventory|median|dom|
days|months|ratio|rate|...`). Do NOT implement it as a bare
`\b(?:sitting|hovering|averaging)\s*[.?!]` nor as a be-verb/negation blacklist.

**Why:** "sitting" is an extremely common real-estate predicate. Clean scripts say
"homes are not sitting." (= not languishing), "it depends on where you're sitting.",
"listings keep sitting." A blacklist of preceding words (are/is/not/keep…) is
whack-a-mole — "you're" slips through. Anchoring on a preceding stat-noun
eliminates every conversational idiom at once while preserving the true leak. This
was a live regression caught by validating against both the repro member and the
control member: the broad form flagged several clean saved scripts; the stat-noun
anchor cleared all of them and still fires on "average sitting."

**How to apply:** when tuning any verb-as-dangling-stat heuristic, prefer a
positive anchor (the surrounding stat context) over a negative exclusion list. Test
against real saved `ContentPlan.script` rows for both the repro and the control
member before trusting it.

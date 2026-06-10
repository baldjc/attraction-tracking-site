---
name: Opaque-segment label letter casing
description: Why the opaque-segment-label check requires an uppercase label letter
---

The `no_opaque_segment_labels` rule in `src/lib/script-content-rules.ts` flags
placeholder audience labels ("Segment A", "Group B", "Cohort C") so the model is
forced to name groups by what they are.

**Rule:** the letter form must require an UPPERCASE `A–E`
(`(?:[Ss]egment|[Gg]roup|…)\s+[A-E]`), not a case-insensitive `[a-e]`.

**Why:** the English article "a" collides with the lowercase letter form. With a
case-insensitive `[a-e]`, "we group a lot of buyers", "I bucket a few clients"
false-positive as "Group A"/"Bucket A". Real opaque labels are always written
capitalized, so requiring uppercase keeps the catch and kills the article
collision. The numbered form (`Segment 1`) is restricted to the unambiguously
opaque nouns (segment/cohort/persona) so a legit "tier 1"/"category 5" survives.

**How to apply:** any single-letter label detector that can collide with the
article "a" should force uppercase rather than rely on a blacklist of following
words.

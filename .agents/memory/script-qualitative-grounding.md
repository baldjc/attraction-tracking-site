---
name: ARC qualitative-fact grounding sourcing model
description: How the script validator decides a qualitative neighbourhood claim (build era, housing style, demographics, named institution) is "sourced" — and why ANY-substring matching is wrong.
---

# Qualitative grounding sources on term GROUPS, not any-substring

The `unsourced_factual_claim` rule grounds qualitative claims against the
member's KB profile + cited facts. A claim is "sourced" only when **every**
required group has at least one term present (separator-insensitive). A single
group means "any of these"; two groups means both are required.

**Rule:**
- Institution claims (e.g. school + rating) need TWO groups: the institution
  noun AND its attribute. A bare "schools" mention must NOT ground a "top-rated
  schools" claim.
- Demographic comparatives ground on the exact metric phrase OR its metric noun
  (income / age / home value / net worth) — never on a generic shared word. A
  profile with only "median age" must NOT source a "median income" claim.
- Housing-style grounds on a curated style root (e.g. "ranch", "single stor")
  plus the full phrase — never on a bare generic token like "single" or "story",
  which lets unrelated prose false-source the claim.

**Why:** the first implementation used `terms.some(blob.includes)` (ANY
substring). That silently let one unrelated profile fact ground a different
claim (median-age → median-income; "schools" → "top-rated"), i.e. false
negatives that defeat the whole grounding guard. Over-blocking a genuinely
grounded claim is the safer failure mode than under-enforcing an invented one.

**How to apply:** when extending qualitative detection, add the claim with the
right `termGroups` shape. If the specific being asserted is an ATTRIBUTE of a
named thing (rating, "new" centre, comparative direction), the attribute must be
its own required group — don't let mere presence of the noun count as sourced.
The qualitative scan runs regardless of numeric-anchor presence (an invented
specific with no profile at all is still rejected); the numeric path keeps its
"silent when no anchors" posture.

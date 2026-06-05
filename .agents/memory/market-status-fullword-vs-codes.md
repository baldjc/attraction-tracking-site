---
name: Status bucketing — single-letter codes vs full-word CSV labels
description: Why a member's facts can all get rejected ("0 sold") even with hundreds of MarketFacts, and how get_facts must report fact tiers honestly.
---

# Status bucketing: config status-codes vs CSV labels

**Symptom:** A member with hundreds of MarketFacts gets "No matching facts" /
every fact graded `rejected`. The validator rejected them because aggregation
reported `soldCount`/`activeCount` = 0 *everywhere* (even the citywide "All
Neighbourhoods" rollup) — so Claude correctly refused to headline a stat with a
zero sold base.

**Root cause:** `bucketStatus` did an exact lowercase lookup of the CSV Status
value against the member's `MarketConfig.statusCodes`. When the config codes are
SHORT (e.g. single letters `A/S/P/X/T/W`) but the CSV Status column uses FULL
WORDS (`ACTIVE`, `SOLD`, `TERMINATED`, `PENDING`, `WITHDRAWN`, and composites
like `"X - EXPIRED"`), every row falls through to `unknown` → all bucket counts
0 → all facts rejected. The stock defaults (GENERIC/CREB/NTREIS/…) all use full
words, so this only bites members whose codes are short/custom.

**Why:** the config status-codes are a member-editable mapping; nothing forced
them to match the actual CSV vocabulary, and the lookup had no fallback.

**Fix shape (don't reintroduce the gap):**
- When building the status mapping from `statusCodes`, ALSO index the *canonical
  word* for each bucket/sub (additive — exact-match precedence preserved), so a
  short code config still matches full-word labels.
- Use a token-fallback lookup: exact match first, then for COMPOSITE labels
  (>1 token, e.g. `"X - EXPIRED"`) match each token by bucket precedence. Apply
  it in BOTH `bucketStatus` and `classifyOffMarketSub`.

**How to apply:** any new status-mapping consumer must go through the shared
token-fallback lookup, not a raw `map[label.toLowerCase()]`. After fixing,
re-validate the affected upload (admin re-validate route clears
`rawValidatorOutput` for a genuine fresh AI pass — a populated blob triggers a
persistence-only reuse of the STALE rejecting output and fixes nothing).

# get_facts must distinguish 4 states, not return a bare empty list

A validated-but-zero-headline-safe upload used to return `{facts:[]}` —
indistinguishable from "never uploaded". Jarvis `executeGetFacts` now returns an
explicit `state`: `no_upload` | `headline_safe` | `texture_only` | `none`, with
a `supporting_texture_only` fallback (flagged `textureOnly` + per-fact caveat)
when no headline-safe fact matches. `groundAssistantText` is intentionally NOT
changed — texture facts are real numbers so their digits stay allowed; the flag
governs HOW the model may use them (background colour, not a headline claim).

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

# Upload preflight must consult the member's status mapping, not just keyword/code lists

**Symptom:** A member maps a regional/custom status label (e.g. a non-English
word) in the status-mapping step, then their upload still HARD-ERRORS with
`STATUS_VALUES_UNRECOGNIZED` (or `STATUS_ONLY_NON_ACTIONABLE`).

**Root cause:** `runPreflight` in `market-csv.ts` judged status recognition /
actionability with ONLY hardcoded keyword/code lists (`isRecognizedStatus` /
`isActionableStatus`) and never looked at the member's saved `statusMapping`. So
a label the member already mapped was still "unknown" at the gate.

**Fix shape:** `runPreflight` takes `opts.statusMapping`; recognition is
`isRecognizedStatus(v) || bucketStatus(v, mapping) !== "unknown"`, and actionable
honours the resolved bucket (sold/active/pending = actionable, offMarket =
recognized-but-not, else keyword fallback). The upload route resolves it via
`resolveStatusMapping(toShape(config))` and passes it in. Additive — un-mapped /
default members are unaffected (they already hit the keyword/code path).

**Precedence to preserve:** unrecognized-majority (<50%) still returns
`STATUS_VALUES_UNRECOGNIZED` BEFORE the zero-actionable check, so a file that's
mostly unmapped labels blocks on "unrecognized", not "non-actionable".

**Client routing:** a `STATUS_VALUES_UNRECOGNIZED` preflight result is a
status-VALUE problem, not a column-identity one — the UI must re-run analyze
(guided StatusMapper) NOT open the ColumnMapper, or members dead-end.

# get_facts must distinguish 4 states, not return a bare empty list

A validated-but-zero-headline-safe upload used to return `{facts:[]}` —
indistinguishable from "never uploaded". Jarvis `executeGetFacts` now returns an
explicit `state`: `no_upload` | `headline_safe` | `texture_only` | `none`, with
a `supporting_texture_only` fallback (flagged `textureOnly` + per-fact caveat)
when no headline-safe fact matches. `groundAssistantText` is intentionally NOT
changed — texture facts are real numbers so their digits stay allowed; the flag
governs HOW the model may use them (background colour, not a headline claim).

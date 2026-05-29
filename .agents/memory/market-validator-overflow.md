---
name: Market-data validator overflow
description: Why very wide markets (NTREIS Dallas) overflow Anthropic's 200K context during market-data validation, and the constraint that fixes it.
---

# Market-data validator 200K-context overflow

`runValidation` in `src/lib/fact-validator.ts` fans out into N parallel facts
chunks PLUS one holistic SUMMARY+LEADS call.

- The **facts** path is token-safe: `buildChunks` + `splitChunkByBudget` split
  each property-type slice (and the big `rollups` slice) into sub-chunks that
  each fit `PER_CALL_GROUPS_CHAR_BUDGET`. For a wide NTREIS market the rollups
  slice alone splits into ~10 sub-chunks; each lands ~50–60K input tokens. Fine.
- The **SUMMARY+LEADS** call is holistic and **cannot be chunked** — it
  serializes the WHOLE table via `summarySerializeTable -> serializeTable(...,
  charBudget)`. That funnels into `selectGroupsForSerialization`.

**The trap:** `selectGroupsForSerialization` always keeps ALL rollups, then
escalates a sample-size threshold on the *segmented* groups to fit budget. For
an ultra-wide market the rollups ALONE exceed the budget (NTREIS Dallas has
~1,800 per-neighbourhood "overall" rollups — neighbourhood overalls have
propertyType=null so they classify as rollups). The escalation loop can never
get under budget, so it falls to the "last resort = rollups only" branch — and
that branch historically returned ALL rollups WITHOUT enforcing charBudget.
~1,827 rollups × ~550 chars ≈ 1M chars ≈ 486K tokens → callValidator's strict
invariant throws `Input too large for 200K context: inputTokens=486102,
remaining=-290102` and the whole upload fails.

**Rule / fix:** the last-resort branch must deterministically bound rollups to
`charBudget` (keep citywide anchors first, then per-neighbourhood overalls by
descending sampleSize, greedy-pack until budget hit). Any future change to a
whole-table serialization path (anything that passes ALL `table.groups` to
`selectGroupsForSerialization`) must preserve this hard cap.

**Why:** the summary call is the only unsplittable call, so it is the single
place where an unbounded GROUPS block silently re-introduces the overflow even
after the facts-chunking fix is in place. The facts fix does NOT cover it.

**How to apply:** when debugging "still overflows after chunking," check the
SUMMARY+LEADS call, not the facts chunks. Telemetry: `[runValidation] firing
summary+leads msgLen=...` and the `inputTokens=...` in the thrown error. Diagnose
from the deployment logs (Phil/NTREIS run on the deployed app, not dev).

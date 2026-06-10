---
name: KB merge dry-run timeout on wide vocabs
description: Why "Could not compute a cleanup." appears and the sequential-LLM-batch root cause behind it
---

The KB "Clean up & merge areas" **dry-run** (compute proposal) can fail on
large-vocab members with the UI error **"Could not compute a cleanup."**

**Diagnostic tell:** that exact string is the *client fallback* in
`KbMergeControl.tsx` `computeFreshRun` (`data.error || "Could not compute a
cleanup."`). The dry-run route's own caught 500 returns a different message
("Could not compute a merge proposal. Please try again."). So seeing the
fallback string means `res.json()` got **no JSON body** → the response was a
**bodyless gateway timeout / function kill**, NOT the route's handled error.
Use this to distinguish "compute threw" from "compute timed out".

**Root cause (the timeout):** the fuzzy near-duplicate pass batches names
(`FUZZY_BATCH_SIZE=120`) and historically `await`ed each Haiku call inside a
plain `for` loop — strictly sequential. A wide market (e.g. ~4,600 deterministic
display names → ~40 batches) ran ~234s+, over the request budget.

**Why it's safe to parallelize:** each batch only de-dupes its own names
(`known` set guards hallucinated cross-batch names), so batches are independent.
`runFuzzyPass` already treats a failed batch as non-fatal (deterministic stage
stands). Fix = bounded concurrency (`FUZZY_CONCURRENCY`, waves of `Promise.all`).
Measured: ~234s → ~93s for ~4,079 displays. Keep concurrency modest (≈6) — the
pass silently drops a batch's proposals on a 429, so over-parallelizing degrades
merge quality without erroring.

**Still open (separate path):** the **apply** path (`applyMergeRun`,
re-aggregate every upload + relabel facts) is also a single in-request operation
and times out on a member's first massive backlog merge (it's what stranded
Phil's run in APPLYING). It's idempotent/resumable; the durable fix is to move
apply onto the background worker queue. Incremental applies after a single new
upload are small and fit the request window.

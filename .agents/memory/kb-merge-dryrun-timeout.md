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

**The apply path (`applyMergeRun`, re-aggregate every upload + relabel facts)**
is also a single in-request operation and outlasts the browser/proxy on a
member's first massive backlog merge (≈27 min for a 14-upload, ~13K-fact backlog).
It's idempotent/resumable (CAS DRY_RUN→APPLYING, `STALE_APPLYING_MS=5min`
reclaim), so the server keeps finishing after the browser gives up — the run DOES
reach APPLIED even though the member saw a "failure". Incremental applies after a
single new upload are small and fit the request window.

**UX consequence + the classification fix:** because the server finishes after
the browser times out, a member who re-clicks "apply" hits the now-APPLIED run
and the route returns 400 `"Merge run is APPLIED, cannot apply"`. The OLD client
showed that as a scary red error. `KbMergeControl.tsx` `applyRun` must now
*classify* the apply response, never blindly throw: `/APPLIED, cannot apply/i` →
success ("already cleaned up"); `/already being applied/i` + bodyless-timeout
(`res.json().catch(()=>null)` → `!data`) + `fetch` network-throw → **info**
("still finishing in the background, refresh shortly"), NOT error; only a genuine
actionable failure stays a red toast. Each non-error branch calls `loadLatest()`
so the existing APPLYING/APPLIED indicators reconcile on refresh.

**Still open — the real fix:** moving apply onto the durable background worker
queue (pg-boss; worker is alive/healthy in prod) so the request returns
immediately and the heavy work never rides the HTTP request. Requires the
established staged-rollout ops: redeploy the Reserved VM worker with a new
apply handler + enable the `durable_job_queue` flag. Gate it like the other
`dispatch*` helpers (flag OFF → synchronous fallback = today's behavior) so it's
zero-regression until activated.

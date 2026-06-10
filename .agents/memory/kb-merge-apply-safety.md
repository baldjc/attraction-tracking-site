---
name: KB merge apply-path safety
description: Why applyMergeRun uses a CAS claim + APPLYING state instead of a plain DRY_RUN→APPLIED flip.
---

# KB merge apply must be atomic, fail-safe, and resumable

`applyMergeRun()` (src/lib/kb-merge/merge-run.ts) is the only path that mutates the
knowledge base. It must not be a naive read-then-write that flips `DRY_RUN → APPLIED`.

**Rule:** claim the run with a conditional UPDATE (CAS) `DRY_RUN → APPLYING`, do the
heavy re-aggregation, and only flip `APPLYING → APPLIED` if *every* upload
re-aggregated. Any per-upload failure must throw and leave the run `APPLYING` (never
APPLIED). A *stale* APPLYING (no `updatedAt` heartbeat for ~5 min) may be re-claimed
so a member can retry.

**Why:**
- Two concurrent applies (double-click, or Jarvis + UI racing) could both pass a
  plain `status === "DRY_RUN"` check and run the heavy mutation twice → mixed
  old/new aggregates. The CAS makes only one win.
- Swallowing per-upload re-aggregation errors but still marking APPLIED leaves
  mixed aggregates while audit state lies "fully applied". Treat partial as failure.

**How to apply:**
- Enum `MergeRunStatus` must include `APPLYING` and `MergeRun` must have
  `updatedAt @updatedAt` (the lease heartbeat). Changing the apply flow requires both.
- Resume is safe ONLY because every downstream step is idempotent: canonical
  upserts, `updateMany` relabels, and per-upload `persistAggregatedMetrics`
  (delete+recreate). If you add a non-idempotent step to apply, the stale-reclaim
  resume becomes unsafe — gate it or make it idempotent.
- `discardMergeRun` intentionally only accepts DRY_RUN; an APPLYING run is mid-apply
  and must not be discardable.

## Durable (background-worker) apply variant

apply can be handed to the pg-boss worker (gated by `durable_job_queue`); the
in-request path is the always-correct fallback. Two non-obvious constraints fall
out of moving a ~30-min job off-request:

- **The run — not the job payload — is the source of truth for the member's
  review-queue selection.** The job is enqueued with `singletonKey = mergeRunId`,
  so a second apply click (a *different* selection) before the worker claims is
  silently DEDUPED and its payload dropped. Fix: fold the selection onto the run
  (`foldReviewSelectionsIntoRun`, DRY_RUN-only, idempotent, shares
  `persistFoldedReport` with the in-apply fold so the paths can't drift) BEFORE
  enqueue, then enqueue with an EMPTY selection. The worker reproduces the plan
  from the persisted report. **Why:** anything carried only in a deduped job
  payload is lost; persist intent before handing off.
- **A long apply must renew its APPLYING lease.** The stale-reclaim window is ~5
  min but a first big backlog runs ~30 min on the worker; without renewal a live
  apply looks crashed and a concurrent trigger reclaims + double-runs the heavy
  mutation. Bump `updatedAt` (`updateMany` status `APPLYING→APPLYING`, status-
  guarded so it can't resurrect a run another path moved off APPLYING) every ~60s
  inside the re-aggregation loop. **Why:** the reclaim heuristic assumes a frozen
  `updatedAt` == dead holder; a living long job must keep proving it's alive.

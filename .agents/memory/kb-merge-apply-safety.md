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

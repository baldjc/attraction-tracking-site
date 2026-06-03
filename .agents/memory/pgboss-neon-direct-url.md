---
name: pg-boss on Neon needs a direct (non-pooled) URL
description: Why the durable job queue can't use the pooled DATABASE_URL, and the dispatch never-throw contract.
---

pg-boss relies on Postgres LISTEN/NOTIFY + session advisory locks. Neon's
transaction-mode pooled host (the `-pooler` segment in DATABASE_URL) does NOT
support those, so the queue must connect to a **direct** Postgres URL.

**Rule:** the queue resolves its connection from `QUEUE_DATABASE_URL` /
`DIRECT_DATABASE_URL` if set, otherwise derives one from `DATABASE_URL` by
stripping the `-pooler` host segment and dropping `pgbouncer`/`channel_binding`.
**Why:** using the pooled URL silently breaks job pickup (workers never get
NOTIFY) even though `boss.send()` appears to succeed.
**How to apply:** any new queue/boss instance must go through
`getQueueConnectionString()` in `src/lib/job-queue.ts`, never raw `DATABASE_URL`.

**Dispatch never-throw contract:** the dispatch helpers
(dispatchValidation/CoachRun/GlanceTest) must NEVER throw. Callers claim rows
(e.g. status='validating') *before* dispatching, so a thrown enqueue error would
strand the claimed row. On any flag-read or enqueue failure they fall back to the
legacy in-process path. Keep this invariant if adding new dispatchers.

**pg-boss v10 gotchas:** `createQueue` must run before send/work
(`ensureQueues`); the `work` handler receives an **array** of jobs, not one;
enqueue boss uses `supervise:false`, the worker uses `supervise:true` (single
maintenance owner). Gated by the `durable_job_queue` flag (default OFF = legacy
path, zero behavior change).

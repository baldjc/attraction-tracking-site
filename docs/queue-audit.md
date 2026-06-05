# Durable Job Queue Audit

**Scope:** the background-work path — what runs out-of-band, how it's enqueued
and drained, where it can lose or double work, and what to watch operationally.

## Architecture (as built)

- **Transport:** pg-boss on the existing Postgres (`src/lib/job-queue.ts`),
  drained by an always-on Reserved VM worker (`scripts/worker.ts` →
  `startWorker()` in `src/lib/job-worker.ts`).
- **Why pg-boss + Postgres** (not BullMQ/Redis): the app already runs on Neon
  Postgres, so a Postgres-backed queue adds durability without a new service.
- **Why this replaced fire-and-forget:** the old in-process paths
  (`validateUploadAsync`, `executeCoachRun`, `runGlanceTestForChannel`) were
  Promise chains that died whenever an autoscale instance was torn down
  mid-flight. Enqueued jobs survive a redeploy.
- **Feature gate:** `durable_job_queue` flag. OFF → legacy in-process path; no
  jobs are enqueued, so nothing is lost while idle. Supports
  `{ enabled, allowedUserIds }` for staged rollout.

### Queues & payloads (`job-queue.ts`)

| Queue constant | Payload | Business fn (worker) |
|---|---|---|
| `validate-upload` | `{ uploadId, userId }` | `runValidation` / `markUploadFailed` |
| `reviewer-coach-run` | `{ runId }` | `executeCoachRun` |
| `glance-test` | `{ channelRef, runBy }` | `runGlanceTestForChannel` |

`enqueue*` helpers wrap `boss.send`; `ensureQueues` creates them; `ALL_QUEUES`
is the canonical list used by the worker and health depth-probe.

### Connection (the critical gotcha)

pg-boss needs a **DIRECT (session-mode)** Postgres connection — it uses
LISTEN/NOTIFY, advisory locks, and prepared statements that Neon's
transaction-mode pooler (`-pooler` host) **does not support**.
`getQueueConnectionString()` resolves it in order:

1. explicit `QUEUE_DATABASE_URL` / `DIRECT_DATABASE_URL` (used as-is), else
2. derive from `NEON_DATABASE_URL` / `DATABASE_URL` by stripping the `-pooler`
   host segment, dropping `pgbouncer` + `channel_binding` params (the latter
   trips node-postgres SCRAM against Neon), and forcing `sslmode=require`.

**Risk:** if the derivation is wrong for a non-Neon provider, set
`QUEUE_DATABASE_URL` explicitly. (Memory: *pg-boss on Neon needs direct URL*.)

## Failure & delivery model

- **Business errors are caught, persisted, and the job returns normally** so
  pg-boss marks it complete — **no auto-retry, no double AI spend**. The
  route-level retry budget (`retryCount`) stays authoritative. (For
  market-data validation this matters: each run fans out to ~5 Anthropic calls,
  so an automatic retry would re-bill the whole fan-out.)
- **The only trigger for a pg-boss retry is genuine process death:** a job left
  `active` when the worker dies expires and is re-fetched (`validate-upload` has
  `retryLimit 2`). That is exactly the durability win over fire-and-forget.
- **At-least-once semantics on crash** ⇒ handlers should be idempotent. Memory
  flags this for persistence (*Fact-validator persistence & tx budget* — keep
  bulk writes out of interactive transactions, make persist idempotent, never
  double-charge persistence-only retries). **Audit item:** confirm each handler
  is safe to re-run after a mid-flight crash.

## Concurrency & resource limits

- `boss.work(..., { batchSize })` caps in-flight jobs **per queue** on the
  single Reserved VM.
- `QUEUE_VALIDATE_CONCURRENCY` (default 2) bounds concurrent market-data
  validations (each ~5 Anthropic calls). `QUEUE_WORKER_MAX_CONNECTIONS`
  (default 5) sizes the worker pg pool.
- **Risk:** validation concurrency × fan-out × per-call output drives both AI
  spend and pg-pool pressure. Memory: *Offline validator runner* — large
  concurrent streams can OOM-kill a run silently; keep concurrency conservative.

## Observability / health

- Worker writes a heartbeat to the `queue_health` AppSetting every 30s
  (`writeHealth`): `lastHeartbeatAt`, `lastJobCompletedAt`, `workerPid`,
  per-queue depth (`getQueueSize`, `-1` on probe error), rolling recent
  outcomes (cap 50), processed/failed counts.
- Admins read it at `GET /api/admin/queue-health`.
- **Liveness gate (must-follow):** never flip `durable_job_queue` ON while the
  `queue_health` heartbeat is stale — there'd be no drainer and jobs would
  strand. (Memory: *Durable queue worker liveness gate*.) A single global
  `DATABASE_URL` means a dev shell reads the same DB prod does — confirm which
  environment a stale heartbeat belongs to before acting.

## Operational runbook

- **Web app:** autoscale, `npm run start`. **Worker:** a *second* deployment of
  this repl, target **Reserved VM**, run command `npm run worker`, same env +
  secrets as the web app.
- **Worker transitive deps:** Next bundles deps, but the `tsx` worker does raw
  Node resolution — worker-only transitive deps (e.g. `whatwg-url`) must be
  **direct** dependencies or prod throws "Cannot find module". (Memory:
  *Worker (tsx) transitive deps*.)
- **Dispatch must never throw:** enqueue helpers in request paths must not throw
  on a queue hiccup, or claimed DB rows strand in an in-progress state.
  (Memory: *pg-boss on Neon needs direct URL* — dispatch resilience.)

## Open audit items

1. Verify idempotency of all three handlers under crash-replay (at-least-once).
2. Confirm `QUEUE_DATABASE_URL` is set (or derivation verified) in **prod**.
3. Confirm the Reserved VM worker deployment exists and its heartbeat is fresh
   **before** enabling `durable_job_queue` for any user.
4. Re-check that no enqueue call sits inside an interactive Prisma transaction
   (P2028 risk + strand-on-throw).

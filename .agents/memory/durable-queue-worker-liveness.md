---
name: Durable queue worker liveness gate
description: How to confirm a worker is actually draining before enabling durable_job_queue for anyone.
---

# Never flip `durable_job_queue` ON while the heartbeat is stale

The authoritative "is a worker alive?" signal is the freshness of the `queue_health`
AppSetting row (the worker rewrites it every ~30s via Prisma). `workerOnline` in
`/api/admin/queue-health` is just `now - lastHeartbeatAt < 90s`.

**Rule:** before enabling `durable_job_queue` (globally or via `{enabled,allowedUserIds}`),
read `queue_health` directly and confirm `lastHeartbeatAt` is < ~60s old AND it advances
across two reads ~35s apart. A frozen heartbeat = no drainer, even if the deployment shows
"running".

**Why:** with the flag ON, background work is enqueued to pg-boss. If nothing is draining,
jobs sit forever (the exact stranding failure the durable queue was meant to prevent).

**How to apply:**
- `DATABASE_URL` is a single **global secret** (no dev/prod/QUEUE override visible via
  viewEnvVars), so the dev shell, the deployed web app, and the Reserved VM worker all point
  at the **same Neon `neondb`**. That means the heartbeat you read from the dev shell IS the
  one prod reads — a stale read here means prod is stale too. (If a deployment-scoped
  DATABASE_URL override were ever added, this stops being true — re-verify topology first.)
- Heartbeat query (value is `text`, cast to jsonb):
  `SELECT (value::jsonb)->>'lastHeartbeatAt', (value::jsonb)->>'workerPid' FROM app_settings WHERE key='queue_health';`
- A heartbeat that shows `workerStartedAt ≈ lastHeartbeatAt` (one beat then frozen) with
  `jobsProcessed=0` means the worker started, wrote its first beat, then crashed/lost the DB
  connection — investigate the VM, don't flip.
- Phil (first rollout user) = `philm@martinht.com`. The flip is a new object-form flag:
  `durable_job_queue = { enabled: false, allowedUserIds: [<philId>] }` (enabled:false +
  allowlist = on for Phil only). The admin PUT route validates every id against `users`.

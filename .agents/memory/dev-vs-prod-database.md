---
name: Dev vs prod database
description: This repl's dev and prod share ONE external Neon DB via global secrets; there is no separate Replit-managed prod DB. How to confirm the target before writing real user data.
---

# Dev and prod share ONE external Neon DB

`NEON_DATABASE_URL` and `DATABASE_URL` are **global secrets** (not env-scoped),
both pointing at the same external Neon instance
(`ep-odd-dream-amrl8l3f-pooler.c-5.us-east-1.aws.neon.tech`). `prisma.ts` prefers
`NEON_DATABASE_URL`. There is **no Replit-managed production database** — the
`database` skill's `environment:"production"` reads fail with "does not have a
production Neon database", and its dev path can't even connect (psql
`invalid channel_binding value`).

Because the connection secrets are global and `.env.local` does NOT override them,
**both the dev Next app and the deployed app talk to the same Neon DB** — it holds
the real member data (73 ContentPlans, 25 with Drive folders, real member emails).
A backfill run via `npx tsx` from this shell therefore writes to the SAME database
production reads.

**Why:** an earlier note claimed dev resolved to a separate managed dev `neondb`
at host `127.0.0.1` with only dev data. That is no longer true (and was likely a
prior config). Don't assume isolation — a write from this environment hits prod.

**How to apply:**
- Before trusting a write, log `SELECT current_database(), inet_server_addr()`.
  Expect `db=neondb`; `inet_server_addr()` shows `::1/128` (the Neon pooler
  loopback) even though the underlying host is the Neon cloud — confirm the host
  from `NEON_DATABASE_URL`/`DATABASE_URL`, not from `inet_server_addr()`.
- The agent `executeSql` tool CANNOT reach this DB (channel_binding error) — use
  Prisma via `npx tsx` instead.
- For production runtime evidence use `fetch_deployment_logs`.

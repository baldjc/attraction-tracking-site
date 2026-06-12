---
name: Turbopack dev stale .next cache 404s route handlers
description: After a merge/reconciliation, App Router route handlers fall through to /_not-found (404) while pages + catch-all routes still work; only a full .next wipe with the server stopped fixes it.
---

# Symptom
In dev (Next 16 + Turbopack), a SUBSET — or eventually ALL — `/api/**/route.ts`
handlers return **404** (Next built-in `/_not-found`, route table maps the path
to `/_not-found`) even though:
- the route file is unchanged and compiles with **no error in the log**,
- the route IS present in `.next/dev/server/app-paths-manifest.json` (written by
  on-demand probes),
- **pages still render 200** and the **catch-all** `/api/auth/[...nextauth]`
  still works.

A misleading "depth" correlation can appear (e.g. `/api/member/*` works but
`/api/member/*/*` 404s) — this is just an artifact of which routes got cleanly
compiled vs not; it is NOT a real depth rule. Two files with identical imports,
one registering and one not, proves it is the cache, not the code.

# Root cause
A stale/corrupt **`.next/dev` Turbopack cache** (typically after a task merge +
post-merge reconciliation that runs `npm install` / `prisma generate`). Turbopack
doesn't invalidate it, so handlers write their manifest on demand but never
register in the live in-memory router → fall through to 404. A DB/migration
drift would yield **500**, not 404 — so a 404 cluster is never the migration.

# Fix (order matters)
1. **Stop the dev server** (`fuser -k 5000/tcp`) — do not delete while it runs.
2. `rm -rf .next`
3. Restart the workflow.
A **plain restart that reuses `.next` REGRESSES** it (router comes up empty,
everything 404s). Verify with `curl` expecting 401 (api unauth) / 307 (pages) /
405 (POST-only like `/api/jarvis`) — **never 404**.

**How to apply:** whenever member/api routes 404 after a merge/restart in dev,
do the stopped-server `.next` wipe first; don't chase the migration or per-route
code. The deploy build script already wipes `.next/dev .next/cache`; dev does not.

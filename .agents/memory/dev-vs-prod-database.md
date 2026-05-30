---
name: Dev vs prod database
description: This repl's dev database is NOT the production database; how to reach each when debugging real user data.
---

# Dev DB != Prod DB

This repl's dev `DATABASE_URL` resolves to a managed dev `neondb`
(`current_database()=neondb`, host 127.0.0.1). It contains only a small set of
dev uploads and does NOT contain real members' production data.

Production (the deployed app) uses a **separate** database with the real
member data (e.g. a wide-market member's NTREIS market-data uploads). Querying
the dev DB by a production userId / uploadId returns 0 rows even though the
record clearly exists in production (visible in deployment logs).

**Why:** several times a "reset a member's locked row" style task assumed the
local DATABASE_URL pointed at production. It does not (at least currently). A
write run from the dev environment lands in the dev DB and does nothing to
production.

**How to apply:**
- For production runtime evidence use `fetch_deployment_logs` (authoritative —
  those logs are from prod).
- To read/modify production rows you need the production DATABASE_URL, not the
  dev env var. Confirm which DB you're on first with
  `SELECT current_database(), inet_server_addr()` before trusting a write.
- The `database` skill supports read-only queries against the production DB
  (`environment: "production"`) — prefer that for prod reads.

# Production DB Backup & Rollback Runbook

**Scope:** Attraction by Video production Postgres. This is the copy-pasteable
procedure for taking a verified backup, restoring it into an isolated clone to
prove it works, and rolling back in an incident. It also documents the launch
kill-switch.

> **HARD RULE:** Test restores go into a **throwaway local clone only**. Never
> run a restore, `DROP`, or `TRUNCATE` against the live production database
> except in a declared disaster recovery (see §5), and even then prefer Neon's
> native point-in-time restore first.

---

## 0. Environment facts

- **Provider:** Neon (Replit-managed Postgres). Server **PostgreSQL 17.x**,
  database `neondb`, region `us-east-1`.
- **`DATABASE_URL`** in this workspace points at **production** (real member
  data). Treat every command that touches it as production-touching.
- The app connects through Neon's **pooled** host (`...-pooler...`). Logical
  dump/restore and `pg-boss` need a **direct (non-pooled)** URL — the pooler
  does not support the required protocol features.
- Client tools must be **PG 17** (server is 17.x). If `pg_dump --version` is not
  17, install them: use the package manager to add `postgresql_17`, then find
  the binaries with `which -a pg_dump pg_restore psql` (or look under the
  `postgresql-17*/bin` nix path it prints).

### Derive the DIRECT (non-pooled) URL — never echo it

```bash
export PGURL="$(node -e '
  const u = new URL(process.env.DATABASE_URL);
  u.hostname = u.hostname.replace(/-pooler/, "");      // pooled -> direct
  u.searchParams.delete("pgbouncer");
  u.searchParams.delete("channel_binding");
  if (!u.searchParams.get("sslmode")) u.searchParams.set("sslmode", "require");
  process.stdout.write(u.toString());
')"
# sanity check WITHOUT printing the secret:
psql "$PGURL" -At -c "select current_database(), version();"
```

---

## 1. Take a verified backup (off-instance)

```bash
export TS="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p backups            # backups/ is .gitignored — dumps never get committed
export PGURL="$(node -e 'const u=new URL(process.env.DATABASE_URL);u.hostname=u.hostname.replace(/-pooler/,"");u.searchParams.delete("pgbouncer");u.searchParams.delete("channel_binding");if(!u.searchParams.get("sslmode"))u.searchParams.set("sslmode","require");process.stdout.write(u.toString())')"

# Compressed custom-format logical dump (schema + data)
pg_dump "$PGURL" -Fc --no-owner --no-privileges -f "backups/neondb_${TS}.dump"
sha256sum "backups/neondb_${TS}.dump" | tee "backups/neondb_${TS}.dump.sha256"
ls -la "backups/neondb_${TS}.dump"
```

### Record the baseline counts (the reconciliation target)

```bash
psql "$PGURL" -At -F'|' -c "
SELECT 'users', count(*) FROM users
UNION ALL SELECT 'content_plans', count(*) FROM content_plans
UNION ALL SELECT 'content_plans_live', count(*) FROM content_plans WHERE \"deletedAt\" IS NULL
UNION ALL SELECT 'saved_scripts_legacy', count(*) FROM saved_scripts
UNION ALL SELECT 'script_drafts', count(*) FROM script_drafts
UNION ALL SELECT 'script_drafts_linked', count(*) FROM script_drafts WHERE \"planId\" IS NOT NULL
UNION ALL SELECT 'market_data_uploads', count(*) FROM market_data_uploads
UNION ALL SELECT 'market_facts', count(*) FROM market_facts
UNION ALL SELECT 'aggregated_metrics', count(*) FROM aggregated_metrics
UNION ALL SELECT 'market_story_leads', count(*) FROM market_story_leads
UNION ALL SELECT 'market_configs', count(*) FROM market_configs
UNION ALL SELECT 'market_configs_with_voice', count(*) FROM market_configs WHERE \"voiceGuide\" IS NOT NULL
UNION ALL SELECT 'cm_threads', count(*) FROM content_manager_threads
UNION ALL SELECT 'cm_messages', count(*) FROM content_manager_messages
UNION ALL SELECT 'users_with_avatar', count(*) FROM users WHERE \"avatarProfile\" IS NOT NULL
UNION ALL SELECT 'plan_artifacts', count(*) FROM plan_artifacts
ORDER BY 1;" | tee "backups/baseline_${TS}.txt"
```

### Push the dump OFF-instance (Replit Object Storage)

The local `backups/` directory is ephemeral. Persist the dump to Object Storage
(bucket = `DEFAULT_OBJECT_STORAGE_BUCKET_ID`). Run from the project root so
`@replit/object-storage` resolves:

```bash
TS="$TS" node -e '
const fs=require("fs");const {Client}=require("@replit/object-storage");
(async()=>{const c=new Client({bucketId:process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID});
const TS=process.env.TS;const buf=fs.readFileSync(`backups/neondb_${TS}.dump`);
console.log(JSON.stringify(await c.uploadFromBytes(`db-backups/neondb_${TS}.dump`,buf)),buf.length);
})().catch(e=>{console.error(e.message);process.exit(1);});'
```

Backups live under the `db-backups/` key prefix. List them:

```bash
node -e 'const {Client}=require("@replit/object-storage");(async()=>{const c=new Client({bucketId:process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID});const r=await c.list();console.log((r.ok?r.value:[]).map(o=>o.name||o).filter(n=>String(n).startsWith("db-backups/")));})();'
```

To pull a dump back down for a restore:

```bash
node -e 'const fs=require("fs");const {Client}=require("@replit/object-storage");(async()=>{const c=new Client({bucketId:process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID});const k=process.argv[1];const r=await c.downloadAsBytes(k);if(!r.ok)throw new Error(JSON.stringify(r.error));fs.writeFileSync(k.split("/").pop(),r.value[0]??r.value);console.log("wrote",k);})().catch(e=>{console.error(e.message);process.exit(1);});' db-backups/neondb_<TS>.dump
```

---

## 2. TEST the restore into a throwaway clone (NOT prod)

This proves the dump is restorable and reconciles to the baseline. It runs an
**isolated local Postgres 17 cluster** — it never connects to Neon.

> Do the whole block in **one shell run** — the local server is a child process
> and is reaped between separate tool calls.

```bash
PG17BIN="$(dirname "$(which pg_restore)")"   # must be PG 17
DUMP="backups/neondb_<TS>.dump"              # <-- set the dump you are testing

rm -rf /tmp/clonepg /tmp/clonepg.log
"$PG17BIN/initdb" -D /tmp/clonepg -U runner --no-locale -E UTF8 >/tmp/initdb.log 2>&1
"$PG17BIN/pg_ctl" -D /tmp/clonepg -o "-p 55432 -k /tmp -c listen_addresses=127.0.0.1" -l /tmp/clonepg.log -w start
"$PG17BIN/createdb" -h 127.0.0.1 -p 55432 -U runner clone_restore

SECONDS=0
"$PG17BIN/pg_restore" -h 127.0.0.1 -p 55432 -U runner -d clone_restore --no-owner --no-privileges "$DUMP" 2>/tmp/restore.err
echo "restore exit=$? in ${SECONDS}s ; SQL errors:"; grep -iE "error|fatal" /tmp/restore.err || echo "(none — clean)"

# Re-run the SAME count query from §1 against the clone and diff vs baseline:
"$PG17BIN/psql" -h 127.0.0.1 -p 55432 -U runner -d clone_restore -At -F'|' -c "SELECT 'users',count(*) FROM users UNION ALL SELECT 'content_plans',count(*) FROM content_plans UNION ALL SELECT 'market_facts',count(*) FROM market_facts UNION ALL SELECT 'aggregated_metrics',count(*) FROM aggregated_metrics;"

"$PG17BIN/pg_ctl" -D /tmp/clonepg -w stop   # tear the clone down when done
```

**Pass criteria:** `restore exit=0`, no SQL errors, ~100 public tables, and the
clone counts match `backups/baseline_<TS>.txt` exactly. (Last verified
restore: **8 s**, 0 errors, all 18 launch-critical metrics matched, and the real
Prisma client booted against the clone.)

---

## 3. Kill-switch (stop a bad rollout instantly — no restore needed)

Two independent, **non-destructive** levers. Flipping a flag only changes the
`feature_visibility` AppSetting row — it never deletes data.

### 3a. Planner / migration kill-switch — `planner_kill_switch`

Object-form flag. When active for a user, **new Content-Plan creation is
refused** (HTTP 423) — which also halts the member-data migration, since the
migration moves work in by creating plans. Existing plans stay fully readable.

The 423 guard is wired into **every** plan-creation path (verified — all
`contentPlan.create` callsites are covered):

- `POST /api/member/content-plans` (manual create) — by session member
- `POST /api/member/content-planner/wizard/use-as-video` (Story Lead → plan) — by session member
- `POST /api/member/content-planner/wizard/save-idea` (idea card → plan) — by session member
- `POST /api/admin/members/[id]/content-plans` (admin/migration create for a member) — by **target** member id

Reads (`GET`) and edits to existing plans are intentionally left open so members
keep full access to their data while creation is paused.

- **Per-member halt:** set `{ "enabled": false, "allowedUserIds": ["<userId>"] }`
- **Global halt (all members):** set `{ "enabled": true }`
- **Resume:** set `{ "enabled": false, "allowedUserIds": [] }`

Flip it via the admin API (admin session required):

```bash
# GLOBAL halt
curl -sS -X PUT "$NEXTAUTH_URL/api/admin/feature-visibility" \
  -H 'content-type: application/json' -b "<admin-session-cookie>" \
  -d '{"key":"planner_kill_switch","value":{"enabled":true,"allowedUserIds":[]}}'

# PER-MEMBER halt
curl -sS -X PUT "$NEXTAUTH_URL/api/admin/feature-visibility" \
  -H 'content-type: application/json' -b "<admin-session-cookie>" \
  -d '{"key":"planner_kill_switch","value":{"enabled":false,"allowedUserIds":["<userId>"]}}'
```

Emergency fallback if the app/admin UI is down — write the flag directly (still
just a config update, non-destructive):

```bash
export PGURL="$(node -e 'const u=new URL(process.env.DATABASE_URL);u.hostname=u.hostname.replace(/-pooler/,"");u.searchParams.delete("pgbouncer");u.searchParams.delete("channel_binding");if(!u.searchParams.get("sslmode"))u.searchParams.set("sslmode","require");process.stdout.write(u.toString())')"
# GLOBAL halt — merges the key into the existing JSON:
psql "$PGURL" -c "UPDATE app_settings SET value = jsonb_set(value::jsonb, '{planner_kill_switch}', '{\"enabled\":true,\"allowedUserIds\":[]}'::jsonb)::text WHERE key='feature_visibility';"
```

### 3c. Market re-aggregation kill-switch — `market_reaggregation_kill_switch`

Object-form flag, **independent of `planner_kill_switch`** (separate key, so you
can freeze market re-aggregation WITHOUT blocking plan creation, and vice-versa).
When active for a user, the **destructive re-aggregation-of-existing-data**
paths are **refused (HTTP 423)** so a re-run can't delete-before-replace the
member's existing `market_facts` / `aggregated_metrics` / `market_story_leads`
(the shared store the legacy AI tools cite — this is the 6→0 Story Leads
incident). Designed for the month-long dual-run window where the legacy tools run
alongside the new planner against one shared market-data foundation.

**Caveat (intentional):** brand-new monthly uploads are **NOT** gated — a new
upload gets its own `uploadId` with no prior rows to clobber, so members can
still upload fresh market data while the switch is on. Only re-aggregation of
*existing* uploads is frozen.

The 423 guard is wired into **every** destructive re-aggregation entry point
(resolved with NO staff bypass, so an admin acting for a frozen member is frozen
too):

- `POST /api/admin/market-data/upload/[id]/revalidate` (admin re-validate) — by the upload **OWNER** id
- `POST /api/member/methodology-revalidate` (member "re-validate my last 3 months") — by session member
- `POST /api/member/knowledge-base/merge/apply` (KB merge apply — re-aggregates every upload onto canonical areas) — by session member
- `POST /api/jarvis/merge/confirm` (in-chat "Yes, clean it up" — same destructive apply) — by session member
- `POST /api/member/knowledge-base/reset` (full wipe of market data / KB stores) — by session member

Left intentionally OPEN (not gated): `POST /api/member/market-data/upload`
(brand-new uploads, per the caveat). Note: `POST /api/debug/validate` re-runs
validation on an existing upload but is a debug-only endpoint and is left
ungated — do not expose it to members during the dual-run.

- **Per-member freeze:** set `{ "enabled": false, "allowedUserIds": ["<userId>"] }`
- **Global freeze (all members):** set `{ "enabled": true }`
- **Resume:** set `{ "enabled": false, "allowedUserIds": [] }`

```bash
# GLOBAL freeze
curl -sS -X PUT "$NEXTAUTH_URL/api/admin/feature-visibility" \
  -H 'content-type: application/json' -b "<admin-session-cookie>" \
  -d '{"key":"market_reaggregation_kill_switch","value":{"enabled":true,"allowedUserIds":[]}}'

# PER-MEMBER freeze
curl -sS -X PUT "$NEXTAUTH_URL/api/admin/feature-visibility" \
  -H 'content-type: application/json' -b "<admin-session-cookie>" \
  -d '{"key":"market_reaggregation_kill_switch","value":{"enabled":false,"allowedUserIds":["<userId>"]}}'
```

Emergency fallback (app/admin UI down) — write the flag directly (non-destructive
config update; merges the key into the existing JSON):

```bash
export PGURL="$(node -e 'const u=new URL(process.env.DATABASE_URL);u.hostname=u.hostname.replace(/-pooler/,"");u.searchParams.delete("pgbouncer");u.searchParams.delete("channel_binding");if(!u.searchParams.get("sslmode"))u.searchParams.set("sslmode","require");process.stdout.write(u.toString())')"
psql "$PGURL" -c "UPDATE app_settings SET value = jsonb_set(value::jsonb, '{market_reaggregation_kill_switch}', '{\"enabled\":true,\"allowedUserIds\":[]}'::jsonb)::text WHERE key='feature_visibility';"
```

### 3b. Migration queue kill-switch — `durable_job_queue`

The background migration/queue path is independently gated by the object-form
`durable_job_queue` flag (same `{ enabled, allowedUserIds }` shape). Setting it
to `{ "enabled": false, "allowedUserIds": [] }` reverts to the proven in-request
path — no jobs are enqueued and nothing is stranded. (Global planner *UI* can
also be hidden with the boolean `content_calendar=false`, but that is global-only
and does not block writes the way `planner_kill_switch` does.)

---

## 4. Rollback decision tree

1. **Bad rollout / migration misbehaving, data still intact** → use the
   **kill-switch** (§3). No restore. This is the default first move.
2. **Recent logical corruption / bad write, need a point in time** → use
   **Neon's native point-in-time restore / branching** from the Neon console
   (Replit Database pane). This is faster and safer than a logical restore and
   keeps you on Neon's managed infra. Restore to a **new branch** first, verify,
   then cut over.
3. **Neon PITR window exhausted / catastrophic loss** → last resort, restore the
   off-instance logical dump (§5).

---

## 5. DISASTER RECOVERY — restore the logical dump to production (last resort)

> Only in a declared disaster, with a fresh pre-restore safety dump in hand.
> Prefer restoring into a **new Neon branch/database** and cutting `DATABASE_URL`
> over to it, rather than overwriting the live database in place.

1. Take a **fresh safety dump of current prod first** (§1) — even if it's
   damaged, you want it before you change anything.
2. Provision a clean target (new Neon branch or empty database). Get its
   **direct** URL into `$TARGET`.
3. Restore:
   ```bash
   pg_restore "$TARGET" --no-owner --no-privileges --clean --if-exists backups/neondb_<TS>.dump
   ```
4. Reconcile counts (§1 query) against the dump's `baseline_<TS>.txt`.
5. Boot the app against the restored target, smoke-test login + planner + market
   data, then repoint `DATABASE_URL` and redeploy.

---

## Appendix — what a good backup set looks like

For each timestamp `<TS>` you should have, in Object Storage under `db-backups/`:

- `neondb_<TS>.dump` — the compressed logical dump
- `neondb_<TS>.manifest.json` — sha256 + baseline counts + clone reconciliation

…and locally (ephemeral, `.gitignored`) under `backups/`:

- `neondb_<TS>.dump`, `neondb_<TS>.dump.sha256`
- `baseline_<TS>.txt`, `clone_counts_<TS>.txt`

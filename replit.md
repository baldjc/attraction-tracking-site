# Attraction by Video

A full-stack Next.js platform for YouTube channel audits, member management, link tracking, AI tools, and SEO intelligence for a real estate coaching program.

## Run & Operate

To run the application, use: `next dev -p 5000 -H 0.0.0.0`

**Durable job queue (Task #52):** Background work (market-data validation, reviewer coach runs, glance tests, **KB area cleanup "apply"**) is enqueued to **pg-boss on the existing Postgres** and drained by an **always-on Reserved VM worker** (`npm run worker` → `scripts/worker.ts`). This replaces the old in-process fire-and-forget paths that died on autoscale teardown. Gated by the `durable_job_queue` feature flag (default OFF → legacy in-process path; supports `{ enabled, allowedUserIds }` for staged rollout). **KB merge apply** additionally self-gates on worker capability: it only hands off when the `queue_health` heartbeat is fresh AND advertises the `kb-merge-apply` queue (i.e. the worker carrying that handler is deployed); otherwise it falls back to the proven in-request apply. So enabling the flag before redeploying the worker can't strand apply jobs — best practice is still to deploy the worker first, then enable the flag. The worker writes a heartbeat to the `queue_health` AppSetting; admins read it at `GET /api/admin/queue-health`. **Operate:** create a second deployment of this repl with target **Reserved VM**, run command `npm run worker` (same env/secrets as the web app). The web app stays on autoscale (`npm run start`). With the flag OFF the worker can sit idle — no jobs are enqueued, so nothing is lost.

Required environment variables:
- `DATABASE_URL`: PostgreSQL connection string
- `NEXTAUTH_SECRET`: Auth session signing
- `NEXTAUTH_URL`: App base URL
- `ANTHROPIC_API_KEY`: Claude AI key
- `YOUTUBE_API_KEY`: YouTube Data API v3 key
- `GHL_API_KEY`: GoHighLevel CRM key
- `ADMIN_EMAIL`: Admin account email
- `QUEUE_DATABASE_URL` (optional): Direct, **non-pooled** Postgres URL for the durable job queue (pg-boss). pg-boss uses LISTEN/NOTIFY + advisory locks that Neon's transaction-mode `-pooler` host does not support. If unset, `src/lib/job-queue.ts` derives a direct URL from `DATABASE_URL` by stripping the `-pooler` host segment (and dropping `pgbouncer`/`channel_binding`). Set this explicitly if the derivation is wrong for your provider. `DIRECT_DATABASE_URL` is accepted as an alias.
- `QUEUE_VALIDATE_CONCURRENCY` (optional, worker only, default `2`): max market-data validations the worker runs at once (each fans out to ~5 Anthropic calls). `QUEUE_WORKER_MAX_CONNECTIONS` (optional, default `5`): worker pg pool size.
- `DEFAULT_OBJECT_STORAGE_BUCKET_ID`: Replit Object Storage bucket (auto-set when the App Storage blueprint is provisioned; required — `src/lib/market-csv.ts` fails fast at import if missing). Used to persist market-data CSV uploads under key `market-data/<userId>/<uploadId>.csv`.
- `PRIVATE_OBJECT_DIR` / `PUBLIC_OBJECT_SEARCH_PATHS`: Auto-set by the App Storage blueprint alongside the bucket id.
- `GOOGLE_SERVICE_ACCOUNT_KEY`: Service-account JSON for Google Drive folder/file automation (`src/lib/google-drive.ts`). Absent → Drive features report `not_configured`.
- `GOOGLE_DRIVE_ROOT_FOLDER_ID`: Parent folder under which per-member → per-video folders are created. **Unified My-Drive root `1cHV_V8D2XjZL10AvXH1ipCW1eS2OM7un` in both dev and prod** — all 25 legacy folders plus new ones live in one tree. (The Shared Drive `0APclQm8wisDOUk9PVA` is no longer used as root; it remains as a harmless fallback. Folders can't be moved into a Shared Drive, so it could never host the legacy folders anyway — see Gotchas.)
- `GOOGLE_DRIVE_IMPERSONATE_EMAIL`: `jared@chamberlaingroup.ca` — domain-wide delegation **is now authorized** in the chamberlaingroup.ca Workspace for the SA client id `110691700037186776145` + `drive` scope. The SA acts as jared (a real Workspace user with storage quota), so Doc creation and file/thumbnail uploads work in My-Drive folders. jared has writer on every plan folder via Phase 3 support-email sharing, so uploads work for all members. **Must stay set** — but only because delegation is authorized; unsetting it reverts to the quota-less SA behavior, and setting it without authorization would break every Drive call (`unauthorized_client`).

## Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Database:** PostgreSQL (Prisma v7)
- **Auth:** NextAuth.js v5 (credentials provider)
- **AI:** Anthropic Claude (claude-sonnet-4-20250514)
- **YouTube:** YouTube Data API v3, `youtube-transcript`
- **UI:** Tailwind CSS, Recharts, Heroicons

## Where things live

- `prisma/schema.prisma`: Database schema definition
- `src/lib/audit-engine.ts`: Core AI audit logic and prompts
- `src/lib/ghl.ts`: GoHighLevel CRM integration
- `src/lib/youtube.ts`: YouTube API utilities
- `src/lib/feature-flags.ts`: Feature flag management
- `src/app/admin/`: Admin-specific pages and APIs
- `src/app/member/`: Member-specific pages and APIs
- `src/app/api/`: All API routes (member, admin, AI tools, analytics)

## Architecture decisions

- **AI Model Choice:** Anthropic Claude (claude-sonnet-4-20250514) is used for all AI-powered features, including audit scoring, script review, and content generation, due to its performance characteristics.
- **Weighted Audit Scoring:** A custom weighted scoring mechanism is applied to audit results, emphasizing key growth areas over general metrics to provide more actionable insights.
- **Client-side Impersonation:** An admin can impersonate a member using a cookie, enabling direct debugging and support from the admin dashboard.
- **Class-based Dark Mode:** Implemented using `html.dark` class toggled by a ThemeProvider and an anti-FOUC inline script in the root layout for seamless theme switching.
- **GHL Deduplication:** GHL member syncing includes email-based deduplication to prevent redundant CRM entries.

## Product

- **YouTube Channel Audits:** AI-powered scoring (0-10) across 16 principles, with detailed strengths, gaps, and diagnoses.
- **AI Tools Suite:** Includes Avatar Architect, Content Engine (idea generation), Title & Thumbnail Analyzer, ARC Script Builder, and Script Review.
- **Member Dashboard:** Personalized views of attraction score, campaign performance, best videos, and quick access to AI tools.
- **Admin Dashboards:** Comprehensive analytics for members, audits, AI tool usage, and member management.
- **SEO Intelligence Platform:** Multi-phase platform for client management, competitor tracking, keyword research, content ideas, and video performance analysis.
- **Content Planner:** Kanban and calendar views for managing video content creation, integrated with member tiers and editing workflows.
- **Lead Tracking & Analytics:** Comprehensive analytics on video clicks, leads, conversion funnels, and geographical distribution.

## User preferences

_Populate as you build_

## Gotchas

- **GHL Pagination:** Always use `meta.nextPageUrl` for GoHighLevel API pagination, not `startAfter`/`startAfterId`.
- **Audit Prompts:** AI audit scoring prompts are stored in the `app_settings` table and can be edited via the Admin Settings page; changes directly impact AI scoring.
- **Feature Flags:** Admins bypass all feature flags; member access is governed by `feature_visibility` in `AppSetting`.
- **Cron Jobs:** Daily YouTube channel sync is triggered via a cron job, secured by an `x-cron-secret` header.
- **Google Drive (service account + delegation — RESOLVED 2026-06-03):** The service account `abv-drive-integration@attraction-drive-integration.iam.gserviceaccount.com` now uses **domain-wide delegation**, impersonating `jared@chamberlaingroup.ca` (`GOOGLE_DRIVE_IMPERSONATE_EMAIL`). Because it acts as a real Workspace user with storage quota, folder creation, Google Doc creation, and file/thumbnail uploads **all work** in the unified My-Drive root. Existing thumbnails were backfilled from Object Storage into Drive; all 25 plan folders are shared (member + active team + support jared). **Why no Shared Drive:** Google forbids moving folders into a Shared Drive (API and UI), and the legacy raw videos are human-owned (and up to 20 GB), so the SA could relocate neither folders nor files — delegation was the only path that unblocks uploads without moving any content. Authorizing delegation: Workspace admin → Security → API controls → Manage Domain Wide Delegation → add client id `110691700037186776145` with scope `https://www.googleapis.com/auth/drive`. **Pre-delegation behavior (for reference):** a quota-less SA against a My-Drive root could create folders (zero-byte, no quota) but Doc/upload 403'd `storageQuotaExceeded` (best-effort paths swallowed → `null`).

## Pointers

- **Next.js Documentation:** [https://nextjs.org/docs](https://nextjs.org/docs)
- **Prisma Documentation:** [https://www.prisma.io/docs](https://www.prisma.io/docs)
- **NextAuth.js Documentation:** [https://next-auth.js.org/](https://next-auth.js.org/)
- **Anthropic Claude API:** [https://docs.anthropic.com/](https://docs.anthropic.com/)
- **YouTube Data API v3:** [https://developers.google.com/youtube/v3](https://developers.google.com/youtube/v3)
- **Tailwind CSS Documentation:** [https://tailwindcss.com/docs](https://tailwindcss.com/docs)
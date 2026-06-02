# Attraction by Video

A full-stack Next.js platform for YouTube channel audits, member management, link tracking, AI tools, and SEO intelligence for a real estate coaching program.

## Run & Operate

To run the application, use: `next dev -p 5000 -H 0.0.0.0`

Required environment variables:
- `DATABASE_URL`: PostgreSQL connection string
- `NEXTAUTH_SECRET`: Auth session signing
- `NEXTAUTH_URL`: App base URL
- `ANTHROPIC_API_KEY`: Claude AI key
- `YOUTUBE_API_KEY`: YouTube Data API v3 key
- `GHL_API_KEY`: GoHighLevel CRM key
- `ADMIN_EMAIL`: Admin account email
- `DEFAULT_OBJECT_STORAGE_BUCKET_ID`: Replit Object Storage bucket (auto-set when the App Storage blueprint is provisioned; required — `src/lib/market-csv.ts` fails fast at import if missing). Used to persist market-data CSV uploads under key `market-data/<userId>/<uploadId>.csv`.
- `PRIVATE_OBJECT_DIR` / `PUBLIC_OBJECT_SEARCH_PATHS`: Auto-set by the App Storage blueprint alongside the bucket id.
- `GOOGLE_SERVICE_ACCOUNT_KEY`: Service-account JSON for Google Drive folder/file automation (`src/lib/google-drive.ts`). Absent → Drive features report `not_configured`.
- `GOOGLE_DRIVE_ROOT_FOLDER_ID`: Parent folder under which per-member → per-video folders are created. Currently a My Drive folder; should become a Shared Drive id (starts `0A…`) to restore Doc/upload support (see Gotchas).
- `GOOGLE_DRIVE_IMPERSONATE_EMAIL` (optional): Workspace user to impersonate via domain-wide delegation. **Intentionally unset** — delegation was never authorized in Workspace, so setting it makes every Drive call fail `unauthorized_client` → `auth_failed`. Only set it once delegation is authorized for the service-account client id + `drive` scope.

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
- **Google Drive (service account + quota):** The service account `abv-drive-integration@attraction-drive-integration.iam.gserviceaccount.com` operates without impersonation against the My Drive root folder. It can create **folders** (zero bytes, no quota), but **cannot create Google Docs or upload files** there — a quota-less service account can't own files in a personal My Drive (403 `storageQuotaExceeded`). So per-video folder creation works (button + status-change), while the auto "Video Research" Doc and thumbnail/text uploads degrade gracefully (swallowed → `null`, never blocking folder creation). **Full fix:** move the root to a **Shared Drive** (id starts `0A…`) with the service account added as **Content manager**, then set `GOOGLE_DRIVE_ROOT_FOLDER_ID` to it — Docs/uploads resume automatically with no impersonation. Code is already Shared-Drive ready (every call passes `supportsAllDrives`). Adding a service account to a Shared Drive can be blocked by Workspace external-sharing policy ("Sharing to email addresses without a Google account is not yet supported") — work around it with a Google Group (allow external members → add the SA → add the group to the drive) or by enabling external sharing.

## Pointers

- **Next.js Documentation:** [https://nextjs.org/docs](https://nextjs.org/docs)
- **Prisma Documentation:** [https://www.prisma.io/docs](https://www.prisma.io/docs)
- **NextAuth.js Documentation:** [https://next-auth.js.org/](https://next-auth.js.org/)
- **Anthropic Claude API:** [https://docs.anthropic.com/](https://docs.anthropic.com/)
- **YouTube Data API v3:** [https://developers.google.com/youtube/v3](https://developers.google.com/youtube/v3)
- **Tailwind CSS Documentation:** [https://tailwindcss.com/docs](https://tailwindcss.com/docs)
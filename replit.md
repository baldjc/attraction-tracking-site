# Attraction by Video — Platform Overview

## Project
Full-stack Next.js 16 platform for YouTube channel audits, GHL member sync, link tracking, and admin/member dashboards for a real estate coaching program run by Jared Chamberlain.

## Stack
- **Framework:** Next.js 16 (App Router, Turbopack)
- **Database:** PostgreSQL (via Prisma v7)
- **Auth:** NextAuth.js v5 (credentials provider)
- **AI:** Anthropic Claude claude-sonnet-4-20250514 — audit scoring engine
- **YouTube:** YouTube Data API v3 + `youtube-transcript` package
- **UI:** Tailwind CSS, Recharts, Heroicons
- **Dev server:** `next dev -p 5000 -H 0.0.0.0`

## Environment Variables Required
| Key | Purpose |
|-----|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Auth session signing |
| `NEXTAUTH_URL` | App base URL |
| `ANTHROPIC_API_KEY` | Claude AI for audit scoring |
| `YOUTUBE_API_KEY` | YouTube Data API v3 for channel/video data |
| `GHL_API_KEY` | GoHighLevel CRM sync |
| `ADMIN_EMAIL` | Admin account email |

## Admin Credentials
- Email: `jared@attractionbyvideo.com`
- Password: `fatcat222`

## GHL Config
- Location ID: `vEIiKAjpBkCDrabeDre7`
- Member tag: `"foundations - weekly coaching"`
- 22 members across 1,831 contacts
- Pagination: use `meta.nextPageUrl` (not `startAfter`/`startAfterId`)

## Color Palette
- Background: `#f1f1ef`
- Primary: `#3dc3ff`
- Alerts: `#ff0033`
- Text/Sidebar: `#1e2a38`

## Key Files
```
prisma/schema.prisma         — DB schema (User, Audit, AuditJob, AppSetting, TrackingLink, Click, etc.)
src/lib/
  ghl.ts                     — GHL sync with nextPageUrl pagination + title case normalization
  youtube.ts                 — YouTube API: channel info, playlist, transcripts
  audit-engine.ts            — Claude AI scoring + DEFAULT_SCORING_PROMPT + AuditResult types
  auth.ts                    — NextAuth config
  prisma.ts                  — Prisma client singleton

src/app/
  admin/
    members/page.tsx          — Members list with search/filter
    members/[id]/page.tsx     — Member detail: info, audit history, Run Audit with job polling, score trend, 16-principle breakdown, tracking links, coaching notes, quick actions
    audits/page.tsx           — All audits list with type filter
    audits/[auditId]/page.tsx — Full audit report: diagnosis callout, score, progress, 16-principle scorecard, videos with per-video dimension scores, what's working (rich), three biggest gaps (with current/improved examples), learning path table with priority, Q&A coaching prompts, footer. Share + Print buttons.
    qa-prep/page.tsx          — Q&A Call Prep: next Thursday date, Celebrate/Address/Common Gaps/Per-Member sections, Copy to Clipboard button
    settings/page.tsx         — AI prompt editor (editable textarea, save/reset)
  reports/
    [auditId]/page.tsx        — Shareable member-facing report (same content, accessible to member themselves or admin, no sidebar)
  member/
    scores/page.tsx           — Member dashboard: score, trend chart, 16-principle breakdown, learning path, audit history
    audits/[auditId]/page.tsx — Member-facing audit report
    script-review/page.tsx    — Script Review tool: paste script → Claude scores 16 principles → show results → optionally save; shows history with delete; baseline comparison if available
  api/
    audits/route.ts           — GET list (admin)
    audits/run/route.ts       — POST to start audit job (async)
    audits/jobs/[jobId]/      — GET job status (polling)
    audits/[auditId]/         — GET audit report (admin or own-member access)
    audits/run-all-monthly/   — POST start batch, GET status (admin)
    settings/route.ts         — GET/PATCH AI prompt
    members/[id]/route.ts     — GET/PATCH member
    members/[id]/notes/       — PATCH coaching notes
    members/[id]/videos/      — GET latest YouTube videos for member
    member/scores/route.ts    — GET current member's audit history
    sync/route.ts             — POST GHL → DB sync
    qa-prep/route.ts          — GET Q&A call prep data (celebrate/address/common gaps/per-member)
    cron/monthly/route.ts     — GET external cron trigger (requires CRON_SECRET header)
    script-review/route.ts    — POST (Claude analysis, returns unsaved result), GET (member history)
    script-review/save/       — POST save a review to DB
    script-review/[reviewId]/ — GET single review, DELETE
```

## Audit Engine
- Claude claude-sonnet-4-20250514, 8192 max tokens
- 16 principles scored 0–10 with evidence text
- Three audit types: `baseline`, `monthly`, `single_video`
- Monthly audits compare vs baseline + last month
- Job states: `queued → downloading → analysing → generating → complete/failed`
- Default scoring prompt stored in `app_settings` table, editable via Settings page
- `SCRIPT_REVIEW_PROMPT` in `audit-engine.ts` — specialized prompt for script/transcript analysis; scores Show Don't Tell on written visual cues; sets Consistency to 5 (N/A for single script); returns `whats_working`, `three_improvements`, `quick_win`
- `ScriptReview` DB model stores: userId, videoTitle, scriptText, scores (Json), overallScore, reportContent (Json)

## Deduplication
- Chris Troke has 25+ duplicate GHL records — sync deduplicates by email
```

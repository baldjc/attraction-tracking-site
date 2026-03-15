# Attraction by Video — Platform Overview

## Project
Full-stack Next.js 16 platform for YouTube channel audits, GHL member sync, link tracking, and admin/member dashboards for a real estate coaching program run by Jared Chamberlain.

## Stack
- **Framework:** Next.js 16 (App Router, Turbopack)
- **Database:** PostgreSQL (via Prisma v7)
- **Auth:** NextAuth.js v5 (credentials provider)
- **AI:** Anthropic Claude claude-sonnet-4-20250514 — audit scoring, script review, AI tools suite
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
prisma/schema.prisma         — DB schema: User (+ avatarProfile/Name/Summary/contentThemes), Audit, AuditJob, AppSetting, TrackingLink, Click, ScriptReview, SavedScript, SavedTitle, TitleAnalysis
src/lib/
  ghl.ts                     — GHL sync with nextPageUrl pagination + title case normalization
  youtube.ts                 — YouTube API: channel info, playlist, transcripts
  audit-engine.ts            — Claude AI scoring + DEFAULT_SCORING_PROMPT + SCRIPT_REVIEW_PROMPT + AuditResult types
  auth.ts                    — NextAuth config
  prisma.ts                  — Prisma client singleton
  session-utils.ts           — resolveUserFromSession() — resolves DB user by session ID or email fallback

src/app/
  admin/
    members/page.tsx          — Members list with search/filter
    members/[id]/page.tsx     — Member detail: info, audit history, Run Audit, score trend, coaching notes, avatar profile editor, AI Tools Usage stats
    audits/page.tsx           — All audits list with Run All Baseline + Run All Monthly buttons
    audits/[auditId]/page.tsx — Full audit report with share/print
    qa-prep/page.tsx          — Q&A Call Prep
    script-review/page.tsx    — Admin script review with member comparison mode
    settings/page.tsx         — AI prompt editor
  member/
    scores/page.tsx           — Member dashboard: score, trend chart, 16-principle breakdown
    script-review/page.tsx    — Script Review tool
    settings/page.tsx         — Settings with Avatar Profile section (view/edit/paste)
    ai-tools/page.tsx         — AI Tools Hub: 4 tool cards with avatar status
    ai-tools/avatar-architect/page.tsx — Chat-style AI coaching to build ideal client avatar
    ai-tools/title-creator/page.tsx    — Title generator: 6 framework categories, star/refine/save
    ai-tools/title-thumbnail-analyzer/page.tsx — Title+thumbnail scoring (3 gauges + Attraction scores)
    ai-tools/arc-script-builder/page.tsx — 6-step ARC Method script wizard
  api/
    member/avatar/            — GET/PUT user avatar profile, themes, summary
    ai-tools/avatar-architect/ — POST multi-turn chat with Avatar Architect Claude agent
    ai-tools/title-creator/   — POST generate titles using 6 framework categories
    ai-tools/title-thumbnail-analyzer/ — POST vision + title analysis (saves TitleAnalysis record)
    ai-tools/arc-script-builder/ — POST step-by-step ARC script generation
    ai-tools/save-script/     — POST save SavedScript
    ai-tools/saved-scripts/   — GET list member's saved scripts
    ai-tools/save-title/      — POST save SavedTitle
    ai-tools/saved-titles/    — GET list member's saved titles
    admin/member-tools-usage/[userId]/ — GET scripts count, analyses count, last activity
    audits/..., members/..., script-review/..., sync/..., qa-prep/... (see previous)
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

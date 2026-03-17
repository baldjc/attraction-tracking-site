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
prisma/schema.prisma         — DB schema: User (+ avatarProfile/Name/Summary/contentThemes/niche/city), Audit, AuditJob, AppSetting, TrackingLink, Click, ScriptReview, SavedScript, SavedTitle, SavedIdea, TitleAnalysis, AIToolConversation (AIToolType enum: replaced title_creator → content_engine)
src/lib/
  ghl.ts                     — GHL sync with nextPageUrl pagination + title case normalization
  youtube.ts                 — YouTube API: channel info, playlist, transcripts
  audit-engine.ts            — Claude AI scoring + DEFAULT_SCORING_PROMPT + SCRIPT_REVIEW_PROMPT + AuditResult types
  auth.ts                    — NextAuth config
  prisma.ts                  — Prisma client singleton
  session-utils.ts           — resolveUserFromSession() — resolves DB user; if admin has impersonate cookie, returns impersonated member
  impersonate-constants.ts   — IMPERSONATE_COOKIE ("abv-impersonate-id") + IMPERSONATE_LS_KEY ("abv_impersonate") — client-safe constants

src/app/
  admin/
    members/page.tsx          — Members list with search/filter
    members/[id]/page.tsx     — Member detail: info, audit history, Run Audit, score trend, coaching notes, avatar profile editor, AI Tools Usage stats
    audits/page.tsx           — All audits list with Run All Baseline + Run All Monthly buttons
    audits/[auditId]/page.tsx — Full audit report with share/print
    qa-prep/page.tsx          — Q&A Call Prep
    script-review/page.tsx    — Redirects → /admin/ai-tools/script-review
    settings/page.tsx         — AI prompt editor (audit scoring prompt)
    ai-tools/script-review/page.tsx — New chat-based Script Review (15 principles + visual_suggestions + coaching chat)
    ai-tools/usage/page.tsx   — AI Tools Usage analytics: summary cards, tool breakdown, member activity, recent feed
  member/
    scores/page.tsx           — Member dashboard: score, trend chart, 16-principle breakdown
    script-review/page.tsx    — Redirects → /member/ai-tools/script-review
    settings/page.tsx         — Settings with Avatar Profile section (view/edit/paste)
    ai-tools/page.tsx         — AI Tools Hub: 5 tool cards with avatar status + admin Usage link
    ai-tools/avatar-architect/page.tsx — Chat-style AI coaching to build ideal client avatar (+ PromptEditor + RecentConversations)
    ai-tools/content-engine/page.tsx   — Content Engine: theme dashboard, batch/chat idea generation, niche setup, imported titles
    ai-tools/title-thumbnail-analyzer/page.tsx — Title+thumbnail scoring (+ PromptEditor + RecentConversations)
    ai-tools/arc-script-builder/page.tsx — 4-step ARC Method script wizard
    ai-tools/script-review/page.tsx — Chat-based Script Review: paste script → scorecard (15 principles + visual suggestions) → coaching chat
  api/
    member/avatar/            — GET/PUT user avatar profile, themes (normalizes string[] → object[]), niche, city
    member/niche/             — PUT update niche + city
    ai-tools/avatar-architect/ — POST multi-turn chat; saves enhanced themes (with emoji/colour/coreStress)
    ai-tools/content-engine/batch/ — POST generate 5 ideas for one theme (parallel-safe)
    ai-tools/content-engine/chat/  — POST multi-turn chat scoped to a theme; returns <IDEA_DATA> tags
    ai-tools/content-engine/save-idea/ — POST save idea to SavedIdea
    ai-tools/content-engine/saved-ideas/ — GET list saved ideas filtered by theme + pagination
    ai-tools/content-engine/delete-idea/ — DELETE remove a saved idea
    ai-tools/title-thumbnail-analyzer/ — POST vision + title analysis; checks title_thumbnail_analyzer_prompt AppSetting
    ai-tools/arc-script-builder/ — POST step-by-step ARC script generation (summarize/opening/credibility/insights/final)
    ai-tools/script-review/  — POST: first call returns JSON scorecard; subsequent calls = coaching chat
    ai-tools/conversations/   — POST create / GET list (filter by toolType, last 20, auto-purge 30d)
    ai-tools/conversations/[id]/ — GET / PATCH / DELETE individual conversation
    ai-tools/conversations/[id]/download/ — GET markdown download (increments downloadCount)
    ai-tools/save-script/     — POST save SavedScript
    ai-tools/saved-scripts/   — GET list member's saved scripts
    admin/member-tools-usage/[userId]/ — GET scripts count, analyses count, last activity
    admin/impersonate/        — POST (set cookie) / DELETE (clear cookie) for admin member impersonation
    settings/                 — GET/PATCH/DELETE generic key-based AppSetting; returns prompt defaults for known keys
    audits/..., members/..., script-review/..., sync/..., qa-prep/... (see previous)
```

## Audit Engine
- Claude claude-sonnet-4-20250514, 8192 max tokens
- 16 principles scored 0–10 with evidence text
- Three audit types: `baseline`, `monthly`, `single_video`
- Monthly audits compare vs baseline + last month
- Job states: `queued → downloading → analysing → generating → complete/failed`
- Default scoring prompt stored in `app_settings` table, editable via Settings page; falls back to `DEFAULT_SCORING_PROMPT` if no DB row exists
- **Weighted scoring**: `overallScore` = Attraction Score (weighted), `raw_average` stored in `reportContent.raw_average`
  - 3x weight: lead_magnet_system, avatar_clarity, binge_architecture
  - 2x weight: arc_attention, approve_the_click, connection_language, title_frameworks, arc_revelation, story_proof
  - 1x weight: themes_over_topics, consistency, curiosity_bridges, values_peppering, grade_5_language, arc_connection
  - 0x weight: show_dont_tell (scored and shown but excluded — transcript-estimated only)
  - Formula: Sum(score × weight) ÷ 27 = Attraction Score; Raw Average = Sum of all 16 ÷ 16
  - `calculateWeightedScores()` exported from `audit-engine.ts`; applied server-side after Claude returns scores
- **Calibration rules** in prompt (12 total): format awareness, scoring strictness, evidence requirement, lead magnet strictness, curiosity bridges, values peppering, story proof specificity, ARC attention opening pattern, binge architecture context quality, Consistency (rule #11 — mathematical from upload dates with lookup table), Show Don't Tell (rule #12 — transcript verbal cues only)
- `SCRIPT_REVIEW_PROMPT` in `audit-engine.ts` — specialized prompt for script/transcript analysis; scores Show Don't Tell on written visual cues; sets Consistency to 5 (N/A for single script); returns `whats_working`, `three_improvements`, `quick_win`
- `ScriptReview` DB model stores: userId, videoTitle, scriptText, scores (Json), overallScore, reportContent (Json)
- Report pages show: big Attraction Score + "Raw Average: X.X / 10" in small text below (admin, shared, member views)

## Deduplication
- Chris Troke has 25+ duplicate GHL records — sync deduplicates by email
```

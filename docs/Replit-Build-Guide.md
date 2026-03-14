# Attraction by Video — Replit Build Guide

> **Purpose:** Step-by-step guide for building the Attraction by Video platform on Replit using Replit Agent. Each phase is a self-contained prompt you can paste into Replit Agent, test, and then move to the next phase.
>
> **Date:** March 14, 2026
> **Companion docs:** `Manus-Build-Spec.md` (full spec), `Complete-Audit-System-Guide.md` (audit details)

---

## How to Use This Guide

1. **Start a new Replit project** — choose "Next.js" as the template
2. **Paste Phase 1 prompt** into Replit Agent → let it build → test it
3. **Only move to the next phase once the current phase works**
4. **If something breaks**, tell the agent what's wrong — don't start over
5. **Upload companion files** to Replit so the agent can reference them for detail

### Replit-Specific Considerations

| Issue | Manus Spec Said | Replit Approach |
|-------|----------------|----------------|
| Database | External PostgreSQL (Neon/Railway) | Use **Replit's built-in PostgreSQL** (available in the Database panel) |
| yt-dlp for transcripts | Command-line yt-dlp | **Won't work on Replit** — use YouTube Data API v3 for metadata + a transcript API (youtube-transcript-api npm package or equivalent) |
| Redis for job queue | BullMQ + Redis | Use **Replit's built-in key-value store** or a simple in-memory queue (fine for your scale of ~12 members) |
| Deployment | Vercel/Railway | **Replit auto-deploys** — just click Deploy |
| Custom domains | Manual DNS config | Configure in Replit's domain settings after deploy |
| File system | Persistent | Replit has an **ephemeral file system** — don't save transcripts to disk, process them in memory |

### Environment Variables You'll Need

Set these in Replit's **Secrets** panel (lock icon in the sidebar):

```
ANTHROPIC_API_KEY=sk-ant-...
GHL_API_KEY=pit-babb9c02-a078-43ef-8ce8-6f951e7cc480
GHL_LOCATION_ID=vEIiKAjpBkCDrabeDre7
NOTION_API_KEY=secret_...
NOTION_AUDIT_DB_ID=31c33f3a-1ade-80ea-a5ed-000bff2f16c1
RESEND_API_KEY=re_...
NEXTAUTH_SECRET=(generate a random string)
NEXTAUTH_URL=https://your-replit-app.replit.app
ADMIN_EMAIL=jared@chamberlaingroup.ca
YOUTUBE_API_KEY=(get from Google Cloud Console)
FROM_EMAIL=noreply@attractionbyvideo.com
TRACKING_DOMAIN=track.attractionbyvideo.com
FALLBACK_URL=https://attractionbyvideo.com
```

**To get a YouTube Data API key:**
1. Go to https://console.cloud.google.com/
2. Create a project (or use existing)
3. Enable "YouTube Data API v3"
4. Create an API key under Credentials
5. Add it to Replit Secrets as `YOUTUBE_API_KEY`

---

## Important Terminology & Auth Rules

**Roles:**
- **Admin** — Jared. Full access. Only admin account.
- **Foundations Member** — a member/client. Use "Foundations Member" in the UI, and `foundations_member` in code. Never call them "student" in the UI.

**Authentication rules:**
- **No self-registration.** Only admin can create Foundations Member accounts.
- **Admin login:** email + password (standard credentials).
- **Foundations Member login (future):** magic link only (enter email → receive login link → click → logged in). No passwords for members.
- **FOR NOW during development:** use email + password for all roles so we can test easily. The magic link system will be enabled later before launch.
- **Bulk invite (future):** admin clicks "Invite All Members" → every Foundations Member gets an email with their magic link login. This is the go-live moment. Do NOT enable until Jared explicitly says so.

---

## Phase 1: Foundation — Auth, Database, Layout

### What This Phase Builds
- PostgreSQL database with all core tables
- NextAuth.js authentication (email/password for now, magic link for members later)
- Admin and Foundations Member roles
- App shell with sidebar navigation
- Basic page routing

### Replit Agent Prompt — Phase 1

```
Build a Next.js 14+ app with TypeScript and Tailwind CSS. This is a platform called "Attraction by Video" for managing YouTube channel audits and link tracking.

IMPORTANT TERMINOLOGY:
- The two roles are "admin" and "foundations_member" (NOT "student")
- In the UI, display "Foundations Member" (not "student")
- There is NO self-registration. Only admin can create accounts.
- For now, use email + password login for all roles (we'll add magic link login for members later)

DATABASE SETUP:
Use Prisma ORM with PostgreSQL. Create these tables:

1. users — id (UUID), email (unique), full_name, password_hash (nullable — will be null when magic link is enabled), magic_link_enabled (bool, default false), email_verified (bool), role (enum: admin/foundations_member), ghl_contact_id, youtube_channel_url, youtube_handle, service_tier (enum: foundations/editing_2/editing_4/scaling_2/scaling_4), invited_at (nullable timestamp), last_login_at (nullable timestamp), created_at, updated_at

2. audits — id (UUID), student_id (FK to users), audit_type (enum: lead/baseline/monthly/single_video), overall_score (decimal), scores (JSON — 16 principle scores), report_content (JSON — full report data), videos_analysed (JSON), notion_page_id, notion_page_url, report_month, created_at

3. audit_jobs — id (UUID), audit_type, student_id (FK), status (enum: queued/downloading/analysing/generating/complete/failed), error_message, audit_id (FK to audits), created_at, updated_at

4. campaigns — id (UUID), user_id (FK), name, description, created_at, updated_at

5. tracking_links — id (UUID), user_id (FK), campaign_id (FK, nullable), name, destination_url, short_code (unique, 8 chars), video_title (nullable), lead_magnet_name (nullable), created_at, updated_at

6. clicks — id (UUID), link_id (FK), timestamp, ip_address, user_agent, referrer, g_campaignid, g_adgroupid, g_keyword, g_device, g_network, g_matchtype

7. conversions — id (UUID), click_id (FK), type (default 'EMAIL_SIGNUP'), timestamp

Add appropriate indexes on foreign keys and frequently queried columns.

AUTHENTICATION:
Use NextAuth.js v5 with credentials provider (email + password). Hash passwords with bcrypt.
- Pre-seed an admin account: email from ADMIN_EMAIL env var, role = 'admin'
- Foundations Member accounts are created by admin (not self-registration)
- On first run, if no admin exists, create one with a temporary password and log it to the console

COLOUR PALETTE:
- Light Grey: #f1f1ef (backgrounds)
- Vivid Azure: #3dc3ff (primary accent, buttons, links)
- Vivid Crimson: #ff0033 (secondary accent, alerts)
- Dark Grey Blue: #1e2a38 (text, dark elements)

LAYOUT:
- Login page at /login
- After login, show a left sidebar navigation
- Admin sidebar: Dashboard, Members, Audits, Q&A Prep, Campaigns, Analytics, Settings
- Foundations Member sidebar: My Scores, My Links, Resources, Settings
- Each nav item should have an appropriate icon
- Sidebar should be collapsible on mobile
- All pages should be mobile-responsive
- Show user name and role in the sidebar footer

Create placeholder pages for each nav item (just show the page title for now). We'll build out each feature in later phases.

The app should be clean, modern, and professional. Use the colour palette consistently.
```

### How to Test Phase 1
- [ ] App loads without errors
- [ ] Login page appears at `/login`
- [ ] Admin can log in (check console for temp password)
- [ ] Sidebar shows correct nav items for admin role
- [ ] All placeholder pages load
- [ ] Database tables exist (check Replit's Database panel)

---

## Phase 2: Member Management (Admin)

### What This Phase Builds
- Admin can add/edit/view Foundations Members
- Member list with key info
- GHL contact lookup on member creation

### Replit Agent Prompt — Phase 2

```
Add member management to the admin dashboard. This builds on the existing app.

ADMIN > MEMBERS PAGE (/admin/members):
Show a table of all members with columns:
- Name
- YouTube Handle
- Current Score (from most recent audit, or "—" if no audits yet)
- Last Audit Date
- Service Tier (formatted nicely: "Foundations", "Editing 2", etc.)
- Status indicator (green dot = active)

Add a search/filter bar above the table.
Clicking a member row opens their detail page.

ADD MEMBER BUTTON:
Opens a modal/form with fields:
- Email (required)
- Full Name (required)
- YouTube Channel URL or Handle (required — extract handle from URL if full URL given)
- Service Tier (dropdown: Foundations, Editing 2, Editing 4, Scaling 2, Scaling 4)

On submit:
1. Create the user in the database with role = 'foundations_member' and a random temporary password
2. Try to look up the contact in GoHighLevel:
   - GET https://services.leadconnectorhq.com/contacts/?query={email}&locationId={GHL_LOCATION_ID}
   - Headers: Authorization: Bearer {GHL_API_KEY}, Version: 2021-07-28
   - If found, save the GHL contact ID to the user record
3. Show success message with the member's temporary password (admin shares it with them)

MEMBER DETAIL PAGE (/admin/members/[id]):
Show all the member's info plus:
- Audit history (table: Date, Type, Score — linked to report pages we'll build later)
- "Run Audit" dropdown button (Baseline, Monthly, Single Video) — these will be wired up in Phase 4
- Edit member info button

IMPORTANT: All member queries must filter by the user's role. Members can only see their own data. Admin can see all members. Enforce this in API routes with middleware.
```

### How to Test Phase 2
- [ ] Members page shows the table (empty at first)
- [ ] Can add a new member with all fields
- [ ] GHL lookup runs (check network tab — OK if it fails due to no matching contact)
- [ ] Member appears in the list after creation
- [ ] Member detail page loads with correct info
- [ ] Edit member works

---

## Phase 3: Link Tracker

### What This Phase Builds
- Short URL creation and redirect system
- Click tracking with Google Ads parameter capture
- Conversion tracking endpoint
- Admin campaign management
- Member link management
- Analytics dashboards for both roles

### Replit Agent Prompt — Phase 3

```
Build the link tracking system. Two use cases: admin campaign tracking (Google Ads) and member lead magnet tracking.

REDIRECT ENDPOINT — GET /api/r/[shortCode]:
This is the most critical endpoint. It must be FAST.
1. Look up the tracking link by short_code
2. If not found, redirect to FALLBACK_URL env var
3. Generate a unique click ID (UUID)
4. Set cookie: _at_click={clickId} (365 days, httpOnly: false, sameSite: lax)
5. Determine destination URL:
   - If request has ?dest= parameter, use that (Google Ads tracking template)
   - Otherwise use the link's stored destination_url
6. Append ?_atc={clickId} to the destination URL (for cross-domain member tracking)
7. Return 302 redirect IMMEDIATELY
8. Log click data ASYNCHRONOUSLY after the redirect is sent (timestamp, IP, user agent, referrer, Google Ads params: cid, agid, kw, dev, net, mt from query string)

CONVERSION ENDPOINT — POST /api/conversions:
- Accepts { click_id, type } (type defaults to 'EMAIL_SIGNUP')
- Creates a conversion record linked to the click
- Returns 200 OK
- Add CORS headers to allow cross-origin requests (members' domains will call this)

ADMIN > CAMPAIGNS PAGE (/admin/campaigns):
- List all campaigns with name, total clicks, total conversions, conversion rate
- Create Campaign button (name, description)
- Click into campaign → see its tracking links

TRACKING LINK CREATION (for admin within a campaign, or for members on their own page):
- Fields: Name, Destination URL, Video Title (optional), Lead Magnet Name (optional)
- Auto-generate an 8-character alphanumeric short code
- Show the generated tracking URL: https://{TRACKING_DOMAIN}/r/{shortCode}
- For admin links, also show the Google Ads tracking template:
  {TRACKING_DOMAIN}/r/{shortCode}?dest={lpurl}&cid={campaignid}&agid={adgroupid}&kw={keyword}&dev={device}&net={network}&mt={matchtype}
- Copy-to-clipboard button for both URLs

ADMIN ANALYTICS (/admin/campaigns/analytics):
- Total clicks and conversions (all campaigns)
- Signup rate percentage
- Clicks/conversions over time (line chart, last 30 days) — use Recharts
- Top campaigns by clicks (bar chart)
- Top tracking links by clicks
- Recent clicks table with timestamp, referrer, and Google Ads data columns

MEMBER > MY LINKS PAGE (/member/links):
- List of their tracking links with clicks, conversions, conversion rate
- Create Link button (same form but no campaign association)
- Performance by video (if video_title was set)
- Performance by lead magnet (if lead_magnet_name was set)
- Video × Lead Magnet performance matrix (table showing which combos perform best)
- Clicks/conversions over time (line chart)

CONVERSION TRACKING SNIPPETS:
When a member creates a tracking link, show them two code snippets to copy:

Landing page snippet:
<script>
var p = new URLSearchParams(window.location.search);
if (p.get('_atc')) sessionStorage.setItem('_atc', p.get('_atc'));
</script>

Thank-you page snippet:
<script>
(function() {
  var params = new URLSearchParams(window.location.search);
  var clickId = params.get('_atc');
  if (!clickId) clickId = sessionStorage.getItem('_atc');
  if (clickId) {
    fetch('https://{TRACKING_DOMAIN}/api/conversions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ click_id: clickId, type: 'EMAIL_SIGNUP' })
    }).catch(function(err) {});
  }
})();
</script>

Score colours for analytics:
- Green for positive metrics
- Red for concerning metrics
- Use the app's colour palette (#3dc3ff for primary, #1e2a38 for text)
```

### How to Test Phase 3
- [ ] Create a tracking link → get a short URL
- [ ] Visit the short URL → redirects to destination
- [ ] Click is recorded in the database
- [ ] Conversion endpoint works (test with curl/Postman)
- [ ] Admin analytics show click data
- [ ] Member link management works
- [ ] Google Ads tracking template generates correctly
- [ ] Conversion snippets display with correct domain

---

## Phase 4: YouTube Audit Engine

### What This Phase Builds
- YouTube channel data fetching (via API, not yt-dlp)
- Transcript downloading
- Claude AI scoring against 16 principles
- Background job processing
- 4 report types generated and stored

### Replit Agent Prompt — Phase 4

```
Build the YouTube audit engine. This is the core intelligence of the platform.

IMPORTANT: We cannot use yt-dlp on Replit. Use these alternatives:

YOUTUBE DATA FETCHING:
1. Channel info: Use YouTube Data API v3
   - GET https://www.googleapis.com/youtube/v3/channels?part=snippet,brandingSettings&forHandle={handle}&key={YOUTUBE_API_KEY}
   - Extract: channel banner URL from brandingSettings.image.bannerExternalUrl

2. Video list: Use YouTube Data API v3
   - First get the uploads playlist: channels endpoint → contentDetails.relatedPlaylists.uploads
   - GET https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId={uploadsPlaylistId}&maxResults=10&key={YOUTUBE_API_KEY}
   - Then for each video: GET https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id={videoId}&key={YOUTUBE_API_KEY}
   - Filter out Shorts (duration < 60 seconds — parse ISO 8601 duration from contentDetails.duration)
   - Take the 5 most recent long-form videos

3. Transcripts: Use the npm package "youtube-transcript" (or "youtubei.js") to fetch auto-generated captions
   - npm install youtube-transcript
   - import { YoutubeTranscript } from 'youtube-transcript'
   - const transcript = await YoutubeTranscript.fetchTranscript(videoId)
   - This returns an array of { text, duration, offset } segments
   - Join them into a single text string with approximate timestamps

AI SCORING ENGINE:
Create an API route POST /api/audits/run that:
1. Accepts: { memberId (optional), auditType, channelUrl/handle, email (for leads), name (for leads), videoId (for single video audits) }
2. Creates an audit_job record with status 'queued'
3. Returns the job ID immediately
4. Processes the job asynchronously (use a simple async function — no Redis needed for your scale):

Job processing steps:
a. Update status → 'downloading'
b. Fetch channel data (banner, video list)
c. Fetch transcripts for up to 5 videos (or 1 for single video audit)
d. Update status → 'analysing'
e. Send transcripts + scoring rubric to Claude API (use @anthropic-ai/sdk npm package)
f. Parse Claude's structured JSON response
g. Update status → 'generating'
h. Build the report content based on audit type
i. Save the audit record to the database
j. Update status → 'complete'
k. If any step fails, set status → 'failed' with error message

CLAUDE API SCORING PROMPT:
Send this system prompt to Claude (model: claude-sonnet-4-20250514):

"""
You are an expert YouTube channel analyst for Attraction by Video, a coaching program that teaches real estate agents to build YouTube channels.

You will be given transcripts from recent long-form YouTube videos by a real estate agent. Score the channel against each of the 16 Attraction by Video principles on a scale of 0–10.

For each principle, provide:
- A numeric score (0–10, one decimal place)
- 2–3 sentences of specific evidence from the transcripts (include video title and timestamp where possible)
- What's working and what's missing

THE 16 PRINCIPLES AND SCORING RUBRIC:

1. AVATAR CLARITY (0–10)
   0–3: No clear audience. Generic "everyone" content.
   4–6: Some audience awareness but inconsistent.
   7–8: Clear audience in most videos.
   9–10: Every video made for ONE specific person.

2. THEMES OVER TOPICS (0–10)
   0–3: Random, disconnected video topics.
   4–6: Some recurring themes but many one-offs.
   7–8: Clear 2–4 content themes.
   9–10: Strong, defined themes that compound.

3. ARC ATTENTION — Opening Hook (0–10)
   0–3: Weak hook. "Hey guys, welcome back."
   4–6: Some attempt at a hook but lacks urgency.
   7–8: Clear hook creating reason to watch.
   9–10: Masterful opening that instantly hooks.

4. ARC REVELATION — Content Insights (0–10)
   0–3: Surface-level info found anywhere.
   4–6: Some useful info but lacks depth.
   7–8: Genuine value with unique insights.
   9–10: Revelatory content the viewer didn't know.

5. ARC CONNECTION — Emotional Connection (0–10)
   0–3: No emotional resonance.
   4–6: Occasional personality.
   7–8: Real connection, authenticity.
   9–10: Deep trust and connection.

6. TITLE FRAMEWORKS (0–10)
   0–3: Generic titles. "Calgary Market Update."
   4–6: Some attention-getting but inconsistent.
   7–8: Most titles use proven patterns.
   9–10: Every title crafted using frameworks.

7. APPROVE THE CLICK (0–10)
   0–3: First 30 seconds unrelated to title.
   4–6: Eventually delivers but takes too long.
   7–8: First 30 seconds clearly set up delivery.
   9–10: Title promise addressed immediately.

8. LEAD MAGNET SYSTEM (0–10)
   0–3: No CTA or lead magnet.
   4–6: Occasional mention of a link.
   7–8: Clear CTA in most videos.
   9–10: Strategic system with natural CTAs.

9. CURIOSITY BRIDGES (0–10)
   0–3: No transitions, abrupt changes.
   4–6: Mechanical transitions ("Next up...").
   7–8: Good curiosity-building transitions.
   9–10: Masterful bridges creating anticipation.

10. SHOW DON'T TELL (0–10)
    0–3: Pure talking head.
    4–6: Some visual elements.
    7–8: Regular visuals — B-roll, screen shares.
    9–10: Rich visual storytelling.

11. VALUES PEPPERING (0–10)
    0–3: No personality beyond real estate.
    4–6: Occasional personal mentions.
    7–8: Natural drops of personal interests.
    9–10: Personality woven throughout.

12. CONNECTION LANGUAGE (0–10)
    0–3: "Hey guys." No targeting.
    4–6: Some direct address.
    7–8: Regular "you" language.
    9–10: Every video personally addressed.

13. STORY PROOF (0–10)
    0–3: No client stories or proof.
    4–6: Occasional client mention.
    7–8: Regular stories with specifics.
    9–10: Rich storytelling, multiple proof points.

14. GRADE 5 LANGUAGE (0–10)
    0–3: Heavy jargon, complex sentences.
    4–6: Mostly accessible, occasional jargon.
    7–8: Clear, simple language.
    9–10: Crystal clear, a 10-year-old could follow.

15. BINGE ARCHITECTURE (0–10)
    0–3: No references to other videos.
    4–6: Occasional "check out my other video."
    7–8: Regular references, some series.
    9–10: Intentional binge structure.

16. CONSISTENCY (0–10)
    0–3: Sporadic, months between videos.
    4–6: Semi-regular but unpredictable.
    7–8: Roughly weekly publishing.
    9–10: Consistent weekly or more.

Return a JSON object with this exact structure:
{
  "scores": {
    "avatar_clarity": { "score": 5.5, "evidence": "..." },
    "themes_over_topics": { "score": 4.0, "evidence": "..." },
    "arc_attention": { "score": 0.0, "evidence": "..." },
    "arc_revelation": { "score": 0.0, "evidence": "..." },
    "arc_connection": { "score": 0.0, "evidence": "..." },
    "title_frameworks": { "score": 0.0, "evidence": "..." },
    "approve_the_click": { "score": 0.0, "evidence": "..." },
    "lead_magnet_system": { "score": 0.0, "evidence": "..." },
    "curiosity_bridges": { "score": 0.0, "evidence": "..." },
    "show_dont_tell": { "score": 0.0, "evidence": "..." },
    "values_peppering": { "score": 0.0, "evidence": "..." },
    "connection_language": { "score": 0.0, "evidence": "..." },
    "story_proof": { "score": 0.0, "evidence": "..." },
    "grade_5_language": { "score": 0.0, "evidence": "..." },
    "binge_architecture": { "score": 0.0, "evidence": "..." },
    "consistency": { "score": 0.0, "evidence": "..." }
  },
  "overall_score": 4.8,
  "strengths": ["...", "...", "..."],
  "biggest_gaps": ["...", "...", "..."],
  "video_breakdowns": [
    {
      "title": "Video Title",
      "opening_analysis": "...",
      "insights_analysis": "...",
      "connection_analysis": "..."
    }
  ],
  "personalised_dimension_analysis": {
    "channel_strategy": "...",
    "content_impact": "...",
    "viewer_connection": "...",
    "lead_generation": "..."
  }
}
"""

JOB STATUS ENDPOINT — GET /api/audits/jobs/[jobId]:
- Returns the current job status
- Frontend polls this every 5 seconds to show progress

ADMIN AUDIT CONTROLS (wire up the buttons from Phase 2):
- "Run Lead Audit" → modal: enter email + YouTube channel URL/handle
- "Run Baseline Audit" → selects from member list
- "Run Monthly Audit" → selects from member list
- "Run Single Video Audit" → selects member, then shows their recent videos to pick one
- "Run All Monthly Audits" → one button that queues all active members sequentially

Show a progress indicator while audits run:
- "Downloading transcripts..." → "Analysing with AI..." → "Generating report..." → "Complete!"
- For bulk audits: "3/12 members complete..."

SCORE COLOUR CODING (use throughout the app):
- 7.0+ → Green background
- 5.0–6.9 → Yellow background
- Below 5.0 → Red background

Store the AI scoring prompt as a configurable text field in the Settings page so it can be refined without code changes.
```

### How to Test Phase 4
- [ ] Run a test audit for a YouTube channel you know
- [ ] Job status updates show progress
- [ ] Transcripts download successfully
- [ ] Claude returns scored results
- [ ] Audit record saved to database with all 16 scores
- [ ] Bulk audit queues and processes sequentially
- [ ] Errors are handled gracefully (bad channel URL, no videos, etc.)

---

## Phase 5: Audit Reports — Display & Templates

### What This Phase Builds
- Branded report pages for all 4 audit types
- Member dashboard showing scores and trends
- Score trend charts

### Replit Agent Prompt — Phase 5

```
Build the audit report display pages and member score dashboard.

4 REPORT TYPES — each gets a branded, polished page:

TYPE 1: LEAD AUDIT REPORT (/reports/lead/[auditId])
This page is PUBLIC (no login required — leads receive a link).
Layout (top to bottom):
1. YouTube channel banner image (full width, from audit data)
2. Blue callout box: "Your YouTube Channel Audit — @{channelHandle}"
3. Score callout (colour-coded bg): "Your Attraction Score: {score} / 10" + one-sentence personalised summary
4. "Your Scores" — table with 4 grouped dimensions:
   - 🎯 Channel Strategy = average of (Avatar Clarity + Themes Over Topics + Consistency)
   - 🎬 Content Impact = average of (ARC Attention + ARC Revelation + Approve the Click + Title Frameworks + Show Don't Tell + Curiosity Bridges)
   - 🤝 Viewer Connection = average of (Connection Language + Values Peppering + Story Proof)
   - 📈 Lead Generation = average of (Lead Magnet System + Binge Architecture)
   Each row: dimension name, score (colour-coded), one-line summary
5. "What This Means" — one section per dimension with 3–4 sentences of personalised analysis referencing specific videos
6. "What's Working" — green callout with 4–5 numbered strengths with video evidence
7. Mid-page CTA (blue callout): "Want to learn how to improve these scores? The Foundations program teaches the exact frameworks behind each dimension." + button
8. "What Your Attraction Score Could Look Like" — projection table:
   - Columns: Dimension | Now | After Foundations | What Shifts
   - All "After" scores must be 8.5+ and each unique (e.g. 8.5, 8.7, 9.0, 9.2)
   - "What Shifts" references lesson numbers vaguely (doesn't teach the method)
9. Green callout: "Projected Overall Score: ~{projected} / 10"
10. "The Bottom Line" — 2 paragraphs acknowledging quality and identifying the gap
11. Primary CTA (large blue callout): "Ready to Build the System Around Your Content?" + "→ Become an Attraction by Video Member Today!" button linking to Foundations signup
12. Footer: "Prepared for {Name} by Jared Chamberlain ~ Founder of Attraction by Video"

TYPE 2: BASELINE AUDIT (/reports/baseline/[auditId])
Login required (member or admin).
Layout:
1. Channel banner
2. "Attraction by Video — Baseline Audit" header callout
3. Overall score callout (colour-coded)
4. Full 16-principle scorecard table (Principle | Score | colour-coded)
5. Videos analysed table (Title | Duration | Date)
6. Video-by-video breakdown — for each video: Opening analysis, Insights analysis, Connection analysis
7. Learning Path — principles below 7 mapped to lessons:
   Avatar Clarity → 1.1 + 1.2, Themes → 1.3, Lead Magnet → 1.4, Values Peppering → 2.1, Connection Language → 2.2, ARC Attention → 2.5 + 2.5a + 3.2, ARC Revelation → 2.5, ARC Connection → 2.2 + 2.5, Curiosity Bridges → 2.5, Story Proof → 2.5, Approve the Click → 4.1 + 2.5, Title Frameworks → 4.2, Binge Architecture → 1.3, Show Don't Tell → 2.5, Grade 5 Language → N/A (practice), Consistency → N/A (practice)
8. Q&A Topics (flagged items for live coaching calls)
9. What's Working (strengths)
10. Footer

TYPE 3: MONTHLY PROGRESS (/reports/monthly/[auditId])
Login required.
Layout:
1. Header callout with month/year
2. Channel banner
3. Progress summary: this month score, Δ from baseline, Δ from last month (with arrows ↑↓)
4. Score comparison table: 16 principles × Baseline | Last Month | This Month | Δ columns
   - Colour logic: Green = improved 1+ from baseline, Yellow = improved 0.5, Red = declined
5. What improved this month (specific principles with evidence)
6. Videos analysed this month (table)
7. Video-by-video breakdown
8. Remaining gaps (principles still below 7, ordered by priority)
9. Updated Learning Path (removes lessons for principles that hit 7+)
10. What's Working (maintained + new strengths)
11. Purple callout: one-sentence coaching summary
12. Footer

TYPE 4: SINGLE VIDEO AUDIT (/reports/video/[auditId])
Login required.
Layout:
1. Channel banner
2. "Single Video Audit" header
3. Video score callout: "Video Attraction Score: {score} / 10" + video title, duration, date
4. Scorecard table: 16 principles × Baseline | This Video | Δ columns
5. Deep dive by phase:
   - Opening (ARC Attention + Approve the Click + Lead Magnet)
   - Body (ARC Revelation + Show Don't Tell + Curiosity Bridges)
   - Connection & Voice (ARC Connection + Connection Language + Values Peppering + Story Proof + Grade 5 Language)
   - Channel Strategy (Avatar Clarity + Themes + Lead Magnet + Binge Architecture + Consistency)
6. What's Working (with timestamps)
7. "Three Ideas for Improvement" (principle, score, what happened, what to do, lesson reference)
8. "Quick Wins & Q&A Prep"
9. One-sentence coaching summary
10. Footer

MEMBER DASHBOARD — MY SCORES (/member/scores):
- Big prominent current overall score (colour-coded)
- Score trend line chart (Recharts) — overall score over time (baseline → monthly audits)
- 16-principle breakdown — current scores with colour coding, showing Δ from baseline
- Click any principle → modal/expandable showing that principle's score over time
- Learning Path — which lessons to revisit for principles below 7
- Audit history list — all reports with links to view each (Type, Date, Score)

All report pages must be:
- Beautifully branded with the colour palette
- Mobile-responsive
- Print-friendly (add a print stylesheet)
- Shareable via URL (lead reports are public, others require auth)
```

### How to Test Phase 5
- [ ] Run a lead audit → view the report page → verify all 12 sections render
- [ ] Run a baseline audit → verify 16-principle scorecard
- [ ] Score colours display correctly (green/yellow/red)
- [ ] Member dashboard shows score trend chart
- [ ] Report pages look good on mobile
- [ ] Lead report page is accessible without login
- [ ] Member/baseline/monthly reports require login

---

## Phase 6: Public Lead Audit Page

### What This Phase Builds
- Self-serve public form for leads
- Automated audit pipeline
- Email delivery of report
- GHL contact creation

### Replit Agent Prompt — Phase 6

```
Build the public lead audit page — this is the biggest sales tool in the platform.

PUBLIC FORM PAGE (/audit):
Clean, branded landing page with:
- Headline: "Get Your Free YouTube Channel Audit"
- Subhead: "See how your channel scores against 16 proven principles used by top-performing real estate agents on YouTube."
- Form fields:
  - Full Name (required)
  - Email Address (required)
  - YouTube Channel URL or Handle (required) — show placeholder: "@yourchannel or youtube.com/@yourchannel"
- Submit button: "Get My Free Audit" (blue, #3dc3ff)
- Below form: "Your audit is typically ready within 5 minutes."

SPAM PROTECTION:
- Rate limit: max 3 audit requests per IP per hour
- Add Cloudflare Turnstile CAPTCHA (or reCAPTCHA v3) to the form
- Check for duplicate: if same email + channel was audited in last 30 days, return the existing report instead of running a new one

ON FORM SUBMIT:
1. Show confirmation page: "Your audit is being generated! We'll email you when it's ready (usually within 5 minutes)."
2. Create or update contact in GHL:
   - Look up: GET https://services.leadconnectorhq.com/contacts/?query={email}&locationId={GHL_LOCATION_ID}
   - If exists: add tag "lead-audit-requested"
   - If not: POST https://services.leadconnectorhq.com/contacts/ with { firstName, lastName, email, locationId, tags: ["lead-audit-requested"] }
   - Headers: Authorization: Bearer {GHL_API_KEY}, Version: 2021-07-28
3. Queue a lead audit job (same engine from Phase 4)
4. When audit completes:
   a. Save audit to database
   b. Create Notion page via Notion API:
      - POST https://api.notion.com/v1/pages
      - Parent: { database_id: NOTION_AUDIT_DB_ID }
      - Set properties: audit name, all 16 scores, overall score, audit type = "Lead", audit date, videos analysed
      - Headers: Authorization: Bearer {NOTION_API_KEY}, Notion-Version: 2022-06-28
   c. Update GHL contact with the report URL:
      - PUT https://services.leadconnectorhq.com/contacts/{contactId}
      - Body: { customFields: [{ id: "zfEHoi06Cw8cmAi42dW6", value: "{reportUrl}" }] }
   d. Send email via Resend API:
      - POST https://api.resend.com/emails
      - From: FROM_EMAIL env var
      - To: lead's email
      - Subject: "Your YouTube Channel Audit is Ready — @{channelHandle}"
      - HTML body: branded email with score preview and link to full report
      - Headers: Authorization: Bearer {RESEND_API_KEY}

The confirmation page should also poll the job status so if the lead stays on the page, they see the report appear in real-time.

ERROR HANDLING:
- Invalid YouTube URL/handle → "We couldn't find a YouTube channel at that URL. Please check and try again."
- No long-form videos → "This channel doesn't have enough long-form videos to analyse. We need at least 1 video over 2 minutes."
- Transcripts unavailable → Score based on available data, note it in the report
- API failures → Retry up to 3 times with exponential backoff, then mark as failed
```

### How to Test Phase 6
- [ ] Public form page loads at /audit (no login required)
- [ ] Submit with a real YouTube channel → audit processes
- [ ] Confirmation page shows and polls for completion
- [ ] Email is sent via Resend with report link
- [ ] GHL contact is created/updated
- [ ] Notion page is created with correct properties
- [ ] Rate limiting works (4th request in an hour gets blocked)
- [ ] Duplicate detection returns existing report

---

## Phase 7: Admin Analytics & Q&A Prep

### What This Phase Builds
- Cohort analytics
- Revenue dashboard
- Auto-generated Q&A call prep
- Campaign ROI views

### Replit Agent Prompt — Phase 7

```
Build the admin analytics pages and Q&A prep feature.

ADMIN DASHBOARD (/admin):
Overview cards at the top:
- Total Active Members (count)
- Average Score (across all members' latest audits)
- Audits Run This Month
- Total Tracking Link Clicks (last 30 days)

Alerts section:
- Members who haven't posted a new video in 2+ weeks (compare audit dates)
- Members whose scores dropped from last month
- Members approaching end of Foundations (week 4 — based on account creation date)

COHORT ANALYTICS (/admin/analytics):
- Average score improvement over first 90 days (line chart by cohort month)
- Score distribution across all members (histogram)
- Member count by service tier (pie chart)
- Upgrade rates: Foundations → Editing → Scaling (if trackable from tier changes)

REVENUE DASHBOARD (/admin/analytics/revenue):
- MRR by tier (table: Tier | # Members | Monthly Rate | Subtotal)
  - Use these rates: Foundations $499, Editing 2 $999, Editing 4 $1,499 or $2,049, Scaling 2 $1,883, Scaling 4 $2,633
  - Calculate from current member count per tier
- Total MRR
- Note: "Based on current member tiers. For exact figures, check Skool + Stripe."

CAMPAIGN ROI (/admin/analytics/campaigns):
- Per campaign: clicks, conversions, conversion rate
- If Google Ads spend data is available (manual input field per campaign): cost per click, cost per signup
- Top-performing campaigns
- Top-performing individual links

Q&A CALL PREP (/admin/qa-prep):
Auto-generate an agenda for the next Thursday Q&A call (1:30 PM MST) based on recent audits:
- Section 1: "Celebrate" — members who improved this month and on which principles
- Section 2: "Address" — members who are stuck and on which principles
- Section 3: "Suggested Topics" — most common gaps across all members (which principles are weakest overall)
- Section 4: "Per-Member Notes" — for each member with a recent audit, show 1–2 bullet points for Jared to reference during the call (specific video timestamps, specific principles to discuss)

Add a "Regenerate" button and a date picker to generate prep for a specific week.

Use Recharts for all charts. Keep the design clean and consistent with the rest of the app.
```

### How to Test Phase 7
- [ ] Admin dashboard shows overview cards with correct counts
- [ ] Alerts flag members correctly
- [ ] Cohort analytics charts render
- [ ] Revenue dashboard calculates MRR from member tiers
- [ ] Q&A prep generates sensible content from audit data
- [ ] All charts are responsive on mobile

---

## Phase 8: Polish & Settings

### What This Phase Builds
- Settings pages for admin and members
- Member resources page
- Notification system
- Final polish

### Replit Agent Prompt — Phase 8

```
Final phase — polish, settings, and remaining features.

ADMIN SETTINGS (/admin/settings):
- AI Scoring Prompt: editable text area with the Claude scoring prompt (stored in a settings table in the DB)
- Default email templates: editable templates for audit delivery emails
- GHL sync: button to manually trigger a GHL contact sync (pull all contacts with "foundations - weekly coaching" tag, create/update Foundations Member accounts)
- Danger zone: reset password for any member

MEMBER SETTINGS (/member/settings):
- Update password
- Update email (with verification)
- View their YouTube channel URL (read-only, set by admin)

MEMBER RESOURCES (/member/resources):
- Links section:
  - Skool Community: link to Skool
  - Avatar Architect GPT: link to the custom GPT
  - Scripting ARC Method GPT: link to the custom GPT
  - Workbook Downloads (if any files are available)
- Next Q&A call: show "Next Q&A: Thursday {date} at 1:30 PM MST" calculated from current date

NOTIFICATIONS:
- When Jared runs an audit for a member, show a notification dot on "My Scores" in the member sidebar
- "New monthly audit available" banner at the top of the member dashboard
- "Score improved!" highlight when principles go up (compare to previous audit)
- Store notification state in the database (read/unread)

POLISH:
- Add loading skeletons/spinners for all data-fetching pages
- Add empty states for pages with no data yet ("No audits yet — your admin will run your first audit soon!")
- Ensure all forms have proper validation and error messages
- Add a 404 page
- Add proper page titles and meta tags
- Ensure the login page redirects to the correct dashboard based on role (admin → /admin, member → /member/scores)
- Add a simple logo/brand mark in the sidebar header (text "ABV" in the brand font/colour is fine)

SEED DATA:
Create a seed script that populates the database with the 12 existing members and their baseline scores for demo/testing:

| Handle | Creator | Score |
|--------|---------|-------|
| @movingtomerritt | Jared Thomas | 3.1 |
| @TorontoHomeSearch | Jamie Harnish | 5.5 |
| @BLDGMikeVelez | Mike Velez | 4.6 |
| @PaulWolfert | Paul Wolfert | 5.1 |
| @NigelRealtor | Nigel Wong | 3.1 |
| @EdmontonHomeTeam | Jay Lewis | 3.8 |
| @presalewithuzair | Uzair Muhammad | 3.9 |
| @kenkunkel | Kenneth Kunkel | 2.7 |
| @SAZANOVICH | Alex Sazanovich | 6.3 |
| @sheldonniemiec | Sheldon Niemiec | 5.7 |
| @julierothrealestateteam | Julie Roth | 5.3 |
| @thehoustonagent | Andrew Lake | 5.3 |

Set all as role 'foundations_member', tier 'foundations', with temporary passwords.
```

### How to Test Phase 8
- [ ] Admin settings page saves and loads the AI prompt
- [ ] Member resources page shows links
- [ ] Notifications appear after running an audit
- [ ] Seed data populates correctly — 12 members visible
- [ ] Login redirects to correct dashboard
- [ ] Empty states show on new accounts
- [ ] Loading states work throughout the app

---

## Deployment Checklist

Once all phases are working on Replit:

1. **Click Deploy** in Replit → get your `.replit.app` URL
2. **Set up custom domain** in Replit's domain settings:
   - `app.attractionbyvideo.com` → main app
   - `track.attractionbyvideo.com` → same app (routing handles it)
3. **Update environment variables:**
   - `NEXTAUTH_URL` → `https://app.attractionbyvideo.com`
   - `TRACKING_DOMAIN` → `track.attractionbyvideo.com`
4. **DNS records** (in your domain registrar):
   - CNAME `app.attractionbyvideo.com` → your Replit deployment URL
   - CNAME `track.attractionbyvideo.com` → same Replit deployment URL
5. **Test the full flow:**
   - [ ] Admin login works on the custom domain
   - [ ] Public audit form works at `app.attractionbyvideo.com/audit`
   - [ ] Tracking links redirect correctly via `track.attractionbyvideo.com/r/...`
   - [ ] Emails send from correct domain
   - [ ] GHL sync works
   - [ ] Notion pages are created

---

## Troubleshooting Common Replit Issues

| Problem | Fix |
|---------|-----|
| "Module not found" errors | Replit Agent sometimes misses dependencies. Tell it: "Install the missing package {name}" |
| Database connection drops | Replit's PostgreSQL can be flaky. Add connection retry logic: tell the agent "Add database connection retry with exponential backoff" |
| Build takes too long | Replit has a build timeout. If it happens, tell the agent to split the build step |
| Transcripts fail to download | The youtube-transcript package may need a fallback. Tell the agent to add error handling that skips unavailable transcripts |
| Claude API timeout | Audit processing can take 30+ seconds. Make sure the API route has a long timeout and the job runs async |
| CORS errors on conversion endpoint | Tell the agent: "Add CORS headers to /api/conversions allowing all origins" |

---

## How Claude Code Can Help During the Build

While Replit Agent builds the app, you can come back to me for:

1. **Reviewing Replit's output** — paste code snippets and I'll check for issues
2. **Debugging** — if something breaks, describe the error and I'll help diagnose
3. **Refining prompts** — if a phase doesn't build right, I'll rewrite the prompt
4. **Testing data** — I can generate test audit data, mock API responses, etc.
5. **GHL/Notion API issues** — I know your exact field IDs and database structures
6. **Scoring prompt refinement** — adjusting the Claude scoring rubric based on results
7. **Custom domain/DNS setup** — step-by-step guidance for your registrar

Think of it as: **Replit Agent builds, Claude Code reviews and troubleshoots.**

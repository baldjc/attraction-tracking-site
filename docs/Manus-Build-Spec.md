# Attraction by Video — Platform Build Specification

> **For:** Manus AI Build Team
> **From:** Jared Chamberlain, Founder — Attraction by Video
> **Date:** March 12, 2026
> **Purpose:** Complete context and specification for building the Attraction by Video web platform

---

## Table of Contents

1. [Business Overview](#1-business-overview)
2. [Platform Summary](#2-platform-summary)
3. [User Roles & Access](#3-user-roles--access)
4. [Feature 1: YouTube Channel Audit System](#4-feature-1-youtube-channel-audit-system)
5. [Feature 2: Attraction Link Tracker](#5-feature-2-attraction-link-tracker)
6. [Feature 3: Student Dashboard](#6-feature-3-student-dashboard)
7. [Feature 4: Admin Dashboard](#7-feature-4-admin-dashboard)
8. [Feature 5: Public Lead Audit Page](#8-feature-5-public-lead-audit-page)
9. [Integrations](#9-integrations)
10. [Design & Branding](#10-design--branding)
11. [Appendix A: The 16 Scoring Principles](#appendix-a-the-16-scoring-principles)
12. [Appendix B: Audit Report Templates](#appendix-b-audit-report-templates)
13. [Appendix C: Link Tracker Technical Spec](#appendix-c-link-tracker-technical-spec)
14. [Appendix D: Course Structure Reference](#appendix-d-course-structure-reference)
15. [Appendix E: Drip Campaign Architecture](#appendix-e-drip-campaign-architecture)
16. [Appendix F: CRM Integration Reference](#appendix-f-crm-integration-reference)

---

## 1. Business Overview

### What Is Attraction by Video?

Attraction by Video teaches real estate agents how to build YouTube channels that generate quality leads through strategic content creation and viewer connection. It's a coaching and service business run by Jared Chamberlain out of Calgary, AB (Canada).

### Service Tiers

| Tier | Price | What's Included |
|------|-------|-----------------|
| **Foundations** | $499/mo (Skool) | 4-week course, Avatar Architect GPT, workbooks, weekly live Q&A (Thursdays 1:30 PM MST), private Slack, lifetime access |
| **Editing 2** | +$500/mo | 2 videos/month edited |
| **Editing 4** | +$1,000/mo (or +$1,550 with Jared feedback) | 4 videos/month edited |
| **Scaling 2** | $1,883/mo all-in | Foundations + editing + 1 funnel at launch, +1 every 60 days, Slack access with Jared, monthly Attraction Score reports |
| **Scaling 4** | $2,633/mo all-in | Foundations + editing + 2 funnels at launch, +1 every 60 days |
| **Rush funnel** | +$1,000 | Faster turnaround than 60-day cadence |

- GHL sub-account for Scaling members: $97/mo
- Billing: Skool for Foundations, Stripe for add-ons/Scaling

### Key Frameworks Taught

- **ARC Method:** Attention → Revelation → Connection (video structure)
- **PSL Framework:** Problem → Solution → Link
- **The 80% Rule:** A published video at 80% beats an unpublished video at 100%
- **Packaging Principle:** Title + thumbnail + first 30 seconds work as a single unit
- **Broad Title, Specific Content:** Generic title for clicks, specific content for ideal client

### Current Students (March 2026 Baselines)

| Channel Handle | Creator | Baseline Score |
|----------------|---------|---------------|
| @movingtomerritt | Jared Thomas | 3.1/10 |
| @TorontoHomeSearch | Jamie Harnish | 5.5/10 |
| @BLDGMikeVelez | Mike Velez | 4.6/10 |
| @PaulWolfert | Paul Wolfert | 5.1/10 |
| @NigelRealtor | Nigel Wong | 3.1/10 |
| @EdmontonHomeTeam | Jay Lewis | 3.8/10 |
| @presalewithuzair | Uzair Muhammad | 3.9/10 |
| @kenkunkel | Kenneth Kunkel | 2.7/10 |
| @SAZANOVICH | Alex Sazanovich | 6.3/10 |
| @sheldonniemiec | Sheldon Niemiec | 5.7/10 |
| @julierothrealestateteam | Julie Roth | 5.3/10 |
| @thehoustonagent | Andrew Lake | 5.3/10 |

---

## 2. Platform Summary

### What This Platform Needs to Do

This is **one unified web application** that serves three audiences:

1. **Jared (Admin)** — Run audits, manage students, view analytics, manage campaigns
2. **Students** — View their scores, track their link performance, access resources
3. **Leads (Public)** — Submit their YouTube channel for a free audit, receive a branded report

### Core Features

| Feature | Who Uses It | Summary |
|---------|-------------|---------|
| YouTube Channel Audit System | Admin + Students | Score channels against 16 principles, generate reports, track progress over time |
| Attraction Link Tracker | Admin + Students | Create tracking URLs for Google Ads, YouTube descriptions, lead magnets. Track clicks and email signups. |
| Student Dashboard | Students | View Attraction Scores, score history, link performance, lead magnet analytics |
| Admin Dashboard | Admin (Jared) | Trigger audits, view all students, cohort analytics, campaign management, revenue overview |
| Public Lead Audit Page | Leads (Public) | Enter YouTube channel URL + email → receive a free branded audit report |

---

## 3. User Roles & Access

### Admin (Jared)

- Full access to all features
- Can trigger any audit type for any student
- Can view all student dashboards
- Can manage campaigns and tracking links (both his own and view students')
- Can view revenue/cohort analytics

### Student

- Logs in with email (synced from GHL)
- Sees their own dashboard only
- Can create tracking links for their own lead magnets
- Can view their own audit history and score trends
- Can see which videos + lead magnets drive the most leads
- Cannot see other students' data

### Lead (Public / Unauthenticated)

- Can access the public lead audit form
- Enters YouTube channel URL + email + name
- Receives a branded lead audit report (delivered via email and/or viewable on site)
- Gets added to GHL as a contact with the audit link saved

---

## 4. Feature 1: YouTube Channel Audit System

### Overview

The audit system scores YouTube channels against 16 proprietary principles. There are 4 report types, each serving a different purpose.

### The 16 Principles

Each scored 0–10. Overall score = flat average of all 16 (equally weighted).

1. **Avatar Clarity** — Does the channel speak to one clear audience?
2. **Themes Over Topics** — Repeatable content buckets vs. random one-offs?
3. **ARC Attention** — Opening hook quality (first 30 seconds)
4. **ARC Revelation** — Content insights and value delivery
5. **ARC Connection** — Emotional connection and relatability
6. **Title Frameworks** — Proven title patterns that drive clicks
7. **Approve the Click** — First 30 seconds deliver on the title's promise
8. **Lead Magnet System** — Clear CTAs driving viewers to opt in
9. **Curiosity Bridges** — Transitions that keep viewers watching
10. **Show Don't Tell** — Visual proof, not just talking head
11. **Values Peppering** — Personal interests/values dropped naturally
12. **Connection Language** — Words that resonate with avatar ("I'm glad you're here" vs. "Hey guys")
13. **Story Proof** — Client stories and social proof
14. **Grade 5 Language** — Simple, accessible language
15. **Binge Architecture** — Content encouraging multi-video viewing
16. **Consistency** — Publishing cadence and regularity

### Score Colour Coding

| Score Range | Colour |
|-------------|--------|
| 7.0+ | Green |
| 5.0–6.9 | Yellow |
| Below 5.0 | Red |

### 4 Report Types

#### Type 1: Lead Audit (for prospective customers)

**Purpose:** Convert leads into Foundations members.
**Trigger:** Public form submission OR admin manually enters email/channel URL.

**Simplified format — 4 grouped dimensions (not all 16 individually):**

| Dimension | Principles Averaged |
|-----------|-------------------|
| 🎯 Channel Strategy | Avatar Clarity + Themes Over Topics + Consistency |
| 🎬 Content Impact | ARC Attention + ARC Revelation + Approve the Click + Title Frameworks + Show Don't Tell + Curiosity Bridges |
| 🤝 Viewer Connection | Connection Language + Values Peppering + Story Proof |
| 📈 Lead Generation | Lead Magnet System + Binge Architecture |

*Note: ARC Connection and Grade 5 Language are scored internally but NOT displayed in lead-facing dimensions.*

**Includes:**
- YouTube channel banner image at top
- Overall score with colour-coded callout
- 4-dimension score table
- Personalised analysis per dimension (references their specific videos)
- "What's Working" section (4–5 strengths with evidence)
- Mid-page CTA
- "After Foundations" projection table (all projected scores 8.5+, each unique)
- "The Bottom Line" section
- Primary CTA to join Foundations
- Footer: "Prepared for {Name} by Jared Chamberlain ~ Founder of Attraction by Video"

**Projection Rules:**
- All 4 "After Foundations" scores must be 8.5 or higher
- Each dimension gets a UNIQUE projected score (no two the same)
- Suggested range: 8.5, 8.7, 9.0, 9.2
- Dimensions already 7+ get projected higher (9.0–9.2)
- "What Shifts" column references lesson numbers vaguely but does NOT teach the method

**Personalisation Rules:**
- Always "you/your" voice, never third person
- Reference specific video titles as evidence
- Never estimate subscriber counts unless exact
- Don't explain what frameworks are — name them, don't teach them

#### Type 2: Baseline Audit (for new students)

**Purpose:** Comprehensive diagnostic when a student joins.
**Trigger:** Admin clicks "Run Baseline Audit" for a student.

**Full format — all 16 principles individually scored:**
- Full 16-principle scorecard with scores
- Video-by-video analysis of 5 most recent long-form videos (Opening / Insights / Connection per video)
- Learning Path showing which Foundations lessons connect to their gaps (only principles below 7)
- Q&A Topics flagged for live coaching calls
- No sales CTAs — purely diagnostic

**Learning Path Maps Principles to Lessons:**

| Principle | Lesson |
|-----------|--------|
| Avatar Clarity | 1.1 + 1.2 |
| Themes Over Topics | 1.3 |
| Lead Magnet System | 1.4 |
| Values Peppering | 2.1 |
| Connection Language | 2.2 |
| ARC Attention | 2.5 + 2.5a + 3.2 |
| ARC Revelation | 2.5 |
| ARC Connection | 2.2 + 2.5 |
| Curiosity Bridges | 2.5 |
| Story Proof | 2.5 |
| Approve the Click | 4.1 + 2.5 |
| Title Frameworks | 4.2 |
| Binge Architecture | 1.3 |
| Show Don't Tell | 2.5 |
| Grade 5 Language | N/A (practice-based) |
| Consistency | N/A (practice-based) |

#### Type 3: Monthly Progress Report (for active students)

**Purpose:** Track improvement month-over-month.
**Trigger:** Admin clicks "Run Monthly Audit" for a student (or bulk "Run All").

**Includes:**
- Progress summary with arrows showing improvement from baseline and last month
- Score comparison table: all 16 principles with Baseline / Last Month / This Month / Δ columns
- What improved this month (specific principles with video evidence)
- Videos analysed this month (table: Title, Duration, Date)
- Video-by-video breakdown
- Remaining gaps (principles still below 7, ordered by priority)
- Updated Learning Path (removes lessons for principles that hit 7+)
- What's Working (maintained + new strengths)
- One-sentence coaching summary

**Progress Colour Logic:**
- Green: improved 1+ from baseline
- Yellow: improved 0.5 from baseline
- No colour: same as baseline
- Red: declined from baseline

#### Type 4: Single Video Audit (coaching tool)

**Purpose:** Deep-dive on one video for coaching prep.
**Trigger:** Admin selects a specific video to audit.

**Includes:**
- All 16 principles scored for this single video
- Scorecard with Baseline column and Δ column
- Deep-dive organised by phase: Opening, Body, Connection & Voice, Channel Strategy
- Timestamp-level analysis throughout
- "Three Ideas for Improvement Based on Attraction Fundamentals"
- "Quick Wins & Q&A Prep" section
- No CTAs or projections (coaching tool only)

### How Audits Work (Technical Process)

**Step 1: Gather Channel Data**
1. Fetch YouTube channel banner image URL
2. Download transcripts for 5 most recent long-form videos (no Shorts) via yt-dlp
3. Pull video metadata (title, duration, publish date, view count)

**Step 2: AI Analysis**
1. Feed transcripts to AI (Claude API) with scoring rubric for all 16 principles
2. AI returns scores with specific evidence from transcripts (timestamps, quotes)
3. Calculate dimension averages (for lead audits) or per-principle scores (for all others)
4. Generate personalised analysis text

**Step 3: Generate Report**
1. Build the report using the appropriate template
2. Store in the platform's database
3. For lead audits: also create a Notion page (existing workflow) and save URL to GHL

**Step 4: Deliver**
- Lead audits: Email to lead + viewable on site
- Student audits: Appear in student dashboard
- All types: viewable by admin

### Admin Audit Controls

**Single student:**
- "Run Lead Audit" (enter email + channel URL)
- "Run Baseline Audit" (for existing student)
- "Run Monthly Audit" (for existing student)
- "Run Single Video Audit" (select specific video)

**Bulk:**
- "Run Monthly Audits — All Active Students" button
- Queues all active students, runs sequentially, shows progress
- Estimated time per student: ~2–3 minutes (transcript download + AI analysis)

---

## 5. Feature 2: Attraction Link Tracker

### Overview

A link tracking system for both Jared's business campaigns AND individual students' lead magnets. Two distinct use cases on one platform.

### Use Case A: Jared's Campaign Tracking (Google Ads + YouTube)

**Purpose:** Track clicks from Google Ads, YouTube video descriptions, and email campaigns → attribute email signups to specific campaigns and content.

**How it works:**
1. Jared creates a campaign (e.g., "Q1 2026 YouTube Retargeting")
2. Creates tracking links within the campaign, each with a destination URL
3. System auto-generates a short tracking URL: `track.attractionbyvideo.com/r/{shortCode}`
4. System also generates a Google Ads tracking template with ValueTrack parameters
5. Jared uses these URLs in Google Ads, YouTube descriptions, or emails
6. System tracks every click with full attribution data
7. When someone signs up on a landing page, a conversion snippet attributes it back to the click

**Google Ads ValueTrack Parameters Captured:**
- Campaign ID (`{campaignid}`)
- Ad Group ID (`{adgroupid}`)
- Keyword (`{keyword}`)
- Device (`{device}`)
- Network (`{network}`)
- Match Type (`{matchtype}`)

**Tracking Template Format:**
```
https://track.attractionbyvideo.com/r/{shortCode}?dest={lpurl}&cid={campaignid}&agid={adgroupid}&kw={keyword}&dev={device}&net={network}&mt={matchtype}
```

**Conversion Tracking:**
- Server sets a cookie (`_at_click`) on redirect
- JavaScript snippet on thank-you pages reads cookie and sends conversion event
- Conversion type: `EMAIL_SIGNUP` (no revenue tracking needed)

**CRITICAL: Google Ads Compliance Requirements:**
- Server-side 302 redirects (NOT JavaScript or meta refresh)
- HTTPS everywhere
- Visible destination parameter in URL (`dest={lpurl}`)
- Redirect must happen immediately (< 100ms) — log click data asynchronously AFTER redirect
- No intermediate domains the client doesn't own

### Use Case B: Student Lead Magnet Tracking

**Purpose:** Each student can create tracking links for their own lead magnets placed in YouTube video descriptions. They can see which combination of video + lead magnet drives the most leads.

**How it works:**
1. Student logs in, goes to their link tracker
2. Creates a tracking link for a lead magnet (e.g., "First-Time Buyer Checklist — placed in [video title]")
3. Gets a short URL to put in their YouTube video description
4. System tracks clicks and conversions
5. Student dashboard shows:
   - Which videos drive the most clicks
   - Which lead magnets have the highest conversion rate
   - Best-performing video + lead magnet combinations
   - Clicks and conversions over time

**Student can see:**
- Total clicks (all time and last 30 days)
- Total email signups
- Signup rate
- Performance by video (which description link got the most clicks)
- Performance by lead magnet (which guide/checklist converts best)
- Combined view: video × lead magnet matrix showing which combos win

**Student CANNOT see:**
- Other students' data
- Jared's campaign data
- Admin analytics

### Link Tracker Data Model

**Campaigns** (admin-only for now, students create links without campaigns):
- Name, description, created date
- Belong to a user (admin)

**Tracking Links:**
- Name, destination URL, short code (8 chars, alphanumeric)
- Belong to a campaign (admin) or directly to a student
- Optional: associated video title (for student lead magnet links)
- Optional: lead magnet name (for student links)

**Clicks:**
- Timestamp, IP, user agent, referrer
- Google Ads parameters (cid, agid, kw, dev, net, mt) — mostly relevant for admin links
- Linked to a tracking link

**Conversions:**
- Linked to a click
- Type: `EMAIL_SIGNUP`
- Timestamp

### Analytics Views

**Admin Dashboard (Jared sees):**
- Total clicks and conversions across all campaigns
- Signup rate
- Clicks/conversions over time (line charts, last 30 days)
- Top campaigns by clicks
- Top tracking links by clicks
- Recent clicks table with Google Ads data
- Per-student link performance overview

**Student Dashboard (each student sees):**
- Their total clicks and conversions
- Their signup rate
- Their clicks/conversions over time
- Performance by video (which video descriptions drive traffic)
- Performance by lead magnet (which lead magnets convert)
- Video × Lead Magnet performance matrix
- Recent clicks

---

## 6. Feature 3: Student Dashboard

### What Students See When They Log In

#### Attraction Score Section
- **Current overall score** (big, prominent number with colour coding)
- **Score trend chart** — line graph showing overall score over time (baseline → monthly audits)
- **16-principle breakdown** — current scores with colour coding, showing Δ from baseline
- **Principle trend** — click into any principle to see its score over time
- **Learning Path** — which Foundations lessons to revisit based on principles still below 7
- **Full audit history** — list of all audit reports (baseline, monthly, single video) with links to view each

#### Link Tracker Section
- All their tracking links with click/conversion stats
- Create new tracking link (destination URL, name, optional video title, optional lead magnet name)
- Performance analytics (as described in Feature 2, Use Case B)
- Video × Lead Magnet performance matrix

#### Resources Section
- Links to Skool community
- Links to Avatar Architect GPT
- Links to Scripting ARC Method GPT
- Next Q&A call date/time
- Workbook downloads (if applicable)

#### Activity / Notifications
- "New monthly audit available" when Jared runs their audit
- "Score improved!" highlights when principles go up
- "No new videos detected in 2+ weeks" nudge (gentle, not pushy)

---

## 7. Feature 4: Admin Dashboard

### What Jared Sees

#### Student Management
- List of all active students with: name, channel handle, current score, last audit date, service tier, status
- Click into any student → see their full dashboard (same view they see, plus admin controls)
- **Flags/alerts:**
  - Students who haven't posted in 2+ weeks
  - Students whose scores dropped from last month
  - Students approaching end of Foundations (week 4)

#### Audit Controls
- **Run Lead Audit** — enter email + YouTube channel URL (or select from GHL contacts)
- **Run Baseline Audit** — select a student
- **Run Monthly Audit** — select a student
- **Run Single Video Audit** — select a student + select a specific video
- **Run All Monthly Audits** — one button, queues entire active roster

#### Q&A Call Prep (Auto-Generated)
- For the next Thursday Q&A call, auto-generate an agenda based on recent audits:
  - Who improved and on what (celebrate)
  - Who's stuck and on what (address)
  - Suggested topics per student
  - Timestamp references from recent videos

#### Campaign Management (Link Tracker — Admin)
- Create/edit/delete campaigns
- Create tracking links within campaigns
- View analytics (as described in Feature 2)
- View all students' link performance at a glance

#### Cohort Analytics
- Average score improvement over first 90 days (by cohort)
- Retention rates by tier
- Upgrade rates (Foundations → Editing → Scaling)
- Score distribution across all students

#### Revenue Dashboard
- MRR by tier (pull from GHL pipeline or manual input)
- Student count by tier
- Churn tracking
- LTV per student (if data available)

#### Campaign ROI (Google Ads)
- Connect Google Ads spend data to tracking URL conversions
- Cost per click, cost per signup, cost per enrolled student
- ROI by campaign

---

## 8. Feature 5: Public Lead Audit Page

### Self-Serve Lead Audit

**This is the biggest unlock.** Currently lead audits are run manually. This page automates it into a 24/7 sales tool.

#### Public-Facing Form

**URL:** Something like `attractionbyvideo.com/audit` or `app.attractionbyvideo.com/audit`

**Fields:**
- Full name (required)
- Email address (required)
- YouTube channel URL or handle (required)

**On submit:**
1. Show confirmation: "Your audit is being generated. We'll email you when it's ready (usually within 5 minutes)."
2. Add contact to GHL (via API) with tag `lead-audit-requested`
3. Queue the audit job:
   a. Fetch channel banner + 5 most recent long-form video transcripts
   b. Run AI analysis against 16 principles
   c. Generate lead audit report (4 grouped dimensions, projections, CTAs)
   d. Store report in platform database
   e. Create Notion page (existing workflow)
   f. Save Notion URL to GHL contact (`lead_audit_link` field)
4. Email the lead a link to view their report on the platform
5. Report page is branded, beautiful, and ends with CTA to join Foundations

#### Report Delivery Page

- Branded page with the full lead audit report
- Channel banner at top
- Score, dimensions, analysis, projections — all as described in Type 1: Lead Audit
- CTA buttons linking to Foundations signup
- Shareable URL (lead can share it)

---

## 9. Integrations

### GoHighLevel (GHL) — Primary CRM

**API Details:**
- Base URL: `https://services.leadconnectorhq.com`
- API Key: `pit-babb9c02-a078-43ef-8ce8-6f951e7cc480`
- Location ID: `vEIiKAjpBkCDrabeDre7`

**Custom Fields:**
| Field | GHL Field ID | Purpose |
|-------|-------------|---------|
| YouTube Channel URL | `AE8we7U1ZSApVL9vUP07` | Student's channel |
| Monthly Analysis Link | `3IwK8sUBoGLsj1PlMjhe` | Latest monthly audit URL |
| Lead Audit Link | `zfEHoi06Cw8cmAi42dW6` | Lead audit report URL |

**Two-Way Sync:**
- **Pull from GHL:** Contact info, YouTube URL, tags, pipeline stage, service tier
- **Push to GHL:** Audit report URLs, lead-audit-requested tag, contact creation (from public form)

**Contact Lookup:**
```
GET https://services.leadconnectorhq.com/contacts/?query={email}
```

**Update Contact:**
```
PUT https://services.leadconnectorhq.com/contacts/{contactId}
```

### YouTube Data

**Method:** yt-dlp (command-line tool) for transcript downloads and video metadata.

**Channel banner:**
```
curl -s "https://www.youtube.com/@{handle}" | grep -o 'https://yt3\.googleusercontent\.com/[^"]*' | grep 'w2560' | head -1
```

**Video list:**
```
yt-dlp --flat-playlist --print "%(id)s|%(title)s|%(duration_string)s|%(upload_date)s|%(view_count)s" --playlist-items 1-5 "https://www.youtube.com/@{handle}/videos"
```

**Transcript download:**
```
yt-dlp --write-auto-sub --sub-lang en --skip-download -o "%(title)s" "VIDEO_URL"
```

- Only analyse long-form videos (skip Shorts)
- Use `/videos` URL path for long-form content

### Notion (Existing Audit Database)

**Database:** YouTube Channel Audits - Attraction Scores
**Data Source ID:** `31c33f3a-1ade-80ea-a5ed-000bff2f16c1`

The platform should continue creating Notion pages for audits (backward compatibility with existing workflow). This can be done via the Notion API.

**Properties to set on Notion pages:**
- Name of Audit (title)
- All 16 principle scores (number fields)
- Overall Score
- Audit Type (Lead / Student / Monthly Progress / Single Video)
- Audit Date
- Videos Analysed
- Report Month
- GHL Contact ID
- Baseline Score
- Previous Month Score

### Claude API (AI Analysis)

The audit scoring is done by feeding video transcripts to Claude with a detailed scoring rubric. The platform needs to:
1. Construct a prompt with the 16 principles, scoring rubric, and the student's transcripts
2. Send to Claude API
3. Parse the structured response (scores + evidence + analysis text)

This is the core intelligence of the audit system — the AI reads the transcripts and scores each principle with specific evidence.

### Email (Transactional)

For sending:
- Lead audit report delivery emails
- Account verification emails
- Audit notification emails to students ("Your monthly audit is ready")

Recommended: Resend (already in use for link tracker)
- API Key format: `re_xxxxxxxxxxxx`
- From: `noreply@attractionbyvideo.com`

---

## 10. Design & Branding

### Colour Palette

| Colour | Hex | Usage |
|--------|-----|-------|
| Light Grey | `#f1f1ef` | Backgrounds |
| Vivid Azure | `#3dc3ff` | Primary accent, buttons, links |
| Vivid Crimson | `#ff0033` | Secondary accent, alerts, warnings |
| Dark Grey Blue | `#1e2a38` | Text, dark elements |

### Score Colours (In Reports)

| Range | Colour |
|-------|--------|
| 7.0+ | Green (`green_bg`) |
| 5.0–6.9 | Yellow (`yellow_bg`) |
| Below 5.0 | Red (`red_bg`) |

### General Design Notes

- Clean, modern, professional
- Mobile-responsive (students will check on phones)
- Left sidebar navigation for authenticated users
- Audit reports should look polished and branded — these are client-facing deliverables
- Charts: Line charts for trends, tables for scores, colour-coded cells

### Navigation Structure

**Admin:**
- Dashboard (overview)
- Students (list + management)
- Audits (run + history)
- Q&A Prep (auto-generated)
- Campaigns (link tracker)
- Analytics (cohort, revenue, campaign ROI)
- Settings

**Student:**
- My Scores (Attraction Score + history)
- My Links (link tracker)
- Resources (GPT tools, Skool, etc.)
- Settings

---

## Appendix A: The 16 Scoring Principles (Detailed)

Each principle is scored 0–10. Here's what each measures:

| # | Principle | What It Measures |
|---|-----------|-----------------|
| 1 | Avatar Clarity | Does the channel speak to ONE clear audience? Can you tell who they're for in 30 seconds? |
| 2 | Themes Over Topics | Are there repeatable content buckets (e.g., "market updates," "neighbourhood guides") or random one-offs? |
| 3 | ARC Attention | Opening hook quality — do the first 30 seconds grab you and create a reason to keep watching? |
| 4 | ARC Revelation | Content insights — does the video deliver genuine value, unique perspective, or useful information? |
| 5 | ARC Connection | Emotional connection — does the viewer feel something? Relatability, vulnerability, shared experience? |
| 6 | Title Frameworks | Are titles using proven patterns (negativity/warning, curiosity/secret, question, list)? |
| 7 | Approve the Click | Do the first 30 seconds deliver on the title's promise? If title says "5 mistakes" do they start with mistake #1 fast? |
| 8 | Lead Magnet System | Is there a clear CTA driving viewers to opt in? (Guide, checklist, consultation, etc.) |
| 9 | Curiosity Bridges | Transitions that keep viewers watching — "but here's what most people miss..." |
| 10 | Show Don't Tell | Visual proof — iPad diagrams, B-roll, screen shares, walking through properties — not just talking head |
| 11 | Values Peppering | Personal interests/values dropped naturally — shows personality beyond real estate |
| 12 | Connection Language | "I'm glad you're here" vs. "Hey guys." Words that make the avatar feel spoken to directly |
| 13 | Story Proof | Client stories, case studies, real examples that prove credibility |
| 14 | Grade 5 Language | Simple, accessible language — no jargon, no unnecessarily complex sentences |
| 15 | Binge Architecture | Content that encourages multi-video viewing — playlists, series, references to other videos |
| 16 | Consistency | Publishing cadence and regularity — weekly is ideal |

---

## Appendix B: Audit Report Templates

### Lead Audit Page Structure

1. YouTube channel banner (FIRST element, full width)
2. Header callout (blue): "Your YouTube Channel Audit — @{ChannelHandle}"
3. Score callout (colour-coded): "Your Attraction Score: {score} / 10" + personalised one-sentence summary
4. "Your Scores" section — 4-dimension table (Channel Strategy, Content Impact, Viewer Connection, Lead Generation)
5. "What This Means" — one section per dimension with personalised analysis (3–4 sentences each, referencing their videos)
6. "What's Working" — green callout with 4–5 numbered strengths with video evidence
7. Mid-page CTA (blue callout): teaser + link to join
8. "What Your Attraction Score Could Look Like" — projection table (Now vs. After Foundations + What Shifts column)
9. Projection callout (green): "Projected Overall Score: ~{projected} / 10"
10. "The Bottom Line" — 2 paragraphs (acknowledge quality, identify the gap)
11. Primary CTA (blue callout, large): "Ready to Build the System Around Your Content?" + "→ Become an Attraction by Video Member Today!"
12. Footer: "Prepared for {Name} by Jared Chamberlain ~ Founder of Attraction by Video"

### Baseline Audit Page Structure

1. YouTube channel banner
2. Header callout: "Attraction by Video — Baseline Audit"
3. Score callout with overall score
4. Full 16-principle scorecard table
5. Videos analysed table (Title, Duration, Date)
6. Video-by-video breakdown (per video: Opening analysis, Insights analysis, Connection analysis)
7. Learning Path (principles below 7 mapped to specific lessons)
8. Q&A Topics (flagged for live call discussion)
9. What's Working (maintained strengths)
10. Footer

### Monthly Progress Report Structure

1. Header callout with month/year
2. YouTube channel banner
3. Progress summary (this month score, Δ from baseline, Δ from last month)
4. Score comparison table (16 principles × Baseline / Last Month / This Month / Δ)
5. What improved this month (specific principles with evidence)
6. Videos analysed this month
7. Video-by-video breakdown
8. Remaining gaps (principles below 7)
9. Updated Learning Path
10. What's Working (maintained + new)
11. One-sentence coaching summary (purple callout)
12. Footer

### Single Video Audit Structure

1. YouTube channel banner
2. Header: "Attraction by Video — Single Video Audit"
3. Video score callout: "Video Attraction Score: {score} / 10" + video title, duration, date
4. Scorecard table (16 principles × Baseline / This Video / Δ)
5. Video deep dive by phase:
   - Opening (ARC Attention + Approve the Click + Lead Magnet)
   - Body (ARC Revelation + Show Don't Tell + Curiosity Bridges)
   - Connection & Voice (ARC Connection + Connection Language + Values Peppering + Story Proof + Grade 5 Language)
   - Channel Strategy (Avatar Clarity + Themes + Lead Magnet + Binge Architecture + Consistency)
6. What's Working (with timestamps)
7. Three Ideas for Improvement (each: principle, score, what happened, what to do, Foundations lesson reference)
8. Quick Wins & Q&A Prep
9. One-sentence coaching summary
10. Footer

---

## Appendix C: Link Tracker Technical Spec

### Database Schema

```sql
-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    password_hash VARCHAR(255) NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    role VARCHAR(20) DEFAULT 'student', -- 'admin' or 'student'
    ghl_contact_id VARCHAR(255),
    youtube_channel_url TEXT,
    youtube_handle VARCHAR(255),
    service_tier VARCHAR(50), -- 'foundations', 'editing_2', 'editing_4', 'scaling_2', 'scaling_4'
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Campaigns table (admin use)
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tracking links table
CREATE TABLE tracking_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    destination_url TEXT NOT NULL,
    short_code VARCHAR(20) UNIQUE NOT NULL,
    video_title TEXT,        -- optional, for student lead magnet links
    lead_magnet_name TEXT,   -- optional, for student lead magnet links
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Clicks table
CREATE TABLE clicks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    link_id UUID NOT NULL REFERENCES tracking_links(id) ON DELETE CASCADE,
    timestamp TIMESTAMP DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    referrer TEXT,
    g_campaignid VARCHAR(255),
    g_adgroupid VARCHAR(255),
    g_keyword TEXT,
    g_device VARCHAR(50),
    g_network VARCHAR(50),
    g_matchtype VARCHAR(20)
);

-- Conversions table
CREATE TABLE conversions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    click_id UUID NOT NULL REFERENCES clicks(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL DEFAULT 'EMAIL_SIGNUP',
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Audits table
CREATE TABLE audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES users(id),
    audit_type VARCHAR(50) NOT NULL, -- 'lead', 'baseline', 'monthly', 'single_video'
    overall_score DECIMAL(3,1),
    scores JSONB NOT NULL, -- all 16 principle scores
    report_content JSONB NOT NULL, -- full report data
    videos_analysed JSONB, -- list of videos included
    notion_page_id VARCHAR(255),
    notion_page_url TEXT,
    report_month VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_clicks_link_id ON clicks(link_id);
CREATE INDEX idx_clicks_timestamp ON clicks(timestamp);
CREATE INDEX idx_tracking_links_short_code ON tracking_links(short_code);
CREATE INDEX idx_tracking_links_user_id ON tracking_links(user_id);
CREATE INDEX idx_campaigns_user_id ON campaigns(user_id);
CREATE INDEX idx_conversions_click_id ON conversions(click_id);
CREATE INDEX idx_audits_student_id ON audits(student_id);
CREATE INDEX idx_audits_audit_type ON audits(audit_type);
```

### Redirect Flow (CRITICAL — Must Be Fast)

```
Click on tracking link
    ↓
GET /api/r/{shortCode}?dest=...&cid=...&kw=...
    ↓
1. Look up link in DB
2. Generate unique click ID
3. Set cookie: _at_click={clickId} (domain: .chamberlaingroup.ca, 365 days, httpOnly: false)
4. Return 302 redirect IMMEDIATELY
5. Log click data ASYNCHRONOUSLY (after redirect sent)
    ↓
User arrives at destination (landing page)
    ↓
User signs up → thank-you page loads
    ↓
JavaScript snippet reads _at_click cookie
    ↓
POST /api/conversions { click_id, type: "EMAIL_SIGNUP" }
    ↓
Conversion attributed to original click
```

### Conversion Tracking Snippet (For Thank-You Pages)

```html
<script>
(function() {
  function getCookie(name) {
    const value = '; ' + document.cookie;
    const parts = value.split('; ' + name + '=');
    if (parts.length === 2) return parts.pop().split(';').shift();
  }
  var clickId = getCookie('_at_click');
  if (clickId) {
    fetch('https://track.attractionbyvideo.com/api/conversions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ click_id: clickId, type: 'EMAIL_SIGNUP' })
    }).catch(function(err) { console.error('Conversion tracking error:', err); });
  }
})();
</script>
```

---

## Appendix D: Course Structure Reference

The Foundations course is 4 weeks, delivered via Skool. This context helps the platform's Learning Path feature map audit gaps to specific lessons.

### Session 1: Positioning Your Channel (60–90 min)

| Lesson | Topic | Outcome |
|--------|-------|---------|
| 1.1 | What Do You Want? | Clarity on goals |
| 1.2 | Who Do You Want? (Avatar) | Define ONE perfect client avatar |
| 1.3 | Finding Your Themes | 1–3 repeatable content themes |
| 1.4 | Client Journey & Building Trust | Understand viewer → client conversion |
| 1.5 | Homework & Action Plan | Next steps |

### Session 2: On-Camera Confidence

| Lesson | Topic | Outcome |
|--------|-------|---------|
| 2.1 | Finding Your Authentic Self on Camera | Embrace natural personality |
| 2.2 | Connection Language | Words that resonate with avatar |
| 2.3 | 80% Rule: Just Publish It | Overcome perfectionism |
| 2.4 | Content Prep & Batch Shooting | Sustainable content system |
| 2.5 | Content Frameworks: PSL & ARC | Never face a blank page |
| 2.5a | ARC Deep Dive | Advanced ARC application |
| 2.6 | How to Present on Camera | Energy, pacing, delivery |
| 2.7 | Practical Tips for Shooting | Technical setup |
| 2.8 | Get in Your Reps — Homework | Build confidence through practice |

### Session 3: Creation

| Lesson | Topic | Outcome |
|--------|-------|---------|
| 3.1 | How to Do YouTube Research | Find topics audience searches for |
| 3.2 | Using Scripting ARC Method GPT | Create scripts with AI |
| 3.3 | Studio Setup | Lighting, audio, camera |
| 3.4 | Your First Two Videos | Record and publish |

### Session 4: Packaging

| Lesson | Topic | Outcome |
|--------|-------|---------|
| 4.1 | Packaging Principle & Building Tension | Why packaging matters most |
| 4.2 | Creating Titles | Titles that get clicks |
| 4.3 | Building a Thumbnail | Thumbnails that stand out |
| 4.4 | Special Invitation | Continue with weekly calls |

---

## Appendix E: Drip Campaign Architecture

This is context for future platform integration — the drip campaigns currently run through GHL but the platform could eventually manage or display campaign performance.

### Campaign Flow

```
Registration → Phase 0 (Pre-Webinar: 8 emails + 8 texts)
    ↓
Webinar Day
    ↓
├── Showed Up → Phase 1 (5 days: 5 emails + 6 texts) → Converts? → YES: Onboard / NO: Phase 3
├── No-Show → Phase 2 (4 days: 4 emails + 3 texts) → Attends next? → YES: Phase 1 / NO: Phase 3
    ↓
Phase 3: Extended Nurture (18 weeks: 18 emails + 1 text)
    ↓
Waitlist signup? → YES: Waitlist confirmation → notify when spots open
```

### Total Campaign Content

| Phase | Emails | Texts |
|-------|--------|-------|
| Phase 0 (Pre-Webinar) | 8 | 8 |
| Phase 1 (Showed Up) | 5 | 6 |
| Phase 2 (No-Shows) | 4 | 3 |
| Phase 3 (Extended Nurture) | 18 | 1 |
| Waitlist | 1 | 1 |
| **Total** | **36** | **19** |

### Key Campaign Principles
- "Mentor checking in" tone, not "doors closing buy now"
- Every message gives value before any ask
- Real urgency (4 spots per cohort) without manufactured pressure
- "What not How" — teach concepts, save implementation for inside Foundations
- Waitlist creates integrity

---

## Appendix F: CRM Integration Reference

The platform may eventually need to push leads into students' CRMs (as part of Scaling tier funnel services). Here are the CRMs most commonly used by real estate agents:

### Tier 1 — Easy Direct Webhook
- **Follow Up Boss** — Basic Auth, flat JSON, most common
- **Rechat** — Channel UUID in URL = auth, simplest to implement
- **kvCORE / BoldTrail** — Bearer token + flat JSON

### Tier 2 — Moderate Setup
- **CINC** — OAuth + nested JSON
- **LionDesk** — Basic Auth + flat JSON

### Tier 3 — Requires Middleware
- **Wise Agent** — Form-encoded, not JSON
- **BoomTown** — Partner-restricted, use Zapier

### Follow Up Boss Webhook (Most Common)

```
POST https://api.followupboss.com/v1/events
Auth: Basic (User: API_KEY, Pass: blank)

{
  "source": "Attraction by Video",
  "type": "General Inquiry",
  "message": "Downloaded [Lead Magnet Name] from YouTube video [Video Title]",
  "person": {
    "firstName": "...",
    "lastName": "...",
    "emails": [{"value": "..."}],
    "phones": [{"value": "..."}],
    "tags": ["YouTube_Lead", "GHL_Lead"]
  }
}
```

---

## Appendix G: Technical Implementation Details

### Recommended Tech Stack

| Component | Recommendation | Rationale |
|-----------|---------------|-----------|
| Framework | Next.js 14+ (TypeScript) | Full-stack React, API routes, server-side rendering for report pages |
| Database | PostgreSQL | Relational data (users, audits, links, clicks), JSONB for flexible audit data |
| ORM | Prisma | Type-safe queries, migration management |
| Auth | NextAuth.js v5 | Industry standard, supports credentials + magic link |
| Email | Resend | Developer-friendly transactional email |
| Charts | Recharts or Chart.js | Score trends, click analytics |
| Styling | Tailwind CSS | Matches colour palette, rapid UI development |
| Job Queue | BullMQ (Redis-backed) or similar | Audits take 2–3 min — must run as background jobs |
| AI | Claude API (Anthropic) | Scoring engine for audits |
| Deployment | Vercel or Railway | Next.js-native hosting, easy PostgreSQL + Redis |

### Authentication & Account Creation

**Admin account:** Pre-created, hardcoded role = `admin` for jared@chamberlaingroup.ca.

**Student accounts — created by admin:**
1. Admin clicks "Add Student" in the platform
2. Enters: email, full name, YouTube channel URL/handle, service tier
3. Platform creates account + sends magic link invitation email to student
4. Student clicks link → sets password → account active
5. Platform also looks up GHL contact by email and stores `ghl_contact_id` for future sync

**Student accounts — auto-sync from GHL (stretch goal):**
- Nightly job polls GHL for contacts with specific tags (e.g., `foundations-active`)
- Auto-creates accounts for new tagged contacts
- Updates service tier if tag changes

**Lead accounts:** No account created. Public audit form is unauthenticated. Lead gets a unique report URL, no login required.

### AI Scoring Engine — The Prompt

This is the core of the platform. The AI needs a detailed rubric to score consistently. Here's the structure of the scoring prompt:

```
You are an expert YouTube channel analyst for Attraction by Video.

You will be given transcripts from {count} recent long-form YouTube videos by a real estate agent.

Score the channel against each of the 16 Attraction by Video principles on a scale of 0–10.

For each principle, provide:
- A numeric score (0–10, one decimal place)
- 2–3 sentences of specific evidence from the transcripts (include video title and timestamp where possible)
- What's working and what's missing

THE 16 PRINCIPLES AND SCORING RUBRIC:

1. AVATAR CLARITY (0–10)
   - 0–3: No clear audience. Generic "everyone" content. Could be for any viewer.
   - 4–6: Some audience awareness but inconsistent. Sometimes speaks to a specific person, sometimes generic.
   - 7–8: Clear audience in most videos. You can tell who this channel is for.
   - 9–10: Every video feels like it was made for ONE specific person. Crystal clear avatar.

2. THEMES OVER TOPICS (0–10)
   - 0–3: Random, disconnected video topics. No repeatable buckets.
   - 4–6: Some recurring themes but also many one-offs. Inconsistent categorisation.
   - 7–8: Clear 2–4 content themes/buckets. Most videos fit into a theme.
   - 9–10: Strong, defined themes that compound. Viewer knows what to expect.

3. ARC ATTENTION — Opening Hook (0–10)
   - 0–3: Weak or non-existent hook. "Hey guys, welcome back." No reason to keep watching.
   - 4–6: Some attempt at a hook but doesn't create urgency or curiosity.
   - 7–8: Opens with a clear hook that creates a reason to watch. Sets up the video's value.
   - 9–10: Masterful opening that instantly hooks. Creates tension, curiosity, or stakes in first 30 seconds.

4. ARC REVELATION — Content Insights (0–10)
   - 0–3: Surface-level information. Nothing a viewer couldn't find elsewhere.
   - 4–6: Some useful information but lacks unique perspective or depth.
   - 7–8: Delivers genuine value. Unique insights, real data, or actionable advice.
   - 9–10: Revelatory content. Viewer learns something they genuinely didn't know.

5. ARC CONNECTION — Emotional Connection (0–10)
   - 0–3: No emotional resonance. Purely transactional information delivery.
   - 4–6: Occasional moments of personality or relatability.
   - 7–8: Viewer feels a real connection. Authenticity, vulnerability, shared values.
   - 9–10: Deep connection. Viewer feels like they know and trust the creator.

6. TITLE FRAMEWORKS (0–10)
   - 0–3: Generic, descriptive titles. "Calgary Market Update March 2026."
   - 4–6: Some attention-getting titles but inconsistent use of frameworks.
   - 7–8: Most titles use proven patterns (negativity, curiosity, question, list).
   - 9–10: Every title is crafted using frameworks. Keyword-rich, curiosity-driven.

7. APPROVE THE CLICK (0–10)
   - 0–3: First 30 seconds don't relate to the title. Viewer feels misled.
   - 4–6: Eventually gets to the title's promise but takes too long.
   - 7–8: First 30 seconds clearly set up delivery on the title's promise.
   - 9–10: Title promise addressed immediately. Viewer feels rewarded for clicking.

8. LEAD MAGNET SYSTEM (0–10)
   - 0–3: No CTA. No lead magnet mentioned. No way for viewer to take next step.
   - 4–6: Occasional mention of a link or resource but no systematic approach.
   - 7–8: Clear lead magnet CTA in most videos. Consistent placement.
   - 9–10: Strategic lead magnet system. Multiple CTAs woven naturally into content.

9. CURIOSITY BRIDGES (0–10)
   - 0–3: No transitions. Abrupt topic changes. Viewer has no reason to keep watching.
   - 4–6: Some transitions but mechanical ("Next up...").
   - 7–8: Good curiosity-building transitions. "But here's what most people miss..."
   - 9–10: Masterful bridges that create anticipation for what's coming next.

10. SHOW DON'T TELL (0–10)
    - 0–3: Pure talking head. No visual evidence, no B-roll, no screen shares.
    - 4–6: Some visual elements but mostly talking.
    - 7–8: Regular use of visuals — iPad drawings, B-roll, screen shares, walkthroughs.
    - 9–10: Rich visual storytelling. Multiple visual proof elements per video.

11. VALUES PEPPERING (0–10)
    - 0–3: No personality beyond real estate. Could be any agent.
    - 4–6: Occasional personal mentions but feels forced or rare.
    - 7–8: Natural drops of personal interests, family, hobbies. Feels authentic.
    - 9–10: Personality woven throughout. Viewer knows them as a person, not just an agent.

12. CONNECTION LANGUAGE (0–10)
    - 0–3: Generic greetings ("Hey guys"). No language targeting specific viewer.
    - 4–6: Some attempts at direct address but inconsistent.
    - 7–8: Regular use of "you" language, empathetic phrases, avatar-specific terms.
    - 9–10: Every video feels personally addressed. "I'm glad you're here." Avatar-specific language throughout.

13. STORY PROOF (0–10)
    - 0–3: No client stories. No social proof. No case studies.
    - 4–6: Occasional mention of a client but no detailed stories.
    - 7–8: Regular client stories with specifics. Builds credibility.
    - 9–10: Rich storytelling. Multiple proof points per video. Viewer trusts through evidence.

14. GRADE 5 LANGUAGE (0–10)
    - 0–3: Heavy jargon. Complex sentences. Feels like reading a contract.
    - 4–6: Mostly accessible but occasional jargon or unnecessarily complex explanations.
    - 7–8: Clear, simple language. Easy to follow. Minimal jargon.
    - 9–10: Crystal clear communication. A 10-year-old could follow the key points.

15. BINGE ARCHITECTURE (0–10)
    - 0–3: No references to other videos. No playlists. No series.
    - 4–6: Occasional "check out my other video" but no intentional architecture.
    - 7–8: Regular references to related content. Some series or playlists.
    - 9–10: Intentional binge structure. Playlists, series, consistent cross-references.

16. CONSISTENCY (0–10)
    - 0–3: Sporadic posting. Months between videos.
    - 4–6: Semi-regular but unpredictable. Sometimes weekly, sometimes monthly.
    - 7–8: Regular publishing schedule. Roughly weekly.
    - 9–10: Consistent weekly (or more) publishing. Reliable cadence.

RESPONSE FORMAT:
Return a JSON object with this structure:
{
  "scores": {
    "avatar_clarity": { "score": 5.5, "evidence": "..." },
    "themes_over_topics": { "score": 4.0, "evidence": "..." },
    ... (all 16)
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
```

**Important:** The AI prompt should be stored as a configurable template in the platform (not hardcoded), so Jared can refine the rubric over time without a code deploy.

### Background Job Architecture

Audits are long-running (2–3 minutes per student). They MUST run as background jobs, not synchronous requests.

**Flow:**
1. Admin clicks "Run Audit" → API creates a job record (status: `queued`)
2. Background worker picks up the job
3. Worker updates status: `queued` → `downloading_transcripts` → `analysing` → `generating_report` → `complete` (or `failed`)
4. Frontend polls job status every 5 seconds (or uses WebSocket/SSE)
5. When complete, report appears in dashboard

**Bulk monthly audits:**
- Creates one job per student
- Jobs run sequentially (to avoid rate-limiting YouTube/Claude API)
- Admin sees progress: "3/12 students complete..."

**Job table:**
```sql
CREATE TABLE audit_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_type VARCHAR(50) NOT NULL,
    student_id UUID REFERENCES users(id),
    status VARCHAR(50) DEFAULT 'queued', -- queued, downloading, analysing, generating, complete, failed
    error_message TEXT,
    audit_id UUID REFERENCES audits(id), -- set when complete
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Student Link Tracking — Conversion on Student Domains

**The problem:** The `_at_click` cookie is set on `.chamberlaingroup.ca` (Jared's domain). But students' landing pages are on their OWN domains (their own websites, GHL pages, etc.). Cookies can't be shared cross-domain.

**Solution: Pixel-based conversion tracking for students.**

Instead of relying on a cookie, use a tracking pixel / JavaScript snippet approach:

1. Student creates a tracking link: `track.attractionbyvideo.com/r/AbC123` → destination: `student-website.com/checklist`
2. On click, the redirect appends the click ID as a query parameter: `student-website.com/checklist?_atc=AbC123`
3. Student adds a conversion snippet to their thank-you page:
```html
<script>
(function() {
  var params = new URLSearchParams(window.location.search);
  var clickId = params.get('_atc');
  if (!clickId) {
    // Check sessionStorage as fallback (set by landing page)
    clickId = sessionStorage.getItem('_atc');
  }
  if (clickId) {
    fetch('https://track.attractionbyvideo.com/api/conversions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ click_id: clickId, type: 'EMAIL_SIGNUP' })
    }).catch(function(err) {});
  }
})();
</script>
```
4. Student also adds a one-liner to their landing page to persist the click ID:
```html
<script>
var p = new URLSearchParams(window.location.search);
if (p.get('_atc')) sessionStorage.setItem('_atc', p.get('_atc'));
</script>
```

This way conversion tracking works on ANY domain — no cookie sharing needed.

**For Jared's own links** (`.chamberlaingroup.ca`), the cookie-based approach still works and is cleaner. The platform should support BOTH methods.

### Data Migration — Existing Baselines

The 12 existing student baselines (March 2026) need to be imported into the platform database on launch. These currently exist as:

1. **Notion pages** (with all 16 scores as page properties)
2. **Local markdown files** (full internal analysis with video breakdowns)

**Migration approach:**
- Pull scores from Notion API using the page IDs listed in Section 1 (Current Students table)
- Import into the `audits` table with `audit_type = 'baseline'`
- Link to existing Notion page URLs via `notion_page_id` and `notion_page_url`
- Create student accounts for all 12 students using their GHL data

### Error Handling

| Scenario | Handling |
|----------|---------|
| YouTube channel doesn't exist / handle invalid | Show error: "We couldn't find a YouTube channel at that URL. Please check and try again." |
| Channel has no long-form videos (only Shorts) | Show error: "This channel doesn't have enough long-form videos to analyse. We need at least 1 video over 2 minutes." |
| Transcripts unavailable (no auto-captions) | Score based on available data. Note in report: "Auto-generated captions were not available for {video title}. This video was scored based on metadata and visual analysis only." |
| Claude API rate limit / error | Retry up to 3 times with exponential backoff. If still failing, mark job as `failed` with error message. |
| GHL API down | Queue the GHL sync for retry. Don't block the audit. |
| Duplicate lead audit request (same email + channel) | Return the existing report if generated within the last 30 days. Otherwise, generate fresh. |
| Public form spam | Rate limit: max 3 audit requests per IP per hour. CAPTCHA (reCAPTCHA v3 or Turnstile) on the public form. |

### Notion API Authentication

To create audit pages in the existing Notion database, the platform needs a Notion integration token.

**Setup required:**
1. Create an internal Notion integration at https://www.notion.so/my-integrations
2. Share the "YouTube Channel Audits - Attraction Scores" database with the integration
3. Store the integration token as an environment variable: `NOTION_API_KEY`

**Notion API base URL:** `https://api.notion.com/v1`
**Database ID:** `31c33f3a-1ade-80ea-a5ed-000bff2f16c1`

### Environment Variables (Complete List)

```env
# Database
DATABASE_URL=postgresql://user:password@host:port/attractionbyvideo

# Redis (for job queue)
REDIS_URL=redis://localhost:6379

# Auth
NEXTAUTH_SECRET=<random-string>
NEXTAUTH_URL=https://app.attractionbyvideo.com

# Claude API (for AI scoring)
ANTHROPIC_API_KEY=sk-ant-...

# GoHighLevel
GHL_API_KEY=pit-babb9c02-a078-43ef-8ce8-6f951e7cc480
GHL_LOCATION_ID=vEIiKAjpBkCDrabeDre7
GHL_BASE_URL=https://services.leadconnectorhq.com

# Notion
NOTION_API_KEY=secret_...
NOTION_AUDIT_DB_ID=31c33f3a-1ade-80ea-a5ed-000bff2f16c1

# Email (Resend)
RESEND_API_KEY=re_...
FROM_EMAIL=noreply@attractionbyvideo.com

# Tracking
TRACKING_DOMAIN=track.attractionbyvideo.com
FALLBACK_URL=https://attractionbyvideo.com

# App
ADMIN_EMAIL=jared@chamberlaingroup.ca
```

### Hosting & Deployment

**Preferred:** Vercel (for Next.js) + managed PostgreSQL (Neon, Supabase, or Railway) + Upstash Redis (for job queue)

**Alternative:** Railway (all-in-one: Next.js + PostgreSQL + Redis)

**Domains to configure:**
- `app.attractionbyvideo.com` → main platform
- `track.attractionbyvideo.com` → redirect/tracking service (can be same app, different subdomain)

**DNS:** Both subdomains point to the deployed app. Routing is handled by the app.

### Security Notes

- All API keys (GHL, Notion, Claude, Resend) stored as environment variables, never in code
- Student data is isolated — middleware checks `user_id` on every query
- Public audit form is rate-limited and CAPTCHA-protected
- Tracking link redirects do NOT require authentication (they're public URLs)
- Admin role is checked server-side, not just in the UI
- GHL API key should be rotated periodically (it's a long-lived key)

---

## Summary: What Manus Needs to Build

1. **Unified web app** with admin + student + public roles
2. **YouTube audit engine** — yt-dlp transcripts → Claude AI scoring → branded reports (4 types)
3. **Link tracker** — short URL redirects, Google Ads compliant, click/conversion tracking
4. **Student dashboard** — scores, trends, link performance, resources
5. **Admin dashboard** — student management, audit triggers (single + bulk), Q&A prep, analytics
6. **Public lead audit page** — self-serve form → automated audit → email delivery → GHL sync
7. **GHL integration** — two-way sync (contacts, tags, audit URLs)
8. **Notion integration** — create audit pages in existing database
9. **Email delivery** — transactional emails for audit reports and account management

### Domains

- **Main app:** TBD (e.g., `app.attractionbyvideo.com`)
- **Tracking URLs:** `track.attractionbyvideo.com`
- **Landing pages (existing):** `chamberlaingroup.ca` / `guides.chamberlaingroup.ca`

### Contact

- Jared Chamberlain — jared@chamberlaingroup.ca
- Founder, Attraction by Video & Chamberlain Real Estate Group
- Calgary, AB, Canada

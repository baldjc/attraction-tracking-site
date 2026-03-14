# Attraction by Video — Complete Audit System Guide

> **Purpose:** This document contains EVERYTHING needed to replicate the YouTube Channel Audit system — every step, every API call, every scoring rubric, every template, every rule. A developer or AI agent reading this document should be able to run audits identically to how they're done today.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Step-by-Step: Running an Audit End to End](#2-step-by-step-running-an-audit-end-to-end)
3. [The 16 Scoring Principles — Full Rubric](#3-the-16-scoring-principles--full-rubric)
4. [How the AI Scores Videos](#4-how-the-ai-scores-videos)
5. [The 4 Report Types — Complete Templates](#5-the-4-report-types--complete-templates)
6. [Lesson Reference Map](#6-lesson-reference-map)
7. [Q&A Flag Guidelines](#7-qa-flag-guidelines)
8. [GHL API Reference](#8-ghl-api-reference)
9. [YouTube Data Collection](#9-youtube-data-collection)
10. [Notion API Reference](#10-notion-api-reference)
11. [Score Calculation Rules](#11-score-calculation-rules)
12. [Personalisation & Voice Rules](#12-personalisation--voice-rules)
13. [Complete Example: Low Scorer Analysis](#13-complete-example-low-scorer-analysis)
14. [Complete Example: Mid-Range Scorer Analysis](#14-complete-example-mid-range-scorer-analysis)
15. [Complete Example: Single Video Audit](#15-complete-example-single-video-audit)

---

## 1. System Overview

### What This System Does

Scores real estate agents' YouTube channels against 16 proprietary principles taught in the Attraction by Video Foundations course. Produces 4 types of branded reports that serve different purposes (lead conversion, student onboarding, monthly coaching, single-video feedback).

### The 4 Report Types

| Type | Audience | Purpose | Trigger |
|------|----------|---------|---------|
| **Lead Audit** | Prospective customers | Convert leads into Foundations members | Public form or admin manual entry |
| **Baseline Audit** | New students | Comprehensive diagnostic at onboarding | Admin runs when student joins |
| **Monthly Progress** | Active students | Track improvement over time | Admin runs monthly (single or bulk) |
| **Single Video** | Active students | Deep-dive coaching on one video | Admin selects specific video |

### Data Flow

```
1. IDENTIFY TARGET
   └── Lead: email + YouTube URL from form or admin
   └── Student: email lookup in GHL → pull YouTube URL from custom field

2. GATHER YOUTUBE DATA
   └── Channel banner image URL
   └── 5 most recent long-form videos (skip Shorts < 60 sec)
   └── Auto-generated transcripts for each video (via yt-dlp)
   └── Video metadata: title, duration, upload date, view count

3. AI ANALYSIS
   └── Feed transcripts + metadata to Claude API
   └── Score all 16 principles (0–10 each) with evidence
   └── Generate personalised analysis text per the report template
   └── Calculate overall score (flat average of 16)

4. GENERATE REPORT
   └── Build Notion page using the appropriate template
   └── Store audit data in platform database

5. DELIVER & SYNC
   └── Lead: email report link + save Notion URL to GHL
   └── Student: show in dashboard + update GHL monthly_analysis_link
```

---

## 2. Step-by-Step: Running an Audit End to End

### Step 1: Identify the Target

**For a lead audit (from public form or manual):**
- Input: email address + YouTube channel URL (or handle like `@channelname`)
- Look up in GHL to check if contact exists:
  ```
  GET https://services.leadconnectorhq.com/contacts/?query={email}&locationId=vEIiKAjpBkCDrabeDre7
  Headers: Authorization: Bearer {GHL_API_KEY}, Version: 2021-07-28
  ```
- If contact exists: pull their GHL Contact ID and any existing data
- If contact doesn't exist: create the contact in GHL:
  ```
  POST https://services.leadconnectorhq.com/contacts/
  Body: { "firstName": "...", "lastName": "...", "email": "...", "locationId": "vEIiKAjpBkCDrabeDre7", "tags": ["lead-audit-requested"] }
  ```

**For a student audit:**
- Fetch all contacts with tag `foundations - weekly coaching`:
  ```
  GET https://services.leadconnectorhq.com/contacts/?locationId=vEIiKAjpBkCDrabeDre7&limit=100
  ```
- Filter client-side: only contacts whose `tags` array contains `foundations - weekly coaching`
- For each matching contact, extract the `youtube_channel_url` custom field (field ID: `AE8we7U1ZSApVL9vUP07`)
- This gives you: contact ID, name, email, YouTube channel URL

### Step 2: Fetch YouTube Channel Data

**2a. Get channel banner image:**

Option A — scrape from channel page HTML:
```bash
curl -s "https://www.youtube.com/@{handle}" | grep -o 'https://yt3\.googleusercontent\.com/[^"]*' | grep 'w2560' | head -1
```

Option B — via yt-dlp JSON (look for banner/w2560 in thumbnails):
```bash
yt-dlp --dump-json --playlist-items 0 "https://www.youtube.com/@{handle}/videos"
```

**2b. Get video list (5 most recent long-form, skip Shorts):**

```bash
yt-dlp --flat-playlist --dump-json --no-download --playlist-end 15 "https://www.youtube.com/@{handle}/videos"
```

This returns one JSON object per line. For each video:
- Parse: `id`, `title`, `upload_date` (YYYYMMDD), `duration` (seconds), `view_count`
- **Skip any video with duration < 60 seconds** (these are Shorts)
- Take the first 5 that pass the filter
- Build URL: `https://www.youtube.com/watch?v={id}`

**For monthly audits:** Only include videos published AFTER the last audit date. Compare `upload_date` against the stored last audit date.

**2c. Download transcripts for each video:**

```bash
yt-dlp --write-auto-sub --sub-lang en --skip-download -o "{safe_title}" "{video_url}"
```

This downloads a `.en.vtt` file (WebVTT format with timestamps).

**2d. Strip VTT to plain text:**

The raw VTT files contain timestamp lines, formatting tags, and duplicate lines. Strip them:

```python
import re

def strip_vtt_to_text(vtt_content):
    lines = vtt_content.split('\n')
    text_lines = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if line == 'WEBVTT':
            continue
        if line.startswith('Kind:') or line.startswith('Language:'):
            continue
        if re.match(r'^\d{2}:\d{2}', line):  # timestamp line
            continue
        if re.match(r'^\d+$', line):  # sequence number
            continue
        line = re.sub(r'<[^>]+>', '', line)  # strip HTML tags
        if line and (not text_lines or line != text_lines[-1]):  # deduplicate
            text_lines.append(line)
    return '\n'.join(text_lines)
```

**For non-English channels** (e.g., Russian): use `--sub-lang ru` and adjust accordingly.

**If no transcript is available:** Note it in the analysis. Score based on available data (metadata, title patterns, thumbnail analysis). Flag in the report: "Auto-generated captions were not available for this video."

### Step 3: Read and Prepare Transcripts

For each video, you now have:
- Title, duration, upload date, view count
- Plain text transcript (if available)

Prepare a structured input for the AI:

```
VIDEO 1: "{title}"
Duration: {minutes}:{seconds} | Published: {date} | Views: {view_count}
Transcript available: Yes/No

[Full transcript text here]

---

VIDEO 2: "{title}"
...
```

### Step 4: Check for Existing Audit Data

Before scoring, check if this channel already has audit data in the database:
- If YES (existing baseline + possibly previous months): this is a **monthly audit** — pull baseline scores and previous month scores for comparison
- If NO: this is a **baseline audit** — no comparison data needed

For lead audits, always treat as fresh (no comparison).

### Step 5: Score with AI (Claude API)

**This is the core of the system.** Send the transcripts to the Claude API with the full scoring rubric.

**API Call:**
```
POST https://api.anthropic.com/v1/messages
Headers:
  x-api-key: {ANTHROPIC_API_KEY}
  anthropic-version: 2023-06-01
  content-type: application/json

Body:
{
  "model": "claude-sonnet-4-20250514",
  "max_tokens": 8000,
  "messages": [
    {
      "role": "user",
      "content": "{THE FULL SCORING PROMPT — SEE SECTION 4 BELOW}"
    }
  ]
}
```

The AI returns a structured JSON response with all 16 scores, evidence, and analysis text. See Section 4 for the complete prompt.

### Step 6: Calculate Scores

From the AI response:
1. Extract all 16 principle scores (each 0–10, one decimal place)
2. **Overall score** = flat average of all 16 (equally weighted)
3. **For lead audits** — also calculate 4 dimension scores:
   - Channel Strategy = average of (Avatar Clarity + Themes Over Topics + Consistency)
   - Content Impact = average of (ARC Attention + ARC Revelation + Approve the Click + Title Frameworks + Show Don't Tell + Curiosity Bridges)
   - Viewer Connection = average of (Connection Language + Values Peppering + Story Proof)
   - Lead Generation = average of (Lead Magnet System + Binge Architecture)
   - *Note: ARC Connection and Grade 5 Language are scored but NOT included in these 4 dimensions*

### Step 7: Build the Report

Use the appropriate template (see Section 5) based on audit type. Populate with:
- Channel banner URL
- Creator name, channel handle
- All scores with colour coding
- Personalised analysis text from the AI
- For students: Learning Path mapping gaps to lessons (see Section 6)
- For students: Q&A flags (see Section 7)
- For leads: Projection scores and CTAs

### Step 8: Create Notion Page

```
POST https://api.notion.com/v1/pages
Headers:
  Authorization: Bearer {NOTION_API_KEY}
  Notion-Version: 2022-06-28

Body: {
  "parent": { "database_id": "31c33f3a-1ade-80ea-a5ed-000bff2f16c1" },
  "properties": {
    "Name of Audit": { "title": [{ "text": { "content": "March 2026 YouTube Attraction Score for {Creator Name}" } }] },
    "Channel Name": { "rich_text": [{ "text": { "content": "@handle" } }] },
    "Creator": { "rich_text": [{ "text": { "content": "Creator Name" } }] },
    "Overall Attraction Score": { "number": 5.5 },
    "Avatar Clarity": { "number": 6.0 },
    "Themes": { "number": 4.0 },
    ... (all 16 principle scores as number properties) ...
    "Audit Type": { "select": { "name": "Student" } },
    "Videos Analysed": { "number": 5 },
    "Baseline Score": { "number": 5.5 },
    "Report Month": { "rich_text": [{ "text": { "content": "March 2026" } }] },
    "GHL Contact ID": { "rich_text": [{ "text": { "content": "contact-id" } }] },
    "Audit Date": { "date": { "start": "2026-03-06" } }
  },
  "children": [
    ... (Notion blocks built from the template markdown — see Section 5)
  ]
}
```

**Notion property names for the 16 scores:**
`Avatar Clarity`, `Themes`, `ARC Attention`, `ARC Revelation`, `ARC Connection`, `Title Frameworks`, `Approve the Click`, `Lead Magnet`, `Curiosity Bridges`, `Show Don't Tell`, `Values Peppering`, `Connection Language`, `Story Proof`, `Grade 5 Language`, `Binge Architecture`, `Consistency`

### Step 9: Save to Platform Database

Store the full audit data in the platform's `audits` table:
- All 16 scores (as JSONB)
- Overall score
- Full report content (as JSONB)
- Videos analysed (as JSONB)
- Notion page ID and URL
- Audit type, date, student ID

### Step 10: Update GHL

**For students — update monthly analysis link:**
```
PUT https://services.leadconnectorhq.com/contacts/{contactId}
Headers: Authorization: Bearer {GHL_API_KEY}, Version: 2021-07-28
Body: {
  "customFields": [
    { "key": "3IwK8sUBoGLsj1PlMjhe", "field_value": "{notion_page_url}" }
  ]
}
```

**For leads — update lead audit link:**
```
PUT https://services.leadconnectorhq.com/contacts/{contactId}
Headers: Authorization: Bearer {GHL_API_KEY}, Version: 2021-07-28
Body: {
  "customFields": [
    { "key": "zfEHoi06Cw8cmAi42dW6", "field_value": "{notion_page_url}" }
  ]
}
```

### Step 11: Deliver

- **Lead audits:** Email the lead a link to view their report
- **Student audits:** Show in student dashboard; optionally notify via email
- **Admin:** Show summary with score, top gaps, top strengths, Notion link

---

## 3. The 16 Scoring Principles — Full Rubric

This is the exact rubric the AI uses to score each principle. Each score is 0–10 with one decimal place.

### 1. Avatar Clarity (0–10)

**What to look for:** Is there ONE clear ideal viewer? Does the Napkin Test pass? (Can you describe who this channel is for in 60 seconds?)

| Score | Description |
|-------|-------------|
| 0–2 | No clear audience. Generic content that could be for anyone. Random mix of topics with no identifiable viewer in mind. |
| 3–4 | Some audience awareness but shifts between videos. One video targets first-time buyers, the next targets luxury sellers. No consistent "who." |
| 5–6 | Partially passes the Napkin Test. You can guess the audience but it's too broad (e.g., "people buying homes in Toronto" rather than "young professionals buying their first condo downtown"). |
| 7–8 | Clear audience in most videos. You can tell who this channel is for. The language, examples, and topics consistently speak to one type of person. |
| 9–10 | Crystal clear. Every video feels like it was made for ONE specific person. Their fears, goals, language, and situation are woven throughout every piece of content. |

**Evidence to cite:** Specific phrases that reveal who they're talking to (or the absence of them). Note when the avatar shifts between videos.

### 2. Themes Over Topics (0–10)

**What to look for:** Are there repeatable content buckets (e.g., "market updates," "neighbourhood guides," "buyer mistakes") that rotate, or is it random one-offs?

| Score | Description |
|-------|-------------|
| 0–2 | Random, disconnected topics. No repeatable structure. Each video seems unrelated to the next. |
| 3–4 | Slight patterns emerging but mostly one-offs. Maybe 2 market updates among 5 unrelated videos. |
| 5–6 | Some recurring themes but inconsistent categorisation. 2–3 possible buckets visible but not intentional. |
| 7–8 | Clear 2–4 content themes/buckets. Most videos fit into a defined theme. Viewer knows what to expect from the channel. |
| 9–10 | Strong, defined themes that compound. Content pillars are obvious. Videos within themes reference each other. Viewer can binge within a theme. |

**Evidence to cite:** List the videos and which theme each belongs to. Note patterns or lack thereof.

### 3. ARC Attention — Opening Hook (0–10)

**What to look for:** First 20–30 seconds. Does the opening grab attention and create a reason to keep watching? Four intro patterns to look for: authority hook, problem hook, revelation hook, story hook.

| Score | Description |
|-------|-------------|
| 0–2 | "Hey guys, welcome back to my channel. Today I want to talk about..." — No hook, no urgency, no reason to watch. |
| 3–4 | Some attempt at an opening but weak. Might mention the topic but doesn't create curiosity or stakes. |
| 5–6 | Decent hook — states what the video is about with some energy. But doesn't create tension, curiosity, or a reason to watch till the end. |
| 7–8 | Strong hook that creates a clear reason to keep watching. Opens with a bold statement, surprising fact, or question that demands an answer. |
| 9–10 | Masterful opening. First 15 seconds hook you completely. Creates tension, stakes, or curiosity that makes you NEED to keep watching. Pattern interrupt or unexpected opening. |

**Evidence to cite:** Quote the exact opening words. Note timestamps. Compare across videos.

### 4. ARC Revelation — Content Insights (0–10)

**What to look for:** Does the video deliver genuine value? Unique perspectives? Information the viewer couldn't easily find elsewhere? The Enhanced Value Loop: insight → evidence → implication.

| Score | Description |
|-------|-------------|
| 0–2 | Surface-level. Basic information anyone could Google. No unique perspective. Property tours with no analysis. |
| 3–4 | Some useful information but lacks depth or unique angle. Covers what everyone else covers the same way. |
| 5–6 | Decent value delivery. Some useful insights but nothing that makes you think "I didn't know that." |
| 7–8 | Genuine value. Unique data, insider knowledge, contrarian takes, or deeply analysed information. Viewer learns something real. |
| 9–10 | Revelatory. Multiple "aha" moments per video. Original research, unique data analysis, perspectives that genuinely shift how the viewer thinks about the topic. |

**Evidence to cite:** Quote specific insights delivered. Note what was unique vs. generic.

### 5. ARC Connection — Emotional Connection (0–10)

**What to look for:** Does the viewer FEEL something? Trust, relatability, shared experience, vulnerability. Connection distributed throughout the video, not just one moment.

| Score | Description |
|-------|-------------|
| 0–2 | Zero emotional resonance. Purely transactional information delivery. Could be an AI reading a script. |
| 3–4 | Occasional personality but mostly robotic or scripted. One warm moment in an otherwise clinical video. |
| 5–6 | Some connection moments. Viewer might think "they seem nice" but not "I trust this person." |
| 7–8 | Real connection. Authenticity, vulnerability, shared values visible. Viewer feels like they know the creator. |
| 9–10 | Deep, consistent connection. Viewer feels personally spoken to. Trust is immediate. Would feel comfortable reaching out. |

**Evidence to cite:** Quote connection moments (or note their absence). Note emotional range.

### 6. Title Frameworks (0–10)

**What to look for:** Are titles using proven patterns? Negativity/warning titles, curiosity/secret titles, question titles, list titles. Keyword usage. Would the title make someone stop scrolling?

| Score | Description |
|-------|-------------|
| 0–2 | Generic, descriptive titles. "Calgary Market Update March 2026." "123 Main Street Tour." |
| 3–4 | Some effort but weak. Maybe one decent title among five generic ones. |
| 5–6 | Mixed — some titles use frameworks, others are flat. Inconsistent quality. |
| 7–8 | Most titles use proven patterns. Curiosity-driven, keyword-rich, would stop a scroll. |
| 9–10 | Every title is crafted using frameworks. Power words, curiosity gaps, specific keywords. Consistent excellence. |

**Evidence to cite:** List all video titles with assessment of each.

### 7. Approve the Click (0–10)

**What to look for:** Do the first 30 seconds deliver on the title's promise? If the title says "5 Mistakes Buyers Make" does the video start talking about mistakes immediately (not "Hi, I'm John from XYZ Realty...")? 15-second confirmation window.

| Score | Description |
|-------|-------------|
| 0–2 | First 30 seconds have NOTHING to do with the title. Long intro about themselves, their company, asks for likes/subscribes before content. |
| 3–4 | Eventually gets to the title promise but takes 45–60+ seconds. Viewer is wondering "did I click the right video?" |
| 5–6 | Gets to the topic within 30 seconds but doesn't strongly CONFIRM the title's promise. |
| 7–8 | First sentence or two directly addresses the title. Viewer immediately knows they're in the right place. |
| 9–10 | First words mirror the title. Instant confirmation. "You clicked because you want to know X — here's exactly what's happening." |

**Evidence to cite:** Quote the first 2–3 sentences of each video. Compare to the title.

### 8. Lead Magnet System (0–10)

**What to look for:** Is there a free resource (guide, checklist, quiz, consultation) mentioned? Is it mentioned at least 3 times per video (beginning, middle, end)? Is there a clear CTA with a link?

| Score | Description |
|-------|-------------|
| 0–2 | No lead magnet. No CTA. No way for viewer to take the next step. Dead-end content. |
| 3–4 | One mention of "check the link below" or "book a call" at the end. No free resource. No system. |
| 5–6 | Has a lead magnet but mentions it only once, or it feels forced. Not woven into content. |
| 7–8 | Clear lead magnet CTA in most videos. Mentioned 2–3 times. Natural integration. Link in description. |
| 9–10 | Strategic lead magnet system. 3+ mentions per video woven naturally into content. Different lead magnets for different topics. Always accessible. |

**Evidence to cite:** Quote every mention of a CTA or resource. Note frequency and placement (beginning/middle/end).

### 9. Curiosity Bridges (0–10)

**What to look for:** Transitions that keep viewers watching. The "And → But → Therefore" formula. "But here's what most people miss..." / "You think that part was good? Wait till you see..." / "Before we get to #1, you need to understand..."

| Score | Description |
|-------|-------------|
| 0–2 | No transitions. Topics change abruptly. Viewer has no reason to keep watching after any given point. |
| 3–4 | Basic transitions ("Next up..." / "Moving on to...") that are mechanical, not curiosity-building. |
| 5–6 | Some curiosity-building moments but inconsistent. One good bridge among flat transitions. |
| 7–8 | Regular curiosity bridges. Viewer is consistently pulled forward through the content. |
| 9–10 | Masterful. Every section ends with a reason to keep watching. Viewer can't stop. "And → But → Therefore" throughout. |

**Evidence to cite:** Quote specific transition phrases. Note where viewers would likely drop off due to lack of bridges.

### 10. Show Don't Tell (0–10)

**What to look for:** Visual proof beyond talking head. iPad diagrams, screen shares, B-roll, maps, overlays, property walkthroughs, data visualisations. "Show AND tell" — voice + visuals.

| Score | Description |
|-------|-------------|
| 0–2 | Pure talking head. Nothing visual. No B-roll, no screen shares, no maps. |
| 3–4 | Occasional visual element (maybe one screen share or B-roll clip per video). |
| 5–6 | Some visual variety but mostly talking. Visual elements feel like afterthoughts. |
| 7–8 | Regular use of visuals. iPad drawings, B-roll, screen shares, walkthroughs. Content is visual, not just verbal. |
| 9–10 | Rich visual storytelling. Multiple visual proof elements per video. Maps with annotations, data overlays, property walkthroughs, diagrams. The visuals ARE the content. |

**Evidence to cite:** Note what visual elements are present (or absent). Quote moments where visuals would have strengthened the content.

### 11. Values Peppering (0–10)

**What to look for:** Personal interests, hobbies, family, values dropped naturally into content. Viewer gets to know them as a PERSON, not just a real estate agent. 2–3 personal drops per video.

| Score | Description |
|-------|-------------|
| 0–2 | Zero personality. Could be any agent. Nothing personal shared. |
| 3–4 | Rare personal mentions. Maybe one reference to family or a hobby across 5 videos. |
| 5–6 | Occasional personal drops but they feel forced or out of place. |
| 7–8 | Natural, regular integration of personal values and interests. Viewer knows who they are beyond real estate. |
| 9–10 | Personality woven throughout every video. Viewer feels like they know this person — their family, their passions, what they care about. Feels authentic, never performative. |

**Evidence to cite:** Quote specific personal moments. Note their frequency and whether they feel natural.

### 12. Connection Language (0–10)

**What to look for:** Specific trust, validation, empathy, and tribe phrases. "I'm glad you're here" vs. "Hey guys." "It makes sense that you'd think..." / "For families in your situation..." / "The reason..." (not "Why..."). Language that makes the avatar feel spoken to directly.

| Score | Description |
|-------|-------------|
| 0–2 | Generic greetings ("Hey guys, what's up"). No language targeting a specific viewer. Could be talking to anyone or no one. |
| 3–4 | Some direct address ("you") but no emotional validation or tribe-building language. |
| 5–6 | Occasional connection phrases but not systematic. One empathetic line in an otherwise generic video. |
| 7–8 | Regular use of connection language. Validation phrases, direct "you" address, avatar-specific terms. Viewer feels spoken to. |
| 9–10 | Every video is rich with connection language. "I'm glad you're here." "It makes sense that you'd feel..." "For families like yours..." Viewer feels personally addressed throughout. |

**Evidence to cite:** Quote every connection phrase found (or note the absence of them). Count frequency per video.

### 13. Story Proof (0–10)

**What to look for:** Client stories with names, stakes, and resolution. 30–60 second stories that prove credibility through real examples. "I had a client named Sarah who..." Not vague references — specific, detailed stories.

| Score | Description |
|-------|-------------|
| 0–2 | Zero client stories. No social proof. No case studies. All theory, no evidence. |
| 3–4 | Vague references to "my clients" or "people I've worked with" but no specific stories. |
| 5–6 | One decent story across multiple videos. Or stories that lack specificity (no names, no stakes). |
| 7–8 | Regular client stories with specifics. Names (or anonymised details), situations, outcomes. Builds trust through evidence. |
| 9–10 | Rich storytelling. Multiple proof points per video. Viewers trust through concrete evidence of expertise and results. |

**Evidence to cite:** Quote or summarise every client story found. Note specificity level.

### 14. Grade 5 Language (0–10)

**What to look for:** Simple, accessible language. No jargon. No unnecessarily complex sentences. "Bigger home" not "move-up property." "Selling and buying at the same time" not "simultaneous transaction." Hemingway App grade level: aim for Grade 5.

| Score | Description |
|-------|-------------|
| 0–2 | Heavy jargon. Complex sentences. Sounds like a legal document. Viewer needs a dictionary. |
| 3–4 | Mostly accessible but drops into jargon regularly. "Cap rate," "basis points," unexplained acronyms. |
| 5–6 | Generally clear but occasionally overcomplicated. Some unnecessary complexity. |
| 7–8 | Clear, simple language throughout. Complex topics explained simply. Jargon-free or always explains terms. |
| 9–10 | Crystal clear communication. A bright 10-year-old could follow the key points. Complex material made genuinely accessible without dumbing it down. |

**Evidence to cite:** Quote examples of jargon or complex language (or praise for simplicity). Note overall accessibility.

### 15. Binge Architecture (0–10)

**What to look for:** Content that encourages multi-video viewing. References to other videos, playlists, series, end cards linking to related content. "If you liked this, you'll love my video on..."

| Score | Description |
|-------|-------------|
| 0–2 | No references to other content. Each video is an island. No playlists, no series, no cross-links. |
| 3–4 | One "check out my other video" at the very end. No intentional architecture. |
| 5–6 | Occasional references to related content. Some playlist structure. Not systematic. |
| 7–8 | Regular cross-references between videos. Content themes link together. End cards point to related content. |
| 9–10 | Intentional binge structure. Series content, themed playlists, in-video references that make viewers want to watch more. Content pillars feed each other. |

**Evidence to cite:** Note any references to other videos. Count cross-links. Assess playlist/series structure.

### 16. Consistency (0–10)

**What to look for:** Publishing cadence and regularity. Weekly is ideal. Look at upload dates across the 5 videos analysed.

| Score | Description |
|-------|-------------|
| 0–2 | Sporadic. Months between videos. 5 videos span a year or more. |
| 3–4 | Irregular. Some weeks active, then long gaps. Unpredictable. |
| 5–6 | Semi-regular. Roughly bi-weekly but with occasional gaps. |
| 7–8 | Regular publishing. Roughly weekly. Predictable cadence. |
| 9–10 | Consistent weekly (or more frequent) publishing. Reliable cadence the audience can count on. |

**Evidence to cite:** List upload dates. Calculate average gap between videos.

---

## 4. How the AI Scores Videos

### The Complete Scoring Prompt

This is the FULL prompt sent to the Claude API. Every word matters — it determines scoring consistency.

```
You are an expert YouTube channel analyst for Attraction by Video, a coaching business that teaches real estate agents how to build YouTube channels that generate leads.

You will be given transcripts and metadata from {video_count} recent long-form YouTube videos by a real estate agent.

Your job is to score the channel against the 16 Attraction by Video principles. You must be rigorous, evidence-based, and specific. Every score must be justified with direct quotes or specific observations from the videos.

CHANNEL INFORMATION:
- Creator: {creator_name}
- Channel: @{channel_handle}
- Videos analysed: {video_count}

THE 16 PRINCIPLES AND SCORING RUBRIC:

{INSERT THE FULL RUBRIC FROM SECTION 3 ABOVE — ALL 16 PRINCIPLES WITH SCORE RANGES AND EVIDENCE INSTRUCTIONS}

SCORING RULES:
- Each principle scored 0.0 to 10.0 (one decimal place)
- Be honest. Most channels score between 2 and 7. A score of 8+ means genuinely excellent. A score of 9+ is rare.
- Scores must be supported by specific evidence from the transcripts
- If a transcript is unavailable for a video, note it and score based on available data
- The overall score is the flat average of all 16 principles (equally weighted)

FOR EACH VIDEO, also provide:
- An ARC breakdown (Attention score, Revelation score, Connection score)
- A one-sentence summary of what's working in that video
- A one-sentence summary of what would improve it

RESPONSE FORMAT:
Return a valid JSON object with this exact structure:

{
  "creator_name": "{creator_name}",
  "channel_handle": "@{channel_handle}",
  "audit_date": "{today's date}",
  "videos_analysed": {video_count},

  "scores": {
    "avatar_clarity": {
      "score": 5.5,
      "evidence": "Quote or specific observation from transcripts that justifies this score. Be specific — cite video titles and moments."
    },
    "themes_over_topics": { "score": 4.0, "evidence": "..." },
    "arc_attention": { "score": 6.0, "evidence": "..." },
    "arc_revelation": { "score": 3.5, "evidence": "..." },
    "arc_connection": { "score": 4.0, "evidence": "..." },
    "title_frameworks": { "score": 7.0, "evidence": "..." },
    "approve_the_click": { "score": 5.0, "evidence": "..." },
    "lead_magnet_system": { "score": 2.0, "evidence": "..." },
    "curiosity_bridges": { "score": 3.0, "evidence": "..." },
    "show_dont_tell": { "score": 6.0, "evidence": "..." },
    "values_peppering": { "score": 4.0, "evidence": "..." },
    "connection_language": { "score": 3.0, "evidence": "..." },
    "story_proof": { "score": 2.0, "evidence": "..." },
    "grade5_language": { "score": 8.0, "evidence": "..." },
    "binge_architecture": { "score": 3.0, "evidence": "..." },
    "consistency": { "score": 5.0, "evidence": "..." }
  },

  "overall_score": 4.4,

  "video_breakdowns": [
    {
      "title": "Exact Video Title",
      "url": "https://www.youtube.com/watch?v=...",
      "duration": "12:34",
      "views": 1234,
      "upload_date": "2026-02-15",
      "arc_attention_score": 6.0,
      "arc_revelation_score": 4.0,
      "arc_connection_score": 3.5,
      "attention_notes": "Specific analysis of opening hook with quotes...",
      "revelation_notes": "Specific analysis of content value with quotes...",
      "connection_notes": "Specific analysis of emotional connection with quotes...",
      "whats_working": "One sentence — the best thing about this video",
      "what_would_change": "One sentence — the single biggest improvement"
    }
  ],

  "top_strengths": [
    "Principle Name (score): Brief explanation with evidence",
    "Principle Name (score): Brief explanation with evidence",
    "Principle Name (score): Brief explanation with evidence"
  ],

  "biggest_gaps": [
    "Principle Name (score): Brief explanation with evidence",
    "Principle Name (score): Brief explanation with evidence",
    "Principle Name (score): Brief explanation with evidence"
  ],

  "one_sentence_diagnosis": "One vivid sentence summarising the channel's core strength and core gap.",

  "personalised_dimension_analysis": {
    "channel_strategy": "2–3 sentences about Channel Strategy (Avatar Clarity + Themes + Consistency). Reference their specific videos. Talk TO them in you/your voice.",
    "content_impact": "2–3 sentences about Content Impact (ARC Attention + Revelation + Approve the Click + Title Frameworks + Show Don't Tell + Curiosity Bridges).",
    "viewer_connection": "2–3 sentences about Viewer Connection (Connection Language + Values Peppering + Story Proof).",
    "lead_generation": "2–3 sentences about Lead Generation (Lead Magnet System + Binge Architecture)."
  },

  "whats_working_list": [
    "Strength 1 — evidence from their videos",
    "Strength 2 — evidence from their videos",
    "Strength 3 — evidence from their videos",
    "Strength 4 — evidence from their videos (optional)"
  ]
}
```

### The Video Data Appended to the Prompt

After the rubric and instructions, append:

```
VIDEO DATA:
============

VIDEO 1: "Do NOT Buy a Home in Calgary Until You Watch This"
Duration: 14:23 | Published: 2026-02-28 | Views: 3,456
TRANSCRIPT:
[Full plain text transcript here]

---

VIDEO 2: "5 Calgary Neighbourhoods Nobody Talks About"
Duration: 11:07 | Published: 2026-02-21 | Views: 2,100
TRANSCRIPT:
[Full plain text transcript here]

---

(repeat for all 5 videos)
```

### Prompt Variations by Audit Type

**Lead audit:** Add to the prompt:
```
ADDITIONAL INSTRUCTIONS FOR LEAD AUDIT:
- Also calculate 4 dimension scores:
  - Channel Strategy = average(Avatar Clarity, Themes Over Topics, Consistency)
  - Content Impact = average(ARC Attention, ARC Revelation, Approve the Click, Title Frameworks, Show Don't Tell, Curiosity Bridges)
  - Viewer Connection = average(Connection Language, Values Peppering, Story Proof)
  - Lead Generation = average(Lead Magnet System, Binge Architecture)
- Generate "After Foundations" projected scores for each dimension (all must be 8.5+, each unique, range 8.5-9.2)
- Generate a "What Shifts" description for each dimension (1-2 sentences, vague reference to lesson numbers, don't teach the method)
- All analysis must be in "you/your" voice, talking directly to the lead
- Reference specific video titles as evidence
- Never name the 16 individual principles in the lead-facing text
```

**Monthly audit:** Add to the prompt:
```
ADDITIONAL INSTRUCTIONS FOR MONTHLY AUDIT:
- Here are the baseline scores for comparison:
  {insert all 16 baseline scores}
- Here are last month's scores (if available):
  {insert all 16 previous month scores}
- For each principle, note whether it improved, declined, or stayed the same
- Identify what specifically improved with video evidence
- Identify remaining gaps (principles still below 7)
```

**Single video audit:** Add to the prompt:
```
ADDITIONAL INSTRUCTIONS FOR SINGLE VIDEO AUDIT:
- Score this ONE video against all 16 principles
- Here are the baseline scores for comparison:
  {insert all 16 baseline scores}
- For each principle, calculate the delta (Δ) from baseline
- Organise the deep dive by video phase: Opening, Body, Connection & Voice, Channel Strategy
- Include timestamps for every significant observation
- Identify the 3 most impactful improvements with specific rewrites/examples
- Include a Quick Win (one immediately actionable thing) and Q&A Prep topics
```

---

## 5. The 4 Report Types — Complete Templates

### Template 1: Lead Audit (Notion Markdown)

**Critical rules for lead reports:**
- NEVER name any of the 16 principles individually
- NEVER describe specific problems (e.g., "openings too long", "no lead magnet")
- NEVER suggest fixes or improvements
- Show scores + describe symptoms/results only
- The goal: they see the pain, can't self-diagnose, need to join to learn why
- Always "you/your" voice — talk TO them, never ABOUT them
- Reference their specific video titles when citing evidence
- Never estimate subscriber counts unless exact

```markdown
::: callout {icon="📊" color="blue_bg"}
	**Your YouTube Channel Audit**
	@{handle} \| Prepared by Attraction by Video
:::
![](CHANNEL_BANNER_URL)
---
::: callout {icon="📉" color="{score_colour}"}
	**Your Attraction Score: {overall_score} / 10**
	{Name}, {personalised one-sentence summary — acknowledge strengths but state it's not converting}. Here's where you stand.
:::
---
## Your Scores
We analysed your {N} most recent long-form videos against the framework used by top-performing real estate YouTube channels — the ones that consistently turn viewers into clients.
<table fit-page-width="true" header-row="true">
<tr>
<td>**Dimension**</td>
<td>**What It Measures**</td>
<td>**Your Score**</td>
</tr>
<tr>
<td>🎯 Channel Strategy</td>
<td>Do you have a clear audience and intentional content plan?</td>
<td color="{colour}_bg">**{score} / 10**</td>
</tr>
<tr>
<td>🎬 Content Impact</td>
<td>Does your content hold attention and build authority?</td>
<td color="{colour}_bg">**{score} / 10**</td>
</tr>
<tr>
<td>🤝 Viewer Connection</td>
<td>Would a stranger trust you enough to reach out after one video?</td>
<td color="{colour}_bg">**{score} / 10**</td>
</tr>
<tr>
<td>📈 Lead Generation</td>
<td>Does your channel actually produce leads?</td>
<td color="{colour}_bg">**{score} / 10**</td>
</tr>
</table>
---
## What This Means
### 🎯 Channel Strategy — {score} / 10
{ONE paragraph. Describe RESULT/SYMPTOM only. No principle names. No fixes. E.g., "Your content could be for anyone in {city} — a first-time buyer, a downsizer, an investor. When viewers can't immediately tell this channel is for THEM, they keep scrolling."}
### 🎬 Content Impact — {score} / 10
{ONE paragraph. RESULT/SYMPTOM only. E.g., "Viewers drop off before they see your best material. The value is there, but it takes too long to arrive — and once it does, nothing pulls them to the next section."}
### 🤝 Viewer Connection — {score} / 10
{ONE paragraph. RESULT/SYMPTOM only. E.g., "Viewers think 'helpful' not 'I need to call this person.' You're informing strangers instead of building a relationship with future clients."}
### 📈 Lead Generation — {score} / 10
{ONE paragraph. RESULT/SYMPTOM only. E.g., "Every video is a dead end. Viewers watch, they learn, they leave. There's no system to capture the people who are ready to take the next step."}
---
## What's Working
::: callout {icon="✅" color="green_bg"}
	1. **{Strength}** — {Brief, genuine praise with evidence from their videos}
	2. **{Strength}** — {evidence}
	3. **{Strength}** — {evidence}
	4. **{Strength}** — {evidence} (optional)
:::
---
## How Attraction by Video Can Improve Your Score
::: callout {icon="📈" color="blue_bg"}
	**What our members typically improve in their first 90 days:**
:::
<table fit-page-width="true" header-row="true">
<tr>
<td>**Dimension**</td>
<td>**Your Score**</td>
<td>**Average Member Improvement**</td>
</tr>
<tr>
<td>🎯 Channel Strategy</td>
<td>{score}</td>
<td>+1.5 – 3.0 points</td>
</tr>
<tr>
<td>🎬 Content Impact</td>
<td>{score}</td>
<td>+1.0 – 2.5 points</td>
</tr>
<tr>
<td>🤝 Viewer Connection</td>
<td>{score}</td>
<td>+2.0 – 3.5 points</td>
</tr>
<tr>
<td>📈 Lead Generation</td>
<td>{score}</td>
<td>+2.5 – 4.0 points</td>
</tr>
</table>
{ONE short paragraph. Tease what membership includes — structured curriculum, weekly Q&A coaching, personalised feedback. Focus on OUTCOME not details. No framework names.}
---
## The Bottom Line
{Two short paragraphs. First: acknowledge their content quality genuinely. Second: the system is missing — tease that a framework exists without naming or teaching it. End with the gap between current and potential.}
---
::: callout {icon="🚀" color="blue_bg"}
	**Want to see the full breakdown — and the framework to fix it?**
	This audit scored your channel across multiple principles within each dimension. The full analysis includes exactly where the gaps are, why they matter, and what the top-performing channels do differently.
	[**Join Attraction by Video →**](https://attractionbyvideo.com)
:::
---
*Prepared by Attraction by Video*
```

### Template 2: Baseline Audit (Student — Notion Markdown)

```markdown
::: callout {icon="🎯" color="blue_bg"}
	**Attraction by Video — YouTube Channel Audit**
	Baseline Audit \| {Month Year} \| @{handle}
:::
![](CHANNEL_BANNER_URL)
---
::: callout {icon="🔍" color="purple_bg"}
	**One-Sentence Diagnosis:** {Vivid summary of core strength and core gap}
:::
::: callout {icon="📊" color="{score_colour}"}
	**Overall Attraction Score: {overall_score} / 10**
:::
<table_of_contents/>
---
## Channel at a Glance
<table fit-page-width="true" header-row="true">
<tr><td>**Field**</td><td>**Detail**</td></tr>
<tr><td>Channel</td><td>@{handle}</td></tr>
<tr><td>Creator</td><td>{Creator Name}</td></tr>
<tr><td>Market</td><td>{City, Province/State}</td></tr>
<tr><td>Niche</td><td>{Niche description}</td></tr>
<tr><td>Format</td><td>{e.g., "Solo talking head with screen-shared charts"}</td></tr>
<tr><td>Videos Analysed</td><td>{N}</td></tr>
</table>
---
## Who Is Their Audience?
**Implied Avatar:** {One sentence}
**The Problem:** {What's wrong with the avatar definition}
**Napkin Test:** {✅ PASS / ⚠️ PARTIAL PASS / ❌ FAIL — with explanation}
---
## The Attraction Scorecard
<table fit-page-width="true" header-row="true">
<tr><td>**#**</td><td>**Principle**</td><td>**Score**</td><td>**Key Finding**</td></tr>
<tr><td>1</td><td>Avatar Clarity</td><td color="{colour}_bg">{score}</td><td>{one sentence evidence}</td></tr>
<tr><td>2</td><td>Themes Over Topics</td><td color="{colour}_bg">{score}</td><td>{evidence}</td></tr>
... (all 16 rows) ...
</table>
---
## Video-by-Video Breakdown
### Video 1: "{Title}"
*{Duration} \| {Views} views*
<table fit-page-width="true" header-row="true">
<tr><td>**ARC Element**</td><td>**Score**</td><td>**Notes**</td></tr>
<tr><td>Attention</td><td color="{colour}_bg">{score}</td><td>{1-2 sentences}</td></tr>
<tr><td>Revelation</td><td color="{colour}_bg">{score}</td><td>{1-2 sentences}</td></tr>
<tr><td>Connection</td><td color="{colour}_bg">{score}</td><td>{1-2 sentences}</td></tr>
</table>
**What's Working:** {One sentence}
**What Would Change:** {One sentence}

(Repeat for all videos)
---
## Three Biggest Gaps
### 1. {Gap Name} ({score}/10)
{2-3 sentences with evidence}
> **Current:** "{Exact quote of what they do now}"
> **Improved:** "{Concrete example of what it would sound like if fixed}"
### 2. {Gap Name} ({score}/10)
{Same format}
### 3. {Gap Name} ({score}/10)
{Same format}
---
::: callout {icon="✅" color="green_bg"}
	**What's Already Working**
	1. **{Principle} ({score})** — {Brief praise with evidence}
	2. **{Principle} ({score})** — {evidence}
	3. **{Principle} ({score})** — {evidence}
:::
---
## Your Learning Path & Q&A Topics
### Priority 1: Critical Gaps (Score 0-3)
<table fit-page-width="true" header-row="true">
<tr><td>**Gap**</td><td>**Score**</td><td>**Lesson**</td><td>**Q&A Action**</td></tr>
{Rows for principles 0-3, sorted lowest first}
</table>
### Priority 2: Improvement Areas (Score 4-6.5)
<table fit-page-width="true" header-row="true">
<tr><td>**Gap**</td><td>**Score**</td><td>**Lesson**</td><td>**Q&A Action**</td></tr>
{Rows for principles 4-6.5}
</table>
### Priority 3: Polish Areas (Score 7+)
{Bullet list of principles 7+ with "keep it up" notes}
### Suggested 3-Week Learning Path
1. **Week 1:** {Lesson} → {What to do} → {What to bring to Q&A}
2. **Week 2:** {Lesson} → {What to do} → {What to bring to Q&A}
3. **Week 3:** {Lesson} → {What to do} → {What to bring to Q&A}
---
::: callout {icon="🚀" color="blue_bg"}
	**What Would Change Everything**
	{Personalised 2-3 sentences addressing student by name. Name the single biggest unlock. Be specific about what 2-3 changes would transform their channel.}
	[Book a strategy session with Jared →](https://link.chamberlaingroup.ca/widget/bookings/attraction-by-video-coaching)
:::
---
*Audit conducted by Attraction by Video \| {Month Year}*
```

### Template 3: Monthly Progress Report

Uses the same structure as baseline BUT with these additions:

**After the Overall Score callout, add:**
```markdown
::: callout {icon="📈" color="green_bg"}
	**This Month: {score} / 10**
	↑ **{delta} from baseline** ({baseline} → {current}) · ↑ **{delta} from last month** ({last_month} → {current})
:::
```

**Replace the Scorecard table with a comparison table:**
```markdown
<table fit-page-width="true" header-row="true" header-column="true">
<tr><td>**Principle**</td><td>**Baseline**</td><td>**Last Month**</td><td>**This Month**</td><td>**Δ Baseline**</td></tr>
{16 rows with colour coding on the Δ column: green if +1, yellow if +0.5, red if declined}
</table>
```

**Add "What Improved This Month" section before gaps:**
```markdown
## What Improved This Month
### ↑ {Principle}: {old} → {new} (+{delta})
{Specific evidence from new videos showing the improvement. Quote the moment. Name the video.}
```

### Template 4: Single Video Audit

```markdown
![](CHANNEL_BANNER_URL)
::: callout {icon="🎬" color="blue_bg"}
	**Attraction by Video — Single Video Audit**
	@{handle} \| Prepared by Jared Chamberlain
:::
---
::: callout {icon="📊" color="{score_colour}"}
	**Video Attraction Score: {score} / 10**
	"{Video Title}" \| {Duration} \| {Published Date}
:::
---
## The Attraction Scorecard
<table fit-page-width="true" header-row="true">
<tr><td>**Principle**</td><td>**Baseline**</td><td>**This Video**</td><td>**Δ**</td></tr>
{16 rows, colour code the Δ column}
</table>
---
## Video Deep Dive
### Opening (0:00–{end})
**ARC Attention ({score}/10) + Approve the Click ({score}/10)**
{Timestamp-level analysis of the opening. Quote the first words.}
**Lead Magnet ({score}/10)** — {First mention analysis with timestamp}

### Body ({start}–{end})
**ARC Revelation ({score}/10)**
{Key insights with timestamps. What was genuinely valuable vs. generic.}
**Show Don't Tell ({score}/10)** — {Visual elements present or absent}
**Curiosity Bridges ({score}/10)** — {Transition quality between sections}

### Connection & Voice (Throughout)
**ARC Connection + Connection Language** — {Every connection phrase with timestamps}
**Values Peppering ({score}/10)** — {Personal interest drops, or absence thereof}
**Story Proof ({score}/10)** — {Client stories with timestamps, or absence}
**Grade 5 Language ({score}/10)** — {Language complexity assessment}

### Channel Strategy in This Video
**Avatar Clarity, Themes Over Topics, Lead Magnet, Binge Architecture, Consistency**
{Brief assessment of each as it relates to this single video}
---
## What's Working
::: callout {icon="✅" color="green_bg"}
	1. **{Strength}** — {evidence with timestamp}
	2. **{Strength}** — {evidence with timestamp}
	3. **{Strength}** — {evidence with timestamp}
:::
---
## Three Ideas for Improvement
### 1. {Improvement Title}
**{Principle(s)} ({score}/10)**
{What happened: quote the moment with timestamp. What to do differently: include a specific rewrite or example.}
**Foundations Reference:** Lesson {X.X} ({Lesson Name})

### 2. {Improvement Title}
{Same format}

### 3. {Improvement Title}
{Same format}
---
## Quick Wins & Q&A Prep
::: callout {icon="⚡" color="yellow_bg"}
	**Quick Win for Your Next Video**
	{One specific, immediately actionable thing they can do in their next video}
:::
::: callout {icon="📋" color="blue_bg"}
	**Q&A Topics**
	1. **{Topic}** — {what to bring to the call}
	2. **{Topic}** — {what to bring}
:::
---
::: callout {icon="💡" color="purple_bg"}
	**{One-sentence coaching summary focused on momentum}**
:::
---
*Prepared for {Full Name} by Jared Chamberlain ~ Founder of Attraction by Video*
```

---

## 6. Lesson Reference Map

This maps each principle to the specific Foundations lesson that addresses it. Used in the Learning Path section of student reports.

| Principle | Score Gap | Lesson(s) | What It Teaches | What to Watch |
|-----------|-----------|-----------|-----------------|---------------|
| Avatar Clarity | Below 7 | **1.1** + **1.2** | Choosing niche, finding avatar, Napkin Test | Session 1: "What Do You Want?" + "Who Do You Want?" |
| Themes Over Topics | Below 7 | **1.3** | Content pillars, calendar, rotation | Session 1: "Finding Your Themes" |
| Lead Magnet System | Below 7 | **1.4** | Client journey, 3x placement per video | Session 1: "Client Journey & Building Trust" |
| Values Peppering | Below 7 | **2.1** | Authentic self on camera, weaving values | Session 2: "Finding Your Authentic Self on Camera" |
| Connection Language | Below 7 | **2.2** | Trust, validation, empathy, tribe phrases | Session 2: "Connection Language" |
| ARC Attention | Below 7 | **2.5** + **2.5a** + **3.2** | Four Intro Patterns, 20-25 second openings, AI scripting | Session 2: "Content Frameworks" + Session 3: "Using Scripting ARC Method GPT" |
| ARC Revelation | Below 7 | **2.5** | Enhanced Value Loop, insight hierarchy | Session 2: "Content Frameworks: PSL & ARC" |
| ARC Connection | Below 7 | **2.2** + **2.5** | Connection as layer throughout | Session 2: "Connection Language" + "Content Frameworks" |
| Curiosity Bridges | Below 7 | **2.5** | And → But → Therefore formula | Session 2: "Content Frameworks: PSL & ARC" |
| Story Proof | Below 7 | **2.5** (Story Proof section) | Client stories with structure: name, stakes, resolution | Session 2: "Content Frameworks" |
| Show Don't Tell | Below 7 | **3.3** | iPad recording (Freeform/Notability), B-roll, maps, screen recording | Session 3: "Show Don't Tell — Visual Content" |
| Approve the Click | Below 7 | **4.1** + **2.5** | Title-hook alignment, 15-second confirmation | Session 4: "The Packaging Principle" + Session 2: "Content Frameworks" |
| Title Frameworks | Below 7 | **4.2** | 700+ proven frameworks, power words, Keywords Everywhere | Session 4: "Crafting Effective Titles" |
| Binge Architecture | Below 7 | **1.3** | Video Thread System, pillar linking, cross-references | Session 1: "Finding Your Themes" |
| Grade 5 Language | N/A | No lesson | Natural ability — practice-based. If low, flag but don't assign a lesson. |
| Consistency | Below 7 | **1.3** | Content calendar structure, batch shooting | Session 1: "Finding Your Themes" + Session 2.4: "Content Prep & Batch Shooting" |

---

## 7. Q&A Flag Guidelines

These determine what Q&A topics to flag for the weekly live coaching call (Thursdays 1:30 PM MST).

### Always Flag (High-Value Feedback — Worth Discussing Regardless of Score)

| Principle | Q&A Action |
|-----------|-----------|
| Lead Magnet System | "Bring your lead magnet draft for feedback" |
| Avatar Clarity | "Bring your napkin test for review" |
| Connection Language | "Bring your next script for review — we'll highlight where to add connection phrases" |
| Approve the Click | "Bring your next 3 title/hook combos" |
| Curiosity Bridges | "Bring a recent script — we'll rewrite transitions live" |

### Flag When Score is 4–6 (Mid-Improvement — Coaching Accelerates Growth)

| Principle | Q&A Action |
|-----------|-----------|
| ARC Attention | "Bring your most recent opening — we'll workshop it" |
| ARC Revelation | "Bring one insight from your next video — we'll Value Loop it" |
| Values Peppering | "Share 5 personal values/interests — we'll find where to weave them in" |
| Story Proof | "Bring a client story to structure — name, situation, stakes, resolution" |
| Title Frameworks | "Bring your next 5 title ideas — we'll run them through frameworks" |

### Don't Flag (Better Learned By Doing — No Live Coaching Needed)

- Grade 5 Language
- Consistency
- Show Don't Tell
- Binge Architecture
- Themes Over Topics

---

## 8. GHL API Reference

### Configuration

```yaml
ghl_api_key: "pit-babb9c02-a078-43ef-8ce8-6f951e7cc480"
ghl_location_id: "vEIiKAjpBkCDrabeDre7"
student_tag: "foundations - weekly coaching"

ghl_custom_fields:
  youtube_channel_url: "AE8we7U1ZSApVL9vUP07"
  monthly_analysis_link: "3IwK8sUBoGLsj1PlMjhe"
  lead_audit_link: "zfEHoi06Cw8cmAi42dW6"
```

### Common API Calls

**Headers for all requests:**
```
Authorization: Bearer pit-babb9c02-a078-43ef-8ce8-6f951e7cc480
Content-Type: application/json
Version: 2021-07-28
```

**Look up contact by email:**
```
GET https://services.leadconnectorhq.com/contacts/?query={email}&locationId=vEIiKAjpBkCDrabeDre7&limit=100
```

**Get all contacts (paginated, 100 per page):**
```
GET https://services.leadconnectorhq.com/contacts/?locationId=vEIiKAjpBkCDrabeDre7&limit=100
```
Response includes `meta.nextPageUrl` for pagination. Filter client-side by tag.

**Extract custom field from contact:**
```python
for field in contact.get("customFields", []):
    if field.get("id") == "AE8we7U1ZSApVL9vUP07":  # youtube_channel_url
        return field.get("value", "")
```

**Update contact with audit URL:**
```
PUT https://services.leadconnectorhq.com/contacts/{contactId}
Body: {
  "customFields": [
    { "key": "3IwK8sUBoGLsj1PlMjhe", "field_value": "{notion_url}" }
  ]
}
```

**Create new contact (for leads from public form):**
```
POST https://services.leadconnectorhq.com/contacts/
Body: {
  "firstName": "...",
  "lastName": "...",
  "email": "...",
  "locationId": "vEIiKAjpBkCDrabeDre7",
  "tags": ["lead-audit-requested"]
}
```

---

## 9. YouTube Data Collection

### yt-dlp Commands

**Get video list (metadata only, no download):**
```bash
yt-dlp --flat-playlist --dump-json --no-download --playlist-end 15 "https://www.youtube.com/@{handle}/videos"
```
- Returns one JSON object per line
- Filter: skip videos with `duration < 60` (Shorts)
- Take first 5 after filtering
- Use `/videos` URL path (not `/shorts` or root)

**Download transcript for one video:**
```bash
yt-dlp --write-auto-sub --sub-lang en --skip-download -o "{safe_title}" "{video_url}"
```
- Downloads `.en.vtt` file
- For non-English channels: `--sub-lang ru` (or appropriate language code)
- If no auto-captions available, no file is created

**Get channel banner URL:**
```bash
curl -s "https://www.youtube.com/@{handle}" | grep -o 'https://yt3\.googleusercontent\.com/[^"]*' | grep 'w2560' | head -1
```

### Video Metadata Fields

From yt-dlp JSON output:
- `id` — YouTube video ID
- `title` — Video title
- `upload_date` — Format: YYYYMMDD
- `duration` — Seconds (integer)
- `view_count` — Integer

### VTT to Plain Text Conversion

```python
import re

def strip_vtt(vtt_content):
    lines = vtt_content.split('\n')
    text_lines = []
    for line in lines:
        line = line.strip()
        if not line: continue
        if line == 'WEBVTT': continue
        if line.startswith('Kind:') or line.startswith('Language:'): continue
        if re.match(r'^\d{2}:\d{2}', line): continue  # timestamps
        if re.match(r'^\d+$', line): continue  # sequence numbers
        line = re.sub(r'<[^>]+>', '', line)  # strip HTML tags
        if line and (not text_lines or line != text_lines[-1]):  # deduplicate
            text_lines.append(line)
    return '\n'.join(text_lines)
```

---

## 10. Notion API Reference

### Database Details

- **Database Name:** YouTube Channel Audits - Attraction Scores
- **Data Source ID:** `31c33f3a-1ade-80ea-a5ed-000bff2f16c1`
- **Database URL:** `https://www.notion.so/31c33f3a1ade80d1afc8c2582cbbb203`

### Notion Page Properties

When creating a page, set these properties:

```json
{
  "Name of Audit": { "title": [{ "text": { "content": "{Month Year} YouTube Attraction Score for {Name}" } }] },
  "Channel Name": { "rich_text": [{ "text": { "content": "@handle" } }] },
  "Creator": { "rich_text": [{ "text": { "content": "Creator Name" } }] },
  "Niche": { "rich_text": [{ "text": { "content": "Detected niche" } }] },
  "Avatar": { "rich_text": [{ "text": { "content": "Avatar description" } }] },
  "Avatar Clarity": { "number": 5.0 },
  "Themes": { "number": 4.0 },
  "ARC Attention": { "number": 6.0 },
  "ARC Revelation": { "number": 3.5 },
  "ARC Connection": { "number": 4.0 },
  "Title Frameworks": { "number": 7.0 },
  "Approve the Click": { "number": 5.0 },
  "Lead Magnet": { "number": 2.0 },
  "Curiosity Bridges": { "number": 3.0 },
  "Show Don't Tell": { "number": 6.0 },
  "Values Peppering": { "number": 4.0 },
  "Connection Language": { "number": 3.0 },
  "Story Proof": { "number": 2.0 },
  "Grade 5 Language": { "number": 8.0 },
  "Binge Architecture": { "number": 3.0 },
  "Consistency": { "number": 5.0 },
  "Overall Attraction Score": { "number": 4.5 },
  "Audit Type": { "select": { "name": "Student" } },
  "Videos Analysed": { "number": 5 },
  "Baseline Score": { "number": 4.5 },
  "Previous Month Score": { "number": null },
  "Report Month": { "rich_text": [{ "text": { "content": "March 2026" } }] },
  "GHL Contact ID": { "rich_text": [{ "text": { "content": "ghl-id" } }] },
  "Audit Date": { "date": { "start": "2026-03-06" } }
}
```

**Audit Type values:** `Lead`, `Student`, `Monthly Progress`, `Single Video`

### Notion Formatting Rules

- Callouts: `::: callout {icon="emoji" color="colour_bg"}`
- Tables: `<table fit-page-width="true" header-row="true">`
- Coloured cells: `<td color="red_bg">` / `<td color="green_bg">` / `<td color="yellow_bg">` / `<td color="orange_bg">`
- Table of contents: `<table_of_contents/>`
- Dividers: `---`
- Escape pipes in text: `\|`
- Escape tildes: `\~`
- Use actual newlines, NOT literal `\n` (corrupts page)
- Banner images: `![](URL)` — no alt text
- **Cannot set page cover images via API** — banner must be embedded in content

---

## 11. Score Calculation Rules

### Overall Score
**Formula:** Flat average of all 16 principles. Equally weighted. No rounding until final display (one decimal place).

```
overall = (avatar_clarity + themes + arc_attention + arc_revelation + arc_connection +
           title_frameworks + approve_the_click + lead_magnet + curiosity_bridges +
           show_dont_tell + values_peppering + connection_language + story_proof +
           grade5_language + binge_architecture + consistency) / 16
```

### Lead Audit Dimension Scores

| Dimension | Principles Averaged | Count |
|-----------|-------------------|-------|
| Channel Strategy | Avatar Clarity + Themes Over Topics + Consistency | /3 |
| Content Impact | ARC Attention + ARC Revelation + Approve the Click + Title Frameworks + Show Don't Tell + Curiosity Bridges | /6 |
| Viewer Connection | Connection Language + Values Peppering + Story Proof | /3 |
| Lead Generation | Lead Magnet System + Binge Architecture | /2 |

**Note:** ARC Connection and Grade 5 Language are scored but NOT included in any lead-facing dimension. They are internal-only for lead audits.

### Colour Coding

| Context | Green | Yellow | Orange | Red |
|---------|-------|--------|--------|-----|
| Principle scores (student reports) | 7.0+ | 6.0–6.9 | 5.0–5.9 | Below 5.0 |
| Dimension scores (lead reports) | 7.0+ | 6.0–6.9 | 5.0–5.9 | Below 5.0 |
| Overall score callout | 7.0+ | — | 5.0–6.9 | Below 5.0 |
| Monthly Δ (change) | +1.0+ | +0.5 | Same | Declined |

### Lead Audit Projection Rules

- All 4 "After Foundations" dimension scores must be **8.5 or higher**
- Each dimension gets a **UNIQUE** projected score (no two the same)
- Suggested range: **8.5, 8.7, 9.0, 9.2**
- Dimensions already scoring 7+ get projected higher (9.0–9.2)
- Dimensions with lowest scores get slightly lower projections (8.5–8.7) but still 8.5+
- Projected overall = average of 4 dimension projections (typically 8.5–9.0)

---

## 12. Personalisation & Voice Rules

### Lead Audit Voice

- Always "you/your" — talk TO the lead, never ABOUT them
- Use first name when directly addressing them
- Reference their specific videos BY TITLE when citing evidence
- Never estimate subscriber counts (use exact count or omit)
- Never name any of the 16 principles
- Never describe specific problems or suggest fixes
- Show symptoms/results only — they see the pain, can't self-diagnose
- "What Shifts" column: reference lesson numbers vaguely ("Lesson 2.2 makes it consistent"), never teach the method
- Keep "What Shifts" to 1–2 sentences max

### Student Audit Voice

- Direct, coaching-oriented
- Can name all 16 principles by name
- Can describe specific problems and suggest fixes
- Include "Current" vs. "Improved" examples (exact before/after quotes)
- Reference Foundations lessons by number
- Coaching tone — supportive but honest

### General Rules

- Canadian spelling always (colour, neighbourhood, analyse, etc.)
- Never use "I" — the audit is from the system/brand
- Evidence over opinion — always cite specific videos, quotes, timestamps
- Scores must feel earned — a 7+ is genuinely good, not inflated

---

## 13. Complete Example: Low Scorer Analysis

**Kenneth Kunkel (@kenkunkel) — 2.7/10**

This shows what a full internal analysis looks like for a channel that scores below 3.

**Videos Analysed:**
1. "Is Paradise Valley, AZ Still Worth It?" — 27:26, 405 views
2. "New Luxury Build in Phoenix, AZ" — 17:04, 80 views
3. "Tour This Stunning Cabin Getaway" — 12:35, 152 views
4. "Paradise Valley Dream Home" — 17:36, 180 views
5. "Scottsdale Luxury Living" — 14:22, 95 views

**Scores:**
- Avatar Clarity: 2/10 — No identifiable ideal viewer. Ranges from $405K to luxury to cabin getaway. Who is this for?
- Themes Over Topics: 3/10 — Property tours dominate but no intentional rotation. Every video is essentially "tour a house."
- ARC Attention: 3/10 — Opens with property exterior shots. No hook, no reason to watch beyond curiosity about the house.
- ARC Revelation: 2/10 — Narrates what's visible. "This is the kitchen, it has granite counters." No analysis, no insider knowledge, no market context.
- ARC Connection: 1/10 — Zero emotional content. Pure walkthrough narration.
- Title Frameworks: 3/10 — Some attempt ("Is Paradise Valley Still Worth It?") but mostly flat property descriptions.
- Approve the Click: 2/10 — First 30 seconds are exterior shots with no verbal hook confirming the title.
- Lead Magnet System: 0/10 — Zero mentions across 5 videos. No resource, no CTA, no way to take the next step.
- Curiosity Bridges: 1/10 — No transitions. Room to room with no pull-through.
- Show Don't Tell: 5/10 — Property tours ARE visual, but it's all showing with no telling (no analysis overlaid).
- Values Peppering: 1/10 — Nothing personal shared across any video.
- Connection Language: 1/10 — No direct address to viewer. No "you" language. Narrating, not connecting.
- Story Proof: 0/10 — Zero client stories. Zero proof of past success.
- Grade 5 Language: 7/10 — Natural, conversational delivery. Not jargon-heavy. The one genuine strength.
- Binge Architecture: 2/10 — No cross-references. Each video is an island.
- Consistency: 3/10 — Irregular posting with multi-week gaps.

**Overall: 2.7/10** — "A listing showcase with no strategic foundation. The camera work is fine but every video is a dead end — no hook to watch, no value beyond the walkthrough, no reason to come back, and no way to become a lead."

---

## 14. Complete Example: Mid-Range Scorer Analysis

**Jamie Harnish (@TorontoHomeSearch) — 5.5/10**

**Key Finding:** Data-driven educator with genuinely differentiated content but zero lead capture and emotionally absent delivery.

**Scores:**
- Avatar Clarity: 6/10 — Partially passes napkin test: "research-minded Toronto buyer." But too broad — first-time buyers AND investors AND sellers all addressed.
- Themes Over Topics: 6/10 — Clear themes emerging (market analysis, neighbourhood deep-dives) but not yet intentional buckets.
- ARC Attention: 5.5/10 — Opens with data or bold claims but doesn't create tension or stakes. More "let me show you the data" than "you need to know this."
- ARC Revelation: 7.5/10 — Genuinely differentiated. Per-100K crime analysis, media manipulation debunking, data work that no other Toronto agent does. This is the channel's clear strength.
- ARC Connection: 4/10 — Informative but distant. Viewer thinks "smart" not "trustworthy" or "I should call this person."
- Title Frameworks: 6/10 — Mixed. Some strong data-driven titles, others generic.
- Approve the Click: 6/10 — Usually gets to the topic quickly but doesn't strongly confirm the title's promise.
- Lead Magnet System: 1.5/10 — Zero capture mechanisms across 5 videos. Only CTA is "book a call" mentioned once.
- Curiosity Bridges: 4/10 — Some natural transitions between data points but no intentional "And → But → Therefore."
- Show Don't Tell: 7/10 — Screen-shared charts, data visualisations, neighbourhood comparisons. Strong visual element.
- Values Peppering: 3.5/10 — Viewer knows he's smart. Doesn't know who he is as a person.
- Connection Language: 4/10 — Some direct "you" address but no validation phrases, no empathy, no tribe-building.
- Story Proof: 3.0/10 — Zero client stories across 5 videos. All data, no proof of personal experience with buyers/sellers.
- Grade 5 Language: 8/10 — Complex statistics explained simply and accessibly. Clear strength.
- Binge Architecture: 4/10 — Some end-card references but no intentional series or cross-linking strategy.
- Consistency: 5/10 — Semi-regular posting, roughly bi-weekly with occasional gaps.

**Overall: 5.5/10** — "Builds a financial planning presentation channel, not an attraction channel. The data work is genuinely elite — nobody else in Toronto is doing per-100K crime analysis or debunking media narratives with this rigour. But every video is a dead end: no lead capture, no emotional connection, no client stories. Viewers leave impressed but never become leads."

---

## 15. Complete Example: Single Video Audit

**Paul Wolfert — "Where Detroit's Wealthy Are Actually Buying Right Now" — 5.9/10**

**Baseline Score: 5.1/10** | **This Video: 5.9/10** | **Δ: +0.8**

**Score Comparison:**

| Principle | Baseline | This Video | Δ |
|-----------|----------|------------|---|
| Avatar Clarity | 5 | 6 | +1 |
| Themes Over Topics | 5 | 6 | +1 |
| ARC Attention | 4 | 6 | +2 |
| ARC Revelation | 4 | 7 | +3 |
| ARC Connection | 5 | 4 | -1 |
| Title Frameworks | 7 | 8 | +1 |
| Approve the Click | 4 | 7 | +3 |
| Lead Magnet System | 2 | 5 | +3 |
| Curiosity Bridges | 5 | 6 | +1 |
| Show Don't Tell | 8 | 7 | -1 |
| Values Peppering | 7 | 3 | -4 |
| Connection Language | 5 | 5 | 0 |
| Story Proof | 6 | 5 | -1 |
| Grade 5 Language | 7 | 7 | 0 |
| Binge Architecture | 3 | 4 | +1 |
| Consistency | 5 | 5 | 0 |

**Key Finding:** "This is a significant step forward from the baseline. His best opening yet — title framework is strong, approval is immediate, and for the first time there's a genuine lead magnet. But the data-driven format strips away the personality and story proof that made his property tours engaging. The trade-off is visible: content quality up, connection down."

**Three Ideas for Improvement:**
1. **Values Peppering (3/10, Δ -4):** The property tours showed Paul's personality — reactions, preferences, humour. This format is all analysis. Fix: Add 2–3 personal reactions ("I was genuinely surprised by Bloomfield Hills — it reminds me of..."). **Foundations Reference:** Lesson 2.1
2. **ARC Connection (4/10, Δ -1):** Data is compelling but emotionally flat. Fix: After each neighbourhood breakdown, add one sentence connecting to the viewer's situation: "If you're raising a family and want top-10 schools without the Birmingham price tag, this is where I'd look." **Foundations Reference:** Lesson 2.2 + 2.5
3. **Lead Magnet System (5/10, Δ +3):** Great improvement — first time mentioning a resource. But only mentioned once at the end. Fix: Mention at the opening hook and mid-video. **Foundations Reference:** Lesson 1.4

---

## APIs Required (Summary)

| API | Purpose | Auth Method |
|-----|---------|-------------|
| **Claude API** (Anthropic) | AI scoring engine — feeds transcripts, returns scores + analysis | API key header: `x-api-key` |
| **GHL API** (GoHighLevel) | Contact lookup, custom field read/write, tag filtering | Bearer token: `Authorization: Bearer {key}` |
| **Notion API** | Create audit report pages in database | Bearer token: `Authorization: Bearer {key}` |
| **yt-dlp** (CLI tool) | Download video metadata, transcripts, channel info | No auth (public YouTube data) |
| **Resend API** | Send audit report delivery emails | API key |

### Environment Variables

```env
ANTHROPIC_API_KEY=sk-ant-...
GHL_API_KEY=pit-babb9c02-a078-43ef-8ce8-6f951e7cc480
GHL_LOCATION_ID=vEIiKAjpBkCDrabeDre7
GHL_STUDENT_TAG=foundations - weekly coaching
NOTION_API_KEY=secret_...
NOTION_AUDIT_DB_ID=31c33f3a-1ade-80ea-a5ed-000bff2f16c1
RESEND_API_KEY=re_...
```

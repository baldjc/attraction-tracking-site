# Campaigns & Tracking Links — Replit Build Prompt

> **Date:** 2026-03-16
> **What this covers:** Campaign management, tracking links with `?ref=` codes, JavaScript tracking snippet, click/lead/page-view tracking, YouTube view count integration, visitor location + browsing journey analytics
> **Companion spec:** `docs/superpowers/specs/2026-03-16-campaigns-tracking-links-design.md`

---

## Prompt 1 of 2: Database, Campaigns, Tracking Links, and Snippet

### Paste this into Replit Agent:

```
We're building the campaign and tracking link system (Phase 3). This lets admin and Foundations members create tracking links for their lead magnets, track clicks and leads, and see which YouTube videos (or ads/emails) drive the most conversions.

The tracking approach: NO redirect domain. The tracked URL is the member's real destination URL with a ?ref= parameter appended (e.g., guides.chamberlaingroup.ca/1?ref=0e1mrgn7). A lightweight JavaScript snippet on the member's site handles all tracking.

=== STEP 1: DATABASE TABLES ===

Create these new tables (add a Prisma migration):

1. Campaign table:
   - id: UUID, primary key
   - memberId: UUID, FK → existing Member table
   - name: VARCHAR(255), required
   - destinationUrl: TEXT, required (the lead magnet URL)
   - sourceType: ENUM ('YOUTUBE', 'GOOGLE_ADS', 'EMAIL', 'OTHER'), default 'YOUTUBE'
   - deletedAt: TIMESTAMP, nullable (soft delete)
   - createdAt: TIMESTAMP
   - updatedAt: TIMESTAMP

2. TrackingLink table:
   - id: UUID, primary key
   - campaignId: UUID, FK → Campaign (CASCADE on delete)
   - name: VARCHAR(255), required
   - refCode: VARCHAR(20), UNIQUE, required
   - youtubeVideoUrl: TEXT, nullable
   - youtubeVideoId: VARCHAR(20), nullable
   - youtubeViewCount: INTEGER, default 0
   - youtubeViewsUpdatedAt: TIMESTAMP, nullable
   - deletedAt: TIMESTAMP, nullable (soft delete)
   - createdAt: TIMESTAMP

3. Click table:
   - id: UUID, primary key
   - trackingLinkId: UUID, FK → TrackingLink
   - refCode: VARCHAR(20), required
   - sessionId: VARCHAR(50), required
   - ipAddress: TEXT, nullable
   - city: VARCHAR(100), nullable
   - province: VARCHAR(100), nullable
   - country: VARCHAR(100), nullable
   - userAgent: TEXT, nullable
   - referrer: TEXT, nullable
   - timestamp: TIMESTAMP

4. PageView table:
   - id: UUID, primary key
   - clickId: UUID, FK → Click
   - pageUrl: TEXT, required
   - timestamp: TIMESTAMP

5. Lead table:
   - id: UUID, primary key
   - clickId: UUID, FK → Click, required
   - timestamp: TIMESTAMP

6. Add to existing Member table (or wherever member settings are stored):
   - thankYouPageUrl: TEXT, nullable

Add these indexes:
   - TrackingLink.refCode (unique)
   - TrackingLink.campaignId
   - Click.trackingLinkId
   - Click.refCode
   - Click.sessionId
   - Click.timestamp
   - PageView.clickId
   - Lead.clickId
   - Campaign.memberId

=== STEP 2: CAMPAIGN CRUD API ===

All endpoints require authentication. Members can only access their own campaigns. Admin can access all.

POST /api/campaigns
- Body: { name, destinationUrl, sourceType }
- Creates a campaign for the logged-in member
- Returns the created campaign

GET /api/campaigns
- Returns all campaigns for the logged-in member (admin sees all)
- Exclude soft-deleted (WHERE deletedAt IS NULL)
- Include aggregate counts: totalClicks, totalLeads, conversionRate (leads ÷ clicks)

GET /api/campaigns/[id]
- Returns campaign details with all its tracking links
- Each tracking link includes: click count, lead count, conversion rate, YouTube view count
- Include campaign-level totals: total views, total clicks, total leads

PATCH /api/campaigns/[id]
- Update name, destinationUrl, sourceType

DELETE /api/campaigns/[id]
- Soft delete: set deletedAt = NOW()
- Do NOT cascade-delete tracking links or click/lead data

=== STEP 3: TRACKING LINK CRUD API ===

POST /api/campaigns/[id]/links
- Body: { name, youtubeVideoUrl (optional) }
- Auto-generate an 8-character alphanumeric refCode (uppercase + lowercase + digits, check for uniqueness)
- If youtubeVideoUrl is provided, extract the video ID from the URL (handle both youtube.com/watch?v=XXX and youtu.be/XXX formats)
- Return the created link with the full tracked URL computed as: campaign.destinationUrl + ?ref= + refCode (use &ref= if destinationUrl already contains a ?)

GET /api/campaigns/[id]/links
- Returns all tracking links for the campaign
- Exclude soft-deleted
- Include per-link stats: clicks, leads, conversion rate, YouTube views

DELETE /api/campaigns/[id]/links/[linkId]
- Soft delete

=== STEP 4: REF CODE GENERATION ===

function generateRefCode(length = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

Always check uniqueness against the database before saving. Retry if collision.

=== STEP 5: TRACKING API ENDPOINTS ===

These 3 endpoints are called by the JavaScript snippet from external sites. They must:
- Accept CORS from ANY origin (Access-Control-Allow-Origin: *)
- NOT require authentication
- Validate that the member_id exists before processing
- Filter out bot/crawler requests by checking user-agent server-side (reject if user-agent contains: bot, crawler, spider, Googlebot, Bingbot, Slurp, DuckDuckBot, facebookexternalhit, Twitterbot, LinkedInBot, WhatsApp, Telegram)

POST /api/tracking/click
- Body: { ref_code, page_url, member_id }
- Server captures from request: IP address (x-forwarded-for header), user-agent, referrer
- Look up the tracking link by ref_code
- Geolocate IP to city/province/country (use a free IP geolocation approach — see note below)
- Generate a session_id (e.g., "s_" + 16 random alphanumeric chars)
- Create a Click record
- Return: { session_id }

POST /api/tracking/pageview
- Body: { session_id, page_url, member_id }
- Look up the click by session_id
- Create a PageView record
- Return: { success: true }

POST /api/tracking/lead
- Body: { ref_code, session_id, member_id }
- Look up the click matching BOTH session_id AND ref_code (this ensures the lead is attributed to the correct visitor, not just the most recent click on that ref code globally)
- Create a Lead record linked to that click
- Prevent duplicate leads: if a lead already exists for this click_id, don't create another
- Return: { success: true }

IP GEOLOCATION NOTE:
Use a free approach for IP geolocation. Options in order of preference:
1. MaxMind GeoLite2 free database (download the .mmdb file, use a Node.js reader like maxmind npm package) — most reliable, no per-request API limits
2. ip-api.com free tier (45 requests/minute) — simpler but rate-limited
3. If neither works easily on Replit, just store the raw IP for now and we'll add geolocation later

=== STEP 6: THE JAVASCRIPT TRACKING SNIPPET (t.js) ===

Create a publicly served JavaScript file at /t.js (or /api/t.js — whatever works best in the Next.js setup). This file must be served with aggressive cache headers (Cache-Control: public, max-age=86400).

The snippet reads two data attributes from its own script tag:
- data-id: the member's ID (e.g., "m_abc123")
- data-ty: the thank you page path (e.g., "/thank-you")

Here is the full behaviour the snippet must implement:

(function() {
  // Get config from script tag
  var script = document.currentScript;
  var memberId = script.getAttribute('data-id');
  var thankYouPath = script.getAttribute('data-ty');
  if (!memberId) return;

  var API_BASE = 'https://member.attractionbyvideo.com';
  var COOKIE_NAME = '_atref';
  var SESSION_KEY = '_atsid';

  // Cookie helpers
  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
  }

  function setCookie(name, value, days) {
    var d = new Date();
    d.setTime(d.getTime() + days * 86400000);
    document.cookie = name + '=' + value + ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax;Secure';
  }

  // Session storage helpers
  function getSession() {
    try { return sessionStorage.getItem(SESSION_KEY); } catch(e) { return null; }
  }

  function setSession(sid) {
    try { sessionStorage.setItem(SESSION_KEY, sid); } catch(e) {}
  }

  // Get ?ref= param from URL
  var urlParams = new URLSearchParams(window.location.search);
  var refParam = urlParams.get('ref');

  var currentRef = refParam || getCookie(COOKIE_NAME);
  var currentSession = getSession();

  // Scenario 1 & 4: New tracked click (has ?ref= param)
  if (refParam) {
    // Set/overwrite the attribution cookie (30-day, last-click)
    setCookie(COOKIE_NAME, refParam, 30);

    // Fire click event, get new session
    fetch(API_BASE + '/api/tracking/click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ref_code: refParam,
        page_url: window.location.href,
        member_id: memberId
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.session_id) {
        setSession(data.session_id);
        // Check if this IS the thank you page
        checkThankYou(refParam, data.session_id);
      }
    })
    .catch(function() {});

  // Scenario 2: Subsequent page view (cookie exists, no ?ref=)
  } else if (currentRef && currentSession) {
    // Fire page view
    fetch(API_BASE + '/api/tracking/pageview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: currentSession,
        page_url: window.location.href,
        member_id: memberId
      })
    }).catch(function() {});

    // Check if this is the thank you page
    checkThankYou(currentRef, currentSession);
  }
  // Scenario 5: No ref, no cookie — do nothing

  function checkThankYou(ref, sid) {
    if (!thankYouPath) return;
    if (window.location.pathname === thankYouPath) {
      fetch(API_BASE + '/api/tracking/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ref_code: ref,
          session_id: sid,
          member_id: memberId
        })
      }).catch(function() {});
    }
  }
})();

IMPORTANT: This is the reference implementation. The actual t.js served by the app should be minified. You can serve the above as-is for now and we'll minify later.

=== STEP 7: MEMBER SETTINGS — LINK TRACKING SECTION ===

Add a new "Link Tracking" section to the member settings page (or wherever member profile/settings are configured).

This section contains:
1. "Your Tracking Snippet" — a read-only code block showing:
   <script src="https://member.attractionbyvideo.com/t.js" data-id="{memberId}" data-ty="{thankYouPagePath}"></script>
   With a "Copy" button that copies the snippet to clipboard
   The snippet auto-updates when the thank you page URL changes

2. "Thank You Page URL" — a text input where the member enters the path of their thank you page (e.g., /thank-you). When saved, it:
   - Saves to the member's record (thankYouPageUrl field)
   - Updates the snippet preview above to include the new data-ty value

Admin should also be able to see/edit this in the member detail page.

=== STEP 8: CAMPAIGN & LINK UI PAGES ===

Add these pages to the existing app. They should follow the same design patterns as the existing pages (sidebar nav, cards, tables, etc.).

1. Campaigns page (/campaigns) — add "Campaigns" to the sidebar nav
   - List of campaigns as cards
   - Each card shows: campaign name, source type badge (YouTube=red, Google Ads=blue, Email=green, Other=gray), destination URL, total clicks, total leads, conversion rate
   - "+ New Campaign" button opens a modal/form: name, destination URL, source type dropdown
   - Click a card → campaign detail page

2. Campaign detail page (/campaigns/[id])
   - Header: campaign name + source type badge + destination URL (clickable link)
   - Stats bar across the top:
     * Total Views (sum of YouTube views across all links) — HIDE this stat if no links have YouTube URLs
     * Total Clicks
     * Total Leads
     * Click-Through Rate (clicks ÷ views) — HIDE if no YouTube views
     * Conversion Rate (leads ÷ clicks)
   - Tracking Links section:
     * Each row shows: YouTube thumbnail + video title (if YouTube link, else just the link name), the tracked URL with a Copy button, Views (or "—" if no YouTube URL), Clicks, Leads, Conversion Rate
     * "+ New Link" button: name field (required), YouTube video URL field (optional, auto-fills name from video title if possible), shows the generated tracked URL after creation
     * Sort dropdown: Newest, Most Clicks, Most Leads
   - "YouTube views last updated at [timestamp]" at the bottom if any links have YouTube URLs

3. Conversions/Leads page (/conversions) — add "Conversions" to the sidebar nav
   - Table of all leads across all campaigns
   - Columns: Date/Time, Campaign Name, Source (link name / video title), Location (city, province)
   - Each row is EXPANDABLE (click to expand):
     * Shows the full browsing journey: list of pages visited in order, with timestamps
     * Time on each page (calculated from gap between consecutive page view timestamps; last page shows "—")
     * Total session duration (first page view to last page view)
   - Filter by campaign dropdown
   - Date range filter

Data isolation: Members only see their own campaigns/links/leads. Admin sees everything (with a member filter dropdown).

=== IMPORTANT NOTES ===

- All tracking links in a campaign point to the SAME destination URL (the campaign's destinationUrl). One lead magnet per campaign, many content pieces driving traffic to it.
- When computing the tracked URL: if destinationUrl already contains a "?", use "&ref=" instead of "?ref=" to avoid double question marks.
- Soft delete for campaigns and tracking links (set deletedAt, don't actually delete). Historical click/lead data must be preserved.
- YouTube referrer will often be null — YouTube strips the Referer header on outbound clicks. This is expected, not a bug.
- The t.js snippet must be publicly accessible without authentication.
```

---

## Prompt 2 of 2: YouTube View Count Integration

### Paste this into Replit Agent AFTER Prompt 1 is working:

```
Add YouTube view count fetching for tracking links.

=== YOUTUBE DATA API SETUP ===

We need a YouTube Data API v3 key. This is a single API key for the platform (not per-member).

1. Add a YOUTUBE_API_KEY environment variable in Replit Secrets
2. Use the YouTube Data API v3 videos endpoint to fetch view counts:
   GET https://www.googleapis.com/youtube/v3/videos?part=statistics&id={videoId}&key={YOUTUBE_API_KEY}
   Response includes: statistics.viewCount

=== BACKGROUND JOB ===

Create a background job (cron or setInterval) that runs every 4 hours:

1. Query all TrackingLinks where youtubeVideoId IS NOT NULL and deletedAt IS NULL
2. Batch the video IDs (the YouTube API accepts up to 50 video IDs per request, comma-separated)
3. For each batch, call the YouTube API and update:
   - youtubeViewCount = response statistics.viewCount (parse as integer)
   - youtubeViewsUpdatedAt = NOW()
4. If a video ID returns no results (not published yet or deleted), set viewCount to 0

Error handling:
- If the API key is missing, log a warning and skip (don't crash)
- If a request fails, log the error and continue with the next batch
- If rate limited, back off and retry once after 60 seconds

=== API ENDPOINT FOR MANUAL REFRESH ===

POST /api/campaigns/[id]/refresh-views (admin only)
- Triggers an immediate view count refresh for all YouTube links in that campaign
- Returns the updated view counts

=== UI ADDITION ===

On the campaign detail page, next to the "YouTube views last updated at [timestamp]" text, add a refresh icon button that calls the manual refresh endpoint. Admin only.

=== VIDEO TITLE AUTO-FILL ===

When creating a new tracking link with a YouTube URL:
1. Extract the video ID from the URL
2. Call YouTube API: GET https://www.googleapis.com/youtube/v3/videos?part=snippet&id={videoId}&key={YOUTUBE_API_KEY}
3. If found, auto-fill the link name with the video title (snippet.title)
4. If found, store the thumbnail URL (snippet.thumbnails.medium.url) for display in the tracking links list
5. If not found (video not published yet), leave the name as whatever the user typed

Add a youtubeThumbnailUrl TEXT nullable field to the TrackingLink table for this.
```

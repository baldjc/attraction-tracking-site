# Tracker Site (members.attractionbyvideo.com) — Correction + New Task

## IMPORTANT: Stop Building Webinar Registration Page

The webinar registration page, webinar thank-you page, and any public-facing landing pages should NOT be built in this project. Those belong on the separate landing page project at `www.attractionbyvideo.com`.

**If any webinar registration routes or components were created, please remove them.** This project is the member platform and admin tools only.

---

## What This Project DOES Need: Admin Settings Panel + Public API

### Overview

Build an admin settings page where Jared can manage dynamic content values for the public landing pages. When he saves, the values are:
1. Stored in the Neon DB
2. Pushed to GHL custom values via API (so GHL emails/texts also update)

A public (no-auth) API endpoint exposes these values so the landing page site (`www.attractionbyvideo.com`) can fetch them at runtime.

---

### 1. Database Table

```sql
CREATE TABLE site_config (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  label VARCHAR(200),                    -- Human-readable label for admin UI
  field_type VARCHAR(20) DEFAULT 'text', -- text, url, toggle, readonly
  category VARCHAR(50) DEFAULT 'webinar',-- For grouping in admin UI
  ghl_custom_value_key VARCHAR(100),     -- GHL key for sync (null = don't sync)
  sort_order INT DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by VARCHAR(100)
);

-- Seed data
INSERT INTO site_config (key, value, label, field_type, category, ghl_custom_value_key, sort_order) VALUES
  -- Editable webinar fields
  ('webinar_date', 'May 14th 2026', 'Webinar Date', 'text', 'webinar', 'webinar_date', 1),
  ('webinar_time', '11:00 AM MST', 'Webinar Time', 'text', 'webinar', 'webinar_time', 2),
  ('webinar_name', '5 YouTube Mistakes Keeping You Invisible to Your Best Clients', 'Webinar Title', 'text', 'webinar', 'webinar_name', 3),
  ('webinar_price', 'Absolutely FREE!', 'Price Display', 'text', 'webinar', NULL, 4),
  ('webinar_link', 'https://us06web.zoom.us/meeting/register/VSV2PExgQRiuSDfudt2hrQ', 'Zoom Registration Link', 'url', 'webinar', 'webinar_link', 5),
  ('webinar_replay_link', 'https://youtu.be/dkDxkLA1qlk', 'Replay Link (YouTube)', 'url', 'webinar', 'webinar_replay_link', 6),
  ('webinar_group', 'https://www.skool.com/bcmng', 'Skool Community Link', 'url', 'webinar', 'webinar_group', 7),
  ('add_event_calendar', 'https://evt.to/m6g2165kzyvd', 'Calendar Add Link', 'url', 'webinar', 'add_event_calendar', 8),
  ('book_a_call_with_jared', 'https://api.leadconnectorhq.com/widget/booking/lXV5gbqk0CnlsLJGBwQ8', 'Booking Widget URL', 'url', 'webinar', 'book_a_call_with_jared', 9),
  ('offer', 'https://attractionbyvideo.com/Attraction-by-Video', 'Offer/Sales Page Link', 'url', 'webinar', 'offer', 10),
  ('webinar_spots_available', 'true', 'Show "Limited Spots Available"', 'toggle', 'webinar', NULL, 11),
  ('webinar_registration_open', 'true', 'Registration Open', 'toggle', 'webinar', NULL, 12),

  -- Auto-computed (read-only in admin, computed on save)
  ('funnel_date_and_time', 'May 14th, 2026  ||  Time: 11 AM MST  ||  Price: Absolutely FREE!', 'Funnel Date & Time (auto)', 'readonly', 'webinar_computed', 'funnel_date_and_time', 20),
  ('webinar_time_workflow_mmddyyyy_hhmm', '05-14-2026 11:00 AM', 'Workflow Timestamp (auto)', 'readonly', 'webinar_computed', 'webinar_time_workflow_mmddyyyy_hhmm', 21);
```

---

### 2. Admin Page

**Route:** `/admin/settings/landing-page` (or as a new tab in existing admin settings)

**Page header** (follow existing admin page pattern):
- Icon pill: settings gear, azure colour
- Section label: "SETTINGS"
- Headline: "Landing Page Settings"
- Description: "Manage dynamic content for the public landing pages. Changes sync to GHL custom values automatically."

**Card: "Webinar Configuration"**

Render all `site_config` rows where `category = 'webinar'`, ordered by `sort_order`.

For each row, render the appropriate input based on `field_type`:
- `text` → text input
- `url` → text input (styled as URL, maybe with external link icon)
- `toggle` → toggle switch
- `readonly` → disabled text input with muted styling + "(auto-computed)" label

**Card: "Computed Values" (collapsed by default)**

Show the `category = 'webinar_computed'` rows as read-only. These are informational — shows Jared what will be pushed to GHL.

**Save Button: "Save & Sync to GHL"**

On click:
1. Validate inputs (URLs are valid, required fields not empty)
2. Compute derived values:
   - `funnel_date_and_time` = `"{webinar_date}  ||  Time: {webinar_time}  ||  Price: {webinar_price}"`
   - `webinar_time_workflow_mmddyyyy_hhmm` = reformat date+time to `"MM-DD-YYYY HH:MM AM"` format
3. Save ALL values (including computed) to DB via `PUT /api/admin/site-config`
4. For each row with a non-null `ghl_custom_value_key`, push to GHL API
5. Show success toast: "Settings saved. GHL custom values updated."
6. If GHL sync fails for any value: warning toast listing which failed. DB save still succeeds.

---

### 3. API Routes

**Admin route (authenticated):**

```
PUT /api/admin/site-config
Body: { settings: [{ key: "webinar_date", value: "June 4th 2026" }, ...] }
Auth: Admin session required
Response: { success: true, ghlSync: { synced: 8, failed: 0 } }
```

Logic:
1. Save all settings to DB
2. Compute derived values and save those too
3. Sync to GHL for all rows with `ghl_custom_value_key`

**Public route (no auth, for landing page to consume):**

```
GET /api/public/site-config
Response: {
  "webinar": {
    "date": "May 14th 2026",
    "time": "11:00 AM MST",
    "name": "5 YouTube Mistakes Keeping You Invisible to Your Best Clients",
    "price": "Absolutely FREE!",
    "link": "https://us06web.zoom.us/...",
    "replayLink": "https://youtu.be/...",
    "group": "https://www.skool.com/bcmng",
    "calendarLink": "https://evt.to/...",
    "bookingLink": "https://api.leadconnectorhq.com/...",
    "offerLink": "https://attractionbyvideo.com/...",
    "spotsAvailable": true,
    "registrationOpen": true
  }
}
```

- No authentication required
- CORS headers: allow `www.attractionbyvideo.com` origin
- Cache: `Cache-Control: public, max-age=60` (1 minute — so changes appear within a minute)
- Only return `category = 'webinar'` values (not computed or internal)

---

### 4. GHL Sync Implementation

```typescript
async function syncToGHL(settings: { key: string; value: string; ghl_custom_value_key: string }[]) {
  const results = { synced: 0, failed: 0, errors: [] as string[] }

  for (const setting of settings) {
    if (!setting.ghl_custom_value_key) continue

    try {
      const response = await fetch(
        `https://services.leadconnectorhq.com/locations/${process.env.GHL_LOCATION_ID}/customValues/${setting.ghl_custom_value_key}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${process.env.GHL_API_KEY}`,
            'Content-Type': 'application/json',
            'Version': '2021-07-28',
          },
          body: JSON.stringify({ value: setting.value }),
        }
      )

      if (response.ok) {
        results.synced++
      } else {
        results.failed++
        results.errors.push(`${setting.key}: ${response.status}`)
      }
    } catch (err) {
      results.failed++
      results.errors.push(`${setting.key}: ${err.message}`)
    }
  }

  return results
}
```

**Required environment variables (Replit Secrets):**
- `GHL_API_KEY` — GHL API key with locations/customValues write permission
- `GHL_LOCATION_ID` — GHL sub-account location ID

---

### 5. CORS Configuration

The public API endpoint needs to accept requests from the landing page domain. Add CORS headers:

```typescript
// In the GET /api/public/site-config handler
res.setHeader('Access-Control-Allow-Origin', 'https://www.attractionbyvideo.com')
res.setHeader('Access-Control-Allow-Methods', 'GET')
res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
```

---

### Summary

| What | Where |
|---|---|
| Admin settings page | `/admin/settings/landing-page` |
| Admin save API | `PUT /api/admin/site-config` (auth required) |
| Public config API | `GET /api/public/site-config` (no auth, CORS enabled) |
| DB table | `site_config` |
| GHL sync | On every admin save, push to GHL custom values |

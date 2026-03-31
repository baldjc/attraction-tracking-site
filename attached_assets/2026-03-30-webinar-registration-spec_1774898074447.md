# Webinar Registration Page — Design Spec

**Date:** 2026-03-30
**Route:** `/webinar-registration` (on the same Replit project as the main landing page)
**Design:** Same minimalist taste-skill aesthetic as the main landing page
**Dynamic Values:** Date, time, and price pulled from DB (editable via tracker site admin)

---

## Dynamic Fields (from Admin Settings)

These values are stored in the Neon DB and editable from the tracker site admin panel. They also push to GHL custom values on save.

| Field | Example Value | GHL Custom Value Name |
|---|---|---|
| Webinar Date | May 14th, 2026 | `{{custom_values.webinar_date}}` |
| Webinar Time | 11 AM MST | `{{custom_values.webinar_time}}` |
| Webinar Price | Absolutely FREE! | `{{custom_values.webinar_price}}` |
| Spots Available | true/false | (controls "LIMITED SPOTS" visibility) |

The page fetches these on load via an API route (e.g., `/api/webinar-config`) that reads from the DB.

---

## Page Structure (Top to Bottom)

### 1. Hero Section
**Background:** Dark (#1A1A1A) — full width
**Layout:** Centred text (this is a registration page, not the main landing — centred is appropriate here)

- Section label: "STOP BEING INVISIBLE TO YOUR DREAM CLIENTS" — 13px, 600 weight, uppercase, letter-spacing 0.12em, #fff
- Headline: "5 YouTube Mistakes Making You Invisible to Clients and Costing You Millions" — Cabinet Grotesk 800, clamp(36px, 5vw, 64px), line-height 1.1
  - "5 YouTube Mistakes" in accent colour (var(--accent-azure) or the copper/orange #d3753d from the current page)
  - Rest in white
- Subheadline: "Join Jared Chamberlain for this powerful, FREE masterclass where he'll show you exactly how to transform your YouTube strategy to attract clients instead of chasing them." — 17px, rgba(255,255,255,0.7), max-width 720px, margin 0 auto
- **Dynamic date/time/price line:** "Date: {{webinar_date}} || Time: {{webinar_time}} || Price: {{webinar_price}}" — 16px, 600 weight, accent colour (copper/orange)
- Primary CTA: "YES! REGISTER MY SPOT NOW!" — large button, accent-azure background, white text, 18px 700 weight, rounded-lg, padding 18px 48px
  - Subtext under button: "LIMITED SPOTS AVAILABLE" — 12px, accent colour, letter-spacing 0.1em
  - Button scrolls to registration form section (or opens modal)
  - Hover: translateY(-2px) + shadow, Active: scale(0.98)

### 2. Problem / Empathy Section
**Background:** White/light (#FAFAF8)

**Headline:** "It's Time to Stop Chasing Clients and Start Attracting Them" — Cabinet Grotesk 800, centred
- "Stop Chasing Clients" in accent colour

**Split layout (photo left, questions right):**

**Left:** Photo of Jared at laptop (same image from current page)
- Rounded corners, subtle shadow

**Right:**
- Subheading: "Let me ask you something honestly" — Cabinet Grotesk 700, 24px
- 4 question cards/bullets (each with an icon):
  1. "When was the last time you felt confident that your marketing was actually working?"
  2. "Are you tired of throwing money at ads that cost more every month?"
  3. "Frustrated with calling leads who don't know who you are, except they are the ones that signed up through your ads?"
  4. "Fed up with networking events that eat up your time but only connect you with one person at a time?"
- Each: icon (styled circle or question mark), text 15px, text-secondary, padding 12px 0

**Below the split — full-width body copy:**
- "Deep down, you already know the truth. Your business deserves better than expensive ads, unreliable algorithms, and slow networking. You're meant to have clients seeking YOU out, ready to pay premium rates because they trust you and see you as the expert."
- "But here's what's really keeping you stuck: it's not lack of talent or opportunity — it's making the wrong moves on YouTube that keep you invisible to the clients who need you most."
- **Bold:** "What you might not realise is how the right YouTube strategy changes everything." Then: "When you finally step into your power as a local authority, everything shifts."
- "Clients who once scrolled past your content suddenly can't wait to work with you. Competitors who dismissed your 'little YouTube channel' start asking how you're booking so many premium clients. And your business grows without the constant stress of chasing leads."

Text styling: 16px, text-primary, line-height 1.8, max-width 800px, margin 0 auto, paragraphs spaced 24px apart.

### 3. The Alternative (Card Section)
**Background:** Light (#F5F4F0)

**Centred card (max-width 720px, bg white, rounded-xl, padding 48px, shadow-md):**

- Headline: "The alternative?" — Cabinet Grotesk 700, 36px, accent colour, centred
- Horizontal rule: 60px wide, 3px, accent-azure, centred, margin 16px auto 32px
- Body text (centred, 16px, text-secondary, line-height 1.8):
  - "Staying where you are, watching your marketing budget disappear while your competitors figure out what you're missing. People sense when you're struggling to get noticed. They feel the desperation in your outreach. And worst of all — so do you."
  - "This isn't about learning a few video tricks or posting more content. This is about transformation!"
  - "Stepping into the version of yourself who attracts $100,000+ in new business annually through YouTube. Who creates valuable content that positions you as THE local expert. Who builds wealth by helping people find you instead of chasing them down. The path to that reality is clearer than you think. But first, you need to stop making the mistakes that keep you invisible."
  - **Bold:** "That's exactly what this free training is designed to do."
- CTA Button: "YES! REGISTER MY SPOT NOW!" (same style as hero)

### 4. What You'll Discover (5 Mistakes Grid)
**Background:** Dark (#1A1A1A)

**Headline:** "What You'll Discover in This Free Training" — Cabinet Grotesk 800, centred, white
- "What You'll Discover" in accent colour

**Card grid: 3 columns top row, 2 columns bottom row (centred)**

Each card:
- Background: white, rounded-xl, padding 32px, text-align centre
- Icon: SVG illustration at top (styled in accent colour, ~64px)
- Label: "MISTAKE #1" — 12px, 600 weight, accent colour, uppercase, letter-spacing 0.1em
- Title: Cabinet Grotesk 700, 18px, text-primary
- Description: 14px, text-secondary, line-height 1.6

**The 5 mistakes:**
1. Icon: magnifying glass + chart | "Not Seeing the YouTube Opportunity" | "Countless industry leaders claim that YouTube is the #1 way to grow your brand and build clients attracted to your business."
2. Icon: AI sparkle | "Not Using AI in Your Business and Content" | "Learn how to leverage AI tools to create compelling content efficiently, even with your busy schedule as a business owner."
3. Icon: person with question | "Not Knowing What Makes Your Content Suck" | "You don't know the reason people aren't watching your videos. It could be a few simple tweaks to drive more views and leads."
4. Icon: sad face / X eyes | "Not Attracting Your Perfect Client" | "Master the art of attracting your ideal local clients while naturally repelling the tire-kickers and bargain hunters."
5. Icon: connected nodes | "Not Having a Proven, Repeatable Strategy" | "Develop your systematic approach to creating content that positions you as the local expert and attracts premium clients."

**Below grid — CTA:** "YES! REGISTER MY SPOT NOW!"

**Responsive:** 3-col → 2-col → 1-col on mobile

### 5. About Your Host
**Background:** Light (#FAFAF8)

**Split layout (photo left, bio right):**

**Left:** Jared headshot (arms crossed, same image from current page)
- Large, edge-to-edge in its column, rounded on right side only (or fully rounded)

**Right:**
- Headline: "About Your Host" — Cabinet Grotesk 800, 40px
  - "Your Host" in accent colour
- Bio paragraphs (16px, text-secondary, line-height 1.8):
  - "Meet Jared Chamberlain — built a multi-7-figure local business with his wife, dedicated dance dad to two teenage daughters, bald longer than he had hair, car enthusiast, and music lover who discovered the secret to turning YouTube into a client-attraction machine for his own local business."
  - **Bold:** "In the past 4 years, Jared's YouTube strategy has generated $3,996,258+ in GCI."
  - "Jared's proven systems focus specifically on local exposure (not national), work within the time constraints of busy business owners, and show you how to do this efficiently and effectively with AI — unlike anything you'll see anywhere else."

### 6. The Hard Way (3-Step Warning)
**Background:** Dark (#1A1A1A)

**Headline:** "You Can Do It the Hard Way..." — Cabinet Grotesk 800, centred, white
- "You Can Do" in accent colour
**Subheadline:** "The Hard Way (Don't Do This!)" — 18px, 600 weight, white

**3-card row:**
Each card: white, rounded-xl, padding 32px, text-align centre
- Number circle: 48px, accent colour (copper/orange) background, white text, 700 weight, border-radius 50%
- Description: 15px, text-secondary, line-height 1.6

1. "Start a YouTube Channel to reach new people, talking about what you like."
2. "You shoot random content that no one cares about or watches."
3. "You get too busy in your business to stay consistent, don't have a road map and there are no results!"

**Below:** "Want the easy way? Sign up for the masterclass!" — 20px, 700 weight, white, centred
**CTA:** "YES, I WANT THE EASY WAY" + "LIMITED SPOTS AVAILABLE"

### 7. Final Urgency Close
**Background:** Light with subtle texture/pattern at bottom

**Headline:** "Don't Let Another Day Pass By Without Taking Action" — Cabinet Grotesk 800, centred
- "Don't Let" in accent colour

**Split layout (image left, copy right):**

**Left:** Photo of laptop + notebook + coffee (workspace shot)
- Rounded, subtle shadow

**Right (centred text):**
- "Your dream client-attraction system isn't going to build itself. Every day you wait is another day of expensive ads, unpredictable algorithms, and slow networking while your competitors figure out what you're missing."
- "The business owners who are thriving with YouTube were once exactly where you are now — talented, passionate, but making the same invisible mistakes. They took one simple action that changed everything: they showed up to learn the right way."
- **Bold:** "Now it's your turn."
- CTA: "RESERVE MY FREE SPOT NOW" + "LIMITED SPOTS AVAILABLE"

### 8. Footer
- Dark background
- "© 2026 Jared Chamberlain - All Rights Reserved"
- Centred, 13px, rgba(255,255,255,0.4)

---

## Registration Form Behaviour

All the CTA buttons on the page should either:

**Option A: Scroll to a form section** — add a form section between the hero and the problem section (or as a slide-out panel)

**Option B: Open a modal/popup** — clicking any CTA opens a registration modal overlay

**Recommended: Option B (modal)** — keeps the page flow clean, every CTA triggers the same modal.

### Modal Form
- Overlay: rgba(0,0,0,0.6) backdrop, centred modal
- Modal: white background, rounded-xl, max-width 480px, padding 40px
- Headline: "Reserve Your Free Spot" — Cabinet Grotesk 700, 28px
- Dynamic line: "{{webinar_date}} at {{webinar_time}}" — accent colour, 14px 600 weight
- Fields:
  1. Full Name (text, required)
  2. Email (email, required)
  3. Cell Phone (tel, required)
- Submit: "REGISTER NOW — IT'S FREE" — full-width, accent-azure, white text, 16px 700 weight
- Subtext: "We'll send you a confirmation and reminder before the event."
- Form POSTs to GHL webhook (same pattern as audit form)
- On success: redirect to `/webinar-thank-you` page

### Thank-You Page (`/webinar-thank-you`)
- Same design system
- Centred content:
  - Animated checkmark
  - "You're registered!"
  - "{{webinar_date}} at {{webinar_time}}"
  - "We'll send you a reminder before the event. Add it to your calendar now."
  - Calendar add links (Google Calendar, Apple Calendar)
  - "While you wait, check out Jared's YouTube channel" — link

---

## Accent Colour Note

The current GHL page uses a copper/orange accent (#d3753d) rather than the azure (#3dc3ff) used on the main landing page. Two options:

1. **Keep copper for the webinar page** — differentiates it from the main site, matches the current brand feel
2. **Switch to azure** — consistent with the new landing page design system

Recommend discussing with Jared. Both work. The spec above uses "accent colour" generically — Replit can set it as a CSS variable that's easy to swap.

---

# Admin Settings Panel — Design Spec

**Location:** Tracker site admin panel → new "Landing Page Settings" section
**Route:** `/admin/settings/landing-page` (or tab within existing settings)

## Database Schema

Add a new table or extend existing settings:

```sql
CREATE TABLE landing_page_settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  ghl_custom_value_id VARCHAR(100), -- GHL custom value ID for sync
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by VARCHAR(100)
);

-- Seed with initial values — GHL custom value keys match exactly
INSERT INTO landing_page_settings (key, value, ghl_custom_value_id) VALUES
  ('webinar_date', 'May 14th 2026', 'webinar_date'),
  ('webinar_time', '11:00 AM MST', 'webinar_time'),
  ('webinar_name', '5 YouTube Mistakes Keeping You Invisible to Your Best Clients', 'webinar_name'),
  ('webinar_link', 'https://us06web.zoom.us/meeting/register/VSV2PExgQRiuSDfudt2hrQ', 'webinar_link'),
  ('webinar_replay_link', 'https://youtu.be/dkDxkLA1qlk', 'webinar_replay_link'),
  ('webinar_group', 'https://www.skool.com/bcmng', 'webinar_group'),
  ('add_event_calendar', 'https://evt.to/m6g2165kzyvd', 'add_event_calendar'),
  ('book_a_call_with_jared', 'https://api.leadconnectorhq.com/widget/booking/lXV5gbqk0CnlsLJGBwQ8', 'book_a_call_with_jared'),
  ('offer', 'https://attractionbyvideo.com/Attraction-by-Video', 'offer'),
  ('webinar_price', 'Absolutely FREE!', NULL),
  ('webinar_spots_available', 'true', NULL),
  ('webinar_registration_open', 'true', NULL);

-- Computed values (auto-generated on save, not editable directly):
-- funnel_date_and_time = "{webinar_date} || Time: {webinar_time} || Price: {webinar_price}"
-- webinar_time_workflow_mmddyyyy_hhmm = date reformatted as "MM-DD-YYYY HH:MM AM"
-- These are computed from the editable fields and pushed to GHL on save
```

## Admin UI

### Layout
Standard tracker site admin page with header pattern:
- Icon pill (settings gear, in azure)
- Section label: "SETTINGS"
- Headline: "Landing Page Settings"
- Description: "Manage dynamic content on the public landing pages. Changes sync to GHL custom values automatically."

### Form Fields

**Webinar Settings Card:**
- Card with white background, border, rounded-lg, padding 32px
- Subtitle: "Webinar Configuration" — 16px, 600 weight

| Field | Type | Label | Syncs to GHL |
|---|---|---|---|
| webinar_date | Text input | Webinar Date (e.g., "May 14th 2026") | `webinar_date` |
| webinar_time | Text input | Webinar Time (e.g., "11:00 AM MST") | `webinar_time` |
| webinar_name | Text input | Webinar Title | `webinar_name` |
| webinar_link | URL input | Zoom Registration Link | `webinar_link` |
| webinar_replay_link | URL input | Replay Link (YouTube) | `webinar_replay_link` |
| webinar_group | URL input | Skool Community Link | `webinar_group` |
| add_event_calendar | URL input | Calendar Add Link (evt.to) | `add_event_calendar` |
| book_a_call_with_jared | URL input | Booking Widget URL | `book_a_call_with_jared` |
| offer | URL input | Offer/Sales Page Link | `offer` |
| webinar_price | Text input | Price Display (e.g., "Absolutely FREE!") | — |
| webinar_spots_available | Toggle switch | Show "Limited Spots Available" | — |
| webinar_registration_open | Toggle switch | Registration Open | — |

**Auto-computed on save (not editable — derived from above fields):**

| GHL Key | Computed From | Example Output |
|---|---|---|
| `funnel_date_and_time` | date + time + price | "May 14th, 2026 \|\| Time: 11 AM MST \|\| Price: Absolutely FREE!" |
| `webinar_time_workflow_mmddyyyy_hhmm` | date + time reformatted | "05-14-2026 11:00 AM" |
| `webinar_time_workflow_mmddyyyy_hhmm_replay_trigger` | date - 1 day (or configurable offset) | "05-13-2026 8:00 AM" |

**Save Button:**
- "Save & Sync to GHL" — primary button style
- On click:
  1. PUT to `/api/admin/landing-page-settings` — saves all values to DB
  2. For each field with a `ghl_custom_value_id`, calls GHL API to update the custom value
  3. Shows success toast: "Settings saved. GHL custom values updated."
  4. If GHL sync fails: shows warning toast: "Settings saved to database. GHL sync failed — check API connection." (DB save still succeeds)

### GHL Sync Logic

```typescript
// On save, for each setting that has a GHL custom value ID:
async function syncToGHL(settings: Setting[]) {
  const ghlSettings = settings.filter(s => s.ghl_custom_value_id)

  for (const setting of ghlSettings) {
    await fetch(
      `https://services.leadconnectorhq.com/locations/${LOCATION_ID}/customValues/${setting.ghl_custom_value_id}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${GHL_API_KEY}`,
          'Content-Type': 'application/json',
          'Version': '2021-07-28',
        },
        body: JSON.stringify({ value: setting.value }),
      }
    )
  }
}
```

**Required env vars (in Replit Secrets):**
- `GHL_API_KEY` — GHL API key with custom values write permission
- `GHL_LOCATION_ID` — your GHL location/sub-account ID

### API Routes

**Public (landing page reads):**
```
GET /api/webinar-config
→ Returns: { date, time, price, spotsAvailable, registrationOpen }
→ No auth required, cached for 60 seconds
```

**Admin (settings writes):**
```
PUT /api/admin/landing-page-settings
→ Body: { key: value, ... }
→ Requires admin auth
→ Saves to DB + syncs to GHL
→ Returns: { success: true, ghlSyncStatus: 'ok' | 'failed' }
```

### Future Expansion

The same settings pattern can later hold:
- Main landing page dynamic values (member count, latest stats)
- A/B test variants
- Seasonal messaging changes
- Any other value you want to control from the admin panel without touching code

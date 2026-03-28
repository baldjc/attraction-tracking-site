# Per-Link Source Type — Campaign Structure Update

## What This Does

Currently campaigns are tied to a single type (e.g., "YouTube") and all tracking links inside inherit that type. This doesn't work when members repurpose content across platforms — a LinkedIn article link shouldn't be labelled as a YouTube campaign.

This change moves the source/platform type from the campaign level down to the individual tracking link level. A campaign becomes a content-level grouping ("Don't Buy a Home in Calgary If Your Agent Does This") and each link inside it declares its own source platform.

---

## Database Changes

### 1. Add `source` field to the TrackingLink model

Add a new field to the `TrackingLink` table in `prisma/schema.prisma`:

```
source  String  @default("youtube")  // youtube, linkedin, instagram, email, other
```

Valid values: `youtube`, `linkedin`, `instagram`, `email`, `other`

### 2. Migrate existing data

All existing tracking links should get their `source` set based on their parent campaign's current type. If the campaign type is "YouTube", all its links become `source: "youtube"`. This preserves existing data accurately.

### 3. Campaign type field

The campaign-level `type` field can stay in the database for now (no need to run a destructive migration), but it should no longer be used in the UI or for any logic. Everything should read from the link-level `source` instead.

---

## UI Changes

### 1. Creating/Editing a Tracking Link

When creating a new tracking link inside a campaign (the "+ New Link" flow or "Edit Link" modal), add a **source picker** — a dropdown or selectable button group with options:
- YouTube
- LinkedIn
- Instagram
- Email
- Other

Default to "YouTube" since that's the most common.

**The modal fields should adapt based on the selected source:**
- **When source is YouTube:** Show "YouTube Video URL (optional)" field and label the name field "Video Name". This is how it works today.
- **When source is anything else:** Hide the "YouTube Video URL" field entirely. Change the name field label from "Video Name" to "Link Name".

### 2. Campaign Detail Page — Per-Link Source Badge

Each tracking link row should show a small source badge (like the current "YouTube" badge on the campaign title) next to the link name. Use distinct colours for each source:
- YouTube: red
- LinkedIn: blue
- Instagram: gradient pink/purple or magenta
- Email: green or teal
- Other: gray

### 3. Campaign Title — Remove Type Badge

Remove the campaign-level type badge (the "YouTube" badge next to the campaign title). The campaign is now source-agnostic — it's a content grouping, not a platform grouping. If you want to show what platforms are used, you could show small icons for all unique sources used by links in that campaign (e.g., YouTube + LinkedIn icons), but this is optional.

### 4. Campaign Creation and Edit Modals

Remove the "Traffic Source" dropdown from both the campaign creation modal and the campaign edit modal. Campaigns no longer have a type/source — the source is chosen per-link. The campaign edit modal should only have: Campaign Name, Destination URL, and Lead Magnet URL.

### 5. YouTube-Specific Features — Conditional on Link Source

The following features should only appear/run when a tracking link's source is `youtube`:
- "+ Attach YouTube URL" button
- Video title and thumbnail auto-fill
- View count fetching (background job)
- "Views" stat on the link row
- YouTube Studio link

For non-YouTube sources, these should be hidden. The link row should just show: link name, source badge, direct URL, short URL, clicks, leads, conversion rate.

### 6. Analytics Filtering

On the campaign detail analytics chart, add a source filter dropdown so members can view:
- All sources (default)
- Just YouTube
- Just LinkedIn
- etc.

This filters the clicks/leads chart data by the source of the tracking links.

### 7. Campaigns List Page

On the campaigns list page, if you currently show the campaign type, replace it with small icons showing which sources are used by links in that campaign. For example, a campaign with 1 YouTube link and 1 LinkedIn link would show both icons.

---

## What Does NOT Change

- Click tracking (`?ref=` param, `/r/[shortCode]` redirect) — works exactly the same regardless of source
- Lead attribution (thank you page matching) — unchanged
- The tracking snippet (`t.js`) — unchanged
- Short links — unchanged
- Conversion tracking — unchanged
- Click Map / geo data — unchanged
- API route structure — same endpoints, just add `source` field to create/update payloads

---

## API Changes

- **POST /api/member/links** — accept optional `source` field (default: `"youtube"`)
- **PATCH /api/member/links/[id]** — accept optional `source` field for updates
- **GET endpoints** — return the `source` field on each link object so the frontend can render badges and conditionally show YouTube features

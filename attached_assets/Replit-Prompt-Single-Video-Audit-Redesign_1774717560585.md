# Single Video Audit — Layout Redesign + My Scores Enhancements

Three related changes to make single video audits feel more like a proper video analysis page and less like a generic report.

---

## 1. Single Video Audit Report Page — New Top Section

**Page:** `/member/audits/[id]` (when the audit type is `single_video`)

Redesign the top section of the report. Currently it shows the yellow score box and blue diagnosis box side by side. Replace with:

### H1 Title Row (full width, top of page)
- Video title as a large H1 heading
- Below the title, a row of small stats/actions in muted text, separated by dots or pipes:
  - View count (e.g., "12.4K views") — pull from stored YouTube data if available, skip gracefully if not
  - Upload date (e.g., "Published Mar 15, 2026")
  - "Edit in Studio →" link (opens `https://studio.youtube.com/video/{videoId}/edit` in new tab)
  - "Watch on YouTube →" link (opens `https://youtube.com/watch?v={videoId}` in new tab)

### Two-Column Section Below the Title
- **Right side (2/3 width):** Embedded YouTube player for the video. Use a standard YouTube iframe embed (`https://www.youtube.com/embed/{videoId}`) with 16:9 aspect ratio.
- **Left side (1/3 width):** The Attraction Score card (yellow background with the big score number) stacked on top of the blue diagnosis/quote section. These two elements should stretch to match the height of the embedded video player so they sit flush side by side.

### Below This
Everything else on the page stays as-is (16-Principle Breakdown, strengths, gaps, learning path, etc.). No changes needed below the new top section.

### Data
The audit record should already store `videoId`, video title, and thumbnail URL from when the audit was created. The videoId is needed for the YouTube embed and the Studio/YouTube links. If view count data is stored in the database (from the YouTube background sync job), display it. If not available, just don't show that stat — don't break the layout over it.

---

## 2. My Scores Page — Recent Video Audits Section

**Page:** `/member/scores`

Add a new "Recent Video Audits" section **between** the Score Over Time chart and the 16-Principle Breakdown.

### Content
- Heading: "Recent Video Audits"
- Show all single video audits from the last 60 days
- Each audit displays as a card or row with:
  - Video thumbnail (small, ~120x68px, rounded corners)
  - Video title (truncate with ellipsis if too long)
  - Attraction Score badge (colour-coded like existing badges — green/yellow/red)
  - Date of the audit
  - "View Report →" link to `/member/audits/[id]`
- If no single video audits in the last 60 days, show a simple empty state: "No video audits in the last 60 days" with a muted subtitle like "Run a single video audit to see how individual videos score."
- Horizontal scrollable row on mobile if there are several, or a clean grid/list on desktop

### Data
Query audits where `type = 'single_video'` and `createdAt >= 60 days ago` for the current user, ordered by date descending. The video title, thumbnail, and score should already be on the audit record.

---

## 3. My Scores Page — Audit History Table Enhancement

**Page:** `/member/scores` — the Audit History table at the bottom

Currently, single video audits show "Single Video" in the TYPE column with no way to tell which video it was. Change single video audit rows to show:

- A small thumbnail (e.g., 60x34px) inline in the row
- The video title next to or replacing "Single Video" (truncate with ellipsis if needed)
- Keep everything else in the row unchanged (date, score badge, "View Report" link)

**Only** change how single video rows display. Baseline and Monthly rows stay exactly as they are.

---

## What NOT to Change

- Baseline and Monthly audit report pages — no layout changes
- The 16-Principle Breakdown section — stays where it is, just moves down on the scores page to make room for the Recent Video Audits section
- Score Over Time chart — untouched
- Current Attraction Score card on the scores page — untouched
- Any API endpoints — reuse existing data, no new endpoints should be needed

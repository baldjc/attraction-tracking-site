# Member Analytics — Style Fix

The Member Analytics page and Member Detail page were built with a dark theme but the rest of the site uses a light theme. Update both pages to match the existing design language.

## Design Language to Match

- **Page background:** Light grey (`bg-gray-50` or `bg-gray-100`) — same as the rest of the site
- **Cards:** White background (`bg-white`), subtle shadow (`shadow-sm`), rounded corners (`rounded-xl`), no visible border or very light border (`border border-gray-200`)
- **Text:** Dark text (`text-gray-900` for headings, `text-gray-600` for secondary text, `text-gray-400` for muted/meta text)
- **Accent colour:** Teal/cyan (`text-teal-600`, `bg-teal-600`) for buttons and interactive links — same as the "Refresh All Channels" button and member name links
- **Tables:** White background, light grey header row, subtle row dividers (`border-gray-100`)
- **Buttons:** Teal/cyan fill for primary actions, light grey for secondary
- **Charts:** Keep the `#3dc3ff` cyan stroke but update tooltip backgrounds to white with light border

## What to Change

### Both pages (`/admin/analytics/page.tsx` and `/admin/analytics/members/[id]/page.tsx`):

| Dark Theme (current) | Light Theme (correct) |
|---|---|
| `bg-gray-800` cards | `bg-white shadow-sm` |
| `bg-gray-750` hover rows | `hover:bg-gray-50` |
| `border-gray-700` | `border-gray-200` or no border |
| `text-white` headings | `text-gray-900` |
| `text-gray-300` body text | `text-gray-600` |
| `text-gray-400` meta text | `text-gray-400` (keep) |
| `text-gray-500` empty states | `text-gray-400` |
| `bg-gray-700` secondary buttons/inputs | `bg-gray-100` or `bg-white border border-gray-200` |
| `bg-cyan-600` primary buttons | `bg-teal-600 hover:bg-teal-500` |
| `text-cyan-400` links | `text-teal-600` |
| `bg-emerald-900/40` score backgrounds | `bg-emerald-50 border-emerald-200` |
| `bg-yellow-900/40` score backgrounds | `bg-yellow-50 border-yellow-200` |
| `bg-red-900/40` score backgrounds | `bg-red-50 border-red-200` |
| `bg-cyan-600/20 text-cyan-400` audit buttons | `bg-teal-50 text-teal-600 border-teal-200` |
| `bg-emerald-600/20 text-emerald-400` view audit | `bg-emerald-50 text-emerald-600 border-emerald-200` |
| Tooltip `backgroundColor: "#1f2937"` | `backgroundColor: "#ffffff"`, `border: "1px solid #e5e7eb"`, dark text |
| `stroke="#374151"` chart grid | `stroke="#f0f0f0"` |

### Summary cards specifically:
- White card with shadow, not dark slate
- Icon + label in `text-gray-500`
- Big number in `text-gray-900` (or colour-coded for inactive/active)
- Active members number: `text-emerald-600`
- Inactive members number: `text-red-600` (if > 0)

### Video cards:
- White card with shadow
- Member name in `text-teal-600`
- "Run Audit" button: `bg-teal-600 text-white` (solid fill, matching rest of site)
- "View Audit" button: `bg-emerald-50 text-emerald-700 border border-emerald-200`

### Member table:
- White background
- Header row: `text-gray-500 text-xs uppercase` on light background
- Row hover: `hover:bg-gray-50`
- Status dots: keep green/yellow/red colours, they work on light backgrounds too
- Score colours: `text-emerald-600` (≥7), `text-yellow-600` (5–6.9), `text-red-600` (<5)

### Tier badges (member detail page):
- Foundations: `bg-teal-50 text-teal-700 border border-teal-200`
- Editing: `bg-amber-50 text-amber-700 border border-amber-200`
- Mastery: `bg-purple-50 text-purple-700 border border-purple-200`

### Filter buttons and dropdown:
- Active filter: `bg-teal-600 text-white`
- Inactive filter: `bg-white text-gray-600 border border-gray-200 hover:bg-gray-50`
- Tier dropdown: `bg-white border border-gray-200 text-gray-700`

## Reference

Look at any existing page for the exact styling — `src/app/admin/ai-tools/page.tsx` or `src/app/admin/members/page.tsx` are good references. The goal is to make the analytics pages look like they've always been part of the same app.

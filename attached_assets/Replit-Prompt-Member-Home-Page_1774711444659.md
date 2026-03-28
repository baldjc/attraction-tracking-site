# Member Home Page — Replace Current Dashboard

## What This Does

Replace the current data-heavy member dashboard (`/member/dashboard`) with a clean, simple home page inspired by StoryOS. The new page is a welcoming landing screen with 6 navigation cards and two info panels at the bottom. The existing `MemberDashboard.tsx` component gets replaced entirely.

**Important:** The `EditorDashboard` component and the page-level logic in `page.tsx` that switches between `MemberDashboard` and `EditorDashboard` based on role/impersonation should stay exactly as-is. Only `MemberDashboard.tsx` changes.

---

## Layout (Top to Bottom)

### 1. Greeting Block

Centred on the page, just like StoryOS:

```
Welcome back, {firstName}
Let's create something that converts. What would you like to work on today?
```

- "Welcome back, {firstName}" — large, styled heading (use the site's brand blue `#6ba3c7` or similar)
- Subtext — smaller, muted text below
- If `firstName` is null/empty, just show "Welcome back"
- Pull `firstName` from the existing `/api/member/dashboard` endpoint (it already returns it)

### 2. Card Grid — 2 columns x 3 rows

Six cards in a responsive grid. On desktop: 3 columns x 2 rows. On mobile: stacked single column or 2 columns.

Each card is a clickable link (`<Link>`) with:
- An icon (use Heroicons outline — pick appropriate ones for each)
- A title (bold)
- A one-line description (muted text)
- Subtle hover effect (e.g., light ring or slight shadow lift)
- Clean white card style matching the existing site design (`bg-white dark:bg-[#1a1a1a]` with border)

| Order | Title | Description | Links To | Icon Suggestion |
|-------|-------|-------------|----------|-----------------|
| 1 | Academy | Master the Attraction system, one lesson at a time. | `/member/academy` | `AcademicCapIcon` |
| 2 | My Avatar | Work on your perfect avatar. | `/member/ai-tools/avatar-architect` | `UserCircleIcon` or `SparklesIcon` |
| 3 | Create Content | Generate ideas, scripts, and titles with AI. | `/member/ai-tools` | `PencilSquareIcon` or `LightBulbIcon` |
| 4 | Generate Leads | Track your links, clicks, and conversions. | `/member/campaigns` | `ChartBarIcon` or `LinkIcon` |
| 5 | My Scores | See how your content stacks up. | `/member/scores` | `TrophyIcon` or `ChartBarSquareIcon` |
| 6 | Hire a Human | Hire us to help you grow faster. | `/member/hire` | `UserGroupIcon` or `HandRaisedIcon` |

**Card styling notes:**
- Generous padding inside each card
- Icon should be larger (like 32-40px), positioned top-left of the card (not centred with the text)
- Title below the icon, description below the title
- Match the StoryOS visual pattern from the screenshot — clean, minimal, lots of white space

### 3. Bottom Info Section — Two Cards Side by Side

Below the 6-card grid, show two existing dashboard widgets in a 2-column layout (stacked on mobile):

#### Left: Next Q&A Call

Keep the existing Next Q&A Call component logic and styling from the current `MemberDashboard.tsx`. It shows:
- "Next Q&A Call" heading
- The date (e.g., "Thursday, April 2")
- Countdown badge (e.g., "in 6 days")
- "Join Call" button linking to the call URL

Data source: the existing `/api/member/dashboard` endpoint already returns `nextCoachingCall` with `date` and `link`.

#### Right: Most Viewed — Last 30 Days

Keep the existing Most Viewed component logic and styling from the current `MemberDashboard.tsx`. It shows:
- "Most Viewed — Last 30 Days" heading with "Open Studio" link
- Top 3 videos with thumbnails, titles, view counts
- Empty states: "No YouTube channel connected" with link to Settings, or "No uploads in the last 30 days"

Data source: the existing `/api/member/top-videos` endpoint.

---

## What to Remove

Everything else from the current `MemberDashboard.tsx` that is NOT listed above:
- KPI row (Attraction Score, Leads This Month, Clicks This Month, Conversion Rate)
- Strengths & Gaps panel
- Score History chart
- Days Since Last Upload panel
- AI Tools quick-links grid
- Academy/Foundations progress bar

These features still exist on their dedicated pages (`/member/scores`, `/member/campaigns`, `/member/academy`, etc.) — they're just no longer duplicated on the home page.

---

## What NOT to Change

- `page.tsx` — the role/impersonation switching logic stays identical
- `EditorDashboard.tsx` — untouched
- Sidebar navigation — no changes
- API endpoints — no new endpoints needed, reuse `/api/member/dashboard` and `/api/member/top-videos`
- Dark mode support — maintain the existing dark mode classes

---

## Responsive Behaviour

- **Desktop (lg+):** 3-column card grid, 2-column bottom info section
- **Tablet (md):** 2-column card grid, 2-column bottom info section
- **Mobile:** Single-column stack for everything

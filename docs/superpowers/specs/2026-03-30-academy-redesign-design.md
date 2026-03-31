# Academy Redesign — Course-First Layout

**Date:** 2026-03-30
**Status:** Draft
**Problem:** Member feedback that the Academy is not intuitive. 6 equal-weight tabs overwhelm new users. No clear "what do I do next?" signal. Lesson pages lose context of where you are in the course.

---

## Current State

- **6 tabs:** Foundations Library, Live Calls, Browse Library, Search, My Coaching Moments, My Saved
- **Content reality:** 6 sections, 22 lessons in Foundations (fully built). Live Calls / Moments / Browse / Saved are empty or near-empty for most members.
- **Lesson pages:** Breadcrumb nav only, no sidebar. Overview and Workbook split into 2 tabs.
- **Section view:** Accordion-style expandable list inside the Foundations tab.

## Design

### 1. Main Academy Page (`/member/academy`)

Replace the 6-tab `AcademyTabs` component with a focused, single-page layout:

**A. Continue Learning Hero (top of page)**

A prominent card showing the member's next incomplete lesson:

```
┌──────────────────────────────────────────────────────┐
│  ▶  CONTINUE LEARNING                               │
│                                                      │
│  Section 2: Positioning Your Channel                 │
│  Lesson 3: Your Niche and Expertise                  │
│                                                      │
│  ████████░░░░  3 of 5 lessons complete               │
│                                                      │
│  [ Continue → ]                                      │
└──────────────────────────────────────────────────────┘
```

- If no lessons started: shows "Start Your First Lesson" pointing to Section 1, Lesson 1
- If all lessons complete: shows a "Course Complete" congratulations state with overall stats
- Links directly to the next incomplete lesson (not the section page)
- Shows section name, lesson title, and section progress

**B. Course Sections Grid**

Below the hero, a grid of section cards (2 columns on desktop, 1 on mobile):

```
┌─────────────────────┐  ┌─────────────────────┐
│  1                   │  │  2                   │
│  Your Why            │  │  Positioning Your    │
│                      │  │  Channel             │
│  1 lesson            │  │  4 lessons           │
│  ✓ Complete          │  │  ████░░  2/4         │
│                      │  │  In Progress         │
└─────────────────────┘  └─────────────────────┘
┌─────────────────────┐  ┌─────────────────────┐
│  3                   │  │  4                   │
│  On-Camera           │  │  Creation            │
│  Confidence          │  │                      │
│  8 lessons           │  │  5 lessons           │
│  ░░░░░░  Not Started │  │  ░░░░░░  Not Started │
└─────────────────────┘  └─────────────────────┘
```

Each card:
- Section number (large, branded colour)
- Section title
- Lesson count
- Progress bar + fraction (e.g., "3/8 lessons")
- Status badge: "Not Started" (grey) / "In Progress" (blue) / "Complete" (green checkmark)
- Click navigates to `/member/academy/foundations/{sectionSlug}`

**C. Resources Section (below course grid)**

A simple horizontal row of 2-3 links for supplementary content. Only shows items that have content:

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  📹 Live Q&A     │  │  🔍 Browse by    │  │  🔎 Search All   │
│  Calls           │  │  Principle       │  │  Content         │
│  12 calls        │  │  17 principles   │  │                  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

- "Live Q&A Calls" → navigates to `/member/academy/calls` (new simple page, or keep as `?tab=live-calls`)
- "Browse by Principle" → navigates to `/member/academy/browse` (new simple page, or keep as `?tab=browse`)
- "Search All Content" → navigates to `/member/academy/search` (new simple page, or keep as `?tab=search`)
- If Live Calls has 0 calls, hide that card entirely
- Moments and Saved are folded into Browse (Moments as a filter, Saved as a toggle/filter)

### 2. Section Detail Page (`/member/academy/foundations/{sectionSlug}`)

Keep the existing page but clean up the lesson list:

- Section title + description at top
- Section progress bar (X/Y lessons, percentage)
- Numbered lesson list — each row shows:
  - Completion checkmark or empty circle
  - Lesson number + title
  - Brief description (1 line, truncated)
  - No principle tags here (save for Browse — reduces clutter)
- Click a lesson to go to the lesson page

### 3. Lesson Page — Sidebar + Single Scroll

**A. Layout: sidebar + main content**

```
┌────────────────┬─────────────────────────────────────┐
│  SIDEBAR       │  MAIN CONTENT                       │
│                │                                     │
│  Section 2:    │  Lesson Title                       │
│  Positioning   │  [principle tags]                   │
│                │                                     │
│  ✓ 1. Lesson A │  ┌─────────────────────────────┐   │
│  ✓ 2. Lesson B │  │  YouTube Video               │   │
│  → 3. Lesson C │  └─────────────────────────────┘   │
│    4. Lesson D │                                     │
│    5. Lesson E │  Description                       │
│                │                                     │
│  ━━━━━━━━━━━━  │  Key Takeaways                     │
│  2/5 complete  │                                     │
│                │  Workbook                           │
│                │  [fields...]                        │
│                │                                     │
│                │  Action Items                       │
│                │  [checklist...]                     │
│                │                                     │
│                │  AI Tool CTA                        │
│                │                                     │
│                │  [✓ Mark Complete]  [← Prev] [Next →]│
└────────────────┴─────────────────────────────────────┘
```

**B. Sidebar details:**
- Shows section title at top
- Lists all lessons in the section with completion state (checkmark vs empty circle)
- Current lesson highlighted (→ indicator or background highlight)
- Click any lesson to navigate directly
- Section progress bar at bottom
- **Mobile:** sidebar collapses into a dropdown/drawer triggered by a button above the lesson content. Not always visible — screen space is too precious.

**C. Single scroll (no tabs):**

Merge Overview and Workbook into one continuous scroll:

1. **Video** (YouTube embed)
2. **Description** (if exists)
3. **Key Takeaways** (markdown, if exists)
4. **Workbook** (dynamic fields — short text, long text, checklist, table — if any exist for this lesson)
5. **Action Items / Homework** (checklist, if exists)
6. **AI Tool CTA** (banner + button, if `aiToolLink` is set)
7. **Navigation bar** — Mark Complete button + Previous/Next lesson buttons

Each section only renders if it has content. No empty sections shown.

### 4. Browse / Search / Live Calls Pages

These move from tabs to standalone pages. The existing tab components (`BrowseTab`, `SearchTab`, `LiveCallsTab`) become their own page components with a back link to Academy:

- `/member/academy/browse` — Browse by Principle (combines current Browse + Moments + Saved as filters)
- `/member/academy/search` — Search all content
- `/member/academy/calls` — Live Q&A Calls (or keep the existing `/member/academy/calls/[callId]` pattern)

Each page has:
- Back arrow + "Back to Academy" link
- Page title
- The existing tab content (reused directly)

**Moments** become a source type filter in Browse ("Coaching Moments" alongside "Foundations Library" and "Q&A Calls").

**Saved** becomes a toggle/filter in Browse ("Show saved only").

### 5. What Gets Removed

- The 6-tab bar (`TABS` array and tab switching UI in `AcademyTabs`)
- The `AcademyTabs` component is replaced by the new Academy page layout
- The Overview/Workbook tab split on lesson pages
- Principle tag badges on the Foundations section lesson lists (still shown on lesson detail pages and in Browse)
- The separate "Moments" and "Saved" tabs (folded into Browse as filters)

### 6. What Stays Unchanged

- All API routes (no backend changes needed)
- Database schema (no migrations)
- All workbook field types and auto-save behaviour
- Homework checklist functionality
- Lesson completion tracking
- The `PromptEditor` and admin Academy Manager pages
- Individual call detail pages (`/member/academy/calls/[callId]`)
- The foundations section detail page structure (just cleaner lesson rows)

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/AcademyTabs.tsx` | Major rewrite — replace 6-tab layout with Continue Learning hero + section cards + resources row. Extract Browse/Search/LiveCalls tab bodies into reusable components. |
| `src/app/member/academy/page.tsx` | Update to use new layout component instead of `AcademyTabs` |
| `src/app/member/academy/foundations/[sectionSlug]/[lessonSlug]/LessonClient.tsx` | Add sidebar with section lesson list. Merge Overview + Workbook tabs into single scroll. |
| `src/app/member/academy/foundations/[sectionSlug]/[lessonSlug]/page.tsx` | Pass additional data (section lessons list) to `LessonClient` |
| `src/app/api/member/academy/lessons/[lessonId]/route.ts` | Extend response to include sibling lessons for sidebar (or fetch client-side) |
| `src/app/member/academy/browse/page.tsx` | New page wrapping existing `BrowseTab` + Moments filter + Saved toggle |
| `src/app/member/academy/search/page.tsx` | New page wrapping existing `SearchTab` |
| `src/app/member/academy/calls/page.tsx` | New page wrapping existing `LiveCallsTab` (if not already standalone) |
| `src/app/member/academy/foundations/[sectionSlug]/page.tsx` | Remove principle tags from lesson rows for cleaner look |

---

## Edge Cases

- **Brand new member (0 lessons complete):** Continue Learning hero shows "Start Your First Lesson" → links to Section 1, Lesson 1
- **All lessons complete:** Hero shows congratulations state with stats (22/22 lessons, course complete)
- **Section with 1 lesson:** Sidebar still shows, just with 1 item. No visual oddness.
- **No workbook fields on a lesson:** Workbook section simply doesn't render. Smooth scroll from Key Takeaways to Action Items.
- **No Live Calls exist:** "Live Q&A Calls" card hidden from Resources row
- **Mobile sidebar:** Collapses to a dropdown/drawer. Triggered by a "Section Lessons" button above the video. Doesn't eat screen space.

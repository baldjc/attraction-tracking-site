# Academy Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 6-tab Academy layout with a course-first design featuring a Continue Learning hero, section cards, lesson sidebar, and single-scroll lesson pages.

**Architecture:** Keep `AcademyTabs` intact for admin use. Create a new `AcademyHome` component for the member page. Extend the lesson API to return sibling lessons for the sidebar. Refactor `LessonClient` to add sidebar and merge Overview/Workbook tabs into a single scroll. Create standalone pages for Browse, Search, and Live Calls.

**Tech Stack:** Next.js 14 (App Router), React, Tailwind CSS, Prisma, Heroicons

**Spec:** `docs/superpowers/specs/2026-03-30-academy-redesign-design.md`

---

### Task 1: Extend Lesson API to Return Sibling Lessons

The lesson API already fetches all sections/lessons for prev/next navigation. Extend it to also return the sibling lessons (all lessons in the same section with their completion status) so the sidebar can render without an extra API call.

**Files:**
- Modify: `src/app/api/member/academy/lessons/[lessonId]/route.ts`

- [ ] **Step 1: Add sibling lessons to API response**

In `src/app/api/member/academy/lessons/[lessonId]/route.ts`, the existing code already fetches `allSections` with all lessons (lines 52-62). Add sibling lesson data to the response by finding the current section's lessons and their completion status.

After line 72 (`const nextLesson = ...`), add:

```typescript
  // Build sibling lessons for sidebar
  const currentSection = allSections.find((s) => s.id === lesson.sectionId);
  const siblingLessonIds = currentSection?.lessons.map((l) => l.id) ?? [];
  const siblingProgress = await prisma.memberLessonProgress.findMany({
    where: { userId: user.id, lessonId: { in: siblingLessonIds }, completed: true },
    select: { lessonId: true },
  });
  const siblingCompletedSet = new Set(siblingProgress.map((p) => p.lessonId));
  const sectionLessons = (currentSection?.lessons ?? []).map((l) => ({
    id: l.id,
    slug: l.slug,
    title: "", // will be filled below
    completed: siblingCompletedSet.has(l.id),
  }));
```

But we need lesson titles too — the current `allSections` query only selects `id, slug, sectionId`. Update the query at line 59 to also include `title`:

Change line 59 from:
```typescript
        select: { id: true, slug: true, sectionId: true },
```
to:
```typescript
        select: { id: true, slug: true, sectionId: true, title: true, sortOrder: true },
```

Then the sectionLessons map becomes:
```typescript
  const sectionLessons = (currentSection?.lessons ?? []).map((l) => ({
    id: l.id,
    slug: l.slug,
    title: l.title,
    completed: siblingCompletedSet.has(l.id),
  }));
```

Add `sectionLessons` to the JSON response object (inside the `lesson` object, after `nextLesson`):
```typescript
      sectionLessons,
```

- [ ] **Step 2: Verify the API still works**

Run: `curl` or test in browser — navigate to a lesson page and check the network tab. The response should now include a `sectionLessons` array with `id`, `slug`, `title`, and `completed` for each lesson in the same section.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/member/academy/lessons/[lessonId]/route.ts
git commit -m "Extend lesson API to return sibling lessons for sidebar"
```

---

### Task 2: Create AcademyHome Component (Continue Learning Hero + Section Cards)

Replace the member's Academy page with a new component that shows a Continue Learning hero, section cards grid, and a resources row.

**Files:**
- Create: `src/components/AcademyHome.tsx`
- Modify: `src/app/member/academy/page.tsx`

- [ ] **Step 1: Create `AcademyHome.tsx`**

Create `src/components/AcademyHome.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  PlayCircleIcon,
  MagnifyingGlassIcon,
  AcademicCapIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";

interface Section {
  id: string;
  title: string;
  slug: string;
  sortOrder: number;
  lessonCount: number;
  completedCount: number;
}

interface ContinueTarget {
  sectionSlug: string;
  sectionTitle: string;
  sectionSortOrder: number;
  lessonSlug: string;
  lessonTitle: string;
  sectionLessonCount: number;
  sectionCompletedCount: number;
}

export default function AcademyHome() {
  const [sections, setSections] = useState<Section[]>([]);
  const [continueTarget, setContinueTarget] = useState<ContinueTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveCallCount, setLiveCallCount] = useState(0);

  useEffect(() => {
    Promise.all([
      fetch("/api/member/academy/sections").then((r) => r.json()),
      fetch("/api/member/academy/live-calls").then((r) => r.json()).catch(() => ({ months: [] })),
    ]).then(async ([sectionData, liveCallData]) => {
      const secs: Section[] = sectionData.sections ?? [];
      setSections(secs);

      // Count live calls
      const months = liveCallData.months ?? [];
      const totalCalls = months.reduce((sum: number, m: { calls: unknown[] }) => sum + m.calls.length, 0);
      setLiveCallCount(totalCalls);

      // Find the continue target — first section with incomplete lessons
      const incompleteSection = secs.find((s) => s.completedCount < s.lessonCount);
      if (incompleteSection) {
        try {
          const lessonData = await fetch(`/api/member/academy/sections/${incompleteSection.slug}/lessons`).then((r) => r.json());
          const lessons = lessonData.lessons ?? [];
          const nextLesson = lessons.find((l: { completed: boolean }) => !l.completed) ?? lessons[0];
          if (nextLesson) {
            setContinueTarget({
              sectionSlug: incompleteSection.slug,
              sectionTitle: incompleteSection.title,
              sectionSortOrder: incompleteSection.sortOrder,
              lessonSlug: nextLesson.slug,
              lessonTitle: nextLesson.title,
              sectionLessonCount: incompleteSection.lessonCount,
              sectionCompletedCount: incompleteSection.completedCount,
            });
          }
        } catch { /* ignore */ }
      }

      setLoading(false);
    });
  }, []);

  const totalLessons = sections.reduce((s, sec) => s + sec.lessonCount, 0);
  const totalCompleted = sections.reduce((s, sec) => s + sec.completedCount, 0);
  const allComplete = totalLessons > 0 && totalCompleted === totalLessons;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-36 bg-white dark:bg-[#1a2433] rounded-xl border border-[#eaeaea] dark:border-white/10 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-white dark:bg-[#1a2433] rounded-xl border border-[#eaeaea] dark:border-white/10 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Continue Learning Hero */}
      {allComplete ? (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800/30 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircleIcon className="w-7 h-7 text-green-500" />
            <h2 className="text-lg font-bold text-[#2f3437] dark:text-white">Course Complete!</h2>
          </div>
          <p className="text-sm text-[#2f3437]/60 dark:text-white/60 mb-3">
            You&apos;ve completed all {totalLessons} lessons across {sections.length} sections. Keep using the AI tools to put everything into practice.
          </p>
          <div className="flex gap-3">
            <Link
              href="/member/ai-tools"
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
            >
              Go to AI Tools
              <ArrowRightIcon className="w-4 h-4" />
            </Link>
            <Link
              href="/member/academy/foundations"
              className="flex items-center gap-2 border border-green-300 dark:border-green-700 text-[#2f3437] dark:text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
            >
              Review Lessons
            </Link>
          </div>
        </div>
      ) : continueTarget ? (
        <Link
          href={`/member/academy/foundations/${continueTarget.sectionSlug}/${continueTarget.lessonSlug}`}
          className="block bg-gradient-to-r from-[#6ba3c7]/5 to-[#6ba3c7]/10 dark:from-[#6ba3c7]/10 dark:to-[#6ba3c7]/20 border border-[#6ba3c7]/25 rounded-xl p-6 hover:border-[#6ba3c7]/50 transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-[#6ba3c7] uppercase tracking-wider">
              {totalCompleted === 0 ? "Start Learning" : "Continue Learning"}
            </span>
            <span className="flex items-center gap-1.5 text-sm font-semibold text-[#6ba3c7] group-hover:translate-x-0.5 transition-transform">
              {totalCompleted === 0 ? "Begin" : "Continue"}
              <ArrowRightIcon className="w-4 h-4" />
            </span>
          </div>
          <p className="text-xs text-[#2f3437]/50 dark:text-white/50 mb-0.5">
            Section {continueTarget.sectionSortOrder}: {continueTarget.sectionTitle}
          </p>
          <p className="text-lg font-bold text-[#2f3437] dark:text-white mb-3">
            {continueTarget.lessonTitle}
          </p>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-[#eaeaea] dark:bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#6ba3c7] rounded-full transition-all"
                style={{ width: `${continueTarget.sectionLessonCount > 0 ? Math.round((continueTarget.sectionCompletedCount / continueTarget.sectionLessonCount) * 100) : 0}%` }}
              />
            </div>
            <span className="text-xs text-[#2f3437]/50 dark:text-white/50 shrink-0">
              {continueTarget.sectionCompletedCount}/{continueTarget.sectionLessonCount} lessons
            </span>
          </div>
        </Link>
      ) : null}

      {/* Section Cards */}
      <div>
        <h2 className="text-sm font-semibold text-[#2f3437]/50 dark:text-white/50 uppercase tracking-wider mb-4">
          Course Sections
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {sections.map((s) => {
            const pct = s.lessonCount > 0 ? Math.round((s.completedCount / s.lessonCount) * 100) : 0;
            const done = s.completedCount === s.lessonCount && s.lessonCount > 0;
            const started = s.completedCount > 0;
            return (
              <Link
                key={s.id}
                href={`/member/academy/foundations/${s.slug}`}
                className="bg-white dark:bg-[#1a2433] border border-[#eaeaea] dark:border-white/10 rounded-xl p-5 hover:border-[#6ba3c7]/40 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all group"
              >
                <div className="flex items-start gap-3 mb-3">
                  <span className="w-8 h-8 rounded-lg bg-[#6ba3c7]/10 text-[#6ba3c7] text-sm font-bold flex items-center justify-center shrink-0">
                    {s.sortOrder}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#2f3437] dark:text-white group-hover:text-[#6ba3c7] transition-colors leading-snug">
                      {s.title}
                    </p>
                    <p className="text-xs text-[#2f3437]/40 dark:text-white/40 mt-0.5">
                      {s.lessonCount} lesson{s.lessonCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                  {done && <CheckCircleIcon className="w-5 h-5 text-green-500 shrink-0" />}
                </div>
                <div className="h-1.5 bg-[#eaeaea] dark:bg-white/10 rounded-full overflow-hidden mb-2">
                  <div className="h-full bg-[#6ba3c7] rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#2f3437]/40 dark:text-white/40">
                    {s.completedCount}/{s.lessonCount} complete
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    done
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : started
                        ? "bg-[#6ba3c7]/10 text-[#6ba3c7]"
                        : "bg-[#f7f6f3] dark:bg-white/5 text-[#2f3437]/40 dark:text-white/40"
                  }`}>
                    {done ? "Complete" : started ? "In Progress" : "Not Started"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Resources Row */}
      <div>
        <h2 className="text-sm font-semibold text-[#2f3437]/50 dark:text-white/50 uppercase tracking-wider mb-4">
          Resources
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {liveCallCount > 0 && (
            <Link
              href="/member/academy?tab=live-calls"
              className="flex items-center gap-3 bg-white dark:bg-[#1a2433] border border-[#eaeaea] dark:border-white/10 rounded-xl p-4 hover:border-[#6ba3c7]/40 transition-all"
            >
              <VideoCameraIcon className="w-5 h-5 text-violet-500 shrink-0" />
              <div>
                <p className="text-sm font-medium text-[#2f3437] dark:text-white">Live Q&A Calls</p>
                <p className="text-xs text-[#2f3437]/40 dark:text-white/40">{liveCallCount} call{liveCallCount !== 1 ? "s" : ""}</p>
              </div>
            </Link>
          )}
          <Link
            href="/member/academy?tab=browse"
            className="flex items-center gap-3 bg-white dark:bg-[#1a2433] border border-[#eaeaea] dark:border-white/10 rounded-xl p-4 hover:border-[#6ba3c7]/40 transition-all"
          >
            <AcademicCapIcon className="w-5 h-5 text-[#6ba3c7] shrink-0" />
            <div>
              <p className="text-sm font-medium text-[#2f3437] dark:text-white">Browse by Principle</p>
              <p className="text-xs text-[#2f3437]/40 dark:text-white/40">17 principles</p>
            </div>
          </Link>
          <Link
            href="/member/academy?tab=search"
            className="flex items-center gap-3 bg-white dark:bg-[#1a2433] border border-[#eaeaea] dark:border-white/10 rounded-xl p-4 hover:border-[#6ba3c7]/40 transition-all"
          >
            <MagnifyingGlassIcon className="w-5 h-5 text-[#2f3437]/50 dark:text-white/50 shrink-0" />
            <div>
              <p className="text-sm font-medium text-[#2f3437] dark:text-white">Search All Content</p>
              <p className="text-xs text-[#2f3437]/40 dark:text-white/40">Lessons, calls & moments</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update the member Academy page**

Replace `src/app/member/academy/page.tsx` with:

```tsx
import AcademyHome from "@/components/AcademyHome";
import PageHeader from "@/components/PageHeader";

export default function AcademyPage() {
  return (
    <>
      <PageHeader
        emoji="🎓"
        title="Academy"
        description="Master the system that turns viewers into clients."
      />
      <AcademyHome />
    </>
  );
}
```

Note: `AcademyTabs` is still imported by the admin page (`src/app/admin/academy/page.tsx`) — do NOT delete the component. The admin page continues to use the tabbed view.

- [ ] **Step 3: Verify the new Academy landing page**

Open `/member/academy` in the browser. Confirm:
- Continue Learning hero appears and links to the correct next lesson
- Section cards show with progress bars and status badges
- Resources row shows Browse and Search (Live Calls only if count > 0)
- Admin page (`/admin/academy`) still works with the old tabbed layout

- [ ] **Step 4: Commit**

```bash
git add src/components/AcademyHome.tsx src/app/member/academy/page.tsx
git commit -m "Add AcademyHome component — course-first layout with hero + section cards"
```

---

### Task 3: Add Resources Tab Routing

The Resources row links use `?tab=live-calls`, `?tab=browse`, and `?tab=search`. We need these to still work by keeping `AcademyTabs` accessible via query params. Update the member Academy page to conditionally render `AcademyTabs` when a `tab` query param is present (for Browse, Search, Live Calls), and `AcademyHome` when no tab is set.

**Files:**
- Modify: `src/app/member/academy/page.tsx`

- [ ] **Step 1: Make the page client-side and route-aware**

Replace `src/app/member/academy/page.tsx` with:

```tsx
"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import AcademyHome from "@/components/AcademyHome";
import AcademyTabs from "@/components/AcademyTabs";
import PageHeader from "@/components/PageHeader";

function AcademyContent() {
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");

  // If a tab param is set, show the old tabbed view (for Browse, Search, Live Calls, etc.)
  if (tab) {
    return (
      <>
        <PageHeader
          emoji="🎓"
          title="Academy"
          description="Master the system that turns viewers into clients."
        />
        <AcademyTabs routePath="/member/academy" />
      </>
    );
  }

  // Default: show the new course-first layout
  return (
    <>
      <PageHeader
        emoji="🎓"
        title="Academy"
        description="Master the system that turns viewers into clients."
      />
      <AcademyHome />
    </>
  );
}

export default function AcademyPage() {
  return (
    <Suspense fallback={<div className="h-48 animate-pulse bg-[#f7f6f3] dark:bg-[#1a2433] rounded-xl" />}>
      <AcademyContent />
    </Suspense>
  );
}
```

- [ ] **Step 2: Add a "Back to Academy" link in the `AcademyTabs` tab bar area**

In `src/components/AcademyTabs.tsx`, inside the `AcademyTabsInner` function (around line 815), add a back link above the tab bar so users on Browse/Search/Live Calls can get back to the main Academy:

Before the `<div className="flex gap-1 bg-[#111]/5 ...">` tab bar (line 825), add:

```tsx
      {routePath === "/member/academy" && (
        <Link
          href="/member/academy"
          className="flex items-center gap-1.5 text-xs text-[#2f3437]/50 dark:text-white/50 hover:text-[#6ba3c7] transition-colors mb-3"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          Back to Academy
        </Link>
      )}
```

Add the import for `ArrowLeftIcon` — it's already imported from `@heroicons/react/24/outline` (check the existing imports; if not present, add it). Also add `Link` import from `next/link` if not already present.

- [ ] **Step 3: Verify routing**

Test:
- `/member/academy` → shows AcademyHome (hero + section cards)
- `/member/academy?tab=browse` → shows AcademyTabs with Browse tab active + "Back to Academy" link
- `/member/academy?tab=search` → shows AcademyTabs with Search tab active
- `/member/academy?tab=live-calls` → shows AcademyTabs with Live Calls tab active
- Clicking "Back to Academy" returns to the course-first layout
- `/admin/academy` → still shows the old tabbed layout with no "Back to Academy" link

- [ ] **Step 4: Commit**

```bash
git add src/app/member/academy/page.tsx src/components/AcademyTabs.tsx
git commit -m "Route member Academy: course-first by default, tabs via query param for resources"
```

---

### Task 4: Add Lesson Sidebar + Merge Overview/Workbook into Single Scroll

Refactor `LessonClient` to show a sidebar with section lessons and merge the Overview/Workbook tabs into a single scrollable page.

**Files:**
- Modify: `src/app/member/academy/foundations/[sectionSlug]/[lessonSlug]/LessonClient.tsx`

- [ ] **Step 1: Update the LessonData interface**

In `LessonClient.tsx`, add `sectionLessons` to the `LessonData` interface (around line 26):

After `nextLesson` (line 43), add:
```typescript
  sectionLessons: { id: string; slug: string; title: string; completed: boolean }[];
```

- [ ] **Step 2: Remove the tab state and replace with single scroll**

Remove the `tab` state variable:
```typescript
// DELETE this line:
const [tab, setTab] = useState<"overview" | "workbook">("overview");
```

- [ ] **Step 3: Create the LessonSidebar component**

Add this component above the main `LessonClient` export (or at the top of the file after the existing helper components):

```tsx
function LessonSidebar({
  sectionTitle,
  sectionSlug,
  sectionSortOrder,
  lessons,
  currentLessonId,
}: {
  sectionTitle: string;
  sectionSlug: string;
  sectionSortOrder: number;
  lessons: { id: string; slug: string; title: string; completed: boolean }[];
  currentLessonId: string;
}) {
  const completedCount = lessons.filter((l) => l.completed).length;
  return (
    <nav className="space-y-1">
      <div className="mb-3">
        <Link
          href={`/member/academy/foundations/${sectionSlug}`}
          className="text-xs font-semibold text-[#2f3437]/40 dark:text-white/40 uppercase tracking-wider hover:text-[#6ba3c7] transition-colors"
        >
          Section {sectionSortOrder}
        </Link>
        <p className="text-sm font-bold text-[#2f3437] dark:text-white mt-0.5 leading-snug">{sectionTitle}</p>
      </div>
      {lessons.map((l, i) => {
        const isCurrent = l.id === currentLessonId;
        return (
          <Link
            key={l.id}
            href={`/member/academy/foundations/${sectionSlug}/${l.slug}`}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              isCurrent
                ? "bg-[#6ba3c7]/10 text-[#6ba3c7] font-medium"
                : "text-[#2f3437]/70 dark:text-white/60 hover:bg-[#f7f6f3] dark:hover:bg-white/5"
            }`}
          >
            <div className="shrink-0">
              {l.completed ? (
                <CheckCircleIcon className="w-4 h-4 text-green-500" />
              ) : isCurrent ? (
                <PlayCircleIcon className="w-4 h-4 text-[#6ba3c7]" />
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-[#d0d0d0] dark:border-white/20" />
              )}
            </div>
            <span className="truncate">
              <span className="text-[#2f3437]/30 dark:text-white/30 mr-1">{i + 1}.</span>
              {l.title}
            </span>
          </Link>
        );
      })}
      <div className="pt-3 mt-2 border-t border-[#eaeaea] dark:border-white/10">
        <div className="flex items-center justify-between text-xs text-[#2f3437]/40 dark:text-white/40 mb-1">
          <span>Progress</span>
          <span>{completedCount}/{lessons.length}</span>
        </div>
        <div className="h-1.5 bg-[#eaeaea] dark:bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#6ba3c7] rounded-full transition-all"
            style={{ width: `${lessons.length > 0 ? Math.round((completedCount / lessons.length) * 100) : 0}%` }}
          />
        </div>
      </div>
    </nav>
  );
}
```

You'll need to add `PlayCircleIcon` to the imports from `@heroicons/react/24/solid` (or `outline` — check which is already imported and use the same set).

- [ ] **Step 4: Refactor the main layout to sidebar + content**

Replace the outer `<div className="max-w-3xl">` wrapper (line 370) and the entire return block structure with a two-column layout. The new structure:

```tsx
  return (
    <div className="flex gap-8 max-w-5xl">
      {/* Sidebar — hidden on mobile, shown on lg+ */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-6 self-start">
        <LessonSidebar
          sectionTitle={lesson.section.title}
          sectionSlug={sectionSlug}
          sectionSortOrder={lesson.section.sortOrder}
          lessons={lesson.sectionLessons ?? []}
          currentLessonId={lesson.id}
        />
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Mobile section nav dropdown */}
        <details className="lg:hidden mb-4 bg-white dark:bg-[#1a2433] border border-[#eaeaea] dark:border-white/10 rounded-lg">
          <summary className="px-4 py-3 text-sm font-medium text-[#2f3437] dark:text-white cursor-pointer flex items-center justify-between">
            <span>Section {lesson.section.sortOrder}: {lesson.section.title}</span>
            <ChevronDownIcon className="w-4 h-4 text-[#2f3437]/40 dark:text-white/40" />
          </summary>
          <div className="px-2 pb-2">
            <LessonSidebar
              sectionTitle={lesson.section.title}
              sectionSlug={sectionSlug}
              sectionSortOrder={lesson.section.sortOrder}
              lessons={lesson.sectionLessons ?? []}
              currentLessonId={lesson.id}
            />
          </div>
        </details>

        {/* Breadcrumb */}
        {/* ... keep existing breadcrumb code ... */}

        {/* Title + tags */}
        {/* ... keep existing title + tags code ... */}

        {/* YouTube embed */}
        {/* ... keep existing embed code ... */}

        {/* Single scroll content — replaces the tab system */}
        <div className="space-y-6">
          {lesson.description && (
            <div className="bg-white dark:bg-[#1a2433] rounded-lg border border-[#eaeaea] dark:border-white/10 p-6">
              <p className="text-sm text-[#2f3437] dark:text-white leading-relaxed">{lesson.description}</p>
            </div>
          )}

          {lesson.keyTakeaways && (
            <div className="bg-white dark:bg-[#1a2433] rounded-lg border border-[#eaeaea] dark:border-white/10 p-6">
              <h3 className="text-sm font-bold text-[#2f3437] dark:text-white uppercase tracking-wider mb-3">
                Key Takeaways
              </h3>
              <div className="prose prose-sm max-w-none text-[#2f3437] dark:text-white [&_ul]:space-y-2 [&_li]:leading-relaxed [&_p]:leading-relaxed">
                <ReactMarkdown>{lesson.keyTakeaways}</ReactMarkdown>
              </div>
            </div>
          )}

          {/* Workbook — inline, no tab needed */}
          {lesson.workbookFields.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-[#2f3437] dark:text-white uppercase tracking-wider">
                  Workbook
                </h3>
                <span className={`text-xs font-medium ${
                  saveStatus === "saving" ? "text-[#2f3437]/40 dark:text-white/40" :
                  saveStatus === "saved" ? "text-green-600 dark:text-green-400" :
                  saveStatus === "error" ? "text-[#e63946]" :
                  "text-[#2f3437]/20 dark:text-white/20"
                }`}>
                  {saveStatus === "saving" && "Saving…"}
                  {saveStatus === "saved" && "✓ All changes saved"}
                  {saveStatus === "error" && "⚠ Save failed"}
                  {saveStatus === "idle" && "Auto-saves as you type"}
                </span>
              </div>
              <div className="space-y-5">
                {lesson.workbookFields.map((field) => (
                  <div key={field.id} className="bg-white dark:bg-[#1a2433] rounded-lg border border-[#eaeaea] dark:border-white/10 p-5">
                    {field.fieldType === "short_text" && <ShortTextField field={field} onSave={saveWorkbookField} />}
                    {field.fieldType === "long_text" && <LongTextField field={field} onSave={saveWorkbookField} />}
                    {field.fieldType === "checklist" && <ChecklistField field={field} onSave={saveWorkbookField} />}
                    {field.fieldType === "table" && <TableField field={field} onSave={saveWorkbookField} />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {lesson.actionItems && (
            <div className="bg-white dark:bg-[#1a2433] rounded-lg border border-[#eaeaea] dark:border-white/10 p-6">
              <h3 className="text-sm font-bold text-[#2f3437] dark:text-white uppercase tracking-wider mb-3">
                Action Items
              </h3>
              <div className="prose prose-sm max-w-none text-[#2f3437] dark:text-white [&_ul]:space-y-2 [&_li]:leading-relaxed">
                <ReactMarkdown>{lesson.actionItems}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>

        {/* Homework section — keep existing code */}
        {/* ... */}

        {/* AI Tool CTA — keep existing code */}
        {/* ... */}

        {/* Mark as Complete + Navigation — keep existing code */}
        {/* ... */}
      </div>
    </div>
  );
```

You'll need to add `ChevronDownIcon` to the imports from `@heroicons/react/24/outline`.

- [ ] **Step 5: Remove the old tab UI code**

Delete the tab bar and the `{tab === "overview" && ...}` / `{tab === "workbook" && ...}` conditional blocks. The content is now in the single scroll above.

Delete the `tab` state variable (`const [tab, setTab] = useState...`).

- [ ] **Step 6: Verify the lesson page**

Navigate to any lesson. Confirm:
- Sidebar appears on desktop (lg+) showing all section lessons with completion state
- Current lesson is highlighted in the sidebar
- On mobile, a collapsible `<details>` dropdown shows the section lessons
- Content flows: Video → Description → Key Takeaways → Workbook → Action Items → Homework → AI Tool CTA → Navigation
- No Overview/Workbook tabs visible
- Workbook auto-save still works
- Mark Complete still works
- Prev/Next navigation still works

- [ ] **Step 7: Commit**

```bash
git add src/app/member/academy/foundations/[sectionSlug]/[lessonSlug]/LessonClient.tsx
git commit -m "Add lesson sidebar + merge Overview/Workbook into single scroll"
```

---

### Task 5: Clean Up Section Detail Page

Remove principle tags from the section lesson list for a cleaner look. Keep the Video/Workbook type indicator.

**Files:**
- Modify: `src/app/member/academy/foundations/[sectionSlug]/page.tsx`

- [ ] **Step 1: Remove principle tag badges from lesson rows**

In `src/app/member/academy/foundations/[sectionSlug]/page.tsx`, find the section that renders principle tags (lines 134-147):

```tsx
                  {(lesson.principleTags as string[]).slice(0, 3).map((tag) => (
                    ...
                  ))}
                  {(lesson.principleTags as string[]).length > 3 && (
                    ...
                  )}
```

Delete these lines entirely. Keep the Video/Workbook type indicator (`lesson.youtubeUrl ? ... Video : ... Workbook`).

Also remove the unused imports: `PRINCIPLE_NAMES` and `PRINCIPLE_COLORS` from `@/lib/academy-constants`.

- [ ] **Step 2: Verify section page**

Navigate to a section page (e.g., `/member/academy/foundations/positioning-your-channel`). Confirm:
- Lesson rows show number, title, description, and type (Video/Workbook)
- No principle tag badges visible
- Clicking a lesson still navigates correctly

- [ ] **Step 3: Commit**

```bash
git add src/app/member/academy/foundations/[sectionSlug]/page.tsx
git commit -m "Clean up section page — remove principle tags from lesson rows"
```

---

### Task 6: Final Verification + Push

**Files:** None — this is a verification and push task.

- [ ] **Step 1: Full navigation flow test**

Test the complete flow:
1. `/member/academy` → AcademyHome with hero + section cards + resources
2. Click "Continue Learning" → goes to correct lesson with sidebar
3. Sidebar shows section lessons, current lesson highlighted
4. Scroll through lesson: Video → Description → Key Takeaways → Workbook → Action Items → CTA → Navigation
5. Click "Mark Complete" → checkmark updates in sidebar
6. Click "Next Lesson" → sidebar updates, new lesson loads
7. Back to `/member/academy` → progress updated on section cards
8. Click "Browse by Principle" → loads `?tab=browse` with "Back to Academy" link
9. Click "Back to Academy" → returns to course-first layout
10. `/admin/academy` → still shows old tabbed layout, no regressions

- [ ] **Step 2: Push to git**

```bash
git push
```

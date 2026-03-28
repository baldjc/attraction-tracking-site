# Hire a Human Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a member-facing "Hire a Human" page where Foundations members browse and purchase editing, coaching, and implementation services via Stripe payment links.

**Architecture:** Pure frontend page — no database, no API routes. All package data is hardcoded in the component. Stripe links open in new tabs. Follows existing platform UI patterns (page header, card grids, dark mode support).

**Tech Stack:** Next.js (App Router), TypeScript, Tailwind CSS, Heroicons

**Spec:** `docs/superpowers/specs/2026-03-27-hire-a-human-design.md`

---

### Task 1: Add Sidebar Link

**Files:**
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: Add UserGroupIcon import**

In `src/components/Sidebar.tsx`, add `UserGroupIcon` to the existing Heroicons import block (line 7-31). It's already importing from `@heroicons/react/24/outline`.

Add `UserGroupIcon` to the destructured imports:

```typescript
import {
  HomeIcon,
  UsersIcon,
  ClipboardDocumentListIcon,
  ChatBubbleLeftRightIcon,
  LinkIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  StarIcon,
  BookOpenIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  PencilSquareIcon,
  SparklesIcon,
  ArrowLeftIcon,
  EyeIcon,
  ChevronDownIcon,
  UserCircleIcon,
  SunIcon,
  MoonIcon,
  AcademicCapIcon,
  VideoCameraIcon,
  WrenchScrewdriverIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
```

- [ ] **Step 2: Add "Hire a Human" to memberLinks**

In the `memberLinks` array (around line 72-80), add the new link before Settings:

```typescript
const memberLinks = [
  { href: "/member/dashboard", label: "Dashboard", icon: HomeIcon, featureKey: null },
  { href: "/member/scores", label: "My Scores", icon: StarIcon, featureKey: null },
  { href: "/member/academy", label: "Academy", icon: AcademicCapIcon, featureKey: null },
  { href: "/member/ai-tools", label: "AI Tools", icon: SparklesIcon, featureKey: "ai_tools" },
  { href: "/member/campaigns", label: "Campaigns", icon: LinkIcon, featureKey: "campaigns" },
  { href: "/member/analytics", label: "Lead Analytics", icon: ChartBarIcon, featureKey: "campaigns" },
  { href: "/member/link-tracking", label: "Link Tracking Settings", icon: LinkIcon, featureKey: "campaigns" },
  { href: "/member/hire", label: "Hire a Human", icon: UserGroupIcon, featureKey: null },
  { href: "/member/settings", label: "Settings", icon: Cog6ToothIcon, featureKey: null },
];
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat: add Hire a Human sidebar link"
```

---

### Task 2: Create the Hire a Human Page

**Files:**
- Create: `src/app/member/hire/page.tsx`

- [ ] **Step 1: Create the page directory**

```bash
mkdir -p src/app/member/hire
```

- [ ] **Step 2: Create the page component**

Create `src/app/member/hire/page.tsx` with the full page content:

```tsx
import {
  FilmIcon,
  RocketLaunchIcon,
  PuzzlePieceIcon,
  CheckCircleIcon,
  ArrowTopRightOnSquareIcon,
  ChatBubbleLeftRightIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";

// ── Package Data ──────────────────────────────────────────────

interface EditingPackage {
  name: string;
  price: string;
  videos: string;
  hasJared: boolean;
  stripeUrl: string;
  features: string[];
  jaredFeatures?: string[];
}

const EDITING_PACKAGES: EditingPackage[] = [
  {
    name: "2 Video Package",
    price: "$500/mo",
    videos: "2 long-form videos/mo",
    hasJared: false,
    stripeUrl: "https://buy.stripe.com/9B67sLcWv9ojf4RcLp0Ny0k",
    features: [
      "Professional editing by ABV team",
      "Music and asset licensing",
      "Graphics, titles, and b-roll",
      "Upload to Frame.io for review",
      "2-3 revisions per video",
      "Onboarding call to customise to your brand",
    ],
  },
  {
    name: "2 Video + Jared",
    price: "$800/mo",
    videos: "2 long-form videos/mo",
    hasJared: true,
    stripeUrl: "https://buy.stripe.com/bJeeVd4pZdEzcWJbHl0Ny0l",
    features: [
      "Professional editing by ABV team",
      "Music and asset licensing",
      "Graphics, titles, and b-roll",
      "Upload to Frame.io for review",
      "2-3 revisions per video",
      "Onboarding call to customise to your brand",
    ],
    jaredFeatures: [
      "Comprehensive review of shooting, setup, and delivery",
      "Editing suggestions delivered in Frame.io",
      "Ideas for future content improvements",
      "15-minute coaching call",
    ],
  },
  {
    name: "4 Video Package",
    price: "$1,000/mo",
    videos: "4 long-form videos/mo",
    hasJared: false,
    stripeUrl: "https://buy.stripe.com/14AaEXe0zfMHaOB26L0Ny0m",
    features: [
      "Professional editing by ABV team",
      "Music and asset licensing",
      "Graphics, titles, and b-roll",
      "Upload to Frame.io for review",
      "2-3 revisions per video",
      "Onboarding call to customise to your brand",
    ],
  },
  {
    name: "4 Video + Jared",
    price: "$1,600/mo",
    videos: "4 long-form videos/mo",
    hasJared: true,
    stripeUrl: "https://buy.stripe.com/28EfZh8Gf2ZVf4ReTx0Ny0n",
    features: [
      "Professional editing by ABV team",
      "Music and asset licensing",
      "Graphics, titles, and b-roll",
      "Upload to Frame.io for review",
      "2-3 revisions per video",
      "Onboarding call to customise to your brand",
    ],
    jaredFeatures: [
      "Comprehensive review of shooting, setup, and delivery",
      "Editing suggestions delivered in Frame.io",
      "Ideas for future content improvements",
      "15-minute coaching call",
    ],
  },
];

interface MasteryPackage {
  name: string;
  price: string;
  videos: string;
  funnels: string;
  badge?: string;
  stripeUrl: string;
  features: string[];
}

const MASTERY_PACKAGES: MasteryPackage[] = [
  {
    name: "Mastery 2",
    price: "$1,995/mo",
    videos: "2 long-form video edits/mo",
    funnels: "1 full funnel built at launch",
    stripeUrl: "https://buy.stripe.com/aFa8wP7Cb9ojf4R5iX0Ny0q",
    features: [
      "Foundational Membership Benefits included",
      "1 new funnel every 90 days",
      "Custom thumbnails per video",
      "GoHighLevel account (lead capture, follow-up, pipeline)",
      "Title & thumbnail review via Slack (1-1 with Jared)",
      "Priority Slack responses",
      "Every video scored & reviewed",
      "Strategy call with Jared (30 min) — 1/month",
    ],
  },
  {
    name: "Mastery 4",
    price: "$2,995/mo",
    videos: "4 long-form video edits/mo",
    funnels: "2 full funnels built at launch",
    badge: "Most Comprehensive",
    stripeUrl: "https://buy.stripe.com/fZu7sLg8HcAvg8VbHl0Ny0r",
    features: [
      "Foundational Membership Benefits included",
      "1 new funnel every 90 days",
      "Custom thumbnails per video",
      "GoHighLevel account (lead capture, follow-up, pipeline)",
      "Title & thumbnail review via Slack (1-1 with Jared)",
      "Priority Slack responses",
      "Every video scored & reviewed",
      "Strategy call with Jared (30 min) — 1/month",
    ],
  },
];

interface AddOn {
  name: string;
  price: string;
  note?: string;
  description: string;
}

const ADD_ONS: AddOn[] = [
  {
    name: "Custom Thumbnails",
    price: "$100 – $150",
    note: "$100 with an Editing or Mastery package, $150 standalone",
    description: "Professional, click-worthy thumbnails designed for your brand and audience.",
  },
  {
    name: "Lead Magnet Creation",
    price: "~$1,000 USD",
    description: "Buyer guides, relocation guides, market reports, or any PDF built for your market. Includes writing, design, and delivery setup.",
  },
  {
    name: "Rush Funnel",
    price: "$950",
    note: "Available to Mastery members only",
    description: "Need a funnel faster than the 90-day cadence? We'll build it on a priority timeline.",
  },
];

// ── Components ────────────────────────────────────────────────

function EditingCard({ pkg }: { pkg: EditingPackage }) {
  return (
    <div className="bg-white dark:bg-[#1a2433] rounded-xl border border-[#eaeaea] dark:border-white/10 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold text-[#2f3437] dark:text-white">{pkg.name}</h3>
          {pkg.hasJared && (
            <span className="text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              + Jared&apos;s Feedback
            </span>
          )}
        </div>
        <p className="text-sm text-[#2f3437]/50 dark:text-white/40">{pkg.videos}</p>
        <p className="text-3xl font-extrabold text-[#2f3437] dark:text-white mt-3">
          {pkg.price}
          <span className="text-sm font-normal text-[#2f3437]/40 dark:text-white/30 ml-1">USD</span>
        </p>
      </div>

      {/* Features */}
      <div className="px-6 pb-4 flex-1">
        <ul className="space-y-2">
          {pkg.features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm text-[#2f3437]/70 dark:text-white/60">
              <CheckCircleIcon className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
              <span>{f}</span>
            </li>
          ))}
        </ul>

        {pkg.jaredFeatures && (
          <div className="mt-4 pt-4 border-t border-[#eaeaea] dark:border-white/10">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-2">
              Jared&apos;s Feedback Includes
            </p>
            <ul className="space-y-2">
              {pkg.jaredFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-[#2f3437]/70 dark:text-white/60">
                  <CheckCircleIcon className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="px-6 pb-6">
        <a
          href={pkg.stripeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full bg-[#6ba3c7] hover:bg-[#5490b5] text-white font-bold text-sm py-3 rounded-lg transition-colors"
        >
          Get Started
          <ArrowTopRightOnSquareIcon className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}

function MasteryCard({ pkg }: { pkg: MasteryPackage }) {
  return (
    <div className="bg-white dark:bg-[#1a2433] rounded-xl border-2 border-amber-200 dark:border-amber-700/40 overflow-hidden flex flex-col relative">
      {/* Badge */}
      {pkg.badge && (
        <div className="absolute top-4 right-4">
          <span className="text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            {pkg.badge}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <h3 className="text-lg font-bold text-[#2f3437] dark:text-white">{pkg.name}</h3>
        <p className="text-sm text-[#2f3437]/50 dark:text-white/40 mt-0.5">{pkg.videos}</p>
        <p className="text-3xl font-extrabold text-[#2f3437] dark:text-white mt-3">
          {pkg.price}
          <span className="text-sm font-normal text-[#2f3437]/40 dark:text-white/30 ml-1">USD</span>
        </p>
      </div>

      {/* Includes note */}
      <div className="mx-6 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30 mb-4">
        <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
          Includes everything in Editing, plus:
        </p>
      </div>

      {/* Key highlights */}
      <div className="px-6 pb-4 flex-1">
        <div className="flex items-start gap-2 text-sm font-medium text-[#2f3437] dark:text-white mb-2">
          <CheckCircleIcon className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <span>{pkg.videos}</span>
        </div>
        <div className="flex items-start gap-2 text-sm font-medium text-[#2f3437] dark:text-white mb-4">
          <CheckCircleIcon className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <span>{pkg.funnels}</span>
        </div>

        <ul className="space-y-2">
          {pkg.features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm text-[#2f3437]/70 dark:text-white/60">
              <CheckCircleIcon className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* CTA */}
      <div className="px-6 pb-6">
        <a
          href={pkg.stripeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm py-3 rounded-lg transition-colors"
        >
          Get Started
          <ArrowTopRightOnSquareIcon className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}

function AddOnCard({ addon }: { addon: AddOn }) {
  return (
    <div className="bg-white dark:bg-[#1a2433] rounded-xl border border-[#eaeaea] dark:border-white/10 p-5 flex flex-col">
      <h3 className="text-sm font-bold text-[#2f3437] dark:text-white mb-1">{addon.name}</h3>
      <p className="text-xl font-extrabold text-[#2f3437] dark:text-white mb-1">{addon.price}</p>
      {addon.note && (
        <p className="text-[11px] text-[#2f3437]/40 dark:text-white/30 mb-2">{addon.note}</p>
      )}
      <p className="text-xs text-[#2f3437]/60 dark:text-white/50 leading-relaxed flex-1">{addon.description}</p>
      <div className="mt-4">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6ba3c7]">
          <ChatBubbleLeftRightIcon className="w-3.5 h-3.5" />
          Message us to get started
        </span>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function HireAHumanPage() {
  return (
    <div className="space-y-12 max-w-7xl pb-12">
      {/* Hero */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 bg-[#6ba3c7]/10 rounded-lg">
            <UserGroupIcon className="w-6 h-6 text-[#6ba3c7]" />
          </div>
          <h1 className="text-2xl font-bold text-[#2f3437] dark:text-white">Hire a Human</h1>
        </div>
        <p className="text-sm text-[#2f3437]/50 dark:text-white/40 mt-2 max-w-2xl">
          You film, we handle the rest. Add editing, coaching, or full implementation support based on how fast you want to grow.
        </p>
      </div>

      {/* ── Editing Section ── */}
      <section>
        <div className="flex items-center gap-3 mb-2">
          <FilmIcon className="w-5 h-5 text-[#6ba3c7]" />
          <h2 className="text-xl font-bold text-[#2f3437] dark:text-white">Attraction Editing</h2>
        </div>
        <p className="text-sm text-[#2f3437]/50 dark:text-white/40 mb-6 max-w-2xl">
          Stop spending 4-6 hours editing every video. Hand us the raw footage and get back a polished, publish-ready video.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {EDITING_PACKAGES.map((pkg) => (
            <EditingCard key={pkg.name} pkg={pkg} />
          ))}
        </div>
      </section>

      {/* ── Mastery Section ── */}
      <section>
        <div className="flex items-center gap-3 mb-2">
          <RocketLaunchIcon className="w-5 h-5 text-amber-500" />
          <h2 className="text-xl font-bold text-[#2f3437] dark:text-white">Attraction Mastery</h2>
        </div>
        <p className="text-sm text-[#2f3437]/50 dark:text-white/40 mb-6 max-w-2xl">
          The full system built with you. Everything in Editing plus strategy, funnels, coaching, and implementation — all under one monthly investment.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {MASTERY_PACKAGES.map((pkg) => (
            <MasteryCard key={pkg.name} pkg={pkg} />
          ))}
        </div>
      </section>

      {/* ── Add-Ons Section ── */}
      <section>
        <div className="flex items-center gap-3 mb-2">
          <PuzzlePieceIcon className="w-5 h-5 text-[#2f3437]/40 dark:text-white/40" />
          <h2 className="text-lg font-bold text-[#2f3437] dark:text-white">Add-Ons</h2>
        </div>
        <p className="text-sm text-[#2f3437]/50 dark:text-white/40 mb-5">
          Available extras to complement your package.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {ADD_ONS.map((a) => (
            <AddOnCard key={a.name} addon={a} />
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/member/hire/page.tsx
git commit -m "feat: add Hire a Human page with editing, mastery, and add-on cards"
```

---

### Task 3: Verify and Push

- [ ] **Step 1: Verify the build compiles**

```bash
npx next build 2>&1 | tail -20
```

Expected: Build succeeds with no errors in the new files.

If TypeScript errors appear in unrelated files (like `prisma/seed.ts` or `.next/types/validator.ts`), those are pre-existing and can be ignored. Only fix errors in `src/app/member/hire/page.tsx` or `src/components/Sidebar.tsx`.

- [ ] **Step 2: Push to GitHub**

```bash
git push origin main
```

- [ ] **Step 3: Sync to Replit**

In the Replit shell:

```bash
git pull origin main --rebase
```

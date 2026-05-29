"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  PlayCircleIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";
import OnboardingBanner from "@/components/onboarding/OnboardingBanner";
import { Button, LinkButton } from "@/components/ui/Button";

// ── Helpers ───────────────────────────────────────────────────

function fmtThursday(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  const datePart = d.toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" });
  const label = `${datePart} at 1:30 PM MST`;
  const today = new Date();
  const diff = Math.ceil((d.getTime() - today.getTime()) / 86400000);
  const relative = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : `in ${diff} days`;
  return { label, relative };
}

function fmtViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function fmtUploadDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

// ── Payment Banner ────────────────────────────────────────────

function PaymentBanner() {
  const [pastDue, setPastDue] = useState(false);
  const [retryUrl, setRetryUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/member/payment-retry-url")
      .then((r) => r.json())
      .then((d) => {
        if (d.pastDue) {
          setPastDue(true);
          setRetryUrl(d.url ?? null);
        }
      })
      .catch(() => {});
  }, []);

  if (!pastDue) return null;

  return (
    <div className="rounded-xl bg-[var(--abv-bg-warm)] border border-[var(--abv-border-strong)] px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between mb-6">
      <div>
        <p className="font-semibold text-[var(--abv-text)] text-sm">Your subscription payment is past due.</p>
        <p className="text-[var(--abv-text-secondary)] text-sm mt-0.5">Update your payment details to keep your access.</p>
      </div>
      <LinkButton
        href={retryUrl ?? "mailto:support@attractionbyvideo.com"}
        target={retryUrl ? "_blank" : undefined}
        className="shrink-0"
      >
        {retryUrl ? "Update payment" : "Contact support"}
      </LinkButton>
    </div>
  );
}

// ── Weekly Focus Card ─────────────────────────────────────────

interface WeeklyFocusData {
  weekStart: string;
  weekEnd: string;
  shoots: Array<{ id: string; title: string }>;
  edits: Array<{ id: string; title: string }>;
  leads: { total: number; sources: Array<{ name: string; count: number }> };
}

const WEEKLY_FOCUS_DISMISS_KEY = "abv:weeklyFocusDismissedWeek";

function WeeklyFocusCard() {
  const [data, setData] = useState<WeeklyFocusData | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch("/api/member/dashboard/weekly-focus")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: WeeklyFocusData | null) => {
        if (!d || !d.weekStart) return;
        // Per-ISO-week dismiss: hidden only while the stored week matches the
        // current one. Naturally expires next Monday when weekStart changes.
        try {
          const raw = localStorage.getItem(WEEKLY_FOCUS_DISMISS_KEY);
          if (raw && raw === d.weekStart) setDismissed(true);
        } catch {}
        setData(d);
      })
      .catch(() => {});
  }, []);

  function dismiss() {
    if (data) {
      try { localStorage.setItem(WEEKLY_FOCUS_DISMISS_KEY, data.weekStart); } catch {}
    }
    setDismissed(true);
  }

  if (!data || dismissed) return null;

  const shootCount = data.shoots.length;
  const editCount = data.edits.length;
  const leadCount = data.leads.total;
  const allEmpty = shootCount === 0 && editCount === 0 && leadCount === 0;

  const eyebrow = (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 text-[var(--abv-azure)] text-[11px] font-bold uppercase tracking-[0.12em]">
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--abv-azure)]" />
      This week&apos;s focus
    </span>
  );

  if (allEmpty) {
    return (
      <div className="rounded-2xl bg-[var(--abv-dark)] text-white p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          {eyebrow}
          <button onClick={dismiss} className="text-white/40 hover:text-white text-xs font-semibold uppercase tracking-wide">
            Dismiss
          </button>
        </div>
        <h2 className="font-display text-2xl sm:text-3xl text-white mt-3 mb-2">You&apos;re caught up.</h2>
        <p className="text-white/70 text-sm sm:text-base mb-4">Nothing booked to shoot, edit, or track this week.</p>
        <LinkButton href="/member/content-planner/wizard" className="!bg-white !text-[var(--abv-dark)] hover:!bg-[var(--abv-bg)]">
          Start something new →
        </LinkButton>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-[var(--abv-dark)] text-white p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4 mb-1">
        {eyebrow}
        <button onClick={dismiss} className="text-white/40 hover:text-white text-xs font-semibold uppercase tracking-wide shrink-0">
          Dismiss
        </button>
      </div>
      <h2 className="font-display text-2xl sm:text-3xl text-white mb-5">Where to spend your hour today.</h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Shoot */}
        <WeeklyBlock
          emoji="🎬"
          title="Shoot this week"
          count={shootCount}
          headerHref="/member/content-planner?status=Ready+to+Shoot"
          empty={shootCount === 0}
          emptyText="Nothing scheduled to shoot."
          emptyCta={{ label: "Plan a video →", href: "/member/content-planner/wizard" }}
        >
          {data.shoots.slice(0, 3).map((p) => (
            <Link key={p.id} href={`/member/content-planner/${p.id}`} className="block text-sm text-white/80 hover:text-[var(--abv-azure)] truncate">
              {p.title}
            </Link>
          ))}
        </WeeklyBlock>

        {/* Edit */}
        <WeeklyBlock
          emoji="✂️"
          title="Edit this week"
          count={editCount}
          headerHref="/member/content-planner?status=Editing"
          empty={editCount === 0}
          emptyText="Nothing in post this week."
          emptyCta={{ label: "See your pipeline →", href: "/member/content-planner" }}
        >
          {data.edits.slice(0, 3).map((p) => (
            <Link key={p.id} href={`/member/content-planner/${p.id}`} className="block text-sm text-white/80 hover:text-[var(--abv-azure)] truncate">
              {p.title}
            </Link>
          ))}
        </WeeklyBlock>

        {/* Leads */}
        <WeeklyBlock
          emoji="📈"
          title="Leads this week"
          count={leadCount}
          headerHref="/member/analytics"
          empty={leadCount === 0}
          emptyText="No leads tracked this week."
          emptyCta={{ label: "Check your campaigns →", href: "/member/campaigns" }}
        >
          {data.leads.sources.slice(0, 3).map((s) => (
            <div key={s.name} className="text-sm text-white/80 truncate">
              <span className="font-mono tabular-nums text-white">{s.count}</span> from {s.name}
            </div>
          ))}
        </WeeklyBlock>
      </div>
    </div>
  );
}

function WeeklyBlock({
  emoji, title, count, headerHref, children, empty, emptyText, emptyCta,
}: {
  emoji: string;
  title: string;
  count: number;
  headerHref: string;
  children: React.ReactNode;
  empty: boolean;
  emptyText: string;
  emptyCta: { label: string; href: string };
}) {
  return (
    <div className="rounded-xl bg-white/5 p-4 flex flex-col">
      <Link href={headerHref} className="flex items-center gap-2 mb-3 group">
        <span className="text-base">{emoji}</span>
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/60 group-hover:text-white transition-colors">{title}</span>
        {!empty && <span className="ml-auto font-mono tabular-nums text-lg text-[var(--abv-azure)]">{count}</span>}
      </Link>
      {empty ? (
        <div className="text-sm text-white/50">
          <p className="mb-2">{emptyText}</p>
          <Link href={emptyCta.href} className="text-[var(--abv-azure)] hover:underline text-xs font-semibold">
            {emptyCta.label}
          </Link>
        </div>
      ) : (
        <div className="space-y-1.5">{children}</div>
      )}
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────

interface DashboardData {
  firstName: string | null;
  nextCoachingCall: { date: string; link: string | null };
}

interface TopVideo {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  viewCount: number;
  uploadDate: string;
  studioUrl: string;
}

// ── Nav Cards ─────────────────────────────────────────────────

// Sprint 3.2: reordered + tagline-style copy. Tinted 40x40 icon block on the
// LEFT replaces the previous emoji-only header. Background is the feature
// colour at ~10% opacity (`${colour}1A` suffix when colour is a hex).
const NAV_CARDS = [
  { title: "AI Tools",        tagline: "Build, write, review.",         href: "/member/ai-tools",        emoji: "✨", colour: "var(--abv-ai-tools)" },
  { title: "My Scores",       tagline: "See where you stand.",          href: "/member/scores",          emoji: "🏆", colour: "var(--abv-scores)" },
  { title: "Academy",         tagline: "Watch a lesson.",               href: "/member/academy",         emoji: "🎓", colour: "var(--abv-academy)" },
  { title: "Content Planner", tagline: "Plan next week.",               href: "/member/content-planner", emoji: "📅", colour: "var(--abv-azure)" },
  { title: "Generate Leads",  tagline: "Run a campaign.",               href: "/member/generate-leads",  emoji: "🚀", colour: "var(--abv-leads)" },
  { title: "My Calls",        tagline: "Watch your recordings.",        href: "/member/my-calls",        emoji: "📹", colour: "var(--abv-azure)" },
  { title: "Hire a Human",    tagline: "Get help when you're stuck.",   href: "/member/hire",            emoji: "🤝", colour: "var(--abv-hire)" },
];

// ── Component ─────────────────────────────────────────────────

export default function MemberDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [topVideos, setTopVideos] = useState<TopVideo[] | null>(null);
  const [videosLoading, setVideosLoading] = useState(true);
  const [noUploadsIn30Days, setNoUploadsIn30Days] = useState(false);
  const [changelog, setChangelog] = useState<Array<{ id: string; title: string; body: string; emoji: string; createdAt: string }>>([]);

  useEffect(() => {
    fetch("/api/member/dashboard")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/member/changelog")
      .then((r) => r.json())
      .then((d) => setChangelog(d.entries ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/member/top-videos")
      .then((r) => r.json())
      .then((d) => {
        setTopVideos(d.videos ?? []);
        setNoUploadsIn30Days(!!d.noUploadsIn30Days);
        setVideosLoading(false);
      })
      .catch(() => { setTopVideos([]); setVideosLoading(false); });
  }, []);

  // Sprint 3.2: unified Card primitive — abv-card surface, abv-border, rounded-2xl
  const card = "bg-[var(--abv-card)] rounded-2xl border border-[var(--abv-border)]";
  const txt = "text-[var(--abv-text)]";
  const muted = "text-[var(--abv-text-secondary)]";

  const firstName = data?.firstName ?? null;
  const nextCoachingCall = data?.nextCoachingCall;
  const coaching = nextCoachingCall ? fmtThursday(nextCoachingCall.date) : null;

  return (
    <div className="space-y-10 pb-12 max-w-5xl mx-auto">

      <OnboardingBanner />

      <PaymentBanner />

      {/* ── Greeting ── */}
      <div className="pt-2">
        {loading ? (
          <>
            <div className="h-10 w-[28rem] max-w-full bg-gray-200 dark:bg-[#2a2a2a] rounded-lg animate-pulse mb-3" />
            <div className="h-6 w-72 bg-gray-100 dark:bg-[#1e1e1e] rounded animate-pulse" />
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5 mb-4 px-3 py-1 rounded-full bg-[var(--abv-azure-tint)] text-[var(--abv-azure)] text-[11px] font-bold uppercase tracking-[0.12em]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--abv-azure)]" />
              Welcome back
            </span>
            <h1 className="font-display text-4xl text-[var(--abv-text)]">
              Welcome back{firstName ? `, ${firstName}` : ""}. Let&apos;s make something that <span className="text-[var(--abv-azure)]">converts</span>.
            </h1>
            <p className="mt-3 text-lg text-[var(--abv-text-secondary)]">
              Pick where to spend your hour today.
            </p>
          </>
        )}
      </div>

      {/* ── This week's focus ── */}
      <WeeklyFocusCard />

      {/* ── 7-Card Nav Grid (tinted icon block on the left) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {NAV_CARDS.map(({ title, tagline, href, emoji, colour }) => (
          <Link
            key={href}
            href={href}
            className="group p-6 bg-[var(--abv-card)] border border-[var(--abv-border)] rounded-2xl hover:shadow-[var(--shadow-abv-md)] hover:border-[var(--abv-border-strong)] transition-all"
          >
            <div className="flex items-start gap-4">
              <span
                className="inline-flex items-center justify-center w-16 h-16 rounded-xl text-2xl shrink-0"
                style={{ backgroundColor: `color-mix(in srgb, ${colour} 10%, transparent)` }}
              >
                {emoji}
              </span>
              <div className="flex-1 min-w-0">
                <h3 className="font-display text-xl text-[var(--abv-text)]">{title}</h3>
                <p className="text-sm text-[var(--abv-text-secondary)] mt-1">{tagline}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* ── Bottom Info Row ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Next Q&A Call */}
        <div className={`${card} p-6`}>
          <h2 className={`text-sm font-semibold ${muted} uppercase tracking-wider mb-4`}>Next LIVE Members Call</h2>
          {loading || !coaching ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-5 w-48 bg-gray-200 dark:bg-[#2a2a2a] rounded" />
              <div className="h-6 w-24 bg-gray-100 dark:bg-[#1e1e1e] rounded-full" />
            </div>
          ) : (
            <>
              <p className={`text-lg font-bold ${txt}`}>{coaching.label}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {/* Sprint 3.2: tint pill (no border, no opacity) */}
                <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--abv-azure-tint)] text-[var(--abv-azure)]">
                  {coaching.relative}
                </span>
                {nextCoachingCall?.link && nextCoachingCall.link.startsWith("http") && (
                  <a
                    href={nextCoachingCall.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-6 py-2.5 rounded-full bg-[var(--abv-dark)] text-white font-semibold text-sm hover:bg-black/90 transition-colors"
                  >
                    Join Call →
                  </a>
                )}
              </div>
              <div className="flex items-center gap-2 mt-3">
                <a
                  href="https://evt.to/gv7c7h0qvlgv"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`text-xs ${muted} hover:text-[var(--abv-azure)] transition-colors`}
                >
                  Add to calendar
                </a>
                {[
                  {
                    label: "Google Calendar",
                    icon: (
                      <svg width="18" height="18" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                    ),
                  },
                  {
                    label: "Apple Calendar",
                    icon: (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="#555">
                        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                      </svg>
                    ),
                  },
                  {
                    label: "Outlook",
                    icon: (
                      <svg width="18" height="18" viewBox="0 0 24 24">
                        <rect x="1.5" y="5" width="13" height="14" rx="1.5" fill="#0078d4"/>
                        <ellipse cx="8" cy="12" rx="2.8" ry="3" fill="white"/>
                        <path d="M14.5 7.5 23 5v14l-8.5-2.5V7.5z" fill="#0078d4"/>
                        <path d="M14.5 12H23" stroke="white" strokeWidth="1" fill="none"/>
                      </svg>
                    ),
                  },
                ].map(({ label, icon }) => (
                  <a
                    key={label}
                    href="https://evt.to/gv7c7h0qvlgv"
                    target="_blank"
                    rel="noopener noreferrer"
                    title={label}
                    className="opacity-85 hover:opacity-100 transition-opacity"
                  >
                    {icon}
                  </a>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Most Viewed — Last 30 Days */}
        <div className={`${card} p-6`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={`text-sm font-semibold ${muted} uppercase tracking-wider`}>Most Viewed — Last 30 Days</h2>
            {/* Sprint 3.2: muted (not azure) — keep one azure moment per region */}
            <a
              href="https://studio.youtube.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[var(--abv-text)]/50 hover:text-[var(--abv-text)] transition-colors shrink-0"
            >
              Open Studio →
            </a>
          </div>

          {videosLoading ? (
            <div className="flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-3 animate-pulse">
                  <div className="w-24 h-14 bg-gray-200 dark:bg-[#2a2a2a] rounded-lg shrink-0" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-3 bg-gray-200 dark:bg-[#2a2a2a] rounded w-full" />
                    <div className="h-3 bg-gray-200 dark:bg-[#2a2a2a] rounded w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : topVideos && topVideos.length > 0 ? (
            <div className="flex flex-col gap-3">
              {topVideos.slice(0, 3).map((v, i) => (
                <a
                  key={v.videoId}
                  href={v.studioUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex gap-3 group rounded-lg p-1 -m-1 hover:bg-gray-50 dark:hover:bg-[var(--abv-dark)] transition-colors"
                >
                  <div className="relative shrink-0">
                    {v.thumbnailUrl ? (
                      <img
                        src={v.thumbnailUrl}
                        alt={v.title}
                        className="w-24 h-14 object-cover rounded-lg"
                      />
                    ) : (
                      <div className="w-24 h-14 bg-gray-100 dark:bg-[#0f1419] rounded-lg flex items-center justify-center">
                        <PlayCircleIcon className={`w-6 h-6 ${muted}`} />
                      </div>
                    )}
                    <span className="absolute top-1 left-1 text-[10px] font-bold bg-black/70 text-white px-1 rounded">
                      #{i + 1}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium ${txt} line-clamp-2 leading-snug group-hover:text-[var(--abv-azure)] transition-colors`}>
                      {v.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {/* Sprint 3.2: view counts in Geist Mono, tabular */}
                      <span className={`text-xs font-semibold font-mono tabular-nums ${txt}`}>{fmtViews(v.viewCount)} views</span>
                      <span className={`text-xs ${muted}`}>· {fmtUploadDate(v.uploadDate)}</span>
                    </div>
                    <span className="text-[10px] text-[var(--abv-azure)] group-hover:underline mt-0.5 block">
                      Edit in Studio →
                    </span>
                  </div>
                </a>
              ))}
            </div>
          ) : noUploadsIn30Days ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <VideoCameraIcon className="w-8 h-8 text-yellow-400 mb-2" />
              <p className={`text-sm font-medium ${txt}`}>No uploads in the last 30 days</p>
              <p className={`text-xs ${muted} mt-1`}>Upload a video to see it here.</p>
              <a
                href="https://studio.youtube.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[var(--abv-azure)] hover:underline mt-2"
              >
                Go to YouTube Studio →
              </a>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <VideoCameraIcon className={`w-8 h-8 ${muted} mb-2`} />
              <p className={`text-sm ${muted}`}>No YouTube channel connected.</p>
              <Link href="/member/settings" className="text-xs text-[var(--abv-azure)] hover:underline mt-1">
                Add your channel in Settings →
              </Link>
            </div>
          )}
        </div>

      </div>

      {/* ── What's New ── */}
      {changelog.length > 0 && (
        <div className={`${card} p-6`}>
          {/* Sprint 3.2: azure eyebrow pill replaces the heading */}
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--abv-azure-tint)] text-[var(--abv-azure)] text-[11px] font-bold uppercase tracking-[0.12em] mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--abv-azure)]" />
            What&apos;s new
          </span>
          <div className="space-y-3">
            {changelog.slice(0, 3).map((entry) => (
              <div key={entry.id} className="flex gap-3">
                <span className="text-lg shrink-0">{entry.emoji}</span>
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${txt}`}>{entry.title}</p>
                  <p className={`text-xs ${muted} line-clamp-1 mt-0.5`}>{entry.body}</p>
                  <p className="text-[10px] text-[var(--abv-text)]/30 dark:text-white/20 mt-1">
                    {new Date(entry.createdAt).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  AcademicCapIcon,
  PencilSquareIcon,
  ChartBarIcon,
  TrophyIcon,
  UserGroupIcon,
  PlayCircleIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";

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

const NAV_CARDS = [
  {
    title: "Academy",
    description: "Master the Attraction system, one lesson at a time.",
    href: "/member/academy",
    icon: AcademicCapIcon,
    colour: "#10B981",
  },
  {
    title: "My Avatar",
    description: "Work on your perfect avatar.",
    href: "/member/ai-tools/avatar-architect",
    icon: null,
    emoji: "🎯",
    colour: "#EF4444",
  },
  {
    title: "Create Content",
    description: "Generate ideas, scripts, and titles with AI.",
    href: "/member/ai-tools",
    icon: PencilSquareIcon,
    colour: "#6ba3c7",
  },
  {
    title: "Generate Leads",
    description: "Track your links, clicks, and conversions.",
    href: "/member/campaigns",
    icon: ChartBarIcon,
    colour: "#E63946",
  },
  {
    title: "My Scores",
    description: "See how your content stacks up.",
    href: "/member/scores",
    icon: TrophyIcon,
    colour: "#F59E0B",
  },
  {
    title: "Hire a Human",
    description: "Hire us to help you grow faster.",
    href: "/member/hire",
    icon: UserGroupIcon,
    colour: "#8B5CF6",
  },
];

// ── Component ─────────────────────────────────────────────────

export default function MemberDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [topVideos, setTopVideos] = useState<TopVideo[] | null>(null);
  const [videosLoading, setVideosLoading] = useState(true);
  const [noUploadsIn30Days, setNoUploadsIn30Days] = useState(false);

  useEffect(() => {
    fetch("/api/member/dashboard")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
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

  const card = "bg-white dark:bg-[#1a1a1a] rounded-xl border border-gray-200 dark:border-[#2a2a2a]";
  const txt = "text-[#2f3437] dark:text-[#e2e8f0]";
  const muted = "text-[#2f3437]/60 dark:text-[#94a3b8]";

  const firstName = data?.firstName ?? null;
  const nextCoachingCall = data?.nextCoachingCall;
  const coaching = nextCoachingCall ? fmtThursday(nextCoachingCall.date) : null;

  return (
    <div className="space-y-10 pb-12 max-w-5xl mx-auto">

      {/* ── Greeting ── */}
      <div className="pt-2 text-center">
        {loading ? (
          <>
            <div className="h-9 w-72 bg-gray-200 dark:bg-[#2a2a2a] rounded-lg animate-pulse mx-auto mb-3" />
            <div className="h-5 w-96 bg-gray-100 dark:bg-[#1e1e1e] rounded animate-pulse mx-auto" />
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold text-[#6ba3c7]">
              Welcome back{firstName ? `, ${firstName}` : ""}
            </h1>
            <p className={`mt-2 text-base ${muted}`}>
              Let&apos;s create something that converts. What would you like to work on today?
            </p>
          </>
        )}
      </div>

      {/* ── 6-Card Nav Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {NAV_CARDS.map(({ title, description, href, icon: Icon, colour, ...rest }) => {
          const emoji = (rest as any).emoji as string | undefined;
          return (
          <Link
            key={href}
            href={href}
            className={`${card} p-6 flex flex-col gap-4 hover:shadow-md transition-all group border-l-[3px]`}
            style={{ borderLeftColor: "transparent" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderLeftColor = colour; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderLeftColor = "transparent"; }}
          >
            <div className="p-2.5 rounded-xl w-fit" style={{ backgroundColor: `${colour}1a` }}>
              {emoji
                ? <span className="text-2xl leading-none block w-8 h-8 flex items-center justify-center">{emoji}</span>
                : Icon && <Icon className="w-8 h-8" style={{ color: colour }} />
              }
            </div>
            <div>
              <p className={`text-base font-bold ${txt} transition-colors`}>
                {title}
              </p>
              <p className={`text-sm mt-1 ${muted} leading-snug`}>{description}</p>
            </div>
          </Link>
          );
        })}
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
                <span className="inline-block text-xs font-medium px-2.5 py-1 rounded-full bg-[#6ba3c7]/15 text-[#6ba3c7]">
                  {coaching.relative}
                </span>
                {nextCoachingCall?.link && nextCoachingCall.link.startsWith("http") && (
                  <a
                    href={nextCoachingCall.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full bg-[#6ba3c7] text-white hover:bg-[#5490b5] transition-colors"
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
                  className={`text-xs ${muted} hover:text-[#6ba3c7] transition-colors`}
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
            <a
              href="https://studio.youtube.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#6ba3c7] hover:underline shrink-0"
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
                  className="flex gap-3 group rounded-lg p-1 -m-1 hover:bg-gray-50 dark:hover:bg-[#1e2a38] transition-colors"
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
                    <p className={`text-xs font-medium ${txt} line-clamp-2 leading-snug group-hover:text-[#6ba3c7] transition-colors`}>
                      {v.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs font-semibold ${txt}`}>{fmtViews(v.viewCount)} views</span>
                      <span className={`text-xs ${muted}`}>· {fmtUploadDate(v.uploadDate)}</span>
                    </div>
                    <span className="text-[10px] text-[#6ba3c7] group-hover:underline mt-0.5 block">
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
                className="text-xs text-[#6ba3c7] hover:underline mt-2"
              >
                Go to YouTube Studio →
              </a>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <VideoCameraIcon className={`w-8 h-8 ${muted} mb-2`} />
              <p className={`text-sm ${muted}`}>No YouTube channel connected.</p>
              <Link href="/member/settings" className="text-xs text-[#6ba3c7] hover:underline mt-1">
                Add your channel in Settings →
              </Link>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  AcademicCapIcon,
  SparklesIcon,
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
  const label = d.toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" });
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
  },
  {
    title: "My Avatar",
    description: "Work on your perfect avatar.",
    href: "/member/ai-tools/avatar-architect",
    icon: SparklesIcon,
  },
  {
    title: "Create Content",
    description: "Generate ideas, scripts, and titles with AI.",
    href: "/member/ai-tools",
    icon: PencilSquareIcon,
  },
  {
    title: "Generate Leads",
    description: "Track your links, clicks, and conversions.",
    href: "/member/campaigns",
    icon: ChartBarIcon,
  },
  {
    title: "My Scores",
    description: "See how your content stacks up.",
    href: "/member/scores",
    icon: TrophyIcon,
  },
  {
    title: "Hire a Human",
    description: "Hire us to help you grow faster.",
    href: "/member/hire",
    icon: UserGroupIcon,
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
    <div className="space-y-10 pb-12 max-w-5xl">

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
        {NAV_CARDS.map(({ title, description, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`${card} p-6 flex flex-col gap-4 hover:ring-2 hover:ring-[#6ba3c7]/40 hover:shadow-md transition-all group`}
          >
            <div className="p-2.5 bg-[#6ba3c7]/10 rounded-xl w-fit">
              <Icon className="w-8 h-8 text-[#6ba3c7]" />
            </div>
            <div>
              <p className={`text-base font-bold ${txt} group-hover:text-[#6ba3c7] transition-colors`}>
                {title}
              </p>
              <p className={`text-sm mt-1 ${muted} leading-snug`}>{description}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* ── Bottom Info Row ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Next Q&A Call */}
        <div className={`${card} p-6`}>
          <h2 className={`text-sm font-semibold ${muted} uppercase tracking-wider mb-4`}>Next Q&A Call</h2>
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

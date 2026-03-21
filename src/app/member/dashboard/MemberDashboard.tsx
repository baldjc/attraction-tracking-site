"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  MinusIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ExclamationCircleIcon,
  SparklesIcon,
  VideoCameraIcon,
  PlayCircleIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  ChartBarIcon,
} from "@heroicons/react/24/outline";

const PRINCIPLE_LABELS: Record<string, string> = {
  avatar_clarity: "Avatar Clarity",
  themes_over_topics: "Themes Over Topics",
  arc_attention: "ARC Attention",
  arc_revelation: "ARC Revelation",
  arc_connection: "ARC Connection",
  title_frameworks: "Title Frameworks",
  approve_the_click: "Approve the Click",
  lead_magnet_system: "Lead Magnet System",
  curiosity_bridges: "Curiosity Bridges",
  show_dont_tell: "Show Don't Tell",
  values_peppering: "Values Peppering",
  connection_language: "Connection Language",
  story_proof: "Story Proof",
  grade_5_language: "Grade 5 Language",
  binge_architecture: "Binge Architecture",
  consistency: "Consistency",
};

function gapSuggestion(key: string): { label: string; href: string } {
  if (key === "avatar_clarity") return { label: "Build your Avatar →", href: "/member/ai-tools" };
  if (key === "title_frameworks") return { label: "Try the Content Engine →", href: "/member/ai-tools" };
  if (["arc_attention", "arc_revelation", "arc_connection"].includes(key))
    return { label: "Outline with ARC Script Builder →", href: "/member/ai-tools" };
  if (key === "lead_magnet_system") return { label: "Set up campaign tracking →", href: "/member/campaigns" };
  return { label: "Review in your latest audit →", href: "/member/scores" };
}

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtThursday(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  const label = d.toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" });
  const today = new Date();
  const diff = Math.ceil((d.getTime() - today.getTime()) / 86400000);
  const relative = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : `in ${diff} days`;
  return { label, relative };
}

function scoreBadgeClass(score: number) {
  if (score >= 7) return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400";
  if (score >= 5) return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400";
  return "bg-red-100 text-[#ff0033] dark:bg-red-900/40 dark:text-red-400";
}

interface DashboardData {
  firstName: string | null;
  latestAudit: {
    id: string;
    score: number | null;
    date: string;
    strengths: { key: string; score: number }[];
    gaps: { key: string; score: number }[];
    oneSentenceDiagnosis: string | null;
  } | null;
  previousAudit: { score: number | null } | null;
  campaignStats: {
    thisMonth: { clicks: number; leads: number; convRate: number };
    lastMonth: { clicks: number; leads: number; convRate: number };
  };
  bestVideo: {
    title: string;
    thumbnail: string | null;
    clicks: number;
    leads: number;
    convRate: number;
    campaignId: string;
  } | null;
  daysSinceUpload: number | null;
  nextCoachingCall: string;
  scoreHistory: { date: string; score: number }[];
}

export default function MemberDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/member/dashboard")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); });
  }, []);

  const card = "bg-white dark:bg-[#242b3d] rounded-2xl border border-gray-200 dark:border-[#2d3748] shadow-sm";
  const txt = "text-[#1e2a38] dark:text-[#e2e8f0]";
  const muted = "text-[#1e2a38]/60 dark:text-[#94a3b8]";
  const divider = "border-gray-200 dark:border-[#2d3748]";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-[#3dc3ff] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const { firstName, latestAudit, previousAudit, campaignStats, bestVideo, daysSinceUpload, nextCoachingCall, scoreHistory } = data;
  const { thisMonth, lastMonth } = campaignStats;
  const hasCampaigns = thisMonth.clicks > 0 || lastMonth.clicks > 0;
  const coaching = fmtThursday(nextCoachingCall);

  function diffLabel(curr: number, prev: number, isPercent = false) {
    const diff = curr - prev;
    if (diff === 0) return null;
    const sign = diff > 0 ? "+" : "";
    const suffix = isPercent ? "pp" : "";
    return { text: `${sign}${diff}${suffix} vs last month`, positive: diff > 0 };
  }

  const clicksDiff = diffLabel(thisMonth.clicks, lastMonth.clicks);
  const leadsDiff = diffLabel(thisMonth.leads, lastMonth.leads);
  const convDiff = diffLabel(thisMonth.convRate, lastMonth.convRate, true);

  let scoreTrend: "up" | "down" | "same" | null = null;
  let scoreDelta: number | null = null;
  if (latestAudit?.score != null && previousAudit?.score != null) {
    scoreDelta = Math.round((latestAudit.score - previousAudit.score) * 10) / 10;
    if (scoreDelta > 0) scoreTrend = "up";
    else if (scoreDelta < 0) scoreTrend = "down";
    else scoreTrend = "same";
  }

  function UploadStatus() {
    if (daysSinceUpload == null) {
      return (
        <div className={`flex items-start gap-3 p-4 rounded-xl bg-gray-50 dark:bg-[#1a1f2e]`}>
          <VideoCameraIcon className={`w-5 h-5 mt-0.5 ${muted} shrink-0`} />
          <div>
            <p className={`text-sm font-medium ${txt}`}>No upload data available</p>
            <Link href="/member/campaigns" className="text-xs text-[#3dc3ff] hover:underline mt-0.5 block">
              Connect a YouTube video to start tracking →
            </Link>
          </div>
        </div>
      );
    }
    const days = daysSinceUpload;
    let icon = <CheckCircleIcon className="w-5 h-5 mt-0.5 text-green-500 shrink-0" />;
    let color = "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40";
    let headline = "You're on track!";
    let sub = `${days} day${days !== 1 ? "s" : ""} since last upload`;
    if (days >= 15) {
      icon = <ExclamationCircleIcon className="w-5 h-5 mt-0.5 text-[#ff0033] shrink-0" />;
      color = "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40";
      headline = "Your consistency score will drop";
      sub = `${days} days since last upload`;
    } else if (days >= 8) {
      icon = <ExclamationTriangleIcon className="w-5 h-5 mt-0.5 text-yellow-500 shrink-0" />;
      color = "bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/40";
      headline = "Time for a new video";
      sub = `${days} days since last upload`;
    }
    return (
      <div className={`flex items-start gap-3 p-4 rounded-xl ${color}`}>
        {icon}
        <div>
          <p className={`text-sm font-semibold ${txt}`}>{headline}</p>
          <p className={`text-xs ${muted} mt-0.5`}>{sub}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-10">
      {/* Header */}
      <div>
        <h1 className={`text-2xl font-bold ${txt}`}>Dashboard</h1>
        <p className={`text-sm ${muted} mt-0.5`}>
          Welcome back{firstName ? `, ${firstName}` : ""}
        </p>
      </div>

      {/* Row 1 — KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Attraction Score */}
        <Link href="/member/scores" className={`${card} p-5 block hover:ring-2 hover:ring-[#3dc3ff]/40 transition-shadow`}>
          <p className={`text-xs font-semibold uppercase tracking-wider ${muted} mb-2`}>Attraction Score</p>
          {latestAudit ? (
            <>
              <div className="flex items-end gap-1.5">
                <span className={`text-4xl font-black ${txt}`}>
                  {latestAudit.score?.toFixed(1) ?? "—"}
                </span>
                <span className={`text-sm ${muted} mb-1`}>/10</span>
                {scoreTrend === "up" && (
                  <>
                    <ArrowTrendingUpIcon className="w-5 h-5 mb-1 text-green-500" />
                    <span className="text-xs font-bold text-green-500 mb-1">+{scoreDelta?.toFixed(1)}</span>
                  </>
                )}
                {scoreTrend === "down" && (
                  <>
                    <ArrowTrendingDownIcon className="w-5 h-5 mb-1 text-[#ff0033]" />
                    <span className="text-xs font-bold text-[#ff0033] mb-1">{scoreDelta?.toFixed(1)}</span>
                  </>
                )}
                {scoreTrend === "same" && <MinusIcon className="w-5 h-5 mb-1 text-gray-400" />}
              </div>
              <p className={`text-xs ${muted} mt-1`}>from {fmt(latestAudit.date)}</p>
            </>
          ) : (
            <>
              <p className={`text-4xl font-black ${muted}`}>—</p>
              <p className={`text-xs ${muted} mt-1`}>Awaiting first audit</p>
            </>
          )}
        </Link>

        {/* Leads This Month */}
        <Link href="/member/analytics?tab=conversions" className={`${card} p-5 block hover:ring-2 hover:ring-[#3dc3ff]/40 transition-shadow`}>
          <p className={`text-xs font-semibold uppercase tracking-wider ${muted} mb-2`}>Leads This Month</p>
          <p className={`text-4xl font-black ${txt}`}>{thisMonth.leads}</p>
          {hasCampaigns ? (
            leadsDiff ? (
              <p className={`text-xs mt-1 font-medium ${leadsDiff.positive ? "text-green-600" : "text-[#ff0033]"}`}>
                {leadsDiff.text}
              </p>
            ) : (
              <p className={`text-xs mt-1 ${muted}`}>Same as last month</p>
            )
          ) : (
            <span className="text-xs mt-1 text-[#3dc3ff] block">
              Set up link tracking →
            </span>
          )}
        </Link>

        {/* Clicks This Month */}
        <Link href="/member/analytics?tab=overview" className={`${card} p-5 block hover:ring-2 hover:ring-[#3dc3ff]/40 transition-shadow`}>
          <p className={`text-xs font-semibold uppercase tracking-wider ${muted} mb-2`}>Clicks This Month</p>
          <p className={`text-4xl font-black ${txt}`}>{thisMonth.clicks}</p>
          {hasCampaigns ? (
            clicksDiff ? (
              <p className={`text-xs mt-1 font-medium ${clicksDiff.positive ? "text-green-600" : "text-[#ff0033]"}`}>
                {clicksDiff.text}
              </p>
            ) : (
              <p className={`text-xs mt-1 ${muted}`}>Same as last month</p>
            )
          ) : (
            <span className="text-xs mt-1 text-[#3dc3ff] block">
              Set up link tracking →
            </span>
          )}
        </Link>

        {/* Conversion Rate */}
        <Link href="/member/analytics?tab=overview" className={`${card} p-5 block hover:ring-2 hover:ring-[#3dc3ff]/40 transition-shadow`}>
          <p className={`text-xs font-semibold uppercase tracking-wider ${muted} mb-2`}>Conversion Rate</p>
          <p className={`text-4xl font-black text-[#3dc3ff]`}>{thisMonth.convRate}%</p>
          {hasCampaigns ? (
            convDiff ? (
              <p className={`text-xs mt-1 font-medium ${convDiff.positive ? "text-green-600" : "text-[#ff0033]"}`}>
                {convDiff.text}
              </p>
            ) : (
              <p className={`text-xs mt-1 ${muted}`}>Same as last month</p>
            )
          ) : (
            <span className="text-xs mt-1 text-[#3dc3ff] block">
              Set up link tracking →
            </span>
          )}
        </Link>
      </div>

      {/* Row 2 — Strengths/Gaps + Right panel */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left — Strengths & Gaps (3/5 columns) */}
        <div className={`lg:col-span-3 ${card} p-6 space-y-5`}>
          {!latestAudit ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <ChartBarIcon className={`w-10 h-10 ${muted} mb-3`} />
              <p className={`font-medium ${txt}`}>No audit data yet</p>
              <p className={`text-sm ${muted} mt-1`}>Your strengths and gaps will appear here after your first audit.</p>
            </div>
          ) : (
            <>
              {/* Strengths */}
              <div>
                <h3 className={`text-sm font-semibold ${txt} mb-3`}>Top 3 Strengths</h3>
                <div className="space-y-2">
                  {latestAudit.strengths.map((s) => (
                    <div key={s.key} className="flex items-center justify-between gap-3">
                      <span className={`text-sm ${txt}`}>{PRINCIPLE_LABELS[s.key] ?? s.key}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${scoreBadgeClass(s.score)}`}>
                        {s.score.toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`border-t ${divider}`} />

              {/* Gaps */}
              <div>
                <h3 className={`text-sm font-semibold ${txt} mb-3`}>Top 3 Gaps</h3>
                <div className="space-y-3">
                  {latestAudit.gaps.map((g) => {
                    const suggestion = gapSuggestion(g.key);
                    return (
                      <div key={g.key}>
                        <div className="flex items-center justify-between gap-3">
                          <span className={`text-sm ${txt}`}>{PRINCIPLE_LABELS[g.key] ?? g.key}</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${scoreBadgeClass(g.score)}`}>
                            {g.score.toFixed(1)}
                          </span>
                        </div>
                        <Link
                          href={suggestion.href}
                          className="text-xs text-[#3dc3ff] hover:underline mt-0.5 block"
                        >
                          {suggestion.label}
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* One-sentence diagnosis */}
              {latestAudit.oneSentenceDiagnosis && (
                <>
                  <div className={`border-t ${divider}`} />
                  <blockquote className="bg-[#3dc3ff]/8 dark:bg-[#3dc3ff]/10 border-l-4 border-[#3dc3ff] rounded-r-xl px-4 py-3">
                    <p className={`text-sm italic ${txt}`}>{latestAudit.oneSentenceDiagnosis}</p>
                  </blockquote>
                </>
              )}
            </>
          )}
        </div>

        {/* Right — Upload + Coaching + Quick Links (2/5 columns) */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Days Since Last Upload */}
          <div className={`${card} p-5`}>
            <h3 className={`text-sm font-semibold ${txt} mb-3`}>Days Since Last Upload</h3>
            <UploadStatus />
          </div>

          {/* Next Coaching Call */}
          <div className={`${card} p-5`}>
            <h3 className={`text-sm font-semibold ${txt} mb-2`}>Next Q&A Call</h3>
            <p className={`text-base font-bold ${txt}`}>{coaching.label}</p>
            <span className="inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full bg-[#3dc3ff]/15 text-[#3dc3ff]">
              {coaching.relative}
            </span>
          </div>

          {/* Quick Links — AI Tools */}
          <div className={`${card} p-5`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={`text-sm font-semibold ${txt}`}>AI Tools</h3>
              <Link href="/member/ai-tools" className="text-xs text-[#3dc3ff] hover:underline">
                See all →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Content Engine", icon: SparklesIcon, href: "/member/ai-tools?tool=content_engine" },
                { label: "ARC Script Builder", icon: PencilSquareIcon, href: "/member/ai-tools?tool=arc_script_builder" },
                { label: "Script Review", icon: MagnifyingGlassIcon, href: "/member/ai-tools?tool=script_review" },
                { label: "Title Analyzer", icon: ChartBarIcon, href: "/member/ai-tools?tool=title_analyzer" },
              ].map(({ label, icon: Icon, href }) => (
                <Link
                  key={label}
                  href={href}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl text-center transition-colors
                    bg-gray-50 dark:bg-[#1a1f2e] hover:bg-[#3dc3ff]/10 dark:hover:bg-[#3dc3ff]/10
                    border border-transparent hover:border-[#3dc3ff]/30`}
                >
                  <Icon className="w-5 h-5 text-[#3dc3ff]" />
                  <span className={`text-xs font-medium ${txt} leading-tight`}>{label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Row 3 — Best Video + Score History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Best Performing Video */}
        <div className={`${card} p-5`}>
          <h3 className={`text-sm font-semibold ${txt} mb-4`}>Best Performing Video This Month</h3>
          {bestVideo ? (
            <div className="flex gap-4">
              {bestVideo.thumbnail && (
                <img
                  src={bestVideo.thumbnail}
                  alt={bestVideo.title}
                  className="w-28 h-16 object-cover rounded-lg shrink-0"
                />
              )}
              {!bestVideo.thumbnail && (
                <div className="w-28 h-16 bg-gray-100 dark:bg-[#1a1f2e] rounded-lg flex items-center justify-center shrink-0">
                  <PlayCircleIcon className={`w-8 h-8 ${muted}`} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${txt} line-clamp-2 leading-snug`}>{bestVideo.title}</p>
                <div className="flex gap-4 mt-2">
                  <div>
                    <p className={`text-xs ${muted}`}>Clicks</p>
                    <p className={`text-sm font-bold ${txt}`}>{bestVideo.clicks}</p>
                  </div>
                  <div>
                    <p className={`text-xs ${muted}`}>Leads</p>
                    <p className={`text-sm font-bold ${txt}`}>{bestVideo.leads}</p>
                  </div>
                  <div>
                    <p className={`text-xs ${muted}`}>Conv.</p>
                    <p className="text-sm font-bold text-[#3dc3ff]">{bestVideo.convRate}%</p>
                  </div>
                </div>
                <Link
                  href={`/member/campaigns?id=${bestVideo.campaignId}`}
                  className="text-xs text-[#3dc3ff] hover:underline mt-2 block"
                >
                  View campaign →
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <VideoCameraIcon className={`w-8 h-8 ${muted} mb-2`} />
              <p className={`text-sm ${muted}`}>No campaign data this month yet.</p>
              <Link href="/member/campaigns" className="text-xs text-[#3dc3ff] hover:underline mt-1">
                Set up a campaign →
              </Link>
            </div>
          )}
        </div>

        {/* Score History Sparkline */}
        <div className={`${card} p-5`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={`text-sm font-semibold ${txt}`}>Score History</h3>
            <Link href="/member/scores" className="text-xs text-[#3dc3ff] hover:underline">
              See details →
            </Link>
          </div>
          {scoreHistory.length >= 2 ? (
            <ResponsiveContainer width="100%" height={130}>
              <LineChart data={scoreHistory}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis domain={[0, 10]} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={24} />
                <Tooltip
                  contentStyle={{
                    background: "#242b3d",
                    border: "1px solid #2d3748",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "#e2e8f0",
                  }}
                  cursor={{ stroke: "#3dc3ff", strokeWidth: 1, strokeDasharray: "4 4" }}
                  formatter={(v) => [typeof v === "number" ? v.toFixed(1) : v, "Score"]}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#3dc3ff"
                  strokeWidth={2}
                  dot={{ fill: "#3dc3ff", r: 3 }}
                  activeDot={{ r: 5, fill: "#3dc3ff" }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : scoreHistory.length === 1 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <p className={`text-3xl font-black ${txt}`}>{scoreHistory[0].score.toFixed(1)}</p>
              <p className={`text-xs ${muted} mt-1`}>1 audit completed — more will build the trend</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <ChartBarIcon className={`w-8 h-8 ${muted} mb-2`} />
              <p className={`text-sm ${muted}`}>No audits yet to display.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

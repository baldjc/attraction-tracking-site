"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ArrowPathIcon, StarIcon } from "@heroicons/react/24/outline";
import PageHeader from "@/components/PageHeader";

const AUDIT_KEY_TO_ACADEMY_SLUG: Record<string, string> = {
  lead_magnet_system: "lead_magnet",
};
function toAcademySlug(key: string): string {
  return AUDIT_KEY_TO_ACADEMY_SLUG[key] ?? key;
}

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
  show_dont_tell: "Show Don't Tell (est.)",
  values_peppering: "Values Peppering",
  connection_language: "Connection Language",
  story_proof: "Story Proof",
  grade_5_language: "Grade 5 Language",
  binge_architecture: "Binge Architecture",
  consistency: "Consistency",
};

const LEARNING_PATH: Record<string, string> = {
  avatar_clarity: "Lessons 1.1 + 1.2",
  themes_over_topics: "Lesson 1.3",
  lead_magnet_system: "Lesson 1.4",
  values_peppering: "Lesson 2.1",
  connection_language: "Lesson 2.2",
  arc_attention: "Lessons 2.5 + 2.5a + 3.2",
  arc_revelation: "Lesson 2.5",
  arc_connection: "Lessons 2.2 + 2.5",
  curiosity_bridges: "Lesson 2.5",
  story_proof: "Lesson 2.5",
  show_dont_tell: "Lesson 3.3",
  approve_the_click: "Lessons 4.1 + 2.5",
  title_frameworks: "Lesson 4.2",
  binge_architecture: "Lesson 1.3",
  grade_5_language: "N/A",
  consistency: "Lessons 1.3 + 2.4",
};

function scoreBadge(score: number | null) {
  if (score == null) return "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400";
  if (score >= 7) return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400";
  if (score >= 5) return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400";
  return "bg-red-100 text-[#ff0033] dark:bg-red-900/40 dark:text-red-400";
}

function scoreBarColor(score: number | null) {
  if (score == null) return "bg-gray-200 dark:bg-gray-600";
  if (score >= 7) return "bg-green-500";
  if (score >= 5) return "bg-yellow-400";
  return "bg-[#ff0033]";
}

function fmt(date: string) {
  return new Date(date).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function MemberScoresPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [principlesWithLessons, setPrinciplesWithLessons] = useState<Set<string>>(new Set());

  function load() {
    setLoading(true);
    fetch("/api/member/scores")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); });
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    fetch("/api/member/academy/principles")
      .then((r) => r.json())
      .then((d) => {
        const slugs = new Set<string>(
          (d.principles ?? [])
            .filter((p: any) => p.lessonCount > 0)
            .map((p: any) => p.slug)
        );
        setPrinciplesWithLessons(slugs);
      })
      .catch(() => {});
  }, []);

  const txt = "text-[#2f3437] dark:text-[#e2e8f0]";
  const muted = "text-[#2f3437]/60 dark:text-[#94a3b8]";
  const card = "bg-white dark:bg-[#1a1a1a] rounded-lg border border-gray-200 dark:border-[#2a2a2a]";
  const divider = "divide-gray-100 dark:divide-[#2a2a2a]";
  const thClass = `text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider ${muted} bg-gray-50 dark:bg-[#1e2530]`;
  const tdClass = `px-5 py-3.5`;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-[#6ba3c7] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data?.latestAudit) {
    return (
      <div>
        <PageHeader
          emoji="🏆"
          title="My Scores"
          description="See where you stand and where to focus next."
        />
        <div className="bg-[#6ba3c7]/10 border border-[#6ba3c7]/30 rounded-lg p-10 text-center">
          <p className={`font-medium ${txt} mb-2`}>No audits yet</p>
          <p className={`text-sm ${muted}`}>
            Your Attraction Scores will appear here after your first audit is completed by your coach.
          </p>
        </div>
      </div>
    );
  }

  const { latestAudit, baselineAudit, audits, channelBannerUrl, channelThumbnailUrl, channelName, youtubeChannelUrl } = data;

  // Current Attraction Score: exclude single video audits — they are per-video checks, not overall channel scores
  // Only baseline or monthly audits represent a full channel score.
  // Single video audits have different scoring (no Consistency, different weighting)
  // and must never feed the score circle, chart channel line, or 16-Principle table.
  const latestChannelAudit: any =
    (audits ?? []).find((a: any) => a.auditType === "baseline" || a.auditType === "monthly") ?? null;

  const scores = (latestChannelAudit?.scores ?? {}) as Record<string, { score: number | null; evidence?: string }>;
  const baselineScores = (baselineAudit?.scores as any) ?? null;

  // Build merged chart data with two separate series
  const allAuditsChron = [...(audits ?? [])]
    .filter((a: any) => a.overallScore != null)
    .reverse();

  // Use an ordered array keeping each audit as its own point (multiple on same day are separate)
  const channelChartData = allAuditsChron
    .filter((a: any) => a.auditType === "baseline" || a.auditType === "monthly")
    .map((a: any) => ({
      date: new Date(a.createdAt).toLocaleDateString("en-CA", { month: "short", day: "numeric" }),
      channelScore: parseFloat(Number(a.overallScore).toFixed(1)),
    }));

  const videoChartData = allAuditsChron
    .filter((a: any) => a.auditType === "single_video")
    .map((a: any) => ({
      date: new Date(a.createdAt).toLocaleDateString("en-CA", { month: "short", day: "numeric" }),
      videoScore: parseFloat(Number(a.overallScore).toFixed(1)),
    }));

  // Merge into a unified date axis for Recharts
  const mergedDates = Array.from(
    new Set(
      [...channelChartData, ...videoChartData].map((d) => d.date)
    )
  );
  const chartData = mergedDates.map((date) => ({
    date,
    channelScore: channelChartData.find((d) => d.date === date)?.channelScore ?? null,
    videoScore: videoChartData.find((d) => d.date === date)?.videoScore ?? null,
  }));
  const hasChannelLine = channelChartData.length >= 1;
  const hasVideoLine = videoChartData.length >= 1;

  const principleRows = Object.entries(scores).map(([key, val]) => {
    const base = baselineScores?.[key]?.score ?? null;
    const delta = base != null && val.score != null ? val.score - base : null;
    return { key, val, base, delta };
  });

  const gaps = principleRows.filter(
    ({ key, val }) => key !== "show_dont_tell" && val.score != null && val.score < 7
  );

  return (
    <div className="space-y-5 pb-10">
      <PageHeader
        emoji="🏆"
        title="My Scores"
        description="See where you stand and where to focus next."
        action={
          <button
            onClick={load}
            className={`shrink-0 flex items-center gap-2 px-3 py-1.5 border border-gray-200 dark:border-[#2a2a2a] rounded-lg text-sm ${txt} hover:bg-gray-50 dark:hover:bg-[#1e2a38] transition-colors`}
          >
            <ArrowPathIcon className="w-4 h-4" /> Refresh
          </button>
        }
      />
      {/* YouTube Channel Banner */}
      {channelBannerUrl && (
        <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-[#2a2a2a] relative">
          <img
            src={channelBannerUrl}
            alt={channelName ? `${channelName} YouTube banner` : "YouTube channel banner"}
            className="w-full object-cover"
            style={{ maxHeight: 220, objectPosition: "center" }}
          />
          {/* Gradient overlay + channel info */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-5 py-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                {channelName && (
                  <p className="text-white font-bold text-lg leading-tight drop-shadow">
                    {channelName}
                  </p>
                )}
              </div>
              {youtubeChannelUrl && (
                <a
                  href={youtubeChannelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 flex items-center gap-1.5 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1.5 rounded-lg border border-white/20 transition-colors"
                >
                  <svg className="w-4 h-4 fill-white" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                  View Channel
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Row 1: Score Hero + Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Overall Score */}
        <div className={`lg:col-span-2 ${card} p-6 flex flex-col items-center justify-center text-center`}>
          <p className={`text-xs font-semibold uppercase tracking-widest ${muted} mb-3`}>
            Current Attraction Score
          </p>
          {latestChannelAudit ? (
            <>
              <div
                className={`w-36 h-36 rounded-full flex flex-col items-center justify-center border-4 ${
                  latestChannelAudit.overallScore >= 7
                    ? "border-green-400 bg-green-50 dark:bg-green-900/20"
                    : latestChannelAudit.overallScore >= 5
                    ? "border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20"
                    : "border-[#ff0033] bg-red-50 dark:bg-red-900/20"
                }`}
              >
                <span
                  className={`text-5xl font-black ${
                    latestChannelAudit.overallScore >= 7
                      ? "text-green-600 dark:text-green-400"
                      : latestChannelAudit.overallScore >= 5
                      ? "text-yellow-600 dark:text-yellow-400"
                      : "text-[#ff0033]"
                  }`}
                >
                  {Number(latestChannelAudit.overallScore).toFixed(1)}
                </span>
                <span className={`text-xs font-medium ${muted} mt-0.5`}>/ 10</span>
              </div>
              <p className={`text-xs ${muted} mt-4`}>from {fmt(latestChannelAudit.createdAt)}</p>
            </>
          ) : (
            <>
              <div className="w-36 h-36 rounded-full flex flex-col items-center justify-center border-4 border-gray-200 dark:border-[#2a2a2a] bg-gray-50 dark:bg-[#1a1a1a]">
                <span className="text-4xl font-black text-gray-300 dark:text-[#3a3a3a]">—</span>
              </div>
              <p className={`text-xs ${muted} mt-4`}>No channel audit yet</p>
            </>
          )}
          {baselineAudit && (
            <p className={`text-xs ${muted} mt-1`}>
              Baseline:{" "}
              <span className="font-semibold">
                {Number(baselineAudit.overallScore).toFixed(1)}
              </span>
            </p>
          )}
        </div>

        {/* Score Over Time */}
        <div className={`lg:col-span-3 ${card} p-6`}>
          <h2 className={`text-sm font-semibold ${txt} mb-4`}>Score Over Time</h2>
          {chartData.length >= 2 ? (
            <>
              <ResponsiveContainer width="100%" height={170}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis
                    domain={[0, 10]}
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    width={28}
                  />
                  <Tooltip
                    formatter={(v, name) => [
                      typeof v === "number" ? v.toFixed(1) : v,
                      name === "channelScore" ? "Channel Score" : "Video Score",
                    ]}
                    contentStyle={{
                      background: "#1a1a1a",
                      border: "1px solid #2a2a2a",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "#e2e8f0",
                    }}
                    cursor={{ stroke: "#6ba3c7", strokeWidth: 1, strokeDasharray: "4 4" }}
                  />
                  {hasChannelLine && (
                    <Line
                      type="monotone"
                      dataKey="channelScore"
                      stroke="#6ba3c7"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: "#6ba3c7", strokeWidth: 0 }}
                      activeDot={{ r: 6, fill: "#6ba3c7" }}
                      connectNulls
                    />
                  )}
                  {hasVideoLine && (
                    <Line
                      type="monotone"
                      dataKey="videoScore"
                      stroke="#94a3b8"
                      strokeWidth={1.5}
                      strokeDasharray="5 3"
                      dot={{ r: 3, fill: "#94a3b8", strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: "#94a3b8" }}
                      connectNulls
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
              {/* Legend */}
              <div className="flex items-center justify-center gap-5 mt-2">
                {hasChannelLine && (
                  <div className="flex items-center gap-1.5">
                    <svg width="20" height="8" className="shrink-0">
                      <line x1="0" y1="4" x2="20" y2="4" stroke="#6ba3c7" strokeWidth="2.5" />
                    </svg>
                    <span className={`text-xs ${muted}`}>Channel Score</span>
                  </div>
                )}
                {hasVideoLine && (
                  <div className="flex items-center gap-1.5">
                    <svg width="20" height="8" className="shrink-0">
                      <line x1="0" y1="4" x2="20" y2="4" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="5 3" />
                    </svg>
                    <span className={`text-xs ${muted}`}>Video Scores</span>
                  </div>
                )}
              </div>
            </>
          ) : chartData.length === 1 ? (
            <div className="flex flex-col items-center justify-center h-44 text-center">
              <p className={`text-4xl font-black ${txt}`}>
                {(chartData[0].channelScore ?? chartData[0].videoScore ?? 0).toFixed(1)}
              </p>
              <p className={`text-sm ${muted} mt-2`}>
                1 audit completed — more will build the trend line
              </p>
            </div>
          ) : (
            <div className={`flex items-center justify-center h-44 text-sm ${muted}`}>
              No score data yet
            </div>
          )}
        </div>
      </div>

      {/* Recent Video Audits */}
      {(() => {
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
        const recentVideoAudits = (audits ?? []).filter(
          (a: any) => a.auditType === "single_video" && new Date(a.createdAt) >= sixtyDaysAgo
        );
        return (
          <div className={`${card} overflow-hidden`}>
            <div className={`px-5 py-4 border-b border-gray-200 dark:border-[#2a2a2a]`}>
              <h2 className={`text-sm font-semibold ${txt}`}>Recent Video Audits</h2>
              <p className={`text-xs ${muted} mt-0.5`}>Every video is audited for Production and Growth members. Foundations members receive audits when videos are reviewed on live Member Calls.</p>
              <p className={`text-xs font-semibold ${muted} mt-0.5`}>If you'd like your video reviewed DM Jared in Slack with the URL of the last video</p>
            </div>
            {recentVideoAudits.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className={`text-sm font-medium ${txt}`}>No video audits in the last 60 days</p>
                <p className={`text-xs ${muted} mt-1`}>When the Attraction team runs a single video audit, you will see them show up here.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="flex gap-4 px-5 py-4" style={{ minWidth: "max-content" }}>
                  {recentVideoAudits.map((a: any) => {
                    const v = (a.videosAnalysed as any[])?.[0];
                    const videoId = v?.videoId;
                    const thumbUrl = videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : null;
                    const title = v?.title ?? "Untitled Video";
                    return (
                      <Link
                        key={a.id}
                        href={`/member/audits/${a.id}`}
                        className="flex flex-col gap-2 w-52 shrink-0 group"
                      >
                        {thumbUrl ? (
                          <img
                            src={thumbUrl}
                            alt={title}
                            className="w-full rounded-lg object-cover"
                            style={{ aspectRatio: "16/9" }}
                          />
                        ) : (
                          <div
                            className="w-full rounded-lg bg-gray-100 dark:bg-[#2a2a2a]"
                            style={{ aspectRatio: "16/9" }}
                          />
                        )}
                        <div>
                          <p className={`text-xs font-medium ${txt} line-clamp-2 group-hover:text-[#6ba3c7] transition-colors leading-snug`}>
                            {title}
                          </p>
                          <div className="flex items-center justify-between mt-1.5">
                            <span className={`text-xs ${muted}`}>{v?.uploadDate ? fmt(v.uploadDate) : fmt(a.createdAt)}</span>
                            {a.overallScore != null && (
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${scoreBadge(Number(a.overallScore))}`}>
                                {Number(a.overallScore).toFixed(1)}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-[#6ba3c7] font-medium group-hover:underline mt-0.5 inline-block">
                            View Report →
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* 16-Principle Breakdown Table */}
      <div className={`${card} overflow-hidden`}>
        <div className={`px-5 py-4 border-b border-gray-200 dark:border-[#2a2a2a]`}>
          <h2 className={`text-sm font-semibold ${txt}`}>16-Principle Breakdown</h2>
          <p className={`text-xs ${muted} mt-0.5`}>Click any row to see the evidence note from your audit</p>
        </div>
        {principleRows.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className={`text-sm font-medium ${txt}`}>No channel audit data yet</p>
            <p className={`text-xs ${muted} mt-1`}>
              Complete a full channel audit (baseline or monthly) to see your 16-principle breakdown.
            </p>
          </div>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b border-gray-200 dark:border-[#2a2a2a]`}>
                <th className={thClass} style={{ width: "36%" }}>Principle</th>
                <th className={thClass} style={{ width: "20%" }}>Learning Path</th>
                <th className={thClass} style={{ width: "24%" }}>Score</th>
                <th className={thClass} style={{ width: "10%" }}>Current</th>
                {baselineAudit && <th className={thClass} style={{ width: "10%" }}>vs Baseline</th>}
              </tr>
            </thead>
            <tbody className={`divide-y ${divider}`}>
              {principleRows.map(({ key, val, base, delta }) => {
                const isOpen = expanded === key;
                const score = val.score;
                return (
                  <React.Fragment key={key}>
                    <tr
                      onClick={() => setExpanded(isOpen ? null : key)}
                      className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-[#1e2a38] transition-colors ${
                        isOpen ? "bg-gray-50 dark:bg-[#0f1419]" : ""
                      }`}
                    >
                      <td className={`${tdClass} font-medium ${txt}`}>
                        <span className="flex items-center gap-1.5">
                          {PRINCIPLE_LABELS[key] ?? key}
                          {val.evidence && (
                            <span className={`text-xs ${muted}`}>{isOpen ? "▲" : "▼"}</span>
                          )}
                        </span>
                      </td>
                      <td className={`${tdClass} text-xs`}>
                        {principlesWithLessons.has(toAcademySlug(key)) ? (
                          <Link
                            href={`/member/academy?tab=browse&tag=${toAcademySlug(key)}`}
                            className="text-[#6ba3c7] hover:underline font-medium"
                          >
                            See lessons →
                          </Link>
                        ) : (
                          <span className={muted}>{LEARNING_PATH[key] ?? "—"}</span>
                        )}
                      </td>
                      <td className={tdClass}>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 dark:bg-[#0f1419] rounded-full h-1.5 max-w-[120px]">
                            <div
                              className={`h-1.5 rounded-full transition-all ${scoreBarColor(score)}`}
                              style={{ width: score != null ? `${(score / 10) * 100}%` : "0%" }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className={tdClass}>
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBadge(score)}`}
                        >
                          {score != null ? score.toFixed(1) : "—"}
                        </span>
                      </td>
                      {baselineAudit && (
                        <td className={tdClass}>
                          {delta != null ? (
                            <span
                              className={`text-xs font-semibold ${
                                delta > 0
                                  ? "text-green-600 dark:text-green-400"
                                  : delta < 0
                                  ? "text-[#ff0033]"
                                  : muted
                              }`}
                            >
                              {delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)}
                            </span>
                          ) : (
                            <span className={`text-xs ${muted}`}>—</span>
                          )}
                        </td>
                      )}
                    </tr>
                    {isOpen && val.evidence && (
                      <tr className="bg-gray-50 dark:bg-[#0f1419]">
                        <td
                          colSpan={baselineAudit ? 5 : 4}
                          className={`px-5 pb-3 pt-0 text-xs italic ${muted}`}
                        >
                          <div className="border-l-2 border-[#6ba3c7] pl-3 ml-1">
                            {val.evidence}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* Row 3: Learning Path + Audit History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Learning Path */}
        {gaps.length > 0 && (
          <div className={`${card} overflow-hidden`}>
            <div className="px-5 py-4 border-b border-gray-200 dark:border-[#2a2a2a] bg-[#6ba3c7]/5">
              <h2 className={`text-sm font-semibold ${txt}`}>📚 Your Learning Path</h2>
              <p className={`text-xs ${muted} mt-0.5`}>Revisit these lessons to close your gaps</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-[#2a2a2a]">
                  <th className={thClass}>Principle</th>
                  <th className={thClass}>Score</th>
                  <th className={thClass}>Lesson</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${divider}`}>
                {gaps.map(({ key, val }) => (
                  <tr key={key} className="hover:bg-gray-50 dark:hover:bg-[#1e2a38] transition-colors">
                    <td className={`${tdClass} font-medium ${txt}`}>{PRINCIPLE_LABELS[key]}</td>
                    <td className={tdClass}>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBadge(val.score)}`}>
                        {val.score?.toFixed(1)}
                      </span>
                    </td>
                    <td className={`${tdClass} text-xs`}>
                      {principlesWithLessons.has(toAcademySlug(key)) ? (
                        <Link
                          href={`/member/academy?tab=browse&tag=${toAcademySlug(key)}`}
                          className="text-[#6ba3c7] font-semibold hover:underline"
                        >
                          See lessons →
                        </Link>
                      ) : (
                        <span className="text-[#6ba3c7] font-semibold">{LEARNING_PATH[key] ?? "—"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Audit History */}
        <div className={`${card} overflow-hidden ${gaps.length === 0 ? "lg:col-span-2" : ""}`}>
          <div className="px-5 py-4 border-b border-gray-200 dark:border-[#2a2a2a]">
            <h2 className={`text-sm font-semibold ${txt}`}>Audit History</h2>
            <p className={`text-xs ${muted} mt-0.5`}>{audits.length} audit{audits.length !== 1 ? "s" : ""} completed</p>
          </div>
          <div className={`divide-y ${divider}`}>
            {audits.map((a: any) => {
              const isSV = a.auditType === "single_video";
              const v = isSV ? (a.videosAnalysed as any[])?.[0] : null;
              const videoId = v?.videoId;
              const thumbUrl = videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : null;
              const title = isSV ? (v?.title ?? "Single Video") : (a.auditType === "baseline" ? "Baseline Audit" : "Monthly Audit");
              const uploadDate = v?.uploadDate;
              return (
                <Link
                  key={a.id}
                  href={`/member/audits/${a.id}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-[#1e2a38] transition-colors group"
                >
                  {/* Left: thumbnail or type icon */}
                  <div className="shrink-0">
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt={title}
                        className="w-[72px] h-[41px] rounded object-cover"
                      />
                    ) : channelThumbnailUrl ? (
                      <img
                        src={channelThumbnailUrl}
                        alt={channelName ?? "Channel"}
                        className="w-[41px] h-[41px] rounded-full object-cover"
                      />
                    ) : (
                      <div className={`w-[41px] h-[41px] rounded-full flex items-center justify-center text-xs font-bold ${
                        a.auditType === "baseline"
                          ? "bg-[#6ba3c7]/15 text-[#6ba3c7]"
                          : "bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400"
                      }`}>
                        {a.auditType === "baseline" ? "B" : "M"}
                      </div>
                    )}
                  </div>

                  {/* Middle: title + date */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${txt} line-clamp-2 leading-snug group-hover:text-[#6ba3c7] transition-colors`}>
                      {title}
                    </p>
                    <p className={`text-xs ${muted} mt-0.5`}>
                      {uploadDate ? fmt(uploadDate) : fmt(a.createdAt)}
                    </p>
                  </div>

                  {/* Right: score + link */}
                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    {a.overallScore != null ? (
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBadge(Number(a.overallScore))}`}>
                        {Number(a.overallScore).toFixed(1)}
                      </span>
                    ) : (
                      <span className={`text-xs ${muted}`}>—</span>
                    )}
                    <span className="text-xs font-medium text-[#6ba3c7] group-hover:underline whitespace-nowrap">
                      View Report →
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

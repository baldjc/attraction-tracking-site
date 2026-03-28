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
import { ArrowPathIcon } from "@heroicons/react/24/outline";

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
        <h1 className={`text-2xl font-bold ${txt} mb-2`}>My Scores</h1>
        <div className="bg-[#6ba3c7]/10 border border-[#6ba3c7]/30 rounded-lg p-10 text-center">
          <p className={`font-medium ${txt} mb-2`}>No audits yet</p>
          <p className={`text-sm ${muted}`}>
            Your Attraction Scores will appear here after your first audit is completed by your coach.
          </p>
        </div>
      </div>
    );
  }

  const { latestAudit, baselineAudit, audits, channelBannerUrl, channelName, youtubeChannelUrl } = data;
  const scores = (latestAudit.scores ?? {}) as Record<string, { score: number | null; evidence?: string }>;
  const baselineScores = (baselineAudit?.scores as any) ?? null;

  const chartData = [...(audits ?? [])]
    .reverse()
    .filter((a: any) => a.overallScore != null)
    .map((a: any) => ({
      date: new Date(a.createdAt).toLocaleDateString("en-CA", { month: "short", day: "numeric" }),
      score: parseFloat(Number(a.overallScore).toFixed(1)),
    }));

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

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-2xl font-bold ${txt}`}>My Scores</h1>
          <p className={`text-sm ${muted} mt-0.5`}>Your Attraction Score breakdown across all 16 principles</p>
        </div>
        <button
          onClick={load}
          className={`flex items-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-[#2a2a2a] rounded-lg text-sm ${txt} hover:bg-gray-50 dark:hover:bg-[#1e2a38] transition-colors`}
        >
          <ArrowPathIcon className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Row 1: Score Hero + Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Overall Score */}
        <div className={`lg:col-span-2 ${card} p-6 flex flex-col items-center justify-center text-center`}>
          <p className={`text-xs font-semibold uppercase tracking-widest ${muted} mb-3`}>
            Current Attraction Score
          </p>
          <div
            className={`w-36 h-36 rounded-full flex flex-col items-center justify-center border-4 ${
              latestAudit.overallScore >= 7
                ? "border-green-400 bg-green-50 dark:bg-green-900/20"
                : latestAudit.overallScore >= 5
                ? "border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20"
                : "border-[#ff0033] bg-red-50 dark:bg-red-900/20"
            }`}
          >
            <span
              className={`text-5xl font-black ${
                latestAudit.overallScore >= 7
                  ? "text-green-600 dark:text-green-400"
                  : latestAudit.overallScore >= 5
                  ? "text-yellow-600 dark:text-yellow-400"
                  : "text-[#ff0033]"
              }`}
            >
              {Number(latestAudit.overallScore).toFixed(1)}
            </span>
            <span className={`text-xs font-medium ${muted} mt-0.5`}>/ 10</span>
          </div>
          <p className={`text-xs ${muted} mt-4`}>from {fmt(latestAudit.createdAt)}</p>
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
            <ResponsiveContainer width="100%" height={180}>
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
                  formatter={(v) => [typeof v === "number" ? v.toFixed(1) : v, "Score"]}
                  contentStyle={{
                    background: "#1a1a1a",
                    border: "1px solid #2a2a2a",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "#e2e8f0",
                  }}
                  cursor={{ stroke: "#6ba3c7", strokeWidth: 1, strokeDasharray: "4 4" }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#6ba3c7"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#6ba3c7", strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: "#6ba3c7" }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : chartData.length === 1 ? (
            <div className="flex flex-col items-center justify-center h-44 text-center">
              <p className={`text-4xl font-black ${txt}`}>{chartData[0].score.toFixed(1)}</p>
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
              <p className={`text-xs ${muted} mt-0.5`}>Single video audits from the last 60 days</p>
            </div>
            {recentVideoAudits.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className={`text-sm font-medium ${txt}`}>No video audits in the last 60 days</p>
                <p className={`text-xs ${muted} mt-1`}>Run a single video audit to see how individual videos score.</p>
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
                            <span className={`text-xs ${muted}`}>{fmt(a.createdAt)}</span>
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-[#2a2a2a]">
                <th className={thClass}>Date</th>
                <th className={thClass}>Type</th>
                <th className={thClass}>Score</th>
                <th className={thClass}>Action</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${divider}`}>
              {audits.map((a: any) => (
                <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-[#1e2a38] transition-colors">
                  <td className={`${tdClass} ${muted}`}>{fmt(a.createdAt)}</td>
                  <td className={`${tdClass} ${txt}`}>
                    {a.auditType === "single_video" ? (() => {
                      const v = (a.videosAnalysed as any[])?.[0];
                      const videoId = v?.videoId;
                      const thumbUrl = videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : null;
                      const title = v?.title ?? "Single Video";
                      return (
                        <div className="flex items-center gap-2">
                          {thumbUrl && (
                            <img
                              src={thumbUrl}
                              alt={title}
                              className="w-[60px] h-[34px] rounded object-cover shrink-0"
                            />
                          )}
                          <span className="truncate max-w-[180px] text-sm">{title}</span>
                        </div>
                      );
                    })() : (
                      <span className="capitalize">{a.auditType.replace(/_/g, " ")}</span>
                    )}
                  </td>
                  <td className={tdClass}>
                    {a.overallScore != null ? (
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBadge(Number(a.overallScore))}`}>
                        {Number(a.overallScore).toFixed(1)}
                      </span>
                    ) : (
                      <span className={`text-xs ${muted}`}>—</span>
                    )}
                  </td>
                  <td className={tdClass}>
                    <Link
                      href={`/member/audits/${a.id}`}
                      className="text-xs font-medium text-[#6ba3c7] hover:underline"
                    >
                      View Report →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";

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
  grade_5_language: "N/A (practice-based)",
  consistency: "Lessons 1.3 + 2.4",
};

const QA_ALWAYS: Record<string, string> = {
  lead_magnet_system: "Bring your lead magnet draft for feedback",
  avatar_clarity: "Bring your napkin test for review",
  connection_language: "Bring your next script for review",
  approve_the_click: "Bring your next 3 title/hook combos",
  curiosity_bridges: "Bring a recent script — we'll rewrite transitions live",
};

const QA_IF_LOW: Record<string, string> = {
  arc_attention: "Bring your most recent opening",
  arc_revelation: "Bring one insight — we'll Value Loop it",
  values_peppering: "Share 5 personal values/interests",
  story_proof: "Bring a client story to structure",
  title_frameworks: "Bring your next 5 title ideas",
};

const DIMENSIONS = [
  { label: "🎯 Channel Strategy", keys: ["avatar_clarity", "themes_over_topics", "consistency"] },
  { label: "🎬 Content Impact", keys: ["arc_attention", "arc_revelation", "arc_connection", "title_frameworks", "approve_the_click", "curiosity_bridges"] },
  { label: "📊 Transcript Estimated", keys: ["show_dont_tell"] },
  { label: "🤝 Viewer Connection", keys: ["connection_language", "values_peppering", "story_proof", "grade_5_language"] },
  { label: "📈 Lead Generation", keys: ["lead_magnet_system", "binge_architecture"] },
];

function scoreBg(score: number) {
  if (score >= 7) return "bg-[#e8f7ff] text-[#0ea5d9]";
  if (score >= 5) return "bg-[#fef3c7] text-amber-700";
  return "bg-[#ffe5ea] text-[#cc0029]";
}

function scoreBgBlock(score: number) {
  if (score >= 7) return "bg-[#e8f7ff]";
  if (score >= 5) return "bg-[#fef3c7]";
  return "bg-[#ffe5ea]";
}

function scoreText(score: number) {
  if (score >= 7) return "text-[#0ea5d9]";
  if (score >= 5) return "text-amber-600";
  return "text-[#cc0029]";
}

function priority(score: number) {
  if (score < 4) return { label: "Critical", cls: "bg-[#ffe5ea] text-[#cc0029]" };
  if (score < 6.5) return { label: "Improvement Area", cls: "bg-[#fef3c7] text-amber-700" };
  return { label: "Fine-Tuning", cls: "bg-[#e8f7ff] text-[#0ea5d9]" };
}

function fmt(d: any) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
}

function fmtDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function SharedReportPage() {
  const params = useParams();
  const auditId = params.auditId as string;

  const [audit, setAudit] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/audits/${auditId}`);
    if (!res.ok) {
      setError(res.status === 403 ? "You don't have access to this report." : "Report not found.");
      setLoading(false);
      return;
    }
    const d = await res.json();
    setAudit(d.audit ?? d);
    setLoading(false);
  }, [auditId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f1f1ef]">
      <p className="text-[#1e2a38]/40">Loading report…</p>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f1f1ef]">
      <div className="text-center">
        <p className="text-[#1e2a38]/60 mb-2">{error}</p>
        <a href="/login" className="text-sm text-[#3dc3ff] hover:underline">Sign in to view this report</a>
      </div>
    </div>
  );

  if (!audit) return null;

  const report = audit.reportContent as any;
  console.log("[SharedReport] reportContent keys:", report ? Object.keys(report) : "null/undefined", "| audit.scores:", audit.scores);
  const rawScores = audit.scores ?? report?.audit_results ?? report?.scores ?? null;
  const scores = (rawScores ?? {}) as Record<string, { score: number; evidence?: string }>;
  const hasScores = Object.keys(scores).length > 0;
  const videos = (audit.videosAnalysed as any[]) ?? [];
  const member = audit.user;
  const baselineScores = report?.baselineScores as any;
  const channelInfo = report?.channelInfo;
  const isSingleVideo = audit.auditType === "single_video";
  const isMonthly = audit.auditType === "monthly";

  const typeLabel = audit.auditType === "baseline" ? "Baseline Audit"
    : audit.auditType === "monthly" ? "Monthly Audit"
    : "Single Video Audit";

  const whatsWorking: Array<{ strength: string; evidence: string }> =
    report?.whats_working?.length > 0
      ? report.whats_working
      : (report?.strengths ?? []).map((s: string) => ({ strength: s, evidence: "" }));

  const biggestGaps: Array<{ principle: string; score: number; description: string; current_example: string; improved_example: string }> =
    report?.three_biggest_gaps?.length > 0
      ? report.three_biggest_gaps
      : (report?.biggest_gaps ?? []).map((g: string, i: number) => ({
          principle: `Gap ${i + 1}`,
          score: 0,
          description: g,
          current_example: "",
          improved_example: "",
        }));

  const learningGaps = Object.entries(scores)
    .filter(([, v]: [string, any]) => v.score < 7)
    .sort(([, a]: [string, any], [, b]: [string, any]) => a.score - b.score);

  const qaItems: Array<{ key: string; prompt: string; score: number }> = [];
  for (const key of Object.keys(QA_ALWAYS)) {
    if (scores[key]) qaItems.push({ key, prompt: QA_ALWAYS[key], score: scores[key].score });
  }
  for (const key of Object.keys(QA_IF_LOW)) {
    if (scores[key] && scores[key].score >= 4 && scores[key].score <= 6) {
      qaItems.push({ key, prompt: QA_IF_LOW[key], score: scores[key].score });
    }
  }

  return (
    <div className="min-h-screen bg-[#f1f1ef] py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6" id="audit-report">

        {/* Top bar */}
        <div className="flex items-center justify-between no-print">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#1e2a38] tracking-tight">Attraction by Video</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.href).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-[#1e2a38]/70 transition-colors"
            >
              {copied ? "Copied!" : "Copy Link"}
            </button>
            <button
              onClick={() => window.print()}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-[#1e2a38]/70 transition-colors"
            >
              Print / PDF
            </button>
          </div>
        </div>

        {/* Print logo */}
        <div className="hidden print:block text-center py-4 border-b border-gray-200">
          <p className="text-lg font-black text-[#1e2a38] tracking-tight">Attraction by Video</p>
          <p className="text-xs text-[#1e2a38]/50">YouTube Channel Audit Report</p>
        </div>

        {/* Banner */}
        {channelInfo?.bannerUrl ? (
          <div className="w-full h-28 rounded-xl overflow-hidden">
            <img src={channelInfo.bannerUrl} alt="Channel banner" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="h-28 rounded-xl bg-gradient-to-r from-[#1e2a38] via-[#2c4a6e] to-[#3dc3ff]" />
        )}

        {/* Header callout */}
        <div className="bg-[#3dc3ff]/10 border border-[#3dc3ff]/30 rounded-xl p-6">
          <p className="text-xs font-semibold text-[#3dc3ff] uppercase tracking-wider mb-1">
            Attraction by Video — {typeLabel}
          </p>
          <h1 className="text-2xl font-bold text-[#1e2a38]">{member?.fullName ?? member?.email}</h1>
          {(member?.youtubeChannelName || channelInfo?.title) && (
            <p className="text-[#1e2a38]/60 mt-1">
              {member?.youtubeChannelName || channelInfo?.title}
            </p>
          )}
          <p className="text-sm text-[#1e2a38]/50 mt-1">{fmt(audit.createdAt)}</p>
        </div>

        {/* Diagnosis */}
        {report?.one_sentence_diagnosis && (
          <div className="bg-[#1e2a38] rounded-xl p-5">
            <p className="text-xs font-semibold text-[#3dc3ff] uppercase tracking-wider mb-2">Diagnosis</p>
            <p className="text-base font-medium text-white leading-relaxed italic">
              "{report.one_sentence_diagnosis}"
            </p>
          </div>
        )}

        {/* Score */}
        <div className={`rounded-xl p-8 text-center ${scoreBgBlock(audit.overallScore)}`}>
          <p className="text-sm font-semibold uppercase tracking-wider mb-2 text-[#1e2a38]/60">
            {isSingleVideo ? "Video Attraction Score" : "Channel Attraction Score"}
          </p>
          <p className={`text-7xl font-black ${scoreText(audit.overallScore)}`}>
            {audit.overallScore?.toFixed(1)}
          </p>
          <p className="text-lg font-medium mt-1 text-[#1e2a38]/50">/ 10</p>
          {report?.raw_average != null && (
            <p className="text-xs text-[#1e2a38]/40 mt-2">Raw Average: {Number(report.raw_average).toFixed(1)} / 10</p>
          )}
        </div>

        {/* Monthly summary */}
        {isMonthly && baselineScores && (() => {
          const baseAvg = Object.values(baselineScores).reduce((a: any, b: any) => a + b.score, 0) / Object.keys(baselineScores).length;
          const delta = audit.overallScore - baseAvg;
          return (
            <div className="bg-[#3dc3ff]/10 border border-[#3dc3ff]/30 rounded-xl p-5 text-center">
              <p className="text-sm font-semibold text-[#1e2a38]">
                This Month: {audit.overallScore?.toFixed(1)}/10 &nbsp;·&nbsp;{" "}
                <span className={delta >= 0 ? "text-green-600" : "text-[#cc0029]"}>
                  {delta >= 0 ? "↑" : "↓"}{Math.abs(delta).toFixed(1)} from baseline ({baseAvg.toFixed(1)} → {audit.overallScore?.toFixed(1)})
                </span>
              </p>
            </div>
          );
        })()}

        {/* Scorecard */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-base font-semibold text-[#1e2a38] mb-4">16-Principle Scorecard</h2>
          {!hasScores ? (
            <p className="text-sm text-[#1e2a38]/50 italic">Score data unavailable for this audit.</p>
          ) : (
          <div className="space-y-4">
            {DIMENSIONS.map((dim) => (
              <div key={dim.label}>
                <h3 className="text-sm font-bold text-[#1e2a38] uppercase tracking-wide mb-2">{dim.label}</h3>
                <div className="space-y-1">
                  {dim.keys.filter((k) => scores[k]).map((key) => {
                    const val = scores[key];
                    return (
                      <div key={key} className="flex items-center justify-between py-1.5 px-3 rounded-lg">
                        <span className="text-sm text-[#1e2a38]">{PRINCIPLE_LABELS[key]}</span>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(val.score)}`}>
                          {val.score.toFixed(1)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          )}
        </div>

        {/* Videos Analysed */}
        {videos.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-[#1e2a38] mb-4">Videos Analysed</h2>
            <div className="space-y-3">
              {videos.map((v: any, i: number) => {
                const breakdown =
                  report?.video_breakdowns?.[i] ??
                  report?.video_breakdowns?.find(
                    (b: any) => b.video_id === v.videoId || b.title?.trim().toLowerCase() === v.title?.trim().toLowerCase()
                  );
                const dimScores = breakdown?.dimension_scores;
                const strong = breakdown?.strength ?? breakdown?.opening_analysis;
                const improve = breakdown?.improvement ?? breakdown?.insights_analysis;

                function dimBadge(score: number | undefined, label: string) {
                  if (score == null) return null;
                  const bg = score >= 7 ? "bg-[#e8f7ff] text-[#0ea5d9]" : score >= 5 ? "bg-[#fef3c7] text-amber-700" : "bg-[#ffe5ea] text-[#cc0029]";
                  return <span key={label} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${bg}`}>{label} {score.toFixed(1)}</span>;
                }

                return (
                  <div key={i} className="border border-gray-100 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <a href={`https://youtube.com/watch?v=${v.videoId}`} target="_blank" rel="noopener noreferrer"
                        className="text-sm font-medium text-[#3dc3ff] hover:underline flex items-center gap-1">
                        {v.title}
                        <ArrowTopRightOnSquareIcon className="w-3 h-3 shrink-0 no-print" />
                      </a>
                      <span className="text-xs text-[#1e2a38]/40 whitespace-nowrap shrink-0">
                        {fmtDuration(v.durationSeconds)} · {fmt(v.uploadDate)}
                      </span>
                    </div>
                    {dimScores && (
                      <div className="flex flex-wrap gap-1.5 mt-2 mb-1">
                        {dimBadge(dimScores.channel_strategy, "🎯")}
                        {dimBadge(dimScores.content_impact, "🎬")}
                        {dimBadge(dimScores.viewer_connection, "🤝")}
                        {dimBadge(dimScores.lead_generation, "📈")}
                      </div>
                    )}
                    {strong && <p className="text-xs text-[#1e2a38]/70 mt-1"><span className="mr-1">✅</span>{strong}</p>}
                    {improve && <p className="text-xs text-[#1e2a38]/70 mt-1"><span className="mr-1">⚠️</span>{improve}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* What's Working */}
        {whatsWorking.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-6">
            <h2 className="text-base font-semibold text-green-800 mb-3">✅ What&apos;s Working</h2>
            <div className="space-y-3">
              {whatsWorking.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="mt-1 text-green-500 shrink-0">•</span>
                  <div>
                    <p className="text-sm text-green-800 font-medium">{item.strength}</p>
                    {item.evidence && <p className="text-xs text-green-700/70 mt-0.5 italic">"{item.evidence}"</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Three Biggest Gaps */}
        {biggestGaps.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-[#1e2a38] mb-4">🎯 Three Biggest Gaps</h2>
            <div className="space-y-5">
              {biggestGaps.map((gap, i) => (
                <div key={i} className="border-l-4 border-[#ff0033] pl-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-[#ff0033]/10 text-[#ff0033] text-xs font-bold px-2 py-0.5 rounded-full">{i + 1}</span>
                    <span className="text-sm font-bold text-[#1e2a38]">{gap.principle}</span>
                    {gap.score > 0 && (
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(gap.score)}`}>
                        {gap.score.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[#1e2a38]/80 mb-3 leading-relaxed">{gap.description}</p>
                  {gap.current_example && (
                    <div className="space-y-2">
                      <div className="bg-[#ffe5ea] rounded-lg px-3 py-2">
                        <p className="text-xs font-semibold text-[#ff0033] mb-1">Current</p>
                        <p className="text-xs text-[#1e2a38]/80 italic">"{gap.current_example}"</p>
                      </div>
                      {gap.improved_example && (
                        <div className="bg-[#e8f7ff] rounded-lg px-3 py-2">
                          <p className="text-xs font-semibold text-[#3dc3ff] mb-1">Improved</p>
                          <p className="text-xs text-[#1e2a38]/80 italic">"{gap.improved_example}"</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Learning Path */}
        {learningGaps.length > 0 && (
          <div className="bg-[#3dc3ff]/10 border border-[#3dc3ff]/30 rounded-xl p-6">
            <h2 className="text-base font-semibold text-[#1e2a38] mb-1">📚 Learning Path</h2>
            <p className="text-xs text-[#1e2a38]/50 mb-4">Principles below 7 — sorted by priority</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#3dc3ff]/20">
                    <th className="text-left py-2 pr-3 text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wider">Principle</th>
                    <th className="text-center py-2 px-2 text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wider">Score</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wider">Lesson</th>
                    <th className="text-center py-2 pl-2 text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wider">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {learningGaps.map(([key, val]: [string, any]) => {
                    const p = priority(val.score);
                    return (
                      <tr key={key} className="border-b border-[#3dc3ff]/10 last:border-0">
                        <td className="py-2 pr-3 text-[#1e2a38] font-medium">{PRINCIPLE_LABELS[key]}</td>
                        <td className="py-2 px-2 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(val.score)}`}>{val.score.toFixed(1)}</span>
                        </td>
                        <td className="py-2 px-2 text-xs text-[#1e2a38]/70">{LEARNING_PATH[key]}</td>
                        <td className="py-2 pl-2 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${p.cls}`}>{p.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Q&A Topics */}
        {qaItems.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-[#1e2a38] mb-1">❓ Q&amp;A Topics for Coaching Call</h2>
            <p className="text-xs text-[#1e2a38]/50 mb-4">Bring these to your next call</p>
            <div className="space-y-2">
              {qaItems.map((item, i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                  <span className="w-2 h-2 rounded-full bg-[#3dc3ff] mt-1.5 shrink-0" />
                  <div className="flex-1">
                    <span className="text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wide mr-2">
                      {PRINCIPLE_LABELS[item.key]} ({item.score.toFixed(1)}):
                    </span>
                    <span className="text-sm text-[#1e2a38]/80">{item.prompt}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-6 text-sm text-[#1e2a38]/40 border-t border-gray-200">
          Prepared for {member?.fullName ?? member?.email} by Jared Chamberlain ~ Founder of Attraction by Video
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  TrashIcon,
  ClipboardDocumentIcon,
  PrinterIcon,
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

function deltaColor(d: number) {
  if (d > 0) return "text-green-600";
  if (d < 0) return "text-[#cc0029]";
  return "text-gray-400";
}

function deltaCellBg(d: number | null) {
  if (d == null) return "";
  if (d > 1) return "bg-green-50";
  if (d < -1) return "bg-red-50";
  return "";
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

export default function AuditReportPage() {
  const params = useParams();
  const router = useRouter();
  const auditId = params.auditId as string;

  const [audit, setAudit] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expandedPrinciple, setExpandedPrinciple] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/audits/${auditId}`);
    if (res.ok) {
      const d = await res.json();
      setAudit(d.audit ?? d);
    }
    setLoading(false);
  }, [auditId]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete() {
    if (!confirm("Delete this audit? This cannot be undone.")) return;
    setDeleting(true);
    await fetch(`/api/audits/${auditId}`, { method: "DELETE" });
    router.push(audit?.user?.id ? `/admin/members/${audit.user.id}` : "/admin/members");
  }

  function handleCopyLink() {
    const url = `${window.location.origin}/reports/${auditId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handlePrint() {
    window.print();
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-[#2f3437]/40">Loading report…</div>;
  if (!audit) return <div className="text-center py-20 text-[#2f3437]/50">Report not found.</div>;

  const report = audit.reportContent as any;
  console.log("[AuditReport] reportContent keys:", report ? Object.keys(report) : "null/undefined", "| audit.scores:", audit.scores);
  const rawScores = audit.scores ?? report?.audit_results ?? report?.scores ?? null;
  const scores = (rawScores ?? {}) as Record<string, { score: number; evidence?: string }>;
  const hasScores = Object.keys(scores).length > 0;
  const videos = (audit.videosAnalysed as any[]) ?? [];
  const member = audit.user;
  const baselineScores = report?.baselineScores as any;
  const lastMonthScores = report?.lastMonthScores as any;
  const channelInfo = report?.channelInfo;
  const isSingleVideo = audit.auditType === "single_video";
  const isMonthly = audit.auditType === "monthly";
  const isLead = audit.auditType === "lead";
  const singleVideoTitle = isSingleVideo ? (videos[0]?.title ?? null) : null;
  const phaseReport = report?.phase_report as any;

  const typeLabel = audit.auditType === "baseline" ? "Baseline Audit"
    : audit.auditType === "monthly" ? "Monthly Audit"
    : isLead ? "Lead Audit"
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
    .filter(([key, v]: [string, any]) => key !== "show_dont_tell" && v.score != null && v.score < 7)
    .sort(([, a]: [string, any], [, b]: [string, any]) => (a.score ?? 0) - (b.score ?? 0));

  const qaItems: Array<{ key: string; prompt: string; score: number }> = [];
  for (const key of Object.keys(QA_ALWAYS)) {
    if (scores[key]) qaItems.push({ key, prompt: QA_ALWAYS[key], score: scores[key].score });
  }
  for (const key of Object.keys(QA_IF_LOW)) {
    if (scores[key] && scores[key].score >= 4 && scores[key].score <= 6) {
      qaItems.push({ key, prompt: QA_IF_LOW[key], score: scores[key].score });
    }
  }

  // ----- LEAD AUDIT VIEW -----
  // Non-members see a thinner report: orange branding, problems + cost + which
  // membership asset solves it. No improved_example, no per-video deep dive,
  // no learning path, no Q&A. Closes with a conversion narrative + CTAs.
  if (isLead) {
    const leadGaps: Array<{
      principle: string;
      score: number;
      description: string;
      current_example: string;
      what_this_costs_you?: string;
      inside_attraction?: string;
    }> = report?.three_biggest_gaps ?? [];
    const conversionNarrative: string = report?.conversion_narrative ?? "";
    const leadVideoBreakdowns: any[] = report?.video_breakdowns ?? [];

    function leadDimBadge(score: number | undefined, label: string) {
      if (score == null) return null;
      const bg =
        score >= 7
          ? "bg-[#e8f7ff] text-[#0ea5d9]"
          : score >= 5
          ? "bg-[#fef3c7] text-amber-700"
          : "bg-[#ffe5ea] text-[#cc0029]";
      return (
        <span key={label} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${bg}`}>
          {label} {score.toFixed(1)}
        </span>
      );
    }

    return (
      <div className="max-w-4xl space-y-4 md:space-y-5 print-full-width" id="audit-report">
        {/* Top nav */}
        <div className="flex items-center justify-between no-print">
          <Link
            href={member?.id ? `/admin/members/${member.id}` : "/admin/leads"}
            className="inline-flex items-center gap-1.5 text-sm text-[#2f3437]/50 hover:text-[#2f3437]"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back to {member?.fullName ?? "Lead"}
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-[#2f3437]/70 transition-colors"
            >
              <ClipboardDocumentIcon className="w-4 h-4" />
              {copied ? "Copied!" : "Share Report"}
            </button>
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-[#2f3437]/70 transition-colors"
            >
              <PrinterIcon className="w-4 h-4" />
              Print / PDF
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 text-sm text-[#ff0033]/60 hover:text-[#ff0033] disabled:opacity-40 transition-colors"
            >
              <TrashIcon className="w-4 h-4" />
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>

        {/* Print-only logo header */}
        <div className="hidden print:block text-center py-4 border-b border-gray-200 mb-2">
          <p className="text-lg font-black text-[#2f3437] tracking-tight">Attraction by Video</p>
          <p className="text-xs text-[#2f3437]/50">Lead Audit — for {member?.fullName ?? member?.email}</p>
        </div>

        {/* Orange banner header */}
        <div className="rounded-lg overflow-hidden bg-gradient-to-r from-amber-500 via-orange-500 to-orange-600 p-6 print-avoid-break text-white">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-block px-2 py-0.5 rounded-full bg-white/20 text-white text-[11px] font-bold uppercase tracking-wider">
              Lead Audit
            </span>
            <span className="text-xs text-white/80">For {member?.fullName ?? member?.email}</span>
          </div>
          <h1 className="text-2xl font-bold leading-tight">Where Your Channel Is Today</h1>
          {(member?.youtubeChannelName || channelInfo?.title || member?.youtubeHandle) && (
            <p className="text-white/90 mt-1">
              {member?.youtubeChannelName || channelInfo?.title || member?.youtubeHandle}
            </p>
          )}
          <p className="text-xs text-white/70 mt-2">{fmt(audit.createdAt)}</p>
        </div>

        {/* Score + diagnosis */}
        <div className="flex flex-col md:flex-row gap-4 print-avoid-break">
          <div className={`rounded-lg p-5 text-center md:w-44 shrink-0 ${scoreBgBlock(audit.overallScore)}`}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-1 text-[#2f3437]/60">Channel Score</p>
            <p className={`text-6xl font-black ${scoreText(Number(audit.overallScore))}`}>
              {audit.overallScore != null ? Number(audit.overallScore).toFixed(1) : "—"}
            </p>
            <p className="text-sm font-medium mt-0.5 text-[#2f3437]/50">/ 10</p>
          </div>
          <div className="flex-1 bg-white rounded-lg border border-gray-200 p-5 flex items-center">
            <p className="text-base text-[#2f3437] leading-relaxed">
              {report?.one_sentence_diagnosis ?? "Diagnosis pending."}
            </p>
          </div>
        </div>

        {/* What's working — 2 strengths only */}
        {whatsWorking.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 print-avoid-break">
            <h2 className="text-base font-semibold text-green-800 mb-3">✅ What&apos;s Working</h2>
            <div className="space-y-3">
              {whatsWorking.slice(0, 2).map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="mt-1 text-green-500 shrink-0">•</span>
                  <div>
                    <p className="text-sm text-green-800 font-medium">{item.strength}</p>
                    {item.evidence && (
                      <p className="text-xs text-green-700/70 mt-0.5 italic">"{item.evidence}"</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Three biggest problems — current + cost + inside attraction */}
        {leadGaps.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-base font-semibold text-[#2f3437] mb-4">🎯 Three Biggest Problems</h2>
            <div className="space-y-6">
              {leadGaps.map((gap, i) => (
                <div key={i} className="border-l-4 border-orange-500 pl-4 print-avoid-break">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">{i + 1}</span>
                    <span className="text-sm font-bold text-[#2f3437]">{gap.principle}</span>
                    {gap.score > 0 && (
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(gap.score)}`}>
                        {gap.score.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[#2f3437]/80 mb-3 leading-relaxed">{gap.description}</p>

                  {gap.current_example && (
                    <div className="bg-[#ffe5ea] rounded-lg px-3 py-2 mb-2">
                      <p className="text-xs font-semibold text-[#ff0033] mb-1">Current</p>
                      <p className="text-xs text-[#2f3437]/80 italic">"{gap.current_example}"</p>
                    </div>
                  )}

                  {gap.what_this_costs_you && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
                      <p className="text-xs font-semibold text-amber-800 mb-1">What this costs you</p>
                      <p className="text-xs text-[#2f3437]/80">{gap.what_this_costs_you}</p>
                    </div>
                  )}

                  {gap.inside_attraction && (
                    <div className="bg-[#e8f7ff] border border-[#6ba3c7]/30 rounded-lg px-3 py-2">
                      <p className="text-xs font-semibold text-[#0ea5d9] mb-1">Inside Attraction by Video</p>
                      <p className="text-xs text-[#2f3437]/80">{gap.inside_attraction}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 16-Principle Scorecard — full breakdown with Inside Attraction chips */}
        {hasScores && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 print-page-break print-avoid-break">
            <h2 className="text-base font-semibold text-[#2f3437] mb-1">Your Attraction Score — 16 Principles</h2>
            <p className="text-xs text-[#2f3437]/50 mb-4">Every low score below has a specific tool or training inside Attraction by Video that addresses it.</p>
            <div className="space-y-4">
              {DIMENSIONS.map((dim) => (
                <div key={dim.label}>
                  <h3 className="text-sm font-bold text-[#2f3437] uppercase tracking-wide mb-2 pt-1">{dim.label}</h3>
                  <div className="space-y-1.5">
                    {dim.keys.filter((k) => scores[k]).map((key) => {
                      const val = scores[key] as { score: number | null; evidence?: string; inside_attraction?: string };
                      const isNA = val.score == null;
                      const pct = isNA ? 0 : Math.max(0, Math.min(100, (val.score ?? 0) * 10));
                      const barColor =
                        isNA ? "bg-gray-200"
                        : (val.score ?? 0) >= 7 ? "bg-[#0ea5d9]"
                        : (val.score ?? 0) >= 5 ? "bg-amber-400"
                        : "bg-[#cc0029]";
                      return (
                        <div key={key} className="rounded-lg border border-gray-100 p-3 print-avoid-break">
                          <div className="flex items-center gap-3">
                            <span className={`flex-1 text-sm font-medium ${isNA ? "text-[#2f3437]/40" : "text-[#2f3437]"}`}>
                              {PRINCIPLE_LABELS[key] ?? key}
                            </span>
                            <span className="w-14 text-right">
                              {isNA
                                ? <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-400">N/A</span>
                                : <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(val.score!)}`}>{val.score!.toFixed(1)}</span>
                              }
                            </span>
                          </div>
                          <div className="mt-2 h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
                          </div>
                          {val.evidence && (
                            <p className="text-xs text-[#2f3437]/65 mt-2 leading-relaxed">{val.evidence}</p>
                          )}
                          {val.inside_attraction && (
                            <div className="mt-2 inline-flex items-start gap-1.5 bg-[#e8f7ff] border border-[#6ba3c7]/30 rounded-md px-2 py-1">
                              <span className="text-[10px] font-bold text-[#0ea5d9] uppercase tracking-wider mt-0.5 shrink-0">Inside Attraction →</span>
                              <span className="text-[11px] text-[#2f3437]/80">{val.inside_attraction}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Videos Analysed — observation-only video cards */}
        {videos.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 print-page-break">
            <h2 className="text-base font-semibold text-[#2f3437] mb-4">Videos Analysed</h2>
            <div className="space-y-4">
              {videos.map((v: any, i: number) => {
                const breakdown =
                  leadVideoBreakdowns[i] ??
                  leadVideoBreakdowns.find(
                    (b: any) =>
                      b.video_id === v.videoId ||
                      b.title?.trim().toLowerCase() === v.title?.trim().toLowerCase()
                  );
                const dimScores = breakdown?.dimension_scores as {
                  channel_strategy?: number;
                  content_impact?: number;
                  viewer_connection?: number;
                  lead_generation?: number;
                } | undefined;

                return (
                  <div key={i} className="border border-gray-100 rounded-lg p-4 print-avoid-break">
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                      <a
                        href={`https://youtube.com/watch?v=${v.videoId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-semibold text-[#6ba3c7] hover:underline flex items-center gap-1"
                      >
                        {v.title}
                        <ArrowTopRightOnSquareIcon className="w-3 h-3 shrink-0 no-print" />
                      </a>
                      <span className="text-xs text-[#2f3437]/40 whitespace-nowrap">
                        {fmtDuration(v.durationSeconds)} · {fmt(v.uploadDate)} · {v.viewCount?.toLocaleString()} views
                      </span>
                    </div>
                    {!v.hadTranscript && (
                      <p className="text-xs text-amber-500 mb-1">(no transcript available)</p>
                    )}
                    {dimScores && (
                      <div className="flex flex-wrap gap-1.5 mt-2 mb-2">
                        {leadDimBadge(dimScores.channel_strategy, "🎯 Strategy")}
                        {leadDimBadge(dimScores.content_impact, "🎬 Content")}
                        {leadDimBadge(dimScores.viewer_connection, "🤝 Connection")}
                        {leadDimBadge(dimScores.lead_generation, "📈 Lead Gen")}
                      </div>
                    )}
                    {breakdown?.whats_working && (
                      <p className="text-xs text-[#2f3437]/75 mt-1">
                        <span className="mr-1 text-green-500">✅</span>{breakdown.whats_working}
                      </p>
                    )}
                    {breakdown?.whats_missing && (
                      <p className="text-xs text-[#2f3437]/75 mt-1">
                        <span className="mr-1 text-amber-500">⚠️</span>{breakdown.whats_missing}
                      </p>
                    )}
                    {breakdown?.inside_attraction && (
                      <div className="mt-3 bg-[#e8f7ff] border border-[#6ba3c7]/30 rounded-md px-2.5 py-1.5">
                        <span className="text-[10px] font-bold text-[#0ea5d9] uppercase tracking-wider">Inside Attraction → </span>
                        <span className="text-[11px] text-[#2f3437]/80">{breakdown.inside_attraction}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Video Deep Dive — observational OPENING / INSIGHTS / CONNECTION */}
        {leadVideoBreakdowns.some((v: any) => v.opening_analysis || v.insights_analysis || v.connection_analysis) && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-base font-semibold text-[#2f3437] mb-4">🔍 Video Deep Dive</h2>
            <div className="space-y-6">
              {leadVideoBreakdowns.map((v: any, i: number) => (
                <div key={i} className="border-l-4 border-orange-500 pl-4 print-avoid-break">
                  <h3 className="font-semibold text-[#2f3437] mb-3">"{v.title}"</h3>
                  {[
                    { label: "Opening", text: v.opening_analysis },
                    { label: "Insights", text: v.insights_analysis },
                    { label: "Connection", text: v.connection_analysis },
                  ].map(({ label, text }) => text && (
                    <div key={label} className="mb-2">
                      <span className="text-[10px] font-bold text-[#2f3437]/50 uppercase tracking-wider block">{label}</span>
                      <span className="text-sm text-[#2f3437]/80">{text}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Conversion narrative + CTAs */}
        {conversionNarrative && (
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-orange-200 rounded-lg p-6 print-avoid-break">
            <h2 className="text-base font-semibold text-[#2f3437] mb-3">Where to go from here</h2>
            <p className="text-sm text-[#2f3437]/85 leading-relaxed whitespace-pre-line">{conversionNarrative}</p>
            <div className="mt-5 flex flex-wrap gap-3 no-print">
              <a
                href={`mailto:${member?.email ?? ""}?subject=${encodeURIComponent("Your Attraction by Video Lead Audit")}&body=${encodeURIComponent(`Hi ${member?.fullName ?? "there"},\n\nYour Lead Audit is ready. Let's book a 15-minute walkthrough call to review it together.\n\n— Jared`)}`}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold transition-colors"
              >
                Send Report + Book Call
              </a>
              {member?.id && (
                <Link
                  href={`/admin/members/${member.id}?convert=1`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2f3437] hover:bg-[#3a4145] text-white text-sm font-semibold transition-colors"
                >
                  Convert to Member →
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-6 text-sm text-[#2f3437]/40 border-t border-gray-200">
          Prepared for {member?.fullName ?? member?.email} by Jared Chamberlain ~ Founder of Attraction by Video
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-4 md:space-y-5 print-full-width" id="audit-report">

      {/* Top navigation — hidden on print */}
      <div className="flex items-center justify-between no-print">
        <Link
          href={`/admin/members/${member?.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-[#2f3437]/50 hover:text-[#2f3437]"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back to {member?.fullName ?? "Member"}
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyLink}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-[#2f3437]/70 transition-colors"
          >
            <ClipboardDocumentIcon className="w-4 h-4" />
            {copied ? "Copied!" : "Share Report"}
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-[#2f3437]/70 transition-colors"
          >
            <PrinterIcon className="w-4 h-4" />
            Print / PDF
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 text-sm text-[#ff0033]/60 hover:text-[#ff0033] disabled:opacity-40 transition-colors"
          >
            <TrashIcon className="w-4 h-4" />
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>

      {/* Print-only logo header */}
      <div className="hidden print:block text-center py-4 border-b border-gray-200 mb-2">
        <p className="text-lg font-black text-[#2f3437] tracking-tight">Attraction by Video</p>
        <p className="text-xs text-[#2f3437]/50">YouTube Channel Audit Report</p>
      </div>

      {/* Banner */}
      {channelInfo?.bannerUrl ? (
        <div className="w-full h-32 rounded-lg overflow-hidden print-avoid-break">
          <img src={channelInfo.bannerUrl} alt="Channel banner" className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="h-28 rounded-lg bg-gradient-to-r from-[#2f3437] via-[#2c4a6e] to-[#6ba3c7] print-avoid-break" />
      )}

      {/* Header callout */}
      <div className="bg-[#6ba3c7]/10 border border-[#6ba3c7]/30 rounded-lg p-6 print-avoid-break">
        <p className="text-xs font-semibold text-[#6ba3c7] uppercase tracking-wider mb-1">
          Attraction by Video — {typeLabel}
        </p>
        <h1 className="text-2xl font-bold text-[#2f3437]">{member?.fullName ?? member?.email}</h1>
        {isSingleVideo && singleVideoTitle ? (
          <p className="text-[#2f3437]/80 font-medium mt-1">"{singleVideoTitle}"</p>
        ) : (
          (member?.youtubeChannelName || channelInfo?.title || member?.youtubeHandle) && (
            <p className="text-[#2f3437]/60 mt-1">
              {member?.youtubeChannelName || channelInfo?.title || member?.youtubeHandle}
            </p>
          )
        )}
        <p className="text-sm text-[#2f3437]/50 mt-1">{fmt(audit.createdAt)}</p>
      </div>

      {/* Score + Diagnosis — side-by-side on desktop */}
      <div className="flex flex-col md:flex-row gap-4 print-avoid-break">
        <div className={`rounded-lg p-5 text-center md:w-44 shrink-0 ${scoreBgBlock(audit.overallScore)}`}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-1 text-[#2f3437]/60">
            {isSingleVideo ? "Video Score" : "Channel Score"}
          </p>
          <p className={`text-6xl font-black ${scoreText(Number(audit.overallScore))}`}>
            {audit.overallScore != null ? Number(audit.overallScore).toFixed(1) : "—"}
          </p>
          <p className="text-sm font-medium mt-0.5 text-[#2f3437]/50">/ 10</p>
          {report?.raw_average != null && (
            <p className="text-xs text-[#2f3437]/40 mt-1.5">Raw avg: {Number(report.raw_average).toFixed(1)}</p>
          )}
        </div>
        {report?.one_sentence_diagnosis && (
          <div className="bg-[#111] rounded-lg p-5 flex-1 flex flex-col justify-center">
            <p className="text-xs font-semibold text-[#6ba3c7] uppercase tracking-wider mb-2">Diagnosis</p>
            <p className="text-base font-medium text-white leading-relaxed italic">
              "{report.one_sentence_diagnosis}"
            </p>
          </div>
        )}
      </div>

      {/* Single Video: Phase Report */}
      {isSingleVideo && phaseReport && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 print-page-break">
          <h2 className="text-base font-semibold text-[#2f3437] mb-5">Video Phase Analysis</h2>
          <div className="space-y-5">
            {[
              { key: "opening", label: "🎬 Opening", description: "First 60–90 seconds" },
              { key: "body", label: "📖 Body", description: "Main content & insights" },
              { key: "connection_and_voice", label: "🤝 Connection & Voice", description: "Emotional resonance & personality" },
              { key: "channel_strategy", label: "📈 Channel Strategy", description: "Title, lead magnet & binge hooks" },
            ].map(({ key, label, description }) => {
              const phase = phaseReport[key];
              if (!phase) return null;
              return (
                <div key={key} className="border border-gray-100 rounded-lg p-5 print-avoid-break">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <h3 className="font-bold text-[#2f3437] text-sm">{label}</h3>
                      <p className="text-xs text-[#2f3437]/40">{description}</p>
                    </div>
                    {phase.score != null && (
                      <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold shrink-0 ${scoreBg(phase.score)}`}>
                        {Number(phase.score).toFixed(1)}
                      </span>
                    )}
                  </div>
                  {phase.analysis && (
                    <p className="text-sm text-[#2f3437]/80 mb-3 leading-relaxed">{phase.analysis}</p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {phase.strengths?.length > 0 && (
                      <div className="bg-[#e8f7ff] rounded-lg p-3">
                        <p className="text-xs font-semibold text-[#6ba3c7] uppercase tracking-wider mb-1.5">✅ Strong</p>
                        {phase.strengths.map((s: string, i: number) => (
                          <p key={i} className="text-xs text-[#2f3437]/70">{s}</p>
                        ))}
                      </div>
                    )}
                    {phase.gaps?.length > 0 && (
                      <div className="bg-[#ffe5ea] rounded-lg p-3">
                        <p className="text-xs font-semibold text-[#ff0033] uppercase tracking-wider mb-1.5">⚠️ Gap</p>
                        {phase.gaps.map((g: string, i: number) => (
                          <p key={i} className="text-xs text-[#2f3437]/70">{g}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Single Video: Three Improvements */}
      {isSingleVideo && report?.three_improvements?.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-[#2f3437] mb-5">💡 Three Ideas for Improvement</h2>
          <div className="space-y-5">
            {report.three_improvements.map((item: any, i: number) => (
              <div key={i} className="border-l-4 border-[#6ba3c7] pl-4 print-avoid-break">
                <p className="text-xs font-bold text-[#6ba3c7] uppercase tracking-wider mb-2">{i + 1}. {item.principle}</p>
                <div className="space-y-2">
                  <div className="bg-[#ffe5ea] rounded-lg px-3 py-2">
                    <p className="text-xs font-semibold text-[#ff0033] mb-1">Current</p>
                    <p className="text-xs text-[#2f3437]/80 italic">"{item.current}"</p>
                  </div>
                  <div className="bg-[#e8f7ff] rounded-lg px-3 py-2">
                    <p className="text-xs font-semibold text-[#6ba3c7] mb-1">Improved</p>
                    <p className="text-xs text-[#2f3437]/80 italic">"{item.improved}"</p>
                  </div>
                  {item.why && (
                    <p className="text-xs text-[#2f3437]/60 italic">{item.why}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Single Video: Quick Wins */}
      {isSingleVideo && report?.quick_wins?.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 print-avoid-break">
          <h2 className="text-base font-semibold text-amber-800 mb-3">⚡ Quick Win for Next Video</h2>
          <ul className="space-y-2">
            {report.quick_wins.slice(0, 1).map((win: string, i: number) => (
              <li key={i} className="text-sm text-amber-900 leading-relaxed">{win}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Monthly progress summary */}
      {isMonthly && baselineScores && (
        <div className="bg-[#6ba3c7]/10 border border-[#6ba3c7]/30 rounded-lg p-6 print-avoid-break">
          <h2 className="text-base font-semibold text-[#2f3437] mb-4">📊 Progress Summary</h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-[#2f3437]/50 uppercase tracking-wider mb-1">This Month</p>
              <p className={`text-3xl font-bold ${scoreText(Number(audit.overallScore))}`}>{audit.overallScore != null ? Number(audit.overallScore).toFixed(1) : "—"}</p>
            </div>
            {baselineScores && (() => {
              const baseAvg = (Object.values(baselineScores) as Array<{ score: number }>).reduce((a, b) => a + b.score, 0) / Object.keys(baselineScores).length;
              const delta = audit.overallScore - baseAvg;
              return (
                <div>
                  <p className="text-xs text-[#2f3437]/50 uppercase tracking-wider mb-1">Δ Baseline</p>
                  <p className={`text-3xl font-bold ${deltaColor(delta)}`}>
                    {delta > 0 ? "↑" : delta < 0 ? "↓" : "→"}{Math.abs(delta).toFixed(1)}
                  </p>
                </div>
              );
            })()}
            {lastMonthScores && (() => {
              const lastAvg = (Object.values(lastMonthScores) as Array<{ score: number }>).reduce((a, b) => a + b.score, 0) / Object.keys(lastMonthScores).length;
              const delta = audit.overallScore - lastAvg;
              return (
                <div>
                  <p className="text-xs text-[#2f3437]/50 uppercase tracking-wider mb-1">Δ Last Month</p>
                  <p className={`text-3xl font-bold ${deltaColor(delta)}`}>
                    {delta > 0 ? "↑" : delta < 0 ? "↓" : "→"}{Math.abs(delta).toFixed(1)}
                  </p>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* 16-Principle Scorecard */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 print-page-break print-avoid-break">
        <h2 className="text-base font-semibold text-[#2f3437] mb-4">16-Principle Scorecard</h2>

        {!hasScores ? (
          <p className="text-sm text-[#2f3437]/50 italic">Score data unavailable for this audit. The report content may have been saved in an older format — check the browser console for the raw keys.</p>
        ) : isMonthly && baselineScores ? (
          <div className="space-y-0.5">
            {/* Column headers */}
            <div className="flex items-center gap-2 pb-2 border-b border-gray-100 px-3">
              <span className="flex-1 text-xs font-semibold text-[#2f3437]/50 uppercase tracking-wider">Principle</span>
              <span className="w-14 text-center text-xs font-semibold text-[#2f3437]/50 uppercase tracking-wider">Base</span>
              {lastMonthScores && <span className="w-14 text-center text-xs font-semibold text-[#2f3437]/50 uppercase tracking-wider">Last</span>}
              <span className="w-14 text-center text-xs font-semibold text-[#2f3437]/50 uppercase tracking-wider">Now</span>
              <span className="w-10 text-center text-xs font-semibold text-[#2f3437]/50 uppercase tracking-wider">Δ</span>
              <span className="w-4" />
            </div>
            {Object.entries(scores).map(([key, val]: [string, any]) => {
              const base = baselineScores?.[key]?.score;
              const last = lastMonthScores?.[key]?.score;
              const curr = val.score;
              const isNA = curr == null;
              const delta = !isNA && base != null ? curr - base : null;
              const isOpen = expandedPrinciple === key;
              return (
                <div key={key} className={`rounded-lg ${deltaCellBg(delta)}`}>
                  <button
                    onClick={() => setExpandedPrinciple(isOpen ? null : key)}
                    className="w-full flex items-center gap-2 py-2.5 px-3 hover:bg-black/5 transition-colors rounded-lg text-left"
                  >
                    <span className={`flex-1 text-sm ${isNA ? "text-[#2f3437]/40" : "text-[#2f3437]"}`}>{PRINCIPLE_LABELS[key] ?? key}</span>
                    <span className="w-14 text-center">
                      {base != null ? <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(base)}`}>{base.toFixed(1)}</span> : <span className="text-[#2f3437]/30 text-xs">—</span>}
                    </span>
                    {lastMonthScores && (
                      <span className="w-14 text-center">
                        {last != null ? <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(last)}`}>{last.toFixed(1)}</span> : <span className="text-[#2f3437]/30 text-xs">—</span>}
                      </span>
                    )}
                    <span className="w-14 text-center">
                      {isNA
                        ? <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-400">N/A</span>
                        : <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(curr)}`}>{curr.toFixed(1)}</span>}
                    </span>
                    <span className="w-10 text-center text-xs font-bold">
                      {isNA ? <span className="text-gray-400">—</span> : delta == null ? <span className="text-gray-400">—</span> : delta > 0 ? <span className={deltaColor(delta)}>+{delta.toFixed(1)}</span> : delta < 0 ? <span className={deltaColor(delta)}>{delta.toFixed(1)}</span> : <span className="text-gray-400">0.0</span>}
                    </span>
                    <span className="w-4 text-[#2f3437]/30 text-xs no-print">{isOpen ? "▲" : "▼"}</span>
                  </button>
                  {isOpen && val.evidence && (
                    <div className="mx-3 mb-2 px-3 py-2 bg-white/70 rounded-lg text-xs text-[#2f3437]/70 italic">
                      {val.evidence}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4">
            {DIMENSIONS.map((dim) => (
              <div key={dim.label}>
                <h3 className="text-sm font-bold text-[#2f3437] uppercase tracking-wide mb-2 pt-1">{dim.label}</h3>
                <div className="space-y-1">
                  {dim.keys.filter((k) => scores[k]).map((key) => {
                    const val = scores[key];
                    const isOpen = expandedPrinciple === key;
                    const isNA = val.score == null;
                    return (
                      <div key={key}>
                        <button
                          onClick={() => setExpandedPrinciple(isOpen ? null : key)}
                          className="w-full flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          <span className={`text-sm ${isNA ? "text-[#2f3437]/40" : "text-[#2f3437]"}`}>{PRINCIPLE_LABELS[key]}</span>
                          <div className="flex items-center gap-2">
                            {isNA
                              ? <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-400">N/A</span>
                              : <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(val.score)}`}>{val.score.toFixed(1)}</span>
                            }
                            <span className="text-[#2f3437]/30 text-xs no-print">{isOpen ? "▲" : "▼"}</span>
                          </div>
                        </button>
                        {isOpen && val.evidence && (
                          <div className="mx-3 mb-2 px-3 py-2 bg-gray-50 rounded-lg text-xs text-[#2f3437]/70 italic">
                            {val.evidence}
                          </div>
                        )}
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
        <div className="bg-white rounded-lg border border-gray-200 p-6 print-page-break">
          <h2 className="text-base font-semibold text-[#2f3437] mb-4">Videos Analysed</h2>
          {!report?.video_breakdowns?.length && (
            <div className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
              Per-video analysis unavailable for this audit. Delete and re-run to see dimension scores, strengths, and improvements per video.
            </div>
          )}
          <div className="space-y-4">
            {videos.map((v: any, i: number) => {
              const breakdown =
                report?.video_breakdowns?.[i] ??
                report?.video_breakdowns?.find(
                  (b: any) =>
                    b.video_id === v.videoId ||
                    b.title?.trim().toLowerCase() === v.title?.trim().toLowerCase()
                );
              const dimScores = breakdown?.dimension_scores as {
                channel_strategy?: number;
                content_impact?: number;
                viewer_connection?: number;
                lead_generation?: number;
              } | undefined;
              const strong = breakdown?.strength ?? breakdown?.opening_analysis;
              const improve = breakdown?.improvement ??
                [breakdown?.insights_analysis, breakdown?.connection_analysis].filter(Boolean)[0];

              function dimBadge(score: number | undefined, label: string) {
                if (score == null) return null;
                const bg =
                  score >= 7
                    ? "bg-[#e8f7ff] text-[#0ea5d9]"
                    : score >= 5
                    ? "bg-[#fef3c7] text-amber-700"
                    : "bg-[#ffe5ea] text-[#cc0029]";
                return (
                  <span key={label} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${bg}`}>
                    {label} {score.toFixed(1)}
                  </span>
                );
              }

              return (
                <div key={i} className="border border-gray-100 rounded-lg p-4 print-avoid-break">
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                    <a
                      href={`https://youtube.com/watch?v=${v.videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-[#6ba3c7] hover:underline flex items-center gap-1"
                    >
                      {v.title}
                      <ArrowTopRightOnSquareIcon className="w-3 h-3 shrink-0 no-print" />
                    </a>
                    <span className="text-xs text-[#2f3437]/40 whitespace-nowrap">
                      {fmtDuration(v.durationSeconds)} · {fmt(v.uploadDate)} · {v.viewCount?.toLocaleString()} views
                    </span>
                  </div>
                  {!v.hadTranscript && (
                    <p className="text-xs text-amber-500 mb-1">(no transcript available)</p>
                  )}
                  {dimScores && (
                    <div className="flex flex-wrap gap-1.5 mt-2 mb-2">
                      {dimBadge(dimScores.channel_strategy, "🎯 Strategy")}
                      {dimBadge(dimScores.content_impact, "🎬 Content")}
                      {dimBadge(dimScores.viewer_connection, "🤝 Connection")}
                      {dimBadge(dimScores.lead_generation, "📈 Lead Gen")}
                    </div>
                  )}
                  {strong && (
                    <p className="text-xs text-[#2f3437]/70 mt-1">
                      <span className="mr-1">✅</span>{strong}
                    </p>
                  )}
                  {improve && (
                    <p className="text-xs text-[#2f3437]/70 mt-1">
                      <span className="mr-1">⚠️</span>{improve}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Video-by-Video Deep Dive (when video_breakdowns have detailed analysis) */}
      {report?.video_breakdowns?.some((v: any) => v.opening_analysis || v.insights_analysis) && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-[#2f3437] mb-4">🔍 Video Deep Dive</h2>
          <div className="space-y-6">
            {report.video_breakdowns.map((v: any, i: number) => (
              <div key={i} className="border-l-4 border-[#6ba3c7] pl-4 print-avoid-break">
                <h3 className="font-semibold text-[#2f3437] mb-3">"{v.title}"</h3>
                {[
                  { label: "Opening", text: v.opening_analysis },
                  { label: "Insights", text: v.insights_analysis },
                  { label: "Connection", text: v.connection_analysis },
                ].map(({ label, text }) => text && (
                  <div key={label} className="mb-2">
                    <span className="text-xs font-semibold text-[#2f3437]/50 uppercase tracking-wider">{label}: </span>
                    <span className="text-sm text-[#2f3437]/80">{text}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* What's Working */}
      {whatsWorking.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 print-page-break print-avoid-break">
          <h2 className="text-base font-semibold text-green-800 mb-3">✅ What&apos;s Working</h2>
          <div className="space-y-3">
            {whatsWorking.map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="mt-1 text-green-500 shrink-0">•</span>
                <div>
                  <p className="text-sm text-green-800 font-medium">{item.strength}</p>
                  {item.evidence && (
                    <p className="text-xs text-green-700/70 mt-0.5 italic">"{item.evidence}"</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Three Biggest Gaps */}
      {biggestGaps.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-[#2f3437] mb-4">🎯 Three Biggest Gaps</h2>
          <div className="space-y-5">
            {biggestGaps.map((gap, i) => (
              <div key={i} className="border-l-4 border-[#ff0033] pl-4 print-avoid-break">
                <div className="flex items-center gap-2 mb-2">
                  <span className="bg-[#ff0033]/10 text-[#ff0033] text-xs font-bold px-2 py-0.5 rounded-full">{i + 1}</span>
                  <span className="text-sm font-bold text-[#2f3437]">{gap.principle}</span>
                  {gap.score > 0 && (
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(gap.score)}`}>
                      {gap.score.toFixed(1)}
                    </span>
                  )}
                </div>
                <p className="text-sm text-[#2f3437]/80 mb-3 leading-relaxed">{gap.description}</p>
                {gap.current_example && (
                  <div className="space-y-2">
                    <div className="bg-[#ffe5ea] rounded-lg px-3 py-2">
                      <p className="text-xs font-semibold text-[#ff0033] mb-1">Current</p>
                      <p className="text-xs text-[#2f3437]/80 italic">"{gap.current_example}"</p>
                    </div>
                    {gap.improved_example && (
                      <div className="bg-[#e8f7ff] rounded-lg px-3 py-2">
                        <p className="text-xs font-semibold text-[#6ba3c7] mb-1">Improved</p>
                        <p className="text-xs text-[#2f3437]/80 italic">"{gap.improved_example}"</p>
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
        <div className="bg-[#6ba3c7]/10 border border-[#6ba3c7]/30 rounded-lg p-6 print-page-break">
          <h2 className="text-base font-semibold text-[#2f3437] mb-1">📚 Learning Path</h2>
          <p className="text-xs text-[#2f3437]/50 mb-4">Principles below 7 — sorted by priority</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#6ba3c7]/20">
                  <th className="text-left py-2 pr-3 text-xs font-semibold text-[#2f3437]/50 uppercase tracking-wider">Principle</th>
                  <th className="text-center py-2 px-2 text-xs font-semibold text-[#2f3437]/50 uppercase tracking-wider">Score</th>
                  <th className="text-left py-2 px-2 text-xs font-semibold text-[#2f3437]/50 uppercase tracking-wider">Lesson</th>
                  <th className="text-center py-2 pl-2 text-xs font-semibold text-[#2f3437]/50 uppercase tracking-wider">Priority</th>
                </tr>
              </thead>
              <tbody>
                {learningGaps.map(([key, val]: [string, any]) => {
                  const p = priority(val.score);
                  return (
                    <tr key={key} className="border-b border-[#6ba3c7]/10 last:border-0">
                      <td className="py-2 pr-3 text-[#2f3437] font-medium">{PRINCIPLE_LABELS[key]}</td>
                      <td className="py-2 px-2 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(val.score)}`}>
                          {val.score.toFixed(1)}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-xs text-[#2f3437]/70">{LEARNING_PATH[key]}</td>
                      <td className="py-2 pl-2 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${p.cls}`}>
                          {p.label}
                        </span>
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
      {(() => {
        const allItems = isSingleVideo && report?.qa_prep?.length > 0
          ? report.qa_prep.map((q: string) => ({ key: "", prompt: q, score: 0 }))
          : qaItems;
        if (allItems.length === 0) return null;
        return (
          <div className="bg-white rounded-lg border border-gray-200 p-6 print-avoid-break">
            <h2 className="text-base font-semibold text-[#2f3437] mb-1">❓ Q&amp;A Topics for Coaching Call</h2>
            <p className="text-xs text-[#2f3437]/50 mb-4">Things to bring or prepare before the next call</p>
            <div className="space-y-2">
              {allItems.map((item: any, i: number) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                  <span className="w-2 h-2 rounded-full bg-[#6ba3c7] mt-1.5 shrink-0" />
                  <div className="flex-1">
                    {item.key && (
                      <span className="text-xs font-semibold text-[#2f3437]/50 uppercase tracking-wide mr-2">
                        {PRINCIPLE_LABELS[item.key]}
                        {item.score > 0 && ` (${item.score.toFixed(1)})`}:
                      </span>
                    )}
                    <span className="text-sm text-[#2f3437]/80">{item.prompt}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Footer */}
      <div className="text-center py-6 text-sm text-[#2f3437]/40 border-t border-gray-200">
        Prepared for {member?.fullName ?? member?.email} by Jared Chamberlain ~ Founder of Attraction by Video
      </div>
    </div>
  );
}

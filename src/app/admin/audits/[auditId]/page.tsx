"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";

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

const QA_FLAGS = ["lead_magnet_system", "avatar_clarity", "connection_language", "approve_the_click", "curiosity_bridges"];

const DIMENSIONS = [
  { label: "🎯 Channel Strategy", keys: ["avatar_clarity", "themes_over_topics", "consistency"] },
  { label: "🎬 Content Impact", keys: ["arc_attention", "arc_revelation", "arc_connection", "title_frameworks", "approve_the_click", "curiosity_bridges", "show_dont_tell"] },
  { label: "🤝 Viewer Connection", keys: ["connection_language", "values_peppering", "story_proof", "grade_5_language"] },
  { label: "📈 Lead Generation", keys: ["lead_magnet_system", "binge_architecture"] },
];

function scoreBg(score: number) {
  if (score >= 7) return "bg-[#e8f7ff] text-[#3dc3ff]";
  if (score >= 5) return "bg-[#fef3c7] text-[#f59e0b]";
  return "bg-[#ffe5ea] text-[#ff0033]";
}

function scoreText(score: number) {
  if (score >= 7) return "text-[#3dc3ff]";
  if (score >= 5) return "text-[#f59e0b]";
  return "text-[#ff0033]";
}

function scoreBgBlock(score: number) {
  if (score >= 7) return "bg-[#e8f7ff] border border-[#3dc3ff]/30";
  if (score >= 5) return "bg-[#fef3c7] border border-[#f59e0b]/30";
  return "bg-[#ffe5ea] border border-[#ff0033]/30";
}

function deltaColor(delta: number) {
  if (delta > 0) return "text-[#3dc3ff]";
  if (delta < 0) return "text-[#ff0033]";
  return "text-gray-400";
}

function deltaCellBg(delta: number | null) {
  if (delta == null) return "";
  if (delta >= 1) return "bg-[#e8f7ff]";
  if (delta >= 0.5) return "bg-[#fef3c7]";
  if (delta < 0) return "bg-[#ffe5ea]";
  return "";
}

function fmt(date: string) {
  return new Date(date).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

function fmtDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function AuditReportPage() {
  const { auditId } = useParams<{ auditId: string }>();
  const [audit, setAudit] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedPrinciple, setExpandedPrinciple] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/audits/${auditId}`)
      .then((r) => r.json())
      .then((d) => { setAudit(d.audit); setLoading(false); });
  }, [auditId]);

  if (loading) return <div className="flex items-center justify-center h-64 text-[#1e2a38]/40">Loading report…</div>;
  if (!audit) return <div className="text-center py-20 text-[#1e2a38]/50">Report not found.</div>;

  const report = audit.reportContent as any;
  const scores = audit.scores as any;
  const videos = (audit.videosAnalysed as any[]) ?? [];
  const member = audit.user;
  const baselineScores = report?.baselineScores as any;
  const lastMonthScores = report?.lastMonthScores as any;
  const channelInfo = report?.channelInfo;
  const isSingleVideo = audit.auditType === "single_video";
  const singleVideoTitle = isSingleVideo ? (videos[0]?.title ?? null) : null;
  const phaseReport = report?.phase_report as any;

  const typeLabel = audit.auditType === "baseline" ? "Baseline Audit"
    : audit.auditType === "monthly" ? "Monthly Audit"
    : "Single Video Audit";

  return (
    <div className="max-w-4xl space-y-6">
      <Link href={`/admin/members/${member?.id}`} className="inline-flex items-center gap-1.5 text-sm text-[#1e2a38]/50 hover:text-[#1e2a38]">
        <ArrowLeftIcon className="w-4 h-4" />
        Back to {member?.fullName ?? "Member"}
      </Link>

      {/* Banner */}
      {channelInfo?.bannerUrl ? (
        <div className="w-full h-32 rounded-xl overflow-hidden">
          <img src={channelInfo.bannerUrl} alt="Channel banner" className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="h-32 rounded-xl bg-gradient-to-r from-[#1e2a38] via-[#2c4a6e] to-[#3dc3ff]" />
      )}

      {/* Header callout */}
      <div className="bg-[#3dc3ff]/10 border border-[#3dc3ff]/30 rounded-xl p-6">
        <p className="text-xs font-semibold text-[#3dc3ff] uppercase tracking-wider mb-1">Attraction by Video — {typeLabel}</p>
        <h1 className="text-2xl font-bold text-[#1e2a38]">{member?.fullName ?? member?.email}</h1>
        {isSingleVideo && singleVideoTitle ? (
          <p className="text-[#1e2a38]/80 font-medium mt-1">"{singleVideoTitle}"</p>
        ) : (
          (member?.youtubeChannelName || channelInfo?.title || member?.youtubeHandle) && (
            <p className="text-[#1e2a38]/60 mt-1">
              {member?.youtubeChannelName || channelInfo?.title || member?.youtubeHandle}
            </p>
          )
        )}
        <p className="text-sm text-[#1e2a38]/50 mt-1">{fmt(audit.createdAt)}</p>
      </div>

      {/* Overall Score */}
      <div className={`rounded-xl p-8 text-center ${scoreBgBlock(audit.overallScore)}`}>
        <p className="text-sm font-semibold uppercase tracking-wider mb-2 text-[#1e2a38]/60">Your Attraction Score</p>
        <p className={`text-7xl font-black ${scoreText(audit.overallScore)}`}>{audit.overallScore?.toFixed(1)}</p>
        <p className="text-lg font-medium mt-1 text-[#1e2a38]/50">/ 10</p>
        {report?.one_sentence_diagnosis && (
          <p className="mt-4 text-sm italic text-[#1e2a38]/70 max-w-lg mx-auto">"{report.one_sentence_diagnosis}"</p>
        )}
      </div>

      {/* Single Video: Phase Report */}
      {isSingleVideo && phaseReport && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-base font-semibold text-[#1e2a38] mb-5">Video Phase Analysis</h2>
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
                <div key={key} className="border border-gray-100 rounded-xl p-5">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <h3 className="font-bold text-[#1e2a38] text-sm">{label}</h3>
                      <p className="text-xs text-[#1e2a38]/40">{description}</p>
                    </div>
                    {phase.score != null && (
                      <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold shrink-0 ${scoreBg(phase.score)}`}>
                        {Number(phase.score).toFixed(1)}
                      </span>
                    )}
                  </div>
                  {phase.analysis && (
                    <p className="text-sm text-[#1e2a38]/80 mb-3 leading-relaxed">{phase.analysis}</p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {phase.strengths?.length > 0 && (
                      <div className="bg-[#e8f7ff] rounded-lg p-3">
                        <p className="text-xs font-semibold text-[#3dc3ff] uppercase tracking-wider mb-1.5">✅ Strong</p>
                        {phase.strengths.map((s: string, i: number) => (
                          <p key={i} className="text-xs text-[#1e2a38]/70">{s}</p>
                        ))}
                      </div>
                    )}
                    {phase.gaps?.length > 0 && (
                      <div className="bg-[#ffe5ea] rounded-lg p-3">
                        <p className="text-xs font-semibold text-[#ff0033] uppercase tracking-wider mb-1.5">⚠️ Gap</p>
                        {phase.gaps.map((g: string, i: number) => (
                          <p key={i} className="text-xs text-[#1e2a38]/70">{g}</p>
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
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-base font-semibold text-[#1e2a38] mb-5">💡 Three Ideas for Improvement</h2>
          <div className="space-y-5">
            {report.three_improvements.map((item: any, i: number) => (
              <div key={i} className="border-l-4 border-[#3dc3ff] pl-4">
                <p className="text-xs font-bold text-[#3dc3ff] uppercase tracking-wider mb-2">{i + 1}. {item.principle}</p>
                <div className="space-y-2">
                  <div className="bg-[#ffe5ea] rounded-lg px-3 py-2">
                    <p className="text-xs font-semibold text-[#ff0033] mb-1">Current</p>
                    <p className="text-xs text-[#1e2a38]/80 italic">"{item.current}"</p>
                  </div>
                  <div className="bg-[#e8f7ff] rounded-lg px-3 py-2">
                    <p className="text-xs font-semibold text-[#3dc3ff] mb-1">Improved</p>
                    <p className="text-xs text-[#1e2a38]/80 italic">"{item.improved}"</p>
                  </div>
                  {item.why && (
                    <p className="text-xs text-[#1e2a38]/60 italic">{item.why}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Single Video: Quick Wins */}
      {isSingleVideo && report?.quick_wins?.length > 0 && (
        <div className="bg-[#e8f7ff] border border-[#3dc3ff]/30 rounded-xl p-6">
          <h2 className="text-base font-semibold text-[#1e2a38] mb-3">⚡ Quick Wins</h2>
          <p className="text-xs text-[#1e2a38]/50 mb-3">Implement these in your next video</p>
          <ul className="space-y-2">
            {report.quick_wins.map((win: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-sm text-[#1e2a38]/80">
                <span className="text-[#3dc3ff] font-bold mt-0.5 shrink-0">{i + 1}.</span>
                {win}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Monthly progress summary */}
      {audit.auditType === "monthly" && baselineScores && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-base font-semibold text-[#1e2a38] mb-4">Progress Summary</h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-[#1e2a38]/50 uppercase tracking-wider mb-1">This Month</p>
              <p className={`text-3xl font-bold ${scoreText(audit.overallScore)}`}>{audit.overallScore?.toFixed(1)}</p>
            </div>
            {baselineScores && (() => {
              const baseAvg = Object.values(baselineScores).reduce((a: any, b: any) => a + b.score, 0) / Object.keys(baselineScores).length;
              const delta = audit.overallScore - baseAvg;
              return (
                <div>
                  <p className="text-xs text-[#1e2a38]/50 uppercase tracking-wider mb-1">Δ Baseline</p>
                  <p className={`text-3xl font-bold ${deltaColor(delta)}`}>
                    {delta > 0 ? "↑" : delta < 0 ? "↓" : "→"}{Math.abs(delta).toFixed(1)}
                  </p>
                </div>
              );
            })()}
            {lastMonthScores && (() => {
              const lastAvg = Object.values(lastMonthScores).reduce((a: any, b: any) => a + b.score, 0) / Object.keys(lastMonthScores).length;
              const delta = audit.overallScore - lastAvg;
              return (
                <div>
                  <p className="text-xs text-[#1e2a38]/50 uppercase tracking-wider mb-1">Δ Last Month</p>
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
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-base font-semibold text-[#1e2a38] mb-4">16-Principle Scorecard</h2>

        {audit.auditType === "monthly" && baselineScores ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 pr-3 text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wider">Principle</th>
                  <th className="text-center py-2 px-2 text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wider">Baseline</th>
                  {lastMonthScores && <th className="text-center py-2 px-2 text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wider">Last Month</th>}
                  <th className="text-center py-2 px-2 text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wider">This Month</th>
                  <th className="text-center py-2 px-2 text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wider">Δ Baseline</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(scores).map(([key, val]: [string, any]) => {
                  const base = baselineScores?.[key]?.score;
                  const last = lastMonthScores?.[key]?.score;
                  const curr = val.score;
                  const delta = base != null ? curr - base : null;
                  const rowBg = deltaCellBg(delta);
                  return (
                    <tr key={key} className={`border-b border-gray-50 last:border-0 ${rowBg}`}>
                      <td className="py-2 pr-3 text-[#1e2a38]">{PRINCIPLE_LABELS[key] ?? key}</td>
                      <td className="py-2 px-2 text-center">
                        {base != null ? <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(base)}`}>{base.toFixed(1)}</span> : "—"}
                      </td>
                      {lastMonthScores && (
                        <td className="py-2 px-2 text-center">
                          {last != null ? <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(last)}`}>{last.toFixed(1)}</span> : "—"}
                        </td>
                      )}
                      <td className="py-2 px-2 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(curr)}`}>{curr.toFixed(1)}</span>
                      </td>
                      <td className="py-2 px-2 text-center text-xs font-bold">
                        {delta == null ? "—" : delta > 0 ? <span className={deltaColor(delta)}>+{delta.toFixed(1)}</span> : delta < 0 ? <span className={deltaColor(delta)}>{delta.toFixed(1)}</span> : <span className="text-gray-400">0.0</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-4">
            {DIMENSIONS.map((dim) => (
              <div key={dim.label}>
                <h3 className="text-sm font-bold text-[#1e2a38] uppercase tracking-wide mb-2 pt-1">{dim.label}</h3>
                <div className="space-y-1">
                  {dim.keys.filter((k) => scores[k]).map((key) => {
                    const val = scores[key];
                    const isOpen = expandedPrinciple === key;
                    return (
                      <div key={key}>
                        <button
                          onClick={() => setExpandedPrinciple(isOpen ? null : key)}
                          className="w-full flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          <span className="text-sm text-[#1e2a38]">{PRINCIPLE_LABELS[key]}</span>
                          <div className="flex items-center gap-2">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(val.score)}`}>{val.score.toFixed(1)}</span>
                            <span className="text-[#1e2a38]/30 text-xs">{isOpen ? "▲" : "▼"}</span>
                          </div>
                        </button>
                        {isOpen && val.evidence && (
                          <div className="mx-3 mb-2 px-3 py-2 bg-gray-50 rounded-lg text-xs text-[#1e2a38]/70 italic">
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
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-base font-semibold text-[#1e2a38] mb-4">Videos Analysed</h2>
          <div className="space-y-4">
            {videos.map((v: any, i: number) => {
              const breakdown = report?.video_breakdowns?.find(
                (b: any) => b.title === v.title || b.video_id === v.videoId
              );
              const strong = breakdown?.opening_analysis || breakdown?.insights_analysis || breakdown?.connection_analysis;
              const improve = [breakdown?.opening_analysis, breakdown?.insights_analysis, breakdown?.connection_analysis]
                .filter(Boolean)
                .find((t: string) => t !== strong);
              return (
                <div key={i} className="border border-gray-100 rounded-lg p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                    <a
                      href={`https://youtube.com/watch?v=${v.videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-[#3dc3ff] hover:underline flex items-center gap-1"
                    >
                      {v.title}
                      <ArrowTopRightOnSquareIcon className="w-3 h-3 shrink-0" />
                    </a>
                    <span className="text-xs text-[#1e2a38]/40 whitespace-nowrap">
                      {fmtDuration(v.durationSeconds)} · {fmt(v.uploadDate)} · {v.viewCount?.toLocaleString()} views
                    </span>
                  </div>
                  {!v.hadTranscript && (
                    <p className="text-xs text-amber-500 mb-1">(no transcript available)</p>
                  )}
                  {strong && (
                    <p className="text-xs text-[#1e2a38]/70 mt-1">
                      <span className="mr-1">✅</span>{strong}
                    </p>
                  )}
                  {improve && (
                    <p className="text-xs text-[#1e2a38]/70 mt-1">
                      <span className="mr-1">⚠️</span>{improve}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Video Breakdowns */}
      {report?.video_breakdowns?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-base font-semibold text-[#1e2a38] mb-4">Video-by-Video Breakdown</h2>
          <div className="space-y-6">
            {report.video_breakdowns.map((v: any, i: number) => (
              <div key={i} className="border-l-4 border-[#3dc3ff] pl-4">
                <h3 className="font-semibold text-[#1e2a38] mb-3">"{v.title}"</h3>
                {[
                  { label: "Opening", text: v.opening_analysis },
                  { label: "Insights", text: v.insights_analysis },
                  { label: "Connection", text: v.connection_analysis },
                ].map(({ label, text }) => text && (
                  <div key={label} className="mb-2">
                    <span className="text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wider">{label}: </span>
                    <span className="text-sm text-[#1e2a38]/80">{text}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* What's Working */}
      {report?.strengths?.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6">
          <h2 className="text-base font-semibold text-green-800 mb-3">✅ What&apos;s Working</h2>
          <ul className="space-y-2">
            {report.strengths.map((s: string, i: number) => (
              <li key={i} className="text-sm text-green-700 flex items-start gap-2">
                <span className="mt-0.5 text-green-500">•</span>{s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Biggest Gaps */}
      {report?.biggest_gaps?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-base font-semibold text-[#1e2a38] mb-3">🎯 Three Biggest Gaps</h2>
          <ul className="space-y-3">
            {report.biggest_gaps.map((g: string, i: number) => (
              <li key={i} className="flex items-start gap-3">
                <span className="bg-[#ff0033]/10 text-[#ff0033] text-xs font-bold px-2 py-0.5 rounded-full shrink-0 mt-0.5">{i + 1}</span>
                <span className="text-sm text-[#1e2a38]/80">{g}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Learning Path */}
      {(() => {
        const gaps = Object.entries(scores).filter(([, v]: [string, any]) => v.score < 7);
        if (gaps.length === 0) return null;
        return (
          <div className="bg-[#3dc3ff]/10 border border-[#3dc3ff]/30 rounded-xl p-6">
            <h2 className="text-base font-semibold text-[#1e2a38] mb-3">📚 Learning Path</h2>
            <p className="text-sm text-[#1e2a38]/60 mb-3">Focus on these lessons to address your gaps:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {gaps.map(([key, val]: [string, any]) => (
                <div key={key} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
                  <span className="text-sm text-[#1e2a38]">{PRINCIPLE_LABELS[key]}</span>
                  <span className="text-xs text-[#3dc3ff] font-semibold">{LEARNING_PATH[key]}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Q&A Topics */}
      {isSingleVideo && report?.qa_prep?.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-base font-semibold text-[#1e2a38] mb-3">❓ Q&amp;A Prep for Coaching Call</h2>
          <ul className="space-y-2">
            {report.qa_prep.map((q: string, i: number) => (
              <li key={i} className="flex items-start gap-3">
                <span className="w-2 h-2 rounded-full bg-[#3dc3ff] mt-1.5 shrink-0" />
                <span className="text-sm text-[#1e2a38]/80">{q}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        (() => {
          const qaItems = QA_FLAGS.filter((k) => scores[k]);
          return (
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h2 className="text-base font-semibold text-[#1e2a38] mb-3">❓ Q&amp;A Topics for Coaching Call</h2>
              <ul className="space-y-2">
                {qaItems.map((key) => (
                  <li key={key} className="flex items-start gap-3">
                    <span className="w-2 h-2 rounded-full bg-[#3dc3ff] mt-1.5 shrink-0" />
                    <div>
                      <span className="text-sm font-medium text-[#1e2a38]">{PRINCIPLE_LABELS[key]}</span>
                      <span className="text-xs text-[#1e2a38]/50 ml-2">(score: {scores[key]?.score?.toFixed(1)})</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })()
      )}

      {/* Footer */}
      <div className="text-center py-6 text-sm text-[#1e2a38]/40 border-t border-gray-200">
        Prepared for {member?.fullName ?? member?.email} by Jared Chamberlain ~ Founder of Attraction by Video
      </div>
    </div>
  );
}

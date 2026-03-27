"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";

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

function scoreBg(score: number) {
  if (score >= 7) return "bg-green-100 text-green-700";
  if (score >= 5) return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-[#ff0033]";
}

function scoreText(score: number) {
  if (score >= 7) return "text-green-600";
  if (score >= 5) return "text-yellow-600";
  return "text-[#ff0033]";
}

function fmt(date: string) {
  return new Date(date).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

function fmtDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function MemberAuditReportPage() {
  const { auditId } = useParams<{ auditId: string }>();
  const [audit, setAudit] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [principlesWithLessons, setPrinciplesWithLessons] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`/api/audits/${auditId}`)
      .then((r) => r.json())
      .then((d) => { setAudit(d.audit); setLoading(false); });
  }, [auditId]);

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

  if (loading) return <div className="flex items-center justify-center h-64 text-[#2f3437]/40">Loading report…</div>;
  if (!audit) return <div className="text-center py-20 text-[#2f3437]/50">Report not found.</div>;

  const report = audit.reportContent as any;
  console.log("[MemberAuditReport] reportContent keys:", report ? Object.keys(report) : "null/undefined", "| audit.scores:", audit.scores);
  const rawScores = audit.scores ?? report?.audit_results ?? report?.scores ?? null;
  const scores = (rawScores ?? {}) as Record<string, { score: number; evidence?: string }>;
  const hasScores = Object.keys(scores).length > 0;
  const videos = (audit.videosAnalysed as any[]) ?? [];
  const baselineScores = report?.baselineScores as any;

  const typeLabel = audit.auditType === "baseline" ? "Baseline Audit"
    : audit.auditType === "monthly" ? "Monthly Audit"
    : "Single Video Audit";

  const gaps = Object.entries(scores).filter(([key, v]: [string, any]) => key !== "show_dont_tell" && v.score != null && v.score < 7);

  return (
    <div className="max-w-3xl space-y-4 md:space-y-5">
      <Link href="/member/scores" className="inline-flex items-center gap-1.5 text-sm text-[#2f3437]/50 hover:text-[#2f3437]">
        <ArrowLeftIcon className="w-4 h-4" />
        Back to My Scores
      </Link>

      {/* Score + Header — side-by-side on desktop */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className={`rounded-lg p-4 md:p-5 text-center md:w-44 shrink-0 ${scoreBg(Number(audit.overallScore))}`}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-1 opacity-70">Attraction Score</p>
          <p className={`text-5xl md:text-6xl font-black ${scoreText(Number(audit.overallScore))}`}>{audit.overallScore != null ? Number(audit.overallScore).toFixed(1) : "—"}</p>
          <p className="text-sm font-medium mt-0.5 opacity-50">/ 10</p>
          {report?.raw_average != null && (
            <p className="text-xs opacity-40 mt-1">Avg: {Number(report.raw_average).toFixed(1)}</p>
          )}
        </div>
        <div className="bg-[#6ba3c7]/10 border border-[#6ba3c7]/30 rounded-lg p-4 md:p-5 flex-1 flex flex-col justify-center">
          <p className="text-xs font-semibold text-[#6ba3c7] uppercase tracking-wider mb-1">Attraction by Video — {typeLabel}</p>
          <p className="text-sm text-[#2f3437]/50 mb-2">{fmt(audit.createdAt)}</p>
          {report?.one_sentence_diagnosis && (
            <p className="text-sm italic text-[#2f3437]/80">"{report.one_sentence_diagnosis}"</p>
          )}
        </div>
      </div>

      {/* Scores */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-[#2f3437] mb-4">16-Principle Breakdown</h2>
        {!hasScores ? (
          <p className="text-sm text-[#2f3437]/50 italic">Score data unavailable for this audit.</p>
        ) : (
        <div className="space-y-1">
          {Object.entries(scores).map(([key, val]: [string, any]) => {
            const isNA = val.score == null;
            const base = baselineScores?.[key]?.score;
            const delta = !isNA && base != null ? val.score - base : null;
            const isOpen = expanded === key;
            return (
              <div key={key}>
                <button
                  onClick={() => setExpanded(isOpen ? null : key)}
                  className="w-full flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <span className={`text-sm text-left ${isNA ? "text-[#2f3437]/40" : "text-[#2f3437]"}`}>{PRINCIPLE_LABELS[key] ?? key}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    {!isNA && delta != null && (
                      <span className={`text-xs font-semibold ${delta > 0 ? "text-green-600" : delta < 0 ? "text-[#ff0033]" : "text-gray-400"}`}>
                        {delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)}
                      </span>
                    )}
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${isNA ? "bg-gray-100 text-gray-400" : scoreBg(val.score)}`}>
                      {isNA ? "N/A" : val.score.toFixed(1)}
                    </span>
                    <span className="text-[#2f3437]/30 text-xs">{isOpen ? "▲" : "▼"}</span>
                  </div>
                </button>
                {isOpen && (val.evidence || principlesWithLessons.has(toAcademySlug(key))) && (
                  <div className="mx-3 mb-1 px-3 py-2 bg-gray-50 rounded-lg text-xs text-[#2f3437]/70 space-y-1">
                    {val.evidence && <p className="italic">{val.evidence}</p>}
                    {principlesWithLessons.has(toAcademySlug(key)) && (
                      <Link
                        href={`/member/academy/principles?tag=${toAcademySlug(key)}`}
                        className="inline-block font-semibold text-[#6ba3c7] hover:underline"
                      >
                        See lessons →
                      </Link>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        )}
      </div>

      {/* Strengths */}
      {report?.strengths?.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <h2 className="text-base font-semibold text-green-800 mb-3">✅ What&apos;s Working</h2>
          <ul className="space-y-2">
            {report.strengths.map((s: string, i: number) => (
              <li key={i} className="text-sm text-green-700 flex items-start gap-2">
                <span className="mt-0.5">•</span>{s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Gaps */}
      {report?.biggest_gaps?.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-[#2f3437] mb-3">🎯 Three Biggest Gaps</h2>
          <ul className="space-y-3">
            {report.biggest_gaps.map((g: string, i: number) => (
              <li key={i} className="flex items-start gap-3">
                <span className="bg-[#ff0033]/10 text-[#ff0033] text-xs font-bold px-2 py-0.5 rounded-full shrink-0 mt-0.5">{i + 1}</span>
                <span className="text-sm text-[#2f3437]/80">{g}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Learning Path */}
      {gaps.length > 0 && (
        <div className="bg-[#6ba3c7]/10 border border-[#6ba3c7]/30 rounded-lg p-6">
          <h2 className="text-base font-semibold text-[#2f3437] mb-3">📚 Your Learning Path</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {gaps.map(([key, val]: [string, any]) => (
              <div key={key} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
                <div>
                  <span className="text-sm text-[#2f3437]">{PRINCIPLE_LABELS[key]}</span>
                  <span className={`ml-2 text-xs font-bold ${scoreBg(val.score)} px-1.5 py-0.5 rounded-full`}>{val.score.toFixed(1)}</span>
                </div>
                {principlesWithLessons.has(toAcademySlug(key)) ? (
                  <Link
                    href={`/member/academy/principles?tag=${toAcademySlug(key)}`}
                    className="text-xs text-[#6ba3c7] font-semibold hover:underline shrink-0"
                  >
                    See lessons →
                  </Link>
                ) : (
                  <span className="text-xs text-[#6ba3c7] font-semibold shrink-0">{LEARNING_PATH[key] ?? "—"}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Videos */}
      {videos.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-[#2f3437] mb-4">Videos Analysed</h2>
          <ul className="space-y-2">
            {videos.map((v: any, i: number) => (
              <li key={i} className="flex items-center justify-between">
                <a href={`https://youtube.com/watch?v=${v.videoId}`} target="_blank" rel="noopener noreferrer" className="text-sm text-[#6ba3c7] hover:underline flex items-center gap-1">
                  {v.title}
                  <ArrowTopRightOnSquareIcon className="w-3 h-3 shrink-0" />
                </a>
                <span className="text-xs text-[#2f3437]/50">{fmtDuration(v.durationSeconds)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-center py-6 text-sm text-[#2f3437]/40 border-t border-gray-200">
        Prepared by Jared Chamberlain ~ Founder of Attraction by Video
      </div>
    </div>
  );
}

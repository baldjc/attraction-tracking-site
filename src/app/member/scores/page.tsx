"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

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

export default function MemberScoresPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/member/scores")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); });
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64 text-[#1e2a38]/40">Loading your scores…</div>;

  if (!data?.latestAudit) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-[#1e2a38] mb-2">My Scores</h1>
        <div className="bg-[#3dc3ff]/10 border border-[#3dc3ff]/30 rounded-xl p-8 text-center">
          <p className="text-[#1e2a38] font-medium mb-2">No audits yet</p>
          <p className="text-[#1e2a38]/60 text-sm">Your Attraction Scores will appear here after your first audit is completed by your coach.</p>
        </div>
      </div>
    );
  }

  const { latestAudit, baselineAudit, audits } = data;
  const scores = latestAudit.scores as any;
  const baselineScores = (baselineAudit?.scores as any) ?? null;

  const chartData = [...(audits ?? [])]
    .reverse()
    .filter((a: any) => a.overallScore != null)
    .map((a: any) => ({
      date: new Date(a.createdAt).toLocaleDateString("en-CA", { month: "short", day: "numeric" }),
      score: Number(a.overallScore?.toFixed(1)),
    }));

  const gaps = Object.entries(scores).filter(([key, v]: [string, any]) => key !== "show_dont_tell" && v.score != null && v.score < 7);

  return (
    <div className="max-w-3xl space-y-4 md:space-y-5">
      <h1 className="text-2xl font-bold text-[#1e2a38]">My Scores</h1>

      {/* Overall Score */}
      <div className={`rounded-xl p-5 text-center ${scoreBg(latestAudit.overallScore)}`}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-1 opacity-70">Current Attraction Score</p>
        <p className={`text-5xl md:text-6xl font-black ${scoreText(latestAudit.overallScore)}`}>
          {latestAudit.overallScore?.toFixed(1)}
        </p>
        <p className="text-sm font-medium mt-0.5 opacity-50">/ 10</p>
      </div>

      {/* Score Trend */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-base font-semibold text-[#1e2a38] mb-4">Score Over Time</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(val: number) => [val.toFixed(1), "Score"]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="score" stroke="#3dc3ff" strokeWidth={2.5} dot={{ r: 4, fill: "#3dc3ff" }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 16-Principle Breakdown */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-base font-semibold text-[#1e2a38] mb-4">16-Principle Breakdown</h2>
        <div className="space-y-1">
          {Object.entries(scores).map(([key, val]: [string, any]) => {
            const base = baselineScores?.[key]?.score;
            const delta = base != null ? val.score - base : null;
            const isOpen = expanded === key;
            return (
              <div key={key}>
                <button
                  onClick={() => setExpanded(isOpen ? null : key)}
                  className="w-full flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <span className="text-sm text-[#1e2a38] text-left">{PRINCIPLE_LABELS[key] ?? key}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    {delta != null && (
                      <span className={`text-xs font-semibold ${delta > 0 ? "text-green-600" : delta < 0 ? "text-[#ff0033]" : "text-gray-400"}`}>
                        {delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)}
                      </span>
                    )}
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(val.score)}`}>
                      {val.score.toFixed(1)}
                    </span>
                    <span className="text-[#1e2a38]/30 text-xs">{isOpen ? "▲" : "▼"}</span>
                  </div>
                </button>
                {isOpen && val.evidence && (
                  <div className="mx-3 mb-1 px-3 py-2 bg-gray-50 rounded-lg text-xs text-[#1e2a38]/70 italic">
                    {val.evidence}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Learning Path */}
      {gaps.length > 0 && (
        <div className="bg-[#3dc3ff]/10 border border-[#3dc3ff]/30 rounded-xl p-6">
          <h2 className="text-base font-semibold text-[#1e2a38] mb-3">📚 Your Learning Path</h2>
          <p className="text-sm text-[#1e2a38]/60 mb-3">Revisit these lessons to address your gaps:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {gaps.map(([key, val]: [string, any]) => (
              <div key={key} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
                <div>
                  <span className="text-sm text-[#1e2a38]">{PRINCIPLE_LABELS[key]}</span>
                  <span className={`ml-2 text-xs font-bold ${scoreBg(val.score)} px-1.5 py-0.5 rounded-full`}>{val.score.toFixed(1)}</span>
                </div>
                <span className="text-xs text-[#3dc3ff] font-semibold">{LEARNING_PATH[key]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audit History */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-base font-semibold text-[#1e2a38] mb-4">Audit History</h2>
        <div className="space-y-2">
          {audits.map((a: any) => (
            <div key={a.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
              <div>
                <span className="text-sm font-medium text-[#1e2a38] capitalize">{a.auditType.replace("_", " ")}</span>
                <span className="text-xs text-[#1e2a38]/50 ml-2">{fmt(a.createdAt)}</span>
              </div>
              <div className="flex items-center gap-3">
                {a.overallScore != null && (
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(a.overallScore)}`}>
                    {a.overallScore.toFixed(1)}
                  </span>
                )}
                <Link href={`/member/audits/${a.id}`} className="text-xs text-[#3dc3ff] hover:underline">
                  View →
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

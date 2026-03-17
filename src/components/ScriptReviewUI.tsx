"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowPathIcon, CheckIcon, BookmarkSquareIcon, TrashIcon, UserCircleIcon } from "@heroicons/react/24/outline";

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
};

const DIMENSIONS = [
  { key: "channel_strategy", label: "🎯 Channel Strategy" },
  { key: "content_impact", label: "🎬 Content Impact" },
  { key: "viewer_connection", label: "🤝 Viewer Connection" },
  { key: "lead_generation", label: "📈 Lead Generation" },
];

const PRINCIPLE_ORDER = [
  "avatar_clarity", "themes_over_topics", "arc_attention", "arc_revelation",
  "arc_connection", "title_frameworks", "approve_the_click", "lead_magnet_system",
  "curiosity_bridges", "show_dont_tell", "values_peppering", "connection_language",
  "story_proof", "grade_5_language", "binge_architecture",
];

function scoreBg(score: number) {
  if (score >= 7) return "bg-[#e8f7ff] text-[#0ea5d9]";
  if (score >= 5) return "bg-[#fef3c7] text-amber-700";
  return "bg-[#ffe5ea] text-[#cc0029]";
}

function scoreBgBlock(score: number) {
  if (score >= 7) return "bg-[#e8f7ff] border-[#3dc3ff]/30";
  if (score >= 5) return "bg-[#fef3c7] border-amber-200";
  return "bg-[#ffe5ea] border-[#ff0033]/20";
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

function extractScore(val: any): number {
  if (typeof val === "number") return val;
  if (val && typeof val === "object" && "score" in val) return Number(val.score);
  return 0;
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

interface ReviewResult {
  videoTitle: string;
  scores: any;
  overallScore: number;
  reportContent: {
    one_sentence_diagnosis: string | null;
    whats_working: Array<{ strength: string; evidence: string }>;
    three_improvements: Array<{ principle: string; score: number; current: string; improved: string; why: string; lesson?: string }>;
    quick_win: string | null;
    dimension_scores: { channel_strategy: number; content_impact: number; viewer_connection: number; lead_generation: number };
  };
}

interface MemberOption {
  id: string;
  fullName: string | null;
  email: string;
  youtubeHandle: string | null;
}

interface Props {
  fetchBaseline?: boolean;
  isAdmin?: boolean;
}

function ResultDisplay({ r, baselineScores }: { r: ReviewResult; baselineScores: any }) {
  const { scores, overallScore, reportContent } = r;
  const dims = reportContent.dimension_scores;
  const baselineAvg = baselineScores
    ? Object.values(baselineScores).map((v: any) => extractScore(v)).reduce((a, b) => a + b, 0) / Object.keys(baselineScores).length
    : null;
  const delta = baselineAvg != null ? overallScore - baselineAvg : null;

  return (
    <div className="space-y-5">
      {reportContent.one_sentence_diagnosis && (
        <div className="bg-[#1e2a38] rounded-xl p-5">
          <p className="text-xs font-semibold text-[#3dc3ff] uppercase tracking-wider mb-2">Diagnosis</p>
          <p className="text-sm font-medium text-white leading-relaxed italic">"{reportContent.one_sentence_diagnosis}"</p>
        </div>
      )}

      <div className={`rounded-xl p-6 text-center border ${scoreBgBlock(overallScore)}`}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-1 text-[#1e2a38]/60">Script Attraction Score</p>
        <p className={`text-6xl font-black ${scoreText(overallScore)}`}>{overallScore.toFixed(1)}</p>
        <p className="text-base font-medium mt-1 text-[#1e2a38]/40">/ 10</p>
        {delta != null && baselineAvg != null && (
          <p className="text-sm mt-2 text-[#1e2a38]/60">
            Baseline: <span className="font-semibold">{baselineAvg.toFixed(1)}</span>
            {" — this script scores "}
            <span className={`font-semibold ${deltaColor(delta)}`}>
              {delta >= 0 ? `↑ ${delta.toFixed(1)} higher` : `↓ ${Math.abs(delta).toFixed(1)} lower`}
            </span>
          </p>
        )}
      </div>

      {dims && (
        <div className="grid grid-cols-2 gap-3">
          {DIMENSIONS.map(({ key, label }) => {
            const s = (dims as any)[key] ?? 0;
            return (
              <div key={key} className={`rounded-xl p-4 border text-center ${scoreBgBlock(s)}`}>
                <p className="text-xs text-[#1e2a38]/50 mb-1">{label}</p>
                <p className={`text-2xl font-bold ${scoreText(s)}`}>{s.toFixed(1)}</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-[#1e2a38] mb-3">16-Principle Scorecard</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-1.5 pr-2 text-[#1e2a38]/50 font-semibold uppercase tracking-wider">Principle</th>
                <th className="text-center py-1.5 px-2 text-[#1e2a38]/50 font-semibold uppercase tracking-wider">Script</th>
                {baselineScores && (
                  <>
                    <th className="text-center py-1.5 px-2 text-[#1e2a38]/50 font-semibold uppercase tracking-wider">Baseline</th>
                    <th className="text-center py-1.5 pl-2 text-[#1e2a38]/50 font-semibold uppercase tracking-wider">Δ</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {PRINCIPLE_ORDER.filter((k) => scores[k]).map((key) => {
                const curr = extractScore(scores[key]);
                const base = baselineScores ? extractScore(baselineScores[key]) : null;
                const d = base != null ? curr - base : null;
                return (
                  <tr key={key} className="border-b border-gray-50 last:border-0">
                    <td className="py-1.5 pr-2 text-[#1e2a38]">{PRINCIPLE_LABELS[key]}</td>
                    <td className="py-1.5 px-2 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(curr)}`}>{curr.toFixed(1)}</span>
                    </td>
                    {baselineScores && (
                      <>
                        <td className="py-1.5 px-2 text-center">
                          {base != null ? <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(base)}`}>{base.toFixed(1)}</span> : "—"}
                        </td>
                        <td className={`py-1.5 pl-2 text-center font-bold ${d != null ? deltaColor(d) : "text-gray-400"}`}>
                          {d == null ? "—" : d > 0 ? `+${d.toFixed(1)}` : d < 0 ? d.toFixed(1) : "0.0"}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {reportContent.whats_working?.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-green-800 mb-3">✅ What&apos;s Working</h3>
          <div className="space-y-3">
            {reportContent.whats_working.map((item, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5 shrink-0">•</span>
                <div>
                  <p className="text-sm text-green-800 font-medium">{item.strength}</p>
                  {item.evidence && <p className="text-xs text-green-700/70 mt-0.5 italic">"{item.evidence}"</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {reportContent.three_improvements?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-[#1e2a38] mb-4">💡 Three Ideas for Improvement</h3>
          <div className="space-y-5">
            {reportContent.three_improvements.map((item, i) => {
              const principleKey = Object.entries(PRINCIPLE_LABELS).find(([, v]) => v.toLowerCase() === (item.principle ?? "").toLowerCase())?.[0];
              const lesson = item.lesson ?? (principleKey ? LEARNING_PATH[principleKey] : null);
              const score = item.score ?? (principleKey ? extractScore(scores[principleKey]) : null);
              return (
                <div key={i} className="border-l-4 border-[#3dc3ff] pl-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-[#3dc3ff] uppercase tracking-wider">{i + 1}. {item.principle}</span>
                    {score != null && score > 0 && (
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(score)}`}>{score.toFixed(1)}</span>
                    )}
                    {lesson && (
                      <span className="text-xs text-[#1e2a38]/40 ml-auto">{lesson}</span>
                    )}
                  </div>
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
              );
            })}
          </div>
        </div>
      )}

      {reportContent.quick_win && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-amber-800 mb-2">⚡ Quick Win — Do This Before You Record</h3>
          <p className="text-sm text-amber-900 leading-relaxed">{reportContent.quick_win}</p>
        </div>
      )}
    </div>
  );
}

export default function ScriptReviewUI({ fetchBaseline = false, isAdmin = false }: Props) {
  const [videoTitle, setVideoTitle] = useState("");
  const [scriptText, setScriptText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [viewedResult, setViewedResult] = useState<any | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [baselineScores, setBaselineScores] = useState<any | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [adminMode, setAdminMode] = useState<"self" | "member">("self");
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");
  const [memberBaseline, setMemberBaseline] = useState<any | null>(null);
  const [memberBaselineLoading, setMemberBaselineLoading] = useState(false);
  const loadHistory = useCallback(async () => {
    const res = await fetch("/api/script-review");
    if (res.ok) {
      const data = await res.json();
      setHistory(data.reviews ?? []);
    }
  }, []);

  const loadBaseline = useCallback(async () => {
    if (!fetchBaseline) return;
    const res = await fetch("/api/member/scores");
    if (res.ok) {
      const data = await res.json();
      const baseline = data.audits?.find((a: any) => a.auditType === "baseline");
      if (baseline?.scores) setBaselineScores(baseline.scores);
    }
  }, [fetchBaseline]);

  const loadMembers = useCallback(async () => {
    if (!isAdmin) return;
    setMembersLoading(true);
    const res = await fetch("/api/members");
    if (res.ok) {
      const data = await res.json();
      setMembers(data.members ?? []);
    }
    setMembersLoading(false);
  }, [isAdmin]);

  const loadMemberBaseline = useCallback(async (userId: string) => {
    if (!userId) { setMemberBaseline(null); return; }
    setMemberBaselineLoading(true);
    const res = await fetch(`/api/admin/member-scores/${userId}`);
    if (res.ok) {
      const data = await res.json();
      setMemberBaseline(data.baseline?.scores ?? null);
    }
    setMemberBaselineLoading(false);
  }, []);

  useEffect(() => {
    loadHistory();
    loadBaseline();
  }, [loadHistory, loadBaseline]);

  useEffect(() => {
    if (isAdmin && adminMode === "member" && members.length === 0) {
      loadMembers();
    }
  }, [isAdmin, adminMode, members.length, loadMembers]);

  async function handleModeToggle(mode: "self" | "member") {
    setAdminMode(mode);
    setSelectedMemberId("");
    setMemberBaseline(null);
    if (mode === "member" && members.length === 0) loadMembers();
  }

  async function handleMemberSelect(userId: string) {
    setSelectedMemberId(userId);
    setMemberBaseline(null);
    if (userId) loadMemberBaseline(userId);
  }

  const activeBaselineScores = isAdmin
    ? (adminMode === "member" ? memberBaseline : null)
    : baselineScores;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!videoTitle.trim() || !scriptText.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setSavedId(null);

    try {
      const res = await fetch("/api/script-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoTitle: videoTitle.trim(), scriptText: scriptText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
      } else {
        setResult(data);
        window.scrollTo({ top: document.getElementById("sr-results")?.offsetTop ?? 0, behavior: "smooth" });
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!result) return;
    setSaving(true);
    try {
      const res = await fetch("/api/script-review/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoTitle: result.videoTitle,
          scriptText: scriptText.trim(),
          scores: result.scores,
          overallScore: result.overallScore,
          reportContent: result.reportContent,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSavedId(data.id);
        loadHistory();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleViewHistory(id: string) {
    if (viewingId === id) {
      setViewingId(null);
      setViewedResult(null);
      return;
    }
    setViewingId(id);
    setViewLoading(true);
    const res = await fetch(`/api/script-review/${id}`);
    if (res.ok) setViewedResult(await res.json());
    setViewLoading(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this saved review?")) return;
    setDeletingId(id);
    await fetch(`/api/script-review/${id}`, { method: "DELETE" });
    setHistory((h) => h.filter((r) => r.id !== id));
    if (viewingId === id) { setViewingId(null); setViewedResult(null); }
    setDeletingId(null);
  }

  const activeResult: ReviewResult | null = viewedResult
    ? { videoTitle: viewedResult.videoTitle, scores: viewedResult.scores, overallScore: viewedResult.overallScore, reportContent: viewedResult.reportContent }
    : result;

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[#1e2a38]">Script Review</h1>
        <p className="text-sm text-[#1e2a38]/60 mt-1">
          Paste a script or transcript to score it against the 16 Attraction principles before recording.
        </p>
      </div>

      {isAdmin && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-3">
          <p className="text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wider">Comparison Mode</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleModeToggle("self")}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                adminMode === "self"
                  ? "bg-[#1e2a38] text-white border-[#1e2a38]"
                  : "bg-white text-[#1e2a38]/60 border-gray-200 hover:border-gray-300"
              }`}
            >
              No comparison
            </button>
            <button
              type="button"
              onClick={() => handleModeToggle("member")}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors flex items-center justify-center gap-1.5 ${
                adminMode === "member"
                  ? "bg-[#3dc3ff] text-white border-[#3dc3ff]"
                  : "bg-white text-[#1e2a38]/60 border-gray-200 hover:border-gray-300"
              }`}
            >
              <UserCircleIcon className="w-4 h-4" />
              Compare to member
            </button>
          </div>
          {adminMode === "member" && (
            <div>
              {membersLoading ? (
                <p className="text-xs text-[#1e2a38]/40 py-2">Loading members…</p>
              ) : (
                <select
                  value={selectedMemberId}
                  onChange={(e) => handleMemberSelect(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-[#1e2a38] focus:outline-none focus:ring-2 focus:ring-[#3dc3ff]/40"
                >
                  <option value="">— Select a member —</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.fullName ?? m.email}{m.youtubeHandle ? ` (@${m.youtubeHandle})` : ""}
                    </option>
                  ))}
                </select>
              )}
              {selectedMemberId && (
                <p className="text-xs mt-1.5 text-[#1e2a38]/50">
                  {memberBaselineLoading
                    ? "Loading baseline…"
                    : memberBaseline
                    ? "✓ Baseline loaded — comparison column will appear in results"
                    : "No baseline audit found for this member"}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
        <div>
          <label className="block text-sm font-medium text-[#1e2a38] mb-1.5">Video Title</label>
          <input
            type="text"
            value={videoTitle}
            onChange={(e) => setVideoTitle(e.target.value)}
            placeholder="What's the working title?"
            required
            disabled={loading}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:ring-2 focus:ring-[#3dc3ff]/40 disabled:opacity-60"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[#1e2a38] mb-1.5">Script / Transcript</label>
          <textarea
            value={scriptText}
            onChange={(e) => setScriptText(e.target.value)}
            placeholder="Paste the full script or transcript here..."
            required
            disabled={loading}
            rows={12}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:ring-2 focus:ring-[#3dc3ff]/40 resize-y disabled:opacity-60"
          />
          <p className="text-xs text-[#1e2a38]/40 mt-1">
            {scriptText.length > 0 ? `${scriptText.split(/\s+/).filter(Boolean).length} words` : "Paste at least a paragraph for best results"}
          </p>
        </div>
        {error && (
          <p className="text-sm text-[#ff0033] bg-[#ffe5ea] px-3 py-2 rounded-lg">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading || !videoTitle.trim() || !scriptText.trim()}
          className="w-full bg-[#3dc3ff] hover:bg-[#2ab0ec] text-white font-semibold text-sm py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <ArrowPathIcon className="w-4 h-4 animate-spin" />
              Analysing script…
            </>
          ) : (
            "Review This Script"
          )}
        </button>
        {loading && (
          <p className="text-xs text-center text-[#1e2a38]/40">Usually takes 20–40 seconds…</p>
        )}
      </form>

      {activeResult && (
        <div id="sr-results" className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#1e2a38]">
              {viewedResult ? `Review: "${viewedResult.videoTitle}"` : "Results"}
            </h2>
            {result && !viewedResult && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setResult(null); setSavedId(null); }}
                  className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-[#1e2a38]/70 transition-colors"
                >
                  Review Again
                </button>
                {savedId ? (
                  <span className="inline-flex items-center gap-1 text-sm text-green-600 font-medium">
                    <CheckIcon className="w-4 h-4" />
                    Saved
                  </span>
                ) : (
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-[#1e2a38] hover:bg-[#1e2a38]/90 text-white transition-colors disabled:opacity-50"
                  >
                    <BookmarkSquareIcon className="w-4 h-4" />
                    {saving ? "Saving…" : "Save Review"}
                  </button>
                )}
              </div>
            )}
            {viewedResult && (
              <button
                onClick={() => { setViewingId(null); setViewedResult(null); }}
                className="text-sm text-[#1e2a38]/50 hover:text-[#1e2a38]"
              >
                ← Back
              </button>
            )}
          </div>
          <ResultDisplay r={activeResult} baselineScores={activeBaselineScores} />
        </div>
      )}

      {history.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-[#1e2a38]">Saved Reviews</h2>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {history.map((rev, i) => (
              <div key={rev.id} className={`flex items-center gap-3 px-4 py-3 ${i < history.length - 1 ? "border-b border-gray-100" : ""}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#1e2a38] truncate">{rev.videoTitle}</p>
                  <p className="text-xs text-[#1e2a38]/40 mt-0.5">{fmt(rev.createdAt)}</p>
                </div>
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ${scoreBg(rev.overallScore)}`}>
                  {Number(rev.overallScore).toFixed(1)}
                </span>
                <button
                  onClick={() => handleViewHistory(rev.id)}
                  disabled={viewLoading && viewingId === rev.id}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors shrink-0 ${
                    viewingId === rev.id
                      ? "border-[#3dc3ff] bg-[#e8f7ff] text-[#3dc3ff]"
                      : "border-gray-200 hover:bg-gray-50 text-[#1e2a38]/70"
                  }`}
                >
                  {viewLoading && viewingId === rev.id ? "Loading…" : viewingId === rev.id ? "Close" : "View"}
                </button>
                <button
                  onClick={() => handleDelete(rev.id)}
                  disabled={deletingId === rev.id}
                  className="text-[#ff0033]/40 hover:text-[#ff0033] transition-colors shrink-0 disabled:opacity-30"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

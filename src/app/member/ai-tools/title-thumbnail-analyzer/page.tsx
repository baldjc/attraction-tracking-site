"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PhotoIcon, BookmarkIcon, CheckIcon, PaperAirplaneIcon, ArrowLeftIcon } from "@heroicons/react/24/outline";
import { SparklesIcon } from "@heroicons/react/24/solid";
import Link from "next/link";
import PromptEditor from "@/components/ai-tools/PromptEditor";
import RecentConversations from "@/components/ai-tools/RecentConversations";
import ResourceRecommendations from "@/components/ResourceRecommendations";
import MarkdownMessage from "@/components/MarkdownMessage";
import NextStepCard from "@/components/ai-tools/NextStepCard";
import LinkedPlanBanner from "@/components/ai-tools/LinkedPlanBanner";

interface SubScores {
  [key: string]: number;
}

interface TitleAlternative {
  title: string;
  formula: string;
}

interface AnalysisResult {
  thumbnail?: {
    score?: number;
    sub_scores?: SubScores;
    dissonance_triggers_used?: string[];
    thumbnail_pattern?: string;
    observations?: string[];
    improvements?: string[];
    mistakes_flagged?: string[];
  };
  title?: {
    score?: number;
    sub_scores?: SubScores;
    framework_used?: string;
    formula_match?: string;
    dissonance_triggers_used?: string[];
    character_count?: number;
    alternatives?: (string | TitleAlternative)[];
    attraction_scores?: {
      title_frameworks: number;
      approve_the_click: number;
      avatar_clarity: number;
      superlative_urgency?: number;
    };
    observations?: string[];
    mistakes_flagged?: string[];
  };
  combined?: {
    score?: number;
    sub_scores?: SubScores;
    dissonance_combination?: string;
    avatar_would_click?: boolean;
    observations?: string[];
    improvements?: string[];
    redundancies?: string[];
    thumbnail_concepts?: string[];
    mistakes_flagged?: string[];
  };
  intro?: {
    score?: number;
    approves_click?: boolean;
    observations?: string[];
    improvements?: string[];
  };
  follow_up?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  titles?: string[];
}

function ScoreGauge({ label, score, max = 20 }: { label: string; score: number; max?: number }) {
  const pct = Math.min((score / max) * 100, 100);
  const color = score >= max * 0.75 ? "#22c55e" : score >= max * 0.5 ? "#f59e0b" : "#e63946";
  return (
    <div className="text-center">
      <div className="relative w-24 h-24 mx-auto mb-2">
        <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" />
          <circle
            cx="18" cy="18" r="15.9" fill="none"
            stroke={color} strokeWidth="3"
            strokeDasharray={`${pct} ${100 - pct}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-[#2f3437]">{score}</span>
          <span className="text-xs text-[#2f3437]/40">/{max}</span>
        </div>
      </div>
      <p className="text-sm font-semibold text-[#2f3437]">{label}</p>
    </div>
  );
}

function ScoreBadge({ label, score }: { label: string; score: number }) {
  const color =
    score >= 8
      ? "bg-green-100 text-green-700"
      : score >= 5
        ? "bg-amber-100 text-amber-700"
        : "bg-red-100 text-red-700";
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${color}`}>
      {label} <strong>{score}/10</strong>
    </span>
  );
}

const SUB_SCORE_LABELS: Record<string, string> = {
  visual_contradiction: "Visual Contradiction",
  expectation_violation: "Expectation Violation",
  curiosity_gap: "Curiosity Gap",
  emotional_tension: "Emotional Tension",
  pattern_interrupt: "Pattern Interrupt",
  belief_challenge: "Belief Challenge",
  specificity_mystery: "Specificity + Mystery",
  tension_words: "Tension Words",
  stakes_clarity: "Stakes Clarity",
  pattern_break: "Pattern Break",
  reinforced_tension: "Reinforced Tension",
  gap_alignment: "Gap Alignment",
  information_balance: "Information Balance",
  promise_consistency: "Promise Consistency",
  click_compulsion: "Click Compulsion",
};

function SubScoreBar({ name, value }: { name: string; value: number }) {
  const label = SUB_SCORE_LABELS[name] ?? name;
  const pct = (value / 4) * 100;
  const color =
    value >= 3 ? "bg-green-500" : value >= 2 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[#2f3437]/60 w-44 shrink-0 text-right">{label}</span>
      <div className="flex-1 h-2 bg-[#2f3437]/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-[#2f3437] w-8">{value}/4</span>
    </div>
  );
}

function SubScoreBreakdown({ subScores }: { subScores?: SubScores }) {
  if (!subScores || Object.keys(subScores).length === 0) return null;
  return (
    <div className="space-y-2 mt-4 pt-4 border-t border-[#2f3437]/8">
      <p className="text-xs font-semibold text-[#2f3437]/40 uppercase tracking-wide mb-2">
        Score Breakdown
      </p>
      {Object.entries(subScores).map(([key, val]) => (
        <SubScoreBar key={key} name={key} value={val} />
      ))}
    </div>
  );
}

function GoDeeperSection({
  title,
  result,
  introTranscript,
  dramaMode,
}: {
  title: string;
  result: AnalysisResult;
  introTranscript: string;
  dramaMode: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [savedTitles, setSavedTitles] = useState<Set<string>>(new Set());
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const alternatives = result.title?.alternatives ?? [];

  const quickActions: string[] = [
    ...alternatives.slice(0, 3).map((a, i) => `Give me 5 more title variations like alternative #${i + 1}`),
    "How can I improve my thumbnail to match this title better?",
    "What would make this title score higher?",
    "Rewrite my title using a different framework",
  ];

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;
    const userMsg: ChatMessage = { role: "user", content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai-tools/title-thumbnail-analyzer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "chat",
          title,
          analysisResult: result,
          introTranscript,
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          dramaMode,
        }),
      });
      const data = await res.json();
      if (data.reply) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.reply, titles: data.titles ?? [] },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function saveTitle(t: string) {
    await fetch("/api/ai-tools/save-title", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: t, topic: title }),
    });
    setSavedTitles((prev) => new Set([...prev, t]));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div className="bg-white border border-[#2f3437]/10 rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-[#2f3437]/8 flex items-center gap-2">
        <SparklesIcon className="w-4 h-4 text-[#6ba3c7]" />
        <h2 className="font-semibold text-[#2f3437]">Go Deeper</h2>
        <span className="text-xs text-[#2f3437]/40 ml-1">Ask questions or try variations based on your analysis</span>
      </div>

      {/* Quick action buttons */}
      <div className="px-6 py-4 border-b border-[#2f3437]/8">
        <p className="text-xs font-semibold text-[#2f3437]/40 uppercase tracking-wide mb-3">Quick Actions</p>
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action) => (
            <button
              key={action}
              onClick={() => sendMessage(action)}
              disabled={loading}
              className="text-xs px-3 py-2 rounded-lg border border-[#6ba3c7]/40 text-[#6ba3c7] bg-[#6ba3c7]/5 hover:bg-[#6ba3c7]/10 hover:border-[#6ba3c7] transition-colors disabled:opacity-50"
            >
              {action}
            </button>
          ))}
        </div>
      </div>

      {/* Chat messages */}
      {messages.length > 0 && (
        <div className="px-6 py-4 space-y-4 max-h-[520px] overflow-y-auto border-b border-[#2f3437]/8">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "user" ? (
                <div className="bg-[#6ba3c7] text-white rounded-lg rounded-tr-sm px-4 py-2.5 max-w-[85%]">
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
              ) : (
                <div className="bg-[#f7f6f3] rounded-lg rounded-tl-sm px-4 py-3 max-w-full w-full space-y-3">
                  <MarkdownMessage className="text-sm text-[#2f3437] leading-relaxed">{msg.content}</MarkdownMessage>
                  {msg.titles && msg.titles.length > 0 && (
                    <div className="border-t border-[#2f3437]/10 pt-3 space-y-2">
                      <p className="text-xs font-semibold text-[#2f3437]/40 uppercase tracking-wide">
                        Title Suggestions — click to save
                      </p>
                      {msg.titles.map((t, ti) => (
                        <div
                          key={ti}
                          className="flex items-start justify-between gap-3 bg-white border border-[#2f3437]/10 rounded-lg px-3 py-2.5"
                        >
                          <p className="text-sm text-[#2f3437] flex-1">
                            {ti + 1}. {t}
                          </p>
                          <button
                            onClick={() => saveTitle(t)}
                            disabled={savedTitles.has(t)}
                            title={savedTitles.has(t) ? "Saved" : "Save this title"}
                            className={`shrink-0 p-1 rounded transition-colors ${
                              savedTitles.has(t)
                                ? "text-green-500"
                                : "text-[#2f3437]/30 hover:text-[#6ba3c7]"
                            }`}
                          >
                            {savedTitles.has(t) ? (
                              <CheckIcon className="w-4 h-4" />
                            ) : (
                              <BookmarkIcon className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-[#f7f6f3] rounded-lg rounded-tl-sm px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-[#6ba3c7]/60 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 bg-[#6ba3c7]/60 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 bg-[#6ba3c7]/60 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      )}

      {/* Chat input */}
      <div className="px-6 py-4 flex gap-3 items-end">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything — e.g. 'Make it more curiosity-driven' or 'Give versions for Instagram Reels too'"
          rows={2}
          className="flex-1 border border-[#2f3437]/20 rounded-lg px-4 py-3 text-sm text-[#2f3437] placeholder-[#2f3437]/30 focus:outline-none focus:border-[#6ba3c7] resize-none transition-colors"
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
          className="shrink-0 p-3 bg-[#6ba3c7] text-white rounded-lg hover:bg-[#6ba3c7]/90 disabled:opacity-50 transition-colors"
        >
          <PaperAirplaneIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function TitleThumbnailAnalyzerPageInner() {
  const searchParams = useSearchParams();
  const urlPlanId = searchParams.get("planId");

  const [title, setTitle] = useState("");
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [introTranscript, setIntroTranscript] = useState("");
  const [thumbnailWords, setThumbnailWords] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [linkedPlanId, setLinkedPlanId] = useState<string | null>(urlPlanId);
  const [dramaMode, setDramaMode] = useState<boolean>(false);
  const [plannerSaving, setPlannerSaving] = useState(false);
  const [plannerSaved, setPlannerSaved] = useState(false);
  const [plannerSaveError, setPlannerSaveError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("title_prefill");
      if (raw) {
        sessionStorage.removeItem("title_prefill");
        const data = JSON.parse(raw);
        if (data.title) setTitle(data.title);
        if (data.planId) setLinkedPlanId(data.planId);
        if (data.transcript) setIntroTranscript(data.transcript);
        if (data.thumbnailWords) setThumbnailWords(data.thumbnailWords);
        if (typeof data.dramaMode === "boolean") setDramaMode(data.dramaMode);
      }
    } catch {}
  }, []);

  async function handleSaveTitleToPlan(titleToSave: string) {
    if (!linkedPlanId || !titleToSave.trim()) return;
    setPlannerSaving(true);
    setPlannerSaveError(false);
    try {
      // Backward-compatible: keep updating ContentPlan.title
      const res = await fetch(`/api/member/content-plans/${linkedPlanId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: titleToSave.trim() }),
      });
      if (!res.ok) throw new Error("Save failed");

      // Sprint 3 Part B: also write a PlanArtifact of type "title".
      // Best-effort: silently swallow artifact errors so legacy save still wins.
      try {
        await fetch(`/api/member/content-plans/${linkedPlanId}/artifacts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "title",
            content: titleToSave.trim(),
            metadata: {
              score: result?.title?.score ?? null,
              alternatives: result?.title?.alternatives ?? [],
              savedAt: new Date().toISOString(),
            },
          }),
        });
      } catch (err) {
        console.error("[title-thumbnail] artifact save failed:", err);
      }

      setPlannerSaved(true);
    } catch {
      setPlannerSaveError(true);
    } finally {
      setPlannerSaving(false);
    }
  }

  // Sprint 3 Part B: Save thumbnail (uploaded image as data URL) as a PlanArtifact
  const [thumbnailSaving, setThumbnailSaving] = useState(false);
  const [thumbnailSaved, setThumbnailSaved] = useState(false);
  const [thumbnailSaveError, setThumbnailSaveError] = useState(false);

  async function handleSaveThumbnailToPlan() {
    if (!linkedPlanId || !thumbnailPreview) return;
    setThumbnailSaving(true);
    setThumbnailSaveError(false);
    try {
      const res = await fetch(`/api/member/content-plans/${linkedPlanId}/artifacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "thumbnail",
          content: thumbnailPreview,
          metadata: {
            score: result?.thumbnail?.score ?? null,
            alternatives: (result?.thumbnail as { alternatives?: unknown[] } | undefined)?.alternatives ?? [],
            imageType: thumbnail?.type ?? null,
            dimensions: null,
            savedAt: new Date().toISOString(),
          },
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      setThumbnailSaved(true);
    } catch {
      setThumbnailSaveError(true);
    } finally {
      setThumbnailSaving(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setThumbnail(file);
    const reader = new FileReader();
    reader.onloadend = () => setThumbnailPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function analyse() {
    if (!title.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);

    let thumbnailBase64: string | null = null;
    let thumbnailMimeType: string | null = null;

    if (thumbnail) {
      const reader = new FileReader();
      await new Promise<void>((resolve) => {
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          const [header, data] = dataUrl.split(",");
          thumbnailBase64 = data;
          thumbnailMimeType = header.match(/data:([^;]+)/)?.[1] ?? "image/jpeg";
          resolve();
        };
        reader.readAsDataURL(thumbnail);
      });
    }

    const res = await fetch("/api/ai-tools/title-thumbnail-analyzer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, thumbnailBase64, thumbnailMimeType, introTranscript: introTranscript.trim(), thumbnailWords: thumbnailWords.trim(), dramaMode }),
    });

    const data = await res.json();
    if (data.result) {
      setResult(data.result);
      // Save analysis as a conversation for 30-day history
      fetch("/api/ai-tools/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolType: "title_thumbnail_analyzer",
          title: title.trim(),
          messages: [
            {
              role: "assistant",
              content: `Analysis complete. Combined score: ${data.result.combined?.score ?? "—"}/20. Title score: ${data.result.title?.score ?? "—"}/20. Thumbnail score: ${data.result.thumbnail?.score ?? "—"}/20.`,
            },
          ],
          metadata: {
            overallScore: data.result.combined?.score != null ? data.result.combined.score / 2 : null,
            titleScore: data.result.title?.score ?? null,
            thumbnailScore: data.result.thumbnail?.score ?? null,
            combinedRaw: data.result.combined?.score ?? null,
            analysisResult: data.result,
            videoTitle: title.trim(),
          },
        }),
      }).then(() => setRefreshCounter((n) => n + 1)).catch(() => {});
    } else {
      setError("Analysis failed. Please try again.");
    }
    setLoading(false);
  }

  function reset() {
    setTitle("");
    setThumbnail(null);
    setThumbnailPreview(null);
    setIntroTranscript("");
    setThumbnailWords("");
    setResult(null);
    setError("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleLoadConversation(conv: { title: string; metadata?: Record<string, unknown> | null }) {
    const meta = conv.metadata as { analysisResult?: AnalysisResult; videoTitle?: string } | null;
    if (!meta?.analysisResult) return;
    setTitle(meta.videoTitle ?? conv.title);
    setResult(meta.analysisResult);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-5">
        <Link
          href="/member/ai-tools"
          className="flex items-center gap-1.5 text-xs text-[#2f3437]/50 hover:text-[#6ba3c7] transition-colors mb-3"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          Back to AI Tools
        </Link>
        <h1 className="text-2xl font-bold text-[#2f3437]">🔍 Title &amp; Thumbnail Analyzer</h1>
        <p className="text-sm text-[#2f3437]/60 mt-1">
          Score your title and thumbnail for cognitive dissonance — the gap that compels the click
        </p>
      </div>

      {linkedPlanId && <LinkedPlanBanner planId={linkedPlanId} />}
      <PromptEditor toolKey="title_thumbnail_analyzer_prompt" defaultPrompt="" placeholders={[]} />
      <RecentConversations
        toolType="title_thumbnail_analyzer"
        label="Recent Analyses"
        emptyLabel="No analyses saved in the last 30 days."
        refreshTrigger={refreshCounter}
        onLoad={handleLoadConversation as any}
      />

      {!result ? (
        <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-[#2f3437] mb-2">Video Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Paste your video title here..."
                className="w-full bg-white border border-[#2f3437]/20 rounded-lg px-4 py-3 text-sm text-[#2f3437] placeholder-[#2f3437]/30 focus:outline-none focus:border-[#6ba3c7] transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#2f3437] mb-2">
                Thumbnail{" "}
                <span className="font-normal text-[#2f3437]/40">(optional — jpg, png, webp)</span>
              </label>
              {thumbnailPreview ? (
                <div className="relative inline-block">
                  <img
                    src={thumbnailPreview}
                    alt="Thumbnail preview"
                    className="h-32 rounded-lg border border-[#2f3437]/20 object-cover"
                  />
                  <button
                    onClick={() => {
                      setThumbnail(null);
                      setThumbnailPreview(null);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                    className="absolute -top-2 -right-2 bg-[#ff0033] text-white w-5 h-5 rounded-full text-xs flex items-center justify-center hover:bg-[#ff0033]/80"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-[#2f3437]/20 rounded-lg cursor-pointer hover:border-[#6ba3c7]/50 transition-colors">
                  <PhotoIcon className="w-8 h-8 text-[#2f3437]/20 mb-2" />
                  <span className="text-sm text-[#2f3437]/40">Click to upload thumbnail</span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#2f3437] mb-1">
                Thumbnail Text{" "}
                <span className="font-normal text-[#2f3437]/40">(optional — 2–3 words you plan to put on the thumbnail)</span>
              </label>
              <p className="text-xs text-[#2f3437]/40 mb-2">
                If you haven&apos;t designed the image yet, type the words you plan to use so the AI can score the title-and-thumbnail copy combo.
              </p>
              <input
                type="text"
                value={thumbnailWords}
                onChange={(e) => setThumbnailWords(e.target.value)}
                placeholder="e.g. STOP CHASING"
                className="w-full bg-white border border-[#2f3437]/20 rounded-lg px-4 py-3 text-sm text-[#2f3437] placeholder-[#2f3437]/30 focus:outline-none focus:border-[#6ba3c7] transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#2f3437] mb-1">
                Video Intro Transcript{" "}
                <span className="font-normal text-[#2f3437]/40">(optional — first 30–60 seconds)</span>
              </label>
              <p className="text-xs text-[#2f3437]/40 mb-2">
                Paste your intro script or transcript so the AI can check whether it delivers on the promise of your title.
              </p>
              <textarea
                value={introTranscript}
                onChange={(e) => setIntroTranscript(e.target.value)}
                placeholder="Hey, in this video I'm going to show you exactly why most agents are losing listings before they even get to the appointment..."
                rows={4}
                className="w-full bg-white border border-[#2f3437]/20 rounded-lg px-4 py-3 text-sm text-[#2f3437] placeholder-[#2f3437]/30 focus:outline-none focus:border-[#6ba3c7] transition-colors resize-y"
              />
            </div>

            {error && <p className="text-sm text-[#ff0033]">{error}</p>}

            <button
              onClick={analyse}
              disabled={loading || !title.trim()}
              className="w-full bg-[#6ba3c7] text-white py-3 rounded-lg font-semibold hover:bg-[#6ba3c7]/90 disabled:opacity-50 transition-colors"
            >
              {loading ? "Analysing..." : "Analyse"}
            </button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Score gauges */}
          <div className="bg-white border border-[#2f3437]/10 rounded-lg p-6">
            <h2 className="font-semibold text-[#2f3437] mb-6 text-center">Cognitive Dissonance Scores</h2>
            <div className={`grid gap-4 ${result.intro ? "grid-cols-4" : "grid-cols-3"}`}>
              <ScoreGauge label="Thumbnail" score={result.thumbnail?.score ?? 0} />
              <ScoreGauge label="Title" score={result.title?.score ?? 0} />
              <ScoreGauge label="Combined" score={result.combined?.score ?? 0} />
              {result.intro && <ScoreGauge label="Intro" score={result.intro?.score ?? 0} />}
            </div>
          </div>

          {/* Attraction principle scores */}
          {result.title?.attraction_scores && (
            <div className="bg-white border border-[#2f3437]/10 rounded-lg p-6">
              <h2 className="font-semibold text-[#2f3437] mb-4">Attraction Principle Scores</h2>
              <div className="flex flex-wrap gap-2">
                <ScoreBadge label="Title Frameworks" score={result.title.attraction_scores.title_frameworks} />
                <ScoreBadge label="Approve the Click" score={result.title.attraction_scores.approve_the_click} />
                <ScoreBadge label="Avatar Clarity" score={result.title.attraction_scores.avatar_clarity} />
                {result.title.attraction_scores.superlative_urgency != null && (
                  <ScoreBadge label="Superlative & Urgency" score={result.title.attraction_scores.superlative_urgency} />
                )}
              </div>
              {result.title?.framework_used && (
                <p className="text-sm text-[#2f3437]/60 mt-3">
                  Framework detected: <strong>{result.title.framework_used}</strong>
                </p>
              )}
            </div>
          )}

          {/* Thumbnail analysis */}
          {(result.thumbnail?.observations?.length ?? 0) > 0 && (
            <div className="bg-white border border-[#2f3437]/10 rounded-lg p-6">
              <h2 className="font-semibold text-[#2f3437] mb-4">Thumbnail Analysis</h2>
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-[#2f3437]/40 uppercase tracking-wide mb-2">
                    Observations
                  </p>
                  <ul className="space-y-1.5">
                    {result.thumbnail?.observations?.map((o, i) => (
                      <li key={i} className="text-sm text-[#2f3437] flex gap-2">
                        <span className="text-[#6ba3c7]">•</span>
                        {o}
                      </li>
                    ))}
                  </ul>
                </div>
                {(result.thumbnail?.improvements?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-[#2f3437]/40 uppercase tracking-wide mb-2">
                      Improvements
                    </p>
                    <ul className="space-y-1.5">
                      {result.thumbnail?.improvements?.map((o, i) => (
                        <li key={i} className="text-sm text-[#2f3437] flex gap-2">
                          <span className="text-amber-500">→</span>
                          {o}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(result.thumbnail?.dissonance_triggers_used?.length ?? 0) > 0 && (
                  <div className="mt-1">
                    <p className="text-xs font-semibold text-[#2f3437]/40 uppercase tracking-wide mb-2">
                      Dissonance Triggers Detected
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {result.thumbnail?.dissonance_triggers_used?.map((t, i) => (
                        <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-[#6ba3c7]/10 text-[#6ba3c7] font-medium">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {result.thumbnail?.thumbnail_pattern && (
                  <p className="text-sm text-[#2f3437]/60">
                    Pattern: <strong>{result.thumbnail.thumbnail_pattern}</strong>
                  </p>
                )}
                {(result.thumbnail?.mistakes_flagged?.length ?? 0) > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1.5">Common Mistakes Detected</p>
                    <ul className="space-y-1">
                      {result.thumbnail?.mistakes_flagged?.map((m, i) => (
                        <li key={i} className="text-sm text-amber-700 flex gap-2">
                          <span>⚠</span>{m}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <SubScoreBreakdown subScores={result.thumbnail?.sub_scores} />
              </div>
            </div>
          )}

          {/* Title analysis */}
          <div className="bg-white border border-[#2f3437]/10 rounded-lg p-6">
            <h2 className="font-semibold text-[#2f3437] mb-4">Title Analysis</h2>
            {(result.title?.observations?.length ?? 0) > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-[#2f3437]/40 uppercase tracking-wide mb-2">
                  Observations
                </p>
                <ul className="space-y-1.5">
                  {result.title?.observations?.map((o, i) => (
                    <li key={i} className="text-sm text-[#2f3437] flex gap-2">
                      <span className="text-[#6ba3c7]">•</span>
                      {o}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap gap-3 mb-4">
              {(result.title?.dissonance_triggers_used?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[#2f3437]/40 uppercase tracking-wide mb-1.5">
                    Dissonance Triggers
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.title?.dissonance_triggers_used?.map((t, i) => (
                      <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-[#6ba3c7]/10 text-[#6ba3c7] font-medium">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {result.title?.formula_match && (
                <div>
                  <p className="text-xs font-semibold text-[#2f3437]/40 uppercase tracking-wide mb-1.5">
                    Title Formula
                  </p>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-700 font-medium">
                    {result.title.formula_match}
                  </span>
                </div>
              )}
              {result.title?.character_count != null && (
                <div>
                  <p className="text-xs font-semibold text-[#2f3437]/40 uppercase tracking-wide mb-1.5">
                    Character Count
                  </p>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                    result.title.character_count > 60
                      ? "bg-red-100 text-red-700"
                      : "bg-green-100 text-green-700"
                  }`}>
                    {result.title.character_count} chars {result.title.character_count > 60 ? "(too long for mobile)" : "✓"}
                  </span>
                </div>
              )}
            </div>
            {(result.title?.alternatives?.length ?? 0) > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-[#2f3437]/40 uppercase tracking-wide mb-2">
                  Improved Alternatives
                </p>
                <ul className="space-y-2">
                  {result.title?.alternatives?.map((a, i) => {
                    const isObj = typeof a === "object" && a !== null && "title" in a;
                    const titleText = isObj ? (a as TitleAlternative).title : (a as string);
                    const formula = isObj ? (a as TitleAlternative).formula : null;
                    return (
                      <li key={i} className="bg-[#f7f6f3] rounded-lg px-4 py-2.5">
                        <p className="text-sm font-medium text-[#2f3437]">{i + 1}. {titleText}</p>
                        {formula && (
                          <p className="text-xs text-[#2f3437]/40 mt-1">Formula: {formula}</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {(result.title?.mistakes_flagged?.length ?? 0) > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-2">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1.5">Common Mistakes Detected</p>
                <ul className="space-y-1">
                  {result.title?.mistakes_flagged?.map((m, i) => (
                    <li key={i} className="text-sm text-amber-700 flex gap-2">
                      <span>⚠</span>{m}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <SubScoreBreakdown subScores={result.title?.sub_scores} />
          </div>

          {/* Intro analysis — only shown when transcript was provided */}
          {result.intro && (
            <div className="bg-white border border-[#2f3437]/10 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-[#2f3437]">Intro Analysis</h2>
                <span
                  className={`text-sm font-medium px-3 py-1 rounded-full ${
                    result.intro.approves_click
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {result.intro.approves_click
                    ? "✓ Approves the click"
                    : "✗ Doesn't fully approve the click"}
                </span>
              </div>
              <div className="space-y-3">
                {(result.intro.observations?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-[#2f3437]/40 uppercase tracking-wide mb-2">
                      Observations
                    </p>
                    <ul className="space-y-1.5">
                      {result.intro.observations?.map((o, i) => (
                        <li key={i} className="text-sm text-[#2f3437] flex gap-2">
                          <span className="text-[#6ba3c7]">•</span>
                          {o}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(result.intro.improvements?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-[#2f3437]/40 uppercase tracking-wide mb-2">
                      Improvements
                    </p>
                    <ul className="space-y-1.5">
                      {result.intro.improvements?.map((o, i) => (
                        <li key={i} className="text-sm text-[#2f3437] flex gap-2">
                          <span className="text-amber-500">→</span>
                          {o}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Combined analysis */}
          <div className="bg-white border border-[#2f3437]/10 rounded-lg p-6">
            <h2 className="font-semibold text-[#2f3437] mb-4">Dissonance Test — Title + Thumbnail</h2>
            <div className="flex items-center gap-2 mb-3">
              <span
                className={`text-sm font-medium px-3 py-1 rounded-full ${
                  result.combined?.avatar_would_click
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {result.combined?.avatar_would_click
                  ? "✓ Avatar would click"
                  : "✗ Avatar unlikely to click"}
              </span>
            </div>
            {result.combined?.dissonance_combination && (
              <p className="text-sm text-[#2f3437]/60 mt-1 mb-3">
                <strong>Dissonance type:</strong> {result.combined.dissonance_combination}
              </p>
            )}
            {(result.combined?.observations?.length ?? 0) > 0 && (
              <ul className="space-y-1.5 mb-3">
                {result.combined?.observations?.map((o, i) => (
                  <li key={i} className="text-sm text-[#2f3437] flex gap-2">
                    <span className="text-[#6ba3c7]">•</span>
                    {o}
                  </li>
                ))}
              </ul>
            )}
            {(result.combined?.improvements?.length ?? 0) > 0 && (
              <>
                <p className="text-xs font-semibold text-[#2f3437]/40 uppercase tracking-wide mb-2">
                  Improvements
                </p>
                <ul className="space-y-1.5 mb-4">
                  {result.combined?.improvements?.map((o, i) => (
                    <li key={i} className="text-sm text-[#2f3437] flex gap-2">
                      <span className="text-amber-500">→</span>
                      {o}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* Redundancies warning */}
            {(result.combined?.redundancies?.length ?? 0) > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-2">
                  ⚠ Redundancies Found — Title &amp; Thumbnail Overlap
                </p>
                <ul className="space-y-1">
                  {result.combined?.redundancies?.map((r, i) => (
                    <li key={i} className="text-sm text-red-700 flex gap-2">
                      <span>⚠</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Thumbnail concepts */}
            {(result.combined?.thumbnail_concepts?.length ?? 0) > 0 && (
              <div className="bg-[#6ba3c7]/5 border border-[#6ba3c7]/20 rounded-lg p-4">
                <p className="text-xs font-semibold text-[#2f3437]/60 uppercase tracking-wide mb-3">
                  Thumbnail Concepts That Create Dissonance
                </p>
                <div className="space-y-2">
                  {result.combined?.thumbnail_concepts?.map((c, i) => (
                    <div key={i} className="bg-white rounded-lg px-4 py-3 text-sm text-[#2f3437] leading-relaxed">
                      {c}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(result.combined?.mistakes_flagged?.length ?? 0) > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-4">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1.5">Combination Mistakes Detected</p>
                <ul className="space-y-1">
                  {result.combined?.mistakes_flagged?.map((m, i) => (
                    <li key={i} className="text-sm text-amber-700 flex gap-2">
                      <span>⚠</span>{m}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <SubScoreBreakdown subScores={result.combined?.sub_scores} />
          </div>

          {result.follow_up && (
            <p className="text-sm text-[#2f3437]/60 italic text-center">{result.follow_up}</p>
          )}

          {/* Resource Recommendations */}
          {result.title?.attraction_scores && (() => {
            const weakPrinciples = Object.entries(result.title.attraction_scores)
              .filter(([, v]) => (v as number) < 8)
              .map(([k]) => k)
              .join(",");
            return weakPrinciples ? (
              <div className="bg-[#6ba3c7]/5 border border-[#6ba3c7]/25 rounded-lg p-5">
                <ResourceRecommendations
                  principles={weakPrinciples}
                  limitPerPrinciple={2}
                  heading="📚 Related Resources for Your Packaging"
                />
              </div>
            ) : null;
          })()}

          {/* Go Deeper section */}
          <GoDeeperSection title={title} result={result} introTranscript={introTranscript} dramaMode={dramaMode} />

          {linkedPlanId && (
            plannerSaved ? (
              <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                <p className="text-sm text-green-700 font-medium flex-1">Title saved to your Content Plan.</p>
                <a href="/member/content-planner" className="text-xs font-semibold text-green-700 underline hover:no-underline shrink-0">
                  View in Planner →
                </a>
              </div>
            ) : (
              <div className="bg-[#6ba3c7]/5 border border-[#6ba3c7]/20 rounded-lg px-4 py-4 space-y-3">
                <p className="text-xs font-semibold text-[#2f3437]/60 uppercase tracking-wide">
                  📅 Save title back to Content Plan
                </p>
                <p className="text-xs text-[#2f3437]/50">
                  Edit the title below if you want to save a refined version based on the AI feedback, then hit Save.
                </p>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-white border border-[#2f3437]/20 rounded-lg px-3 py-2 text-sm text-[#2f3437] focus:outline-none focus:border-[#6ba3c7] transition-colors"
                />
                {plannerSaveError && (
                  <p className="text-xs text-red-500">Save failed. Please try again.</p>
                )}
                <button
                  onClick={() => handleSaveTitleToPlan(title)}
                  disabled={plannerSaving || !title.trim()}
                  className="w-full bg-[#6ba3c7] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#5490b5] disabled:opacity-50 transition-colors"
                >
                  {plannerSaving ? "Saving…" : "Save Title to Content Plan"}
                </button>
              </div>
            )
          )}

          {linkedPlanId && thumbnailPreview && (
            thumbnailSaved ? (
              <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                <p className="text-sm text-green-700 font-medium flex-1">Thumbnail saved to your Content Plan.</p>
                <a href={`/member/content-planner?plan=${linkedPlanId}`} className="text-xs font-semibold text-green-700 underline hover:no-underline shrink-0">
                  View in Planner →
                </a>
              </div>
            ) : (
              <div className="bg-[#6ba3c7]/5 border border-[#6ba3c7]/20 rounded-lg px-4 py-4 space-y-3">
                <p className="text-xs font-semibold text-[#2f3437]/60 uppercase tracking-wide">
                  🖼 Save thumbnail back to Content Plan
                </p>
                <p className="text-xs text-[#2f3437]/50">
                  Stores this thumbnail (with its analyzer score) on the linked plan so you can reference it later.
                </p>
                {thumbnailSaveError && (
                  <p className="text-xs text-red-500">Save failed. Please try again.</p>
                )}
                <button
                  onClick={handleSaveThumbnailToPlan}
                  disabled={thumbnailSaving}
                  className="w-full bg-[#6ba3c7] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#5490b5] disabled:opacity-50 transition-colors"
                >
                  {thumbnailSaving ? "Saving…" : "Save Thumbnail to Content Plan"}
                </button>
              </div>
            )
          )}

          <NextStepCard
            emoji="🎬"
            title="Write Your Script"
            description="Take your optimised title into the ARC Script Builder and structure your video around it."
            href="/member/ai-tools/arc-script-builder"
            buttonLabel="Open ARC Script Builder"
          />

          <button
            onClick={reset}
            className="w-full border border-[#2f3437]/20 text-[#2f3437] py-3 rounded-lg font-semibold hover:bg-[#111]/5 transition-colors"
          >
            Analyse Another
          </button>
        </div>
      )}
    </div>
  );
}

export default function TitleThumbnailAnalyzerPage() {
  return (
    <Suspense>
      <TitleThumbnailAnalyzerPageInner />
    </Suspense>
  );
}

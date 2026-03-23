"use client";

import { useState, useRef, useEffect } from "react";
import { PhotoIcon, BookmarkIcon, CheckIcon, PaperAirplaneIcon, ArrowLeftIcon } from "@heroicons/react/24/outline";
import { SparklesIcon } from "@heroicons/react/24/solid";
import Link from "next/link";
import PromptEditor from "@/components/ai-tools/PromptEditor";
import RecentConversations from "@/components/ai-tools/RecentConversations";
import ResourceRecommendations from "@/components/ResourceRecommendations";

interface AnalysisResult {
  thumbnail?: {
    score?: number;
    observations?: string[];
    improvements?: string[];
  };
  title?: {
    score?: number;
    framework_used?: string;
    alternatives?: string[];
    attraction_scores?: {
      title_frameworks: number;
      approve_the_click: number;
      avatar_clarity: number;
    };
    observations?: string[];
  };
  combined?: {
    score?: number;
    avatar_would_click?: boolean;
    observations?: string[];
    improvements?: string[];
    redundancies?: string[];
    thumbnail_concepts?: string[];
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
  const color = score >= max * 0.75 ? "#22c55e" : score >= max * 0.5 ? "#f59e0b" : "#ef4444";
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
          <span className="text-xl font-bold text-[#1e2a38]">{score}</span>
          <span className="text-xs text-[#1e2a38]/40">/{max}</span>
        </div>
      </div>
      <p className="text-sm font-semibold text-[#1e2a38]">{label}</p>
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

function GoDeeperSection({
  title,
  result,
  introTranscript,
}: {
  title: string;
  result: AnalysisResult;
  introTranscript: string;
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
    ...alternatives.slice(0, 3).map((_, i) => `Give me 5 more title variations like alternative #${i + 1}`),
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
    <div className="bg-white border border-[#1e2a38]/10 rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-[#1e2a38]/8 flex items-center gap-2">
        <SparklesIcon className="w-4 h-4 text-[#3dc3ff]" />
        <h2 className="font-semibold text-[#1e2a38]">Go Deeper</h2>
        <span className="text-xs text-[#1e2a38]/40 ml-1">Ask questions or try variations based on your analysis</span>
      </div>

      {/* Quick action buttons */}
      <div className="px-6 py-4 border-b border-[#1e2a38]/8">
        <p className="text-xs font-semibold text-[#1e2a38]/40 uppercase tracking-wide mb-3">Quick Actions</p>
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action) => (
            <button
              key={action}
              onClick={() => sendMessage(action)}
              disabled={loading}
              className="text-xs px-3 py-2 rounded-lg border border-[#3dc3ff]/40 text-[#3dc3ff] bg-[#3dc3ff]/5 hover:bg-[#3dc3ff]/10 hover:border-[#3dc3ff] transition-colors disabled:opacity-50"
            >
              {action}
            </button>
          ))}
        </div>
      </div>

      {/* Chat messages */}
      {messages.length > 0 && (
        <div className="px-6 py-4 space-y-4 max-h-[520px] overflow-y-auto border-b border-[#1e2a38]/8">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "user" ? (
                <div className="bg-[#3dc3ff] text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[85%]">
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
              ) : (
                <div className="bg-[#f1f1ef] rounded-2xl rounded-tl-sm px-4 py-3 max-w-full w-full space-y-3">
                  <p className="text-sm text-[#1e2a38] whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  {msg.titles && msg.titles.length > 0 && (
                    <div className="border-t border-[#1e2a38]/10 pt-3 space-y-2">
                      <p className="text-xs font-semibold text-[#1e2a38]/40 uppercase tracking-wide">
                        Title Suggestions — click to save
                      </p>
                      {msg.titles.map((t, ti) => (
                        <div
                          key={ti}
                          className="flex items-start justify-between gap-3 bg-white border border-[#1e2a38]/10 rounded-lg px-3 py-2.5"
                        >
                          <p className="text-sm text-[#1e2a38] flex-1">
                            {ti + 1}. {t}
                          </p>
                          <button
                            onClick={() => saveTitle(t)}
                            disabled={savedTitles.has(t)}
                            title={savedTitles.has(t) ? "Saved" : "Save this title"}
                            className={`shrink-0 p-1 rounded transition-colors ${
                              savedTitles.has(t)
                                ? "text-green-500"
                                : "text-[#1e2a38]/30 hover:text-[#3dc3ff]"
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
              <div className="bg-[#f1f1ef] rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-[#3dc3ff]/60 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 bg-[#3dc3ff]/60 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 bg-[#3dc3ff]/60 rounded-full animate-bounce [animation-delay:300ms]" />
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
          className="flex-1 border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:border-[#3dc3ff] resize-none transition-colors"
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
          className="shrink-0 p-3 bg-[#3dc3ff] text-white rounded-xl hover:bg-[#3dc3ff]/90 disabled:opacity-50 transition-colors"
        >
          <PaperAirplaneIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function TitleThumbnailAnalyzerPage() {
  const [title, setTitle] = useState("");
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [introTranscript, setIntroTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [refreshCounter, setRefreshCounter] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

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
      body: JSON.stringify({ title, thumbnailBase64, thumbnailMimeType, introTranscript: introTranscript.trim() }),
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
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-5">
        <Link
          href="/member/ai-tools"
          className="flex items-center gap-1.5 text-xs text-[#1e2a38]/50 hover:text-[#3dc3ff] transition-colors mb-3"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          Back to AI Tools
        </Link>
        <h1 className="text-2xl font-bold text-[#1e2a38]">🔍 Title &amp; Thumbnail Analyzer</h1>
        <p className="text-sm text-[#1e2a38]/60 mt-1">
          Score your title and thumbnail for cognitive dissonance — the gap that compels the click
        </p>
      </div>
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
              <label className="block text-sm font-semibold text-[#1e2a38] mb-2">Video Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Paste your video title here..."
                className="w-full bg-white border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:border-[#3dc3ff] transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#1e2a38] mb-2">
                Thumbnail{" "}
                <span className="font-normal text-[#1e2a38]/40">(optional — jpg, png, webp)</span>
              </label>
              {thumbnailPreview ? (
                <div className="relative inline-block">
                  <img
                    src={thumbnailPreview}
                    alt="Thumbnail preview"
                    className="h-32 rounded-xl border border-[#1e2a38]/20 object-cover"
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
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-[#1e2a38]/20 rounded-xl cursor-pointer hover:border-[#3dc3ff]/50 transition-colors">
                  <PhotoIcon className="w-8 h-8 text-[#1e2a38]/20 mb-2" />
                  <span className="text-sm text-[#1e2a38]/40">Click to upload thumbnail</span>
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
              <label className="block text-sm font-semibold text-[#1e2a38] mb-1">
                Video Intro Transcript{" "}
                <span className="font-normal text-[#1e2a38]/40">(optional — first 30–60 seconds)</span>
              </label>
              <p className="text-xs text-[#1e2a38]/40 mb-2">
                Paste your intro script or transcript so the AI can check whether it delivers on the promise of your title.
              </p>
              <textarea
                value={introTranscript}
                onChange={(e) => setIntroTranscript(e.target.value)}
                placeholder="Hey, in this video I'm going to show you exactly why most agents are losing listings before they even get to the appointment..."
                rows={4}
                className="w-full bg-white border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:border-[#3dc3ff] transition-colors resize-y"
              />
            </div>

            {error && <p className="text-sm text-[#ff0033]">{error}</p>}

            <button
              onClick={analyse}
              disabled={loading || !title.trim()}
              className="w-full bg-[#3dc3ff] text-white py-3 rounded-xl font-semibold hover:bg-[#3dc3ff]/90 disabled:opacity-50 transition-colors"
            >
              {loading ? "Analysing..." : "Analyse"}
            </button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Score gauges */}
          <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-6">
            <h2 className="font-semibold text-[#1e2a38] mb-6 text-center">Cognitive Dissonance Scores</h2>
            <div className={`grid gap-4 ${result.intro ? "grid-cols-4" : "grid-cols-3"}`}>
              <ScoreGauge label="Thumbnail" score={result.thumbnail?.score ?? 0} />
              <ScoreGauge label="Title" score={result.title?.score ?? 0} />
              <ScoreGauge label="Combined" score={result.combined?.score ?? 0} />
              {result.intro && <ScoreGauge label="Intro" score={result.intro?.score ?? 0} />}
            </div>
          </div>

          {/* Attraction principle scores */}
          {result.title?.attraction_scores && (
            <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-6">
              <h2 className="font-semibold text-[#1e2a38] mb-4">Attraction Principle Scores</h2>
              <div className="flex flex-wrap gap-2">
                <ScoreBadge label="Title Frameworks" score={result.title.attraction_scores.title_frameworks} />
                <ScoreBadge label="Approve the Click" score={result.title.attraction_scores.approve_the_click} />
                <ScoreBadge label="Avatar Clarity" score={result.title.attraction_scores.avatar_clarity} />
              </div>
              {result.title?.framework_used && (
                <p className="text-sm text-[#1e2a38]/60 mt-3">
                  Framework detected: <strong>{result.title.framework_used}</strong>
                </p>
              )}
            </div>
          )}

          {/* Thumbnail analysis */}
          {(result.thumbnail?.observations?.length ?? 0) > 0 && (
            <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-6">
              <h2 className="font-semibold text-[#1e2a38] mb-4">Thumbnail Analysis</h2>
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-[#1e2a38]/40 uppercase tracking-wide mb-2">
                    Observations
                  </p>
                  <ul className="space-y-1.5">
                    {result.thumbnail?.observations?.map((o, i) => (
                      <li key={i} className="text-sm text-[#1e2a38] flex gap-2">
                        <span className="text-[#3dc3ff]">•</span>
                        {o}
                      </li>
                    ))}
                  </ul>
                </div>
                {(result.thumbnail?.improvements?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-[#1e2a38]/40 uppercase tracking-wide mb-2">
                      Improvements
                    </p>
                    <ul className="space-y-1.5">
                      {result.thumbnail?.improvements?.map((o, i) => (
                        <li key={i} className="text-sm text-[#1e2a38] flex gap-2">
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

          {/* Title analysis */}
          <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-6">
            <h2 className="font-semibold text-[#1e2a38] mb-4">Title Analysis</h2>
            {(result.title?.observations?.length ?? 0) > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-[#1e2a38]/40 uppercase tracking-wide mb-2">
                  Observations
                </p>
                <ul className="space-y-1.5">
                  {result.title?.observations?.map((o, i) => (
                    <li key={i} className="text-sm text-[#1e2a38] flex gap-2">
                      <span className="text-[#3dc3ff]">•</span>
                      {o}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(result.title?.alternatives?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-semibold text-[#1e2a38]/40 uppercase tracking-wide mb-2">
                  Improved Alternatives
                </p>
                <ul className="space-y-2">
                  {result.title?.alternatives?.map((a, i) => (
                    <li
                      key={i}
                      className="bg-[#f1f1ef] rounded-lg px-4 py-2.5 text-sm font-medium text-[#1e2a38]"
                    >
                      {i + 1}. {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Intro analysis — only shown when transcript was provided */}
          {result.intro && (
            <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-[#1e2a38]">Intro Analysis</h2>
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
                    <p className="text-xs font-semibold text-[#1e2a38]/40 uppercase tracking-wide mb-2">
                      Observations
                    </p>
                    <ul className="space-y-1.5">
                      {result.intro.observations.map((o, i) => (
                        <li key={i} className="text-sm text-[#1e2a38] flex gap-2">
                          <span className="text-[#3dc3ff]">•</span>
                          {o}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(result.intro.improvements?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-[#1e2a38]/40 uppercase tracking-wide mb-2">
                      Improvements
                    </p>
                    <ul className="space-y-1.5">
                      {result.intro.improvements.map((o, i) => (
                        <li key={i} className="text-sm text-[#1e2a38] flex gap-2">
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
          <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-6">
            <h2 className="font-semibold text-[#1e2a38] mb-4">Dissonance Test — Title + Thumbnail</h2>
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
            {(result.combined?.observations?.length ?? 0) > 0 && (
              <ul className="space-y-1.5 mb-3">
                {result.combined?.observations?.map((o, i) => (
                  <li key={i} className="text-sm text-[#1e2a38] flex gap-2">
                    <span className="text-[#3dc3ff]">•</span>
                    {o}
                  </li>
                ))}
              </ul>
            )}
            {(result.combined?.improvements?.length ?? 0) > 0 && (
              <>
                <p className="text-xs font-semibold text-[#1e2a38]/40 uppercase tracking-wide mb-2">
                  Improvements
                </p>
                <ul className="space-y-1.5 mb-4">
                  {result.combined?.improvements?.map((o, i) => (
                    <li key={i} className="text-sm text-[#1e2a38] flex gap-2">
                      <span className="text-amber-500">→</span>
                      {o}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* Redundancies warning */}
            {(result.combined?.redundancies?.length ?? 0) > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
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
              <div className="bg-[#3dc3ff]/5 border border-[#3dc3ff]/20 rounded-xl p-4">
                <p className="text-xs font-semibold text-[#1e2a38]/60 uppercase tracking-wide mb-3">
                  Thumbnail Concepts That Create Dissonance
                </p>
                <div className="space-y-2">
                  {result.combined?.thumbnail_concepts?.map((c, i) => (
                    <div key={i} className="bg-white rounded-lg px-4 py-3 text-sm text-[#1e2a38] leading-relaxed">
                      {c}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {result.follow_up && (
            <p className="text-sm text-[#1e2a38]/60 italic text-center">{result.follow_up}</p>
          )}

          {/* Resource Recommendations */}
          {result.title?.attraction_scores && (() => {
            const weakPrinciples = Object.entries(result.title.attraction_scores)
              .filter(([, v]) => (v as number) < 8)
              .map(([k]) => k)
              .join(",");
            return weakPrinciples ? (
              <div className="bg-[#3dc3ff]/5 border border-[#3dc3ff]/25 rounded-2xl p-5">
                <ResourceRecommendations
                  principles={weakPrinciples}
                  limitPerPrinciple={2}
                  heading="📚 Related Resources for Your Packaging"
                />
              </div>
            ) : null;
          })()}

          {/* Go Deeper section */}
          <GoDeeperSection title={title} result={result} introTranscript={introTranscript} />

          <button
            onClick={reset}
            className="w-full border border-[#1e2a38]/20 text-[#1e2a38] py-3 rounded-xl font-semibold hover:bg-[#1e2a38]/5 transition-colors"
          >
            Analyse Another
          </button>
        </div>
      )}
    </div>
  );
}

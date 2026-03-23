"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import {
  ArrowUpIcon,
  ArrowDownTrayIcon,
  PlusIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/solid";
import RecentConversations from "./RecentConversations";
import PromptEditor from "./PromptEditor";
import ResourceRecommendations from "@/components/ResourceRecommendations";

const PRINCIPLES: Record<string, string> = {
  avatar_clarity: "Avatar Clarity",
  themes_over_topics: "Themes Over Topics",
  arc_attention: "ARC Attention",
  arc_revelation: "ARC Revelation",
  arc_connection: "ARC Connection",
  title_frameworks: "Title Frameworks",
  approve_the_click: "Approve the Click",
  lead_magnet_system: "Lead Magnet System",
  curiosity_bridges: "Curiosity Bridges",
  values_peppering: "Values Peppering",
  connection_language: "Connection Language",
  story_proof: "Story Proof",
  grade_5_language: "Grade 5 Language",
  binge_architecture: "Binge Architecture",
};

function scoreColor(score: number) {
  if (score >= 7) return "text-green-600";
  if (score >= 5) return "text-[#f59e0b]";
  return "text-[#ff0033]";
}

function scoreBg(score: number) {
  if (score >= 7) return "bg-green-50 border-green-200";
  if (score >= 5) return "bg-yellow-50 border-yellow-200";
  return "bg-red-50 border-red-100";
}

interface AnalysisResult {
  scores: Record<string, { score: number; evidence: string }>;
  overall_score: number;
  one_sentence_diagnosis: string;
  whats_working: { strength: string; evidence: string }[];
  three_improvements: {
    principle: string;
    score: number;
    current: string;
    improved: string;
    arc_breakdown?: { attention: string; revelation: string; connection: string } | null;
    why: string;
    lesson: string;
  }[];
  visual_suggestions: { moment: string; suggestion: string; why: string }[];
  quick_win: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  analysis?: AnalysisResult;
}

function ScorecardCard({ analysis, onDownload }: { analysis: AnalysisResult; onDownload?: () => void }) {
  const [expandedImprovement, setExpandedImprovement] = useState<number | null>(null);
  const overallScore = analysis.overall_score ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-base font-medium text-[#1e2a38] dark:text-white leading-snug">
            {analysis.one_sentence_diagnosis}
          </p>
        </div>
        <div className="shrink-0 text-center">
          <div className={`text-4xl font-black ${scoreColor(overallScore)}`}>
            {Number(overallScore).toFixed(1)}
          </div>
          <div className="text-xs text-[#1e2a38]/40 dark:text-white/40 font-medium">/ 10</div>
          <div className="text-[11px] text-[#1e2a38]/40 dark:text-white/40">Script Score</div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {Object.entries(analysis.scores ?? {})
          .filter(([k]) => k !== "show_dont_tell" && k in PRINCIPLES)
          .map(([key, val]) => (
            <div
              key={key}
              className={`rounded-lg border px-2.5 py-2 ${scoreBg(val.score)}`}
              title={val.evidence}
            >
              <div className="text-[10px] font-medium text-[#1e2a38]/60 dark:text-white/60 truncate">
                {PRINCIPLES[key]}
              </div>
              <div className={`text-lg font-black mt-0.5 ${scoreColor(val.score)}`}>
                {Number(val.score).toFixed(1)}
              </div>
            </div>
          ))}
      </div>

      {analysis.whats_working?.length > 0 && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-green-800 dark:text-green-300 uppercase tracking-wider">
            ✅ What&apos;s Working
          </p>
          {analysis.whats_working.map((w, i) => (
            <div key={i}>
              <p className="text-sm font-semibold text-green-900 dark:text-green-200">{w.strength}</p>
              <p className="text-xs text-green-800/70 dark:text-green-300/70 italic mt-0.5">&ldquo;{w.evidence}&rdquo;</p>
            </div>
          ))}
        </div>
      )}

      {analysis.three_improvements?.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-[#1e2a38]/60 dark:text-white/60 uppercase tracking-wider">
            🔧 Top 3 Improvements
          </p>
          {analysis.three_improvements.map((imp, i) => (
            <div key={i} className="border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandedImprovement(expandedImprovement === i ? null : i)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-[#1a1f2e] hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[#1e2a38] dark:text-white">{imp.principle}</span>
                  <span className={`text-sm font-bold ${scoreColor(imp.score)}`}>
                    {Number(imp.score).toFixed(1)}
                  </span>
                </div>
                <span className="text-xs text-[#3dc3ff]">
                  {expandedImprovement === i ? "Hide" : "Show"} rewrite
                </span>
              </button>
              {expandedImprovement === i && (
                <div className="px-4 py-3 space-y-3 bg-white dark:bg-[#242b3d]">
                  <div>
                    <p className="text-[10px] font-semibold text-[#1e2a38]/50 dark:text-white/50 uppercase tracking-wider mb-1">
                      Current
                    </p>
                    <p className="text-sm text-[#1e2a38]/70 dark:text-white/70 italic">&ldquo;{imp.current}&rdquo;</p>
                  </div>
                  <div className="bg-[#3dc3ff]/5 border border-[#3dc3ff]/20 rounded-lg px-3 py-3">
                    <p className="text-[10px] font-semibold text-[#3dc3ff] uppercase tracking-wider mb-1">
                      Rewritten
                    </p>
                    <p className="text-sm text-[#1e2a38] dark:text-white leading-relaxed">{imp.improved}</p>
                  </div>
                  {imp.arc_breakdown && (
                    <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg px-3 py-2.5 space-y-1.5">
                      <p className="text-[10px] font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wider">
                        ARC Breakdown
                      </p>
                      <p className="text-xs text-purple-900 dark:text-purple-200">
                        <span className="font-semibold">⚡ Attention:</span>{" "}
                        {imp.arc_breakdown.attention}
                      </p>
                      <p className="text-xs text-purple-900 dark:text-purple-200">
                        <span className="font-semibold">💡 Revelation:</span>{" "}
                        {imp.arc_breakdown.revelation}
                      </p>
                      <p className="text-xs text-purple-900 dark:text-purple-200">
                        <span className="font-semibold">🤝 Connection:</span>{" "}
                        {imp.arc_breakdown.connection}
                      </p>
                    </div>
                  )}
                  <p className="text-xs text-[#1e2a38]/60 dark:text-white/60">{imp.why}</p>
                  <p className="text-[10px] text-[#3dc3ff]/80 font-medium">📚 {imp.lesson}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {analysis.visual_suggestions?.length > 0 && (
        <div className="border border-[#3dc3ff]/30 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-[#3dc3ff]/5 border-b border-[#3dc3ff]/20">
            <p className="text-xs font-semibold text-[#3dc3ff] uppercase tracking-wider">
              🎬 Visual Suggestions
            </p>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-white/5">
            {analysis.visual_suggestions.map((vs, i) => (
              <div key={i} className="px-4 py-3 space-y-1">
                <p className="text-xs text-[#1e2a38]/50 dark:text-white/50 italic">&ldquo;{vs.moment}&rdquo;</p>
                <p className="text-sm font-medium text-[#1e2a38] dark:text-white">{vs.suggestion}</p>
                <p className="text-xs text-[#1e2a38]/60 dark:text-white/60">{vs.why}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {analysis.quick_win && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-yellow-800 dark:text-yellow-300 uppercase tracking-wider mb-1">
            ⚡ Quick Win
          </p>
          <p className="text-sm text-yellow-900 dark:text-yellow-200">{analysis.quick_win}</p>
        </div>
      )}

      {onDownload && (
        <button
          onClick={onDownload}
          className="flex items-center gap-1.5 text-xs text-[#1e2a38]/50 hover:text-[#3dc3ff] transition-colors"
        >
          <ArrowDownTrayIcon className="w-3.5 h-3.5" />
          Download full report
        </button>
      )}
    </div>
  );
}

function AssistantBubble({
  message,
  onDownload,
}: {
  message: ChatMessage;
  onDownload?: () => void;
}) {
  if (message.analysis) {
    return (
      <div className="bg-white dark:bg-[#242b3d] rounded-2xl rounded-tl-sm border border-gray-200 dark:border-white/10 p-4 max-w-full">
        <ScorecardCard analysis={message.analysis} onDownload={onDownload} />
      </div>
    );
  }
  return (
    <div className="bg-white dark:bg-[#242b3d] rounded-2xl rounded-tl-sm border border-gray-200 dark:border-white/10 px-4 py-3 max-w-full">
      <p className="text-sm text-[#1e2a38] dark:text-white whitespace-pre-wrap leading-relaxed">
        {message.content}
      </p>
    </div>
  );
}

interface Props {
  basePath: string;
  noAvatar?: boolean;
}

export default function ScriptReviewChatUI({ basePath, noAvatar }: Props) {
  const [phase, setPhase] = useState<"input" | "chat">("input");
  const [videoTitle, setVideoTitle] = useState("");
  const [scriptText, setScriptText] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [refreshCounter, setRefreshCounter] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleAnalyze() {
    if (!videoTitle.trim() || !scriptText.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai-tools/script-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoTitle: videoTitle.trim(), scriptText: scriptText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI error");

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: data.analysis?.one_sentence_diagnosis ?? "Script analysed.",
        analysis: data.analysis,
      };
      setMessages([assistantMsg]);
      setConversationId(data.conversationId);
      setPhase("chat");
      setRefreshCounter((n) => n + 1);
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading || !conversationId) return;
    setInput("");

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch("/api/ai-tools/script-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          messages: [{ role: "user", content: text }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI error");

      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  const weakScriptPrinciples = useMemo(() => {
    const analysis = messages[0]?.analysis;
    if (!analysis?.scores) return "";
    return Object.entries(analysis.scores)
      .filter(([, v]) => v.score < 7)
      .sort(([, a], [, b]) => a.score - b.score)
      .slice(0, 5)
      .map(([key]) => key)
      .join(",");
  }, [messages]);

  function handleReset() {
    setPhase("input");
    setVideoTitle("");
    setScriptText("");
    setMessages([]);
    setConversationId(null);
  }

  function handleDownload() {
    if (!conversationId) return;
    window.open(`/api/ai-tools/conversations/${conversationId}/download`, "_blank");
  }

  function handleLoadConversation(conv: any) {
    const msgs = Array.isArray(conv.messages) ? conv.messages : [];
    const visible: ChatMessage[] = msgs
      .filter((m: any) => !m.hidden)
      .map((m: any) => ({
        role: m.role,
        content: m.content,
        analysis: m.analysis,
      }));
    setMessages(visible);
    setConversationId(conv.id);
    setVideoTitle(conv.title ?? "");
    setPhase("chat");
  }

  return (
    <div className="space-y-4">
      <PromptEditor
        toolKey="script_review_analysis_prompt"
        defaultPrompt=""
        placeholders={[{ key: "{{AVATAR_CONTEXT}}", description: "Injected avatar context for the member" }]}
      />

      <RecentConversations
        toolType="script_review"
        onLoad={handleLoadConversation}
        refreshTrigger={refreshCounter}
        label="Recent Script Reviews"
        emptyLabel="No script reviews saved in the last 30 days."
        forceOpen={refreshCounter}
      />

      {noAvatar && phase === "input" && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-xl px-4 py-3">
          <p className="text-sm text-yellow-800 dark:text-yellow-300">
            <span className="font-semibold">Tip:</span> Build your avatar first in Avatar Architect — it makes Script Review feedback much more specific to your ideal viewer.
          </p>
        </div>
      )}

      {phase === "input" ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-[#1e2a38] dark:text-white mb-1.5">
              Video Title
            </label>
            <input
              type="text"
              value={videoTitle}
              onChange={(e) => setVideoTitle(e.target.value)}
              placeholder="What is this video called? (or planned title)"
              className="w-full bg-white dark:bg-[#1a1f2e] border border-gray-200 dark:border-white/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#3dc3ff]/40"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#1e2a38] dark:text-white mb-1.5">
              Script or Transcript
            </label>
            <textarea
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
              placeholder="Paste your full script or transcript here…"
              rows={14}
              className="w-full bg-white dark:bg-[#1a1f2e] border border-gray-200 dark:border-white/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#3dc3ff]/40 resize-y"
            />
          </div>

          <button
            onClick={handleAnalyze}
            disabled={loading || !videoTitle.trim() || !scriptText.trim()}
            className="w-full py-3.5 bg-[#3dc3ff] text-white font-semibold rounded-xl hover:bg-[#3dc3ff]/90 disabled:opacity-50 transition-colors"
          >
            {loading ? "Analysing script…" : "Analyse My Script"}
          </button>
        </div>
      ) : (
        <div className="flex flex-col h-[70vh]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[#1e2a38] dark:text-white truncate max-w-[70%]">
              {videoTitle}
            </h2>
            <div className="flex items-center gap-2 shrink-0">
              <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                <CheckCircleIcon className="w-3.5 h-3.5" />
                Saved · 30 days
              </span>
              {conversationId && (
                <button
                  onClick={handleDownload}
                  title="Download"
                  className="p-1.5 rounded-lg text-[#1e2a38]/40 dark:text-white/40 hover:text-[#3dc3ff] hover:bg-[#3dc3ff]/10 transition-colors"
                >
                  <ArrowDownTrayIcon className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={handleReset}
                title="New review"
                className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 dark:border-white/20 rounded-lg text-xs text-[#1e2a38]/60 dark:text-white/60 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
              >
                <PlusIcon className="w-3 h-3" />
                New
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "user" ? (
                  <div className="bg-[#3dc3ff] text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[85%]">
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  </div>
                ) : (
                  <div className="max-w-full w-full">
                    <AssistantBubble
                      message={msg}
                      onDownload={i === 0 ? handleDownload : undefined}
                    />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-[#242b3d] border border-gray-200 dark:border-white/10 rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-[#3dc3ff]/60 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 bg-[#3dc3ff]/60 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 bg-[#3dc3ff]/60 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {weakScriptPrinciples && (
            <ResourceRecommendations
              principles={weakScriptPrinciples}
              limitPerPrinciple={2}
              heading="📚 Resources for Your Weakest Areas"
              className="pt-3 border-t border-gray-100 dark:border-white/10 mt-1"
            />
          )}

          <div className="flex gap-2 mt-3 border-t border-gray-100 dark:border-white/10 pt-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask a follow-up question or request a rewrite…"
              rows={2}
              className="flex-1 bg-white dark:bg-[#1a1f2e] border border-gray-200 dark:border-white/20 rounded-xl px-3 py-2 text-sm text-[#1e2a38] dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#3dc3ff]/40 resize-none"
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="self-end p-3 bg-[#3dc3ff] text-white rounded-xl hover:bg-[#3dc3ff]/90 disabled:opacity-50 transition-colors"
            >
              <ArrowUpIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

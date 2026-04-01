"use client";

import { useState, useRef, useEffect } from "react";
import {
  ArrowUpIcon,
  ArrowDownTrayIcon,
  PlusIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/solid";
import RecentConversations from "./RecentConversations";
import PromptEditor from "./PromptEditor";
import MarkdownMessage from "@/components/MarkdownMessage";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function AssistantBubble({
  message,
  onDownload,
}: {
  message: ChatMessage;
  onDownload?: () => void;
}) {
  return (
    <div className="bg-white dark:bg-[#1a1a1a] rounded-lg rounded-tl-sm border border-gray-200 dark:border-white/10 px-4 py-3 max-w-full">
      <MarkdownMessage className="text-sm text-[#2f3437] dark:text-white leading-relaxed">
        {message.content}
      </MarkdownMessage>
      {onDownload && (
        <button
          onClick={onDownload}
          className="flex items-center gap-1.5 text-xs text-[#2f3437]/50 hover:text-[#6ba3c7] transition-colors mt-3 pt-3 border-t border-gray-100 dark:border-white/10"
        >
          <ArrowDownTrayIcon className="w-3.5 h-3.5" />
          Download full report
        </button>
      )}
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
        content: data.markdownReport ?? "Script analysed.",
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
        placeholders={[
          { key: "{{FULL_AVATAR_PROFILE}}", description: "Full avatar profile data (name, summary, profile, themes)" },
          { key: "{{AVATAR_CONTEXT}}", description: "Same as FULL_AVATAR_PROFILE (legacy alias)" },
        ]}
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
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg px-4 py-3">
          <p className="text-sm text-yellow-800 dark:text-yellow-300">
            <span className="font-semibold">Tip:</span> Build your avatar first in Avatar Architect — it makes Script Review feedback much more specific to your ideal viewer.
          </p>
        </div>
      )}

      {phase === "input" ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-[#2f3437] dark:text-white mb-1.5">
              Video Title
            </label>
            <input
              type="text"
              value={videoTitle}
              onChange={(e) => setVideoTitle(e.target.value)}
              placeholder="What is this video called? (or planned title)"
              className="w-full bg-white dark:bg-[#0f1419] border border-gray-200 dark:border-white/20 rounded-lg px-4 py-3 text-sm text-[#2f3437] dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#2f3437] dark:text-white mb-1.5">
              Script or Transcript
            </label>
            <textarea
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
              placeholder="Paste your full script or transcript here…"
              rows={14}
              className="w-full bg-white dark:bg-[#0f1419] border border-gray-200 dark:border-white/20 rounded-lg px-4 py-3 text-sm text-[#2f3437] dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40 resize-y"
            />
          </div>

          <button
            onClick={handleAnalyze}
            disabled={loading || !videoTitle.trim() || !scriptText.trim()}
            className="w-full py-3.5 bg-[#6ba3c7] text-white font-semibold rounded-lg hover:bg-[#6ba3c7]/90 disabled:opacity-50 transition-colors"
          >
            {loading ? "Analysing script…" : "Analyse My Script"}
          </button>
        </div>
      ) : (
        <div className="flex flex-col h-[70vh]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[#2f3437] dark:text-white truncate max-w-[70%]">
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
                  className="p-1.5 rounded-lg text-[#2f3437]/40 dark:text-white/40 hover:text-[#6ba3c7] hover:bg-[#6ba3c7]/10 transition-colors"
                >
                  <ArrowDownTrayIcon className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={handleReset}
                title="New review"
                className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 dark:border-white/20 rounded-lg text-xs text-[#2f3437]/60 dark:text-white/60 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
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
                  <div className="bg-[#6ba3c7] text-white rounded-lg rounded-tr-sm px-4 py-2.5 max-w-[85%]">
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
                <div className="bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-lg rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-[#6ba3c7]/60 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 bg-[#6ba3c7]/60 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 bg-[#6ba3c7]/60 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

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
              className="flex-1 bg-white dark:bg-[#0f1419] border border-gray-200 dark:border-white/20 rounded-lg px-3 py-2 text-sm text-[#2f3437] dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40 resize-none"
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="self-end p-3 bg-[#6ba3c7] text-white rounded-lg hover:bg-[#6ba3c7]/90 disabled:opacity-50 transition-colors"
            >
              <ArrowUpIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

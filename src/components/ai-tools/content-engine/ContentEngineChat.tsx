"use client";

import { useEffect, useRef, useState } from "react";
import IdeaCard, { Idea } from "./IdeaCard";
import MarkdownMessage from "@/components/MarkdownMessage";
import { AiThinking } from "@/components/ai/AiThinking";
import { Button } from "@/components/ui/Button";

interface ContentTheme {
  name: string;
  emoji?: string | null;
  colour?: string | null;
  coreStress?: string | null;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ParsedSegment {
  type: "text" | "idea";
  text?: string;
  idea?: Idea;
}

function parseMessage(content: string): ParsedSegment[] {
  const segments: ParsedSegment[] = [];
  const parts = content.split(/(<IDEA_DATA>[\s\S]*?<\/IDEA_DATA>)/g);
  for (const part of parts) {
    const ideaMatch = part.match(/^<IDEA_DATA>([\s\S]*?)<\/IDEA_DATA>$/);
    if (ideaMatch) {
      try {
        const idea = JSON.parse(ideaMatch[1].trim()) as Idea;
        segments.push({ type: "idea", idea });
      } catch {
        segments.push({ type: "text", text: part });
      }
    } else if (part.trim()) {
      segments.push({ type: "text", text: part });
    }
  }
  return segments;
}

interface Props {
  theme: ContentTheme | string;
  onBack: () => void;
}

export default function ContentEngineChat({ theme, onBack }: Props) {
  const themeName = typeof theme === "string" ? theme : theme.name;
  const themeEmoji = typeof theme === "string" ? null : (theme.emoji ?? null);
  const themeColour = typeof theme === "string" ? "var(--abv-ai-tools)" : (theme.colour ?? "var(--abv-ai-tools)");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftChecked, setDraftChecked] = useState(false);
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [resumeSnapshot, setResumeSnapshot] = useState<ChatMessage[] | null>(null);
  const [resumeTimestamp, setResumeTimestamp] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Check for an in-progress draft on mount
  useEffect(() => {
    fetch(`/api/ai-tools/content-engine/chat/draft?theme=${encodeURIComponent(themeName)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.draft && Array.isArray(d.draft.messages) && d.draft.messages.length > 0) {
          setDraftId(d.draft.id);
          setResumeSnapshot(d.draft.messages as ChatMessage[]);
          setResumeTimestamp(d.draft.updatedAt ?? null);
          setShowResumeBanner(true);
        }
      })
      .catch(() => {})
      .finally(() => setDraftChecked(true));
  }, [themeName]);

  function handleResumeDraft() {
    if (!resumeSnapshot) return;
    setMessages(resumeSnapshot);
    setShowResumeBanner(false);
  }

  function handleDismissDraft() {
    fetch(`/api/ai-tools/content-engine/chat/draft?theme=${encodeURIComponent(themeName)}`, { method: "DELETE" }).catch(() => {});
    setDraftId(null);
    setResumeSnapshot(null);
    setShowResumeBanner(false);
  }

  async function saveDraft(updatedMessages: ChatMessage[]) {
    if (updatedMessages.length < 2) return;
    try {
      const res = await fetch("/api/ai-tools/content-engine/chat/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: themeName, messages: updatedMessages }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d?.draft?.id) setDraftId(d.draft.id);
      }
    } catch {
      // silent — draft save is best-effort
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg: ChatMessage = { role: "user", content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai-tools/content-engine/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: themeName, messages: next }),
      });
      const data = await res.json();
      const assistantMsg: ChatMessage = { role: "assistant", content: data.message ?? "Sorry, something went wrong." };
      const finalMessages = [...next, assistantMsg];
      setMessages(finalMessages);
      saveDraft(finalMessages);
    } catch {
      setMessages([...next, { role: "assistant", content: "Something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 pb-4 border-b border-[var(--abv-text)]/10 dark:border-white/10 mb-4">
        <button
          onClick={onBack}
          className="text-sm text-[var(--abv-text)]/50 dark:text-white/50 hover:text-[var(--abv-text)] dark:hover:text-white transition-colors flex items-center gap-1"
        >
          ← Back
        </button>
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-white text-sm font-semibold"
          style={{ backgroundColor: themeColour }}
        >
          {themeEmoji && <span>{themeEmoji}</span>}
          <span>{themeName}</span>
        </div>
        <span className="text-xs text-[var(--abv-text)]/40 dark:text-white/40">Go Deeper mode</span>
      </div>

      {/* Resume draft banner */}
      {draftChecked && showResumeBanner && resumeSnapshot && (
        <div className="mb-4 bg-[var(--abv-ai-tools)]/10 border border-[var(--abv-ai-tools)]/30 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="font-semibold text-[var(--abv-text)] dark:text-white text-sm">Resume previous conversation</p>
            {resumeTimestamp && (
              <p className="text-xs text-[var(--abv-text)]/50 dark:text-white/50 mt-0.5">
                Last saved {new Date(resumeTimestamp).toLocaleDateString("en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={handleResumeDraft}
              className="px-3 py-1.5 $1var(--abv-ai-tools)$2 hover:bg-[var(--abv-ai-tools)]/85 text-white text-xs font-medium rounded-md transition-colors"
            >
              Resume
            </button>
            <button
              onClick={handleDismissDraft}
              className="px-3 py-1.5 border border-[var(--abv-text)]/20 text-[var(--abv-text)]/60 dark:text-white/50 hover:text-[var(--abv-text)] dark:hover:text-white text-xs font-medium rounded-md transition-colors"
            >
              Start fresh
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <p className="text-2xl mb-3">{themeEmoji ?? "💬"}</p>
            <p className="text-sm font-medium text-[var(--abv-text)] dark:text-white">Explore the <span style={{ color: themeColour }}>{themeName}</span> theme</p>
            <p className="text-xs text-[var(--abv-text)]/50 dark:text-white/50 mt-1 max-w-xs mx-auto">
              Ask for specific ideas, request variations, or explore different angles within this theme.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "user" ? (
              <div className="bg-[#111] dark:bg-[var(--abv-ai-tools)]/20 text-white text-sm px-4 py-2.5 rounded-lg rounded-br-sm max-w-[80%]">
                {msg.content}
              </div>
            ) : (
              <div className="flex-1 space-y-3">
                {parseMessage(msg.content).map((seg, j) =>
                  seg.type === "idea" && seg.idea ? (
                    <IdeaCard key={j} idea={seg.idea} theme={themeName} />
                  ) : (
                    <MarkdownMessage key={j} className="text-sm text-[var(--abv-text)]/80 dark:text-white/80 leading-relaxed">
                      {seg.text ?? ""}
                    </MarkdownMessage>
                  )
                )}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <AiThinking mode="quick" label="Thinking with Content Engine" />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="pt-4 border-t border-[var(--abv-text)]/10 dark:border-white/10 mt-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={`Ask about the "${themeName}" theme...`}
            disabled={loading}
            className="flex-1 bg-white dark:bg-[#0f1419] border border-[var(--abv-text)]/20 dark:border-white/20 rounded-lg px-4 py-2.5 text-sm text-[var(--abv-text)] dark:text-white placeholder-[var(--abv-text)]/30 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[var(--abv-ai-tools)]/40"
          />
          <Button variant="aiTools" onClick={handleSend} disabled={loading || !input.trim()}>
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import IdeaCard, { Idea } from "./IdeaCard";
import MarkdownMessage from "@/components/MarkdownMessage";

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
  const themeColour = typeof theme === "string" ? "#6ba3c7" : (theme.colour ?? "#6ba3c7");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
      setMessages([...next, { role: "assistant", content: data.message ?? "Sorry, something went wrong." }]);
    } catch {
      setMessages([...next, { role: "assistant", content: "Something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 pb-4 border-b border-[#2f3437]/10 dark:border-white/10 mb-4">
        <button
          onClick={onBack}
          className="text-sm text-[#2f3437]/50 dark:text-white/50 hover:text-[#2f3437] dark:hover:text-white transition-colors flex items-center gap-1"
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
        <span className="text-xs text-[#2f3437]/40 dark:text-white/40">Go Deeper mode</span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <p className="text-2xl mb-3">{themeEmoji ?? "💬"}</p>
            <p className="text-sm font-medium text-[#2f3437] dark:text-white">Explore the <span style={{ color: themeColour }}>{themeName}</span> theme</p>
            <p className="text-xs text-[#2f3437]/50 dark:text-white/50 mt-1 max-w-xs mx-auto">
              Ask for specific ideas, request variations, or explore different angles within this theme.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "user" ? (
              <div className="bg-[#111] dark:bg-[#6ba3c7]/20 text-white text-sm px-4 py-2.5 rounded-lg rounded-br-sm max-w-[80%]">
                {msg.content}
              </div>
            ) : (
              <div className="flex-1 space-y-3">
                {parseMessage(msg.content).map((seg, j) =>
                  seg.type === "idea" && seg.idea ? (
                    <IdeaCard key={j} idea={seg.idea} theme={themeName} />
                  ) : (
                    <MarkdownMessage key={j} className="text-sm text-[#2f3437]/80 dark:text-white/80 leading-relaxed">
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
            <div className="flex gap-1 items-center px-4 py-3">
              <span className="w-2 h-2 bg-[#6ba3c7] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-2 h-2 bg-[#6ba3c7] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-2 h-2 bg-[#6ba3c7] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="pt-4 border-t border-[#2f3437]/10 dark:border-white/10 mt-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={`Ask about the "${themeName}" theme...`}
            disabled={loading}
            className="flex-1 bg-white dark:bg-[#0f1419] border border-[#2f3437]/20 dark:border-white/20 rounded-lg px-4 py-2.5 text-sm text-[#2f3437] dark:text-white placeholder-[#2f3437]/30 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="bg-[#6ba3c7] hover:bg-[#2bb0ec] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

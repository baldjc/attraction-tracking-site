"use client";

import { useState, useEffect, useRef } from "react";
import { XMarkIcon, PaperAirplaneIcon } from "@heroicons/react/24/outline";
import { HELP_WELCOME_MESSAGE } from "@/lib/help-knowledge-base";
import { AiThinking } from "@/components/ai/AiThinking";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  onClose: () => void;
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <AiThinking mode="quick" />
    </div>
  );
}

export default function HelpChat({ onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/member/help")
      .then((r) => r.json())
      .then((data) => {
        const welcome: Message = { role: "assistant", content: HELP_WELCOME_MESSAGE };
        const history: Message[] = (data.messages ?? []).map((m: any) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));
        setMessages([welcome, ...history]);
        setConversationId(data.conversationId ?? null);
      })
      .catch(() => {
        setMessages([{ role: "assistant", content: HELP_WELCOME_MESSAGE }]);
      })
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/member/help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationId }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
      if (data.conversationId) setConversationId(data.conversationId);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2f3437]/10 dark:border-[#2a2a2a] shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-[#6ba3c7] flex items-center justify-center shrink-0">
            <span className="text-sm leading-none">🤖</span>
          </div>
          <span className="font-semibold text-sm text-[#2f3437] dark:text-white">Kit</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-[#2f3437]/40 dark:text-white/40 hover:text-[#2f3437] dark:hover:text-white hover:bg-[#2f3437]/5 dark:hover:bg-white/5 transition-colors"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {!loaded && (
          <div className="flex justify-start">
            <div className="bg-[#f7f6f3] dark:bg-[#0f1419] rounded-2xl rounded-bl-md px-3.5 py-2 text-sm text-[#2f3437]/40 dark:text-white/30 animate-pulse max-w-[85%]">
              Loading...
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`px-3.5 py-2 text-sm max-w-[85%] leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-[#6ba3c7] text-white rounded-2xl rounded-br-md"
                  : "bg-[#f7f6f3] dark:bg-[#0f1419] text-[#2f3437] dark:text-[#e2e8f0] rounded-2xl rounded-bl-md"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {sending && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-[#2f3437]/10 dark:border-[#2a2a2a] shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question..."
            rows={1}
            disabled={sending}
            className="flex-1 border border-[#2f3437]/20 dark:border-white/20 rounded-lg px-3 py-2 text-sm text-[#2f3437] dark:text-white placeholder-[#2f3437]/30 dark:placeholder-white/30 bg-white dark:bg-[#0f1419] focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40 resize-none disabled:opacity-50"
            style={{ minHeight: "38px", maxHeight: "100px" }}
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="px-3 py-2 bg-[#6ba3c7] text-white rounded-lg hover:bg-[#2bb0ec] disabled:opacity-40 transition-colors shrink-0"
          >
            <PaperAirplaneIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

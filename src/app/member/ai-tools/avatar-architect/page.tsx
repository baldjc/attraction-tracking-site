"use client";

import { useState, useRef, useEffect } from "react";
import { PaperAirplaneIcon, ArrowPathIcon, ClipboardDocumentIcon, CheckIcon } from "@heroicons/react/24/outline";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AvatarData {
  avatar_name: string;
  avatar_summary: string;
  content_themes: string[];
  full_document: string;
}

export default function AvatarArchitectPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [detectedAvatar, setDetectedAvatar] = useState<AvatarData | null>(null);
  const [existingAvatar, setExistingAvatar] = useState<{ avatarName?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch("/api/member/avatar").then((r) => r.json()).then(setExistingAvatar).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function startSession() {
    setMessages([]);
    setDetectedAvatar(null);
    setSaved(false);
    setConfirmReplace(false);
    setStarted(true);
    setLoading(true);

    const res = await fetch("/api/ai-tools/avatar-architect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "Start the session." }] }),
    });
    const data = await res.json();
    const aiMsg = cleanMessage(data.message);
    setMessages([{ role: "assistant", content: aiMsg }]);
    if (data.avatarData) setDetectedAvatar(data.avatarData);
    setLoading(false);
  }

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const userMsg: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    const res = await fetch("/api/ai-tools/avatar-architect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: newMessages }),
    });
    const data = await res.json();
    const aiMsg = cleanMessage(data.message);
    setMessages([...newMessages, { role: "assistant", content: aiMsg }]);
    if (data.avatarData) setDetectedAvatar(data.avatarData);
    setLoading(false);
  }

  function cleanMessage(text: string) {
    return text.replace(/<AVATAR_DATA>[\s\S]*?<\/AVATAR_DATA>/g, "").trim();
  }

  async function saveAvatar() {
    if (!detectedAvatar) return;
    if (existingAvatar?.avatarName && !confirmReplace) {
      setConfirmReplace(true);
      return;
    }
    setSaving(true);
    await fetch("/api/member/avatar", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        avatarProfile: detectedAvatar,
        avatarName: detectedAvatar.avatar_name,
        avatarSummary: detectedAvatar.avatar_summary,
        contentThemes: detectedAvatar.content_themes,
      }),
    });
    setSaving(false);
    setSaved(true);
    setConfirmReplace(false);
    setExistingAvatar({ avatarName: detectedAvatar.avatar_name });
  }

  function copyAvatar() {
    if (!detectedAvatar) return;
    navigator.clipboard.writeText(detectedAvatar.full_document);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <span className="text-6xl mb-6">🎯</span>
        <h1 className="text-2xl font-bold text-[#1e2a38] mb-3">Avatar Architect</h1>
        <p className="text-[#1e2a38]/60 max-w-md mb-8">
          A guided coaching conversation that builds your ideal client avatar — the ONE person your entire YouTube channel speaks to.
        </p>
        {existingAvatar?.avatarName && (
          <p className="text-sm text-[#3dc3ff] mb-4">
            You have an existing avatar saved: <strong>{existingAvatar.avatarName}</strong>
          </p>
        )}
        <button
          onClick={startSession}
          className="bg-[#3dc3ff] text-white px-8 py-3 rounded-xl font-semibold hover:bg-[#3dc3ff]/90 transition-colors"
        >
          {existingAvatar?.avatarName ? "Start New Session" : "Start Building My Avatar"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-[#1e2a38]">Avatar Architect</h1>
          <p className="text-sm text-[#1e2a38]/50">Chat with your AI coach</p>
        </div>
        <button
          onClick={startSession}
          className="flex items-center gap-2 text-sm text-[#1e2a38]/60 hover:text-[#1e2a38] border border-[#1e2a38]/20 px-3 py-1.5 rounded-lg transition-colors"
        >
          <ArrowPathIcon className="w-4 h-4" />
          New Session
        </button>
      </div>

      {/* Avatar save banner */}
      {detectedAvatar && !saved && (
        <div className="flex-shrink-0 mb-3 bg-[#3dc3ff]/10 border border-[#3dc3ff]/30 rounded-xl p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-[#1e2a38] text-sm">
                ✅ Avatar ready: <strong>{detectedAvatar.avatar_name}</strong>
              </p>
              <p className="text-xs text-[#1e2a38]/60 mt-0.5">Save it to your profile so all AI tools can use it.</p>
              {confirmReplace && (
                <p className="text-xs text-amber-700 mt-1">
                  ⚠️ This will replace your current avatar ({existingAvatar?.avatarName}). Are you sure?
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={copyAvatar}
                className="flex items-center gap-1.5 text-xs text-[#1e2a38]/60 hover:text-[#1e2a38] border border-[#1e2a38]/20 px-3 py-1.5 rounded-lg transition-colors"
              >
                {copied ? <CheckIcon className="w-3.5 h-3.5" /> : <ClipboardDocumentIcon className="w-3.5 h-3.5" />}
                {copied ? "Copied!" : "Copy text"}
              </button>
              <button
                onClick={saveAvatar}
                disabled={saving}
                className={`text-xs px-4 py-1.5 rounded-lg font-semibold transition-colors ${
                  confirmReplace
                    ? "bg-amber-500 text-white hover:bg-amber-600"
                    : "bg-[#3dc3ff] text-white hover:bg-[#3dc3ff]/90"
                }`}
              >
                {saving ? "Saving..." : confirmReplace ? "Yes, Replace" : "Save to My Profile"}
              </button>
            </div>
          </div>
        </div>
      )}

      {saved && (
        <div className="flex-shrink-0 mb-3 bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2">
          <CheckIcon className="w-5 h-5 text-green-600" />
          <p className="text-sm font-medium text-green-800">Avatar saved! All your AI tools will now use {detectedAvatar?.avatar_name}.</p>
        </div>
      )}

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                msg.role === "user"
                  ? "bg-[#1e2a38] text-white rounded-tr-sm"
                  : "bg-white border border-[#1e2a38]/10 text-[#1e2a38] rounded-tl-sm shadow-sm"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-[#1e2a38]/10 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1.5 items-center h-4">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-2 h-2 rounded-full bg-[#3dc3ff]/60 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-[#1e2a38]/10 pt-4">
        <div className="flex gap-3 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Type your reply... (Enter to send, Shift+Enter for new line)"
            rows={2}
            className="flex-1 border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 resize-none focus:outline-none focus:border-[#3dc3ff] transition-colors"
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="flex-shrink-0 w-11 h-11 flex items-center justify-center bg-[#3dc3ff] text-white rounded-xl hover:bg-[#3dc3ff]/90 disabled:opacity-40 transition-colors"
          >
            <PaperAirplaneIcon className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

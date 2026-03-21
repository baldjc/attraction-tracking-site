"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  PaperAirplaneIcon,
  ArrowPathIcon,
  ArrowLeftIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  PencilIcon,
  XMarkIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import PromptEditor from "@/components/ai-tools/PromptEditor";
import RecentConversations from "@/components/ai-tools/RecentConversations";

interface Message {
  role: "user" | "assistant";
  content: string;
}

type RawTheme = string | { name: string; emoji?: string | null; colour?: string | null; coreStress?: string | null; content_engine_prompt?: string | null };

interface AvatarData {
  avatar_name: string;
  avatar_summary: string;
  content_themes: RawTheme[];
  full_document: string;
}

interface SavedAvatar {
  avatarName?: string;
  avatarSummary?: string;
  contentThemes?: RawTheme[];
  updatedAt?: string;
}

function getThemeName(t: RawTheme): string {
  return typeof t === "string" ? t : (t.name ?? "");
}

function getThemeEmoji(t: RawTheme): string | null {
  return typeof t === "string" ? null : (t.emoji ?? null);
}

// ─── Lightweight Markdown Renderer ────────────────────────────────────────────
function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function MarkdownBlock({ content }: { content: string }) {
  const lines = content.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || trimmed === "") {
      i++;
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      nodes.push(<hr key={i} className="my-3 border-[#1e2a38]/10" />);
      i++;
      continue;
    }

    if (trimmed.startsWith("### ")) {
      nodes.push(
        <h3 key={i} className="text-xs font-bold text-[#1e2a38]/50 uppercase tracking-wider mt-4 mb-1">
          {renderInline(trimmed.slice(4))}
        </h3>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith("## ")) {
      nodes.push(
        <h2 key={i} className="text-sm font-bold text-[#1e2a38] mt-5 mb-1.5">
          {renderInline(trimmed.slice(3))}
        </h2>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith("# ")) {
      nodes.push(
        <h1 key={i} className="text-base font-bold text-[#1e2a38] mt-2 mb-2">
          {renderInline(trimmed.slice(2))}
        </h1>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && (lines[i].trim().startsWith("- ") || lines[i].trim().startsWith("* "))) {
        listItems.push(
          <li key={i} className="text-sm text-[#1e2a38]/80 leading-relaxed">
            {renderInline(lines[i].trim().slice(2))}
          </li>
        );
        i++;
      }
      nodes.push(
        <ul key={`ul-${i}`} className="list-disc list-inside space-y-0.5 my-1.5 ml-1">
          {listItems}
        </ul>
      );
      continue;
    }

    nodes.push(
      <p key={i} className="text-sm text-[#1e2a38]/80 leading-relaxed my-1.5">
        {renderInline(trimmed)}
      </p>
    );
    i++;
  }

  return <div>{nodes}</div>;
}

// ─── Inline Avatar Profile Card ───────────────────────────────────────────────
function AvatarProfileCard({
  avatar,
  onChange,
}: {
  avatar: SavedAvatar;
  onChange: (updated: SavedAvatar) => void;
}) {
  const isEmpty = !avatar.avatarName;
  const [editing, setEditing] = useState(isEmpty);
  const [name, setName] = useState(avatar.avatarName ?? "");
  const [summary, setSummary] = useState(avatar.avatarSummary ?? "");
  const [themes, setThemes] = useState<string[]>(
    Array.isArray(avatar.contentThemes) ? avatar.contentThemes.map(getThemeName) : []
  );
  const [themeInput, setThemeInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function startEdit() {
    setName(avatar.avatarName ?? "");
    setSummary(avatar.avatarSummary ?? "");
    setThemes(Array.isArray(avatar.contentThemes) ? avatar.contentThemes.map(getThemeName) : []);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setThemeInput("");
  }

  function addTheme() {
    const t = themeInput.trim();
    if (t && !themes.includes(t)) {
      setThemes((prev) => [...prev, t]);
    }
    setThemeInput("");
  }

  function removeTheme(t: string) {
    setThemes((prev) => prev.filter((x) => x !== t));
  }

  function handleThemeKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTheme();
    }
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/member/avatar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          avatarName: name.trim(),
          avatarSummary: summary.trim(),
          contentThemes: themes,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        onChange({
          avatarName: updated.avatarName,
          avatarSummary: updated.avatarSummary,
          contentThemes: updated.contentThemes,
          updatedAt: updated.updatedAt,
        });
        setEditing(false);
        setThemeInput("");
        setToast("Avatar updated");
        setTimeout(() => setToast(null), 3000);
      }
    } finally {
      setSaving(false);
    }
  }

  const displayThemes = Array.isArray(avatar.contentThemes) ? avatar.contentThemes : [];
  const lastUpdated = avatar.updatedAt
    ? new Date(avatar.updatedAt).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <div className="border border-[#3dc3ff]/30 rounded-xl overflow-hidden mb-6">
      <div className="flex items-center justify-between px-4 py-3 bg-[#3dc3ff]/5">
        <div className="flex items-center gap-2">
          <span className="text-base">🎯</span>
          <span className="text-xs font-semibold text-[#3dc3ff] uppercase tracking-wider">
            {isEmpty ? "Save Your Avatar" : "Your Current Avatar"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {toast && (
            <span className="text-xs text-green-600 font-medium">{toast}</span>
          )}
          {!editing && (
            <button
              onClick={startEdit}
              className="flex items-center gap-1 text-xs text-[#3dc3ff] hover:text-[#3dc3ff]/70 transition-colors font-medium"
            >
              <PencilIcon className="w-3.5 h-3.5" />
              Edit
            </button>
          )}
        </div>
      </div>

      <div className="bg-white px-4 py-4">
        {!editing ? (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-[#1e2a38]/40 uppercase tracking-wider mb-1">
                Avatar Name
              </p>
              <p className="text-base font-bold text-[#1e2a38]">
                {avatar.avatarName || <span className="text-[#1e2a38]/30 font-normal italic">Not set</span>}
              </p>
            </div>

            {avatar.avatarSummary && (
              <div>
                <p className="text-xs font-semibold text-[#1e2a38]/40 uppercase tracking-wider mb-2">
                  Summary
                </p>
                <MarkdownBlock content={avatar.avatarSummary} />
              </div>
            )}

            {displayThemes.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[#1e2a38]/40 uppercase tracking-wider mb-1.5">
                  Content Themes
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {displayThemes.map((t, i) => (
                    <span
                      key={i}
                      className="text-xs bg-[#3dc3ff]/10 text-[#3dc3ff] font-medium px-2.5 py-1 rounded-full border border-[#3dc3ff]/20"
                    >
                      {getThemeEmoji(t) && <span className="mr-1">{getThemeEmoji(t)}</span>}
                      {getThemeName(t)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {lastUpdated && (
              <p className="text-xs text-[#1e2a38]/30">Last updated {lastUpdated}</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#1e2a38]/60 uppercase tracking-wider mb-1.5">
                Avatar Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sarah the Suburban Mover"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#1e2a38] focus:outline-none focus:ring-2 focus:ring-[#3dc3ff]/40"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1e2a38]/60 uppercase tracking-wider mb-1.5">
                Summary
              </label>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="A brief description of your avatar's situation, fears, and goals…"
                rows={4}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#1e2a38] focus:outline-none focus:ring-2 focus:ring-[#3dc3ff]/40 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1e2a38]/60 uppercase tracking-wider mb-1.5">
                Content Themes
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {themes.map((t) => (
                  <span
                    key={t}
                    className="flex items-center gap-1 text-xs bg-[#3dc3ff]/10 text-[#3dc3ff] font-medium px-2.5 py-1 rounded-full border border-[#3dc3ff]/20"
                  >
                    {t}
                    <button
                      onClick={() => removeTheme(t)}
                      className="text-[#3dc3ff]/60 hover:text-[#ff0033] transition-colors"
                    >
                      <XMarkIcon className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={themeInput}
                  onChange={(e) => setThemeInput(e.target.value)}
                  onKeyDown={handleThemeKeyDown}
                  placeholder="Add a theme, press Enter…"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#1e2a38] focus:outline-none focus:ring-2 focus:ring-[#3dc3ff]/40"
                />
                <button
                  onClick={addTheme}
                  className="p-2 bg-[#3dc3ff]/10 text-[#3dc3ff] rounded-lg hover:bg-[#3dc3ff]/20 transition-colors"
                >
                  <PlusIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 bg-[#3dc3ff] text-white text-xs font-semibold rounded-lg hover:bg-[#3dc3ff]/90 disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving…" : isEmpty ? "Save Avatar" : "Save Changes"}
              </button>
              {!isEmpty && (
                <button
                  onClick={cancelEdit}
                  disabled={saving}
                  className="px-4 py-2 border border-gray-200 text-[#1e2a38]/60 text-xs font-semibold rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function AvatarArchitectPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [detectedAvatar, setDetectedAvatar] = useState<AvatarData | null>(null);
  const [savedAvatar, setSavedAvatar] = useState<SavedAvatar | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch("/api/member/avatar")
      .then((r) => r.json())
      .then((d) => {
        if (d && (d.avatarName || d.avatarSummary)) {
          setSavedAvatar(d);
        }
        setAvatarLoading(false);
      })
      .catch(() => setAvatarLoading(false));
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
    if (savedAvatar?.avatarName && !confirmReplace) {
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

    try {
      if (conversationId) {
        await fetch(`/api/ai-tools/conversations/${conversationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages }),
        });
      } else {
        const res = await fetch("/api/ai-tools/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            toolType: "avatar_architect",
            title: detectedAvatar.avatar_name ?? "Avatar Session",
            messages,
            metadata: { avatarName: detectedAvatar.avatar_name },
          }),
        });
        const data = await res.json();
        setConversationId(data.id ?? null);
        setRefreshCounter((n) => n + 1);
      }
    } catch {
      // best-effort
    }

    setSaving(false);
    setSaved(true);
    setConfirmReplace(false);
    setSavedAvatar({
      avatarName: detectedAvatar.avatar_name,
      avatarSummary: detectedAvatar.avatar_summary,
      contentThemes: detectedAvatar.content_themes,
    });
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
      <div className="max-w-xl mx-auto">
        <div className="mb-5">
          <Link
            href="/member/ai-tools"
            className="flex items-center gap-1.5 text-xs text-[#1e2a38]/50 hover:text-[#3dc3ff] transition-colors mb-3"
          >
            <ArrowLeftIcon className="w-3.5 h-3.5" />
            Back to AI Tools
          </Link>
          <h1 className="text-2xl font-bold text-[#1e2a38]">🎯 Avatar Architect</h1>
          <p className="text-sm text-[#1e2a38]/60 mt-1">Build your ideal client avatar through a guided coaching conversation</p>
        </div>
        <PromptEditor toolKey="avatar_architect_prompt" defaultPrompt="" placeholders={[]} />
        <RecentConversations toolType="avatar_architect" refreshTrigger={refreshCounter} />

        {/* Avatar card — always shown once loading is done */}
        {!avatarLoading && (
          <AvatarProfileCard avatar={savedAvatar ?? {}} onChange={setSavedAvatar} />
        )}

        {/* Main CTA */}
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <span className="text-6xl mb-5">🎯</span>
          <p className="text-[#1e2a38]/60 max-w-md mb-8">
            {savedAvatar?.avatarName
              ? "Start a new coaching session to refine or replace your current avatar."
              : "Use the guided AI coaching session to build your avatar — or enter the details manually above."}
          </p>
          <button
            onClick={startSession}
            className="bg-[#3dc3ff] text-white px-8 py-3 rounded-xl font-semibold hover:bg-[#3dc3ff]/90 transition-colors"
          >
            {savedAvatar?.avatarName ? "Start New Session" : "Start Building My Avatar"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      <div className="flex-shrink-0 mb-1">
        <Link
          href="/member/ai-tools"
          className="flex items-center gap-1.5 text-xs text-[#1e2a38]/50 hover:text-[#3dc3ff] transition-colors"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          Back to AI Tools
        </Link>
      </div>
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-[#1e2a38]">🎯 Avatar Architect</h1>
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
                  ⚠️ This will replace your current avatar ({savedAvatar?.avatarName}). Are you sure?
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
          <p className="text-sm font-medium text-green-800">
            Avatar saved! All your AI tools will now use {detectedAvatar?.avatar_name}.
          </p>
        </div>
      )}

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
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
            className="flex-1 bg-white border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 resize-none focus:outline-none focus:border-[#3dc3ff] transition-colors"
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

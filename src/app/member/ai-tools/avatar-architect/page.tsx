"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
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
import MarkdownMessage from "@/components/MarkdownMessage";
import NextStepCard from "@/components/ai-tools/NextStepCard";
import { CANONICAL_THEMES, MAX_THEMES } from "@/lib/canonical-themes";

interface Message {
  role: "user" | "assistant";
  content: string;
}

type RawTheme = string | {
  name: string;
  canonicalName?: string | null;
  emoji?: string | null;
  colour?: string | null;
  coreStress?: string | null;
  content_engine_prompt?: string | null;
  enforceBuySideTitles?: boolean;
  whyThisFits?: string | null;
  builtAt?: string | null;
  state?: "empty" | "building" | "built";
};

interface ThemeSelectionItem {
  canonicalName: string;
  coreStress: string;
  enforceBuySideTitles: boolean;
  whyThisFits: string;
}

interface AvatarData {
  avatar_name: string;
  avatar_summary: string;
  content_themes: RawTheme[];
  full_document: string;
}

interface SavedAvatar {
  avatarName?: string;
  avatarSummary?: string;
  avatarProfile?: string;
  contentThemes?: RawTheme[];
  city?: string;
  niche?: string;
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
      nodes.push(<hr key={i} className="my-3 border-[#2f3437]/10" />);
      i++;
      continue;
    }

    if (trimmed.startsWith("### ")) {
      nodes.push(
        <h3 key={i} className="text-xs font-bold text-[#2f3437]/50 uppercase tracking-wider mt-4 mb-1">
          {renderInline(trimmed.slice(4))}
        </h3>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith("## ")) {
      nodes.push(
        <h2 key={i} className="text-sm font-bold text-[#2f3437] mt-5 mb-1.5">
          {renderInline(trimmed.slice(3))}
        </h2>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith("# ")) {
      nodes.push(
        <h1 key={i} className="text-base font-bold text-[#2f3437] mt-2 mb-2">
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
          <li key={i} className="text-sm text-[#2f3437]/80 leading-relaxed">
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
      <p key={i} className="text-sm text-[#2f3437]/80 leading-relaxed my-1.5">
        {renderInline(trimmed)}
      </p>
    );
    i++;
  }

  return <div>{nodes}</div>;
}

// ─── Avatar Profile Card (redesigned) ────────────────────────────────────────
function AvatarProfileCard({
  avatar,
  onChange,
}: {
  avatar: SavedAvatar;
  onChange: (updated: SavedAvatar) => void;
}) {
  const isEmpty = !avatar.avatarName;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(avatar.avatarName ?? "");
  const [summary, setSummary] = useState(avatar.avatarSummary ?? "");
  const [themes, setThemes] = useState<{ name: string; context: string; enforceBuySideTitles: boolean }[]>(
    Array.isArray(avatar.contentThemes)
      ? avatar.contentThemes.map((t) => ({
          name: getThemeName(t),
          context: typeof t === "string" ? "" : (t.content_engine_prompt ?? ""),
          enforceBuySideTitles: typeof t === "string" ? isEquityTheme(t) : (t.enforceBuySideTitles ?? isEquityTheme(getThemeName(t))),
        }))
      : []
  );
  const [showMigrationBanner, setShowMigrationBanner] = useState(() =>
    Array.isArray(avatar.contentThemes) &&
    avatar.contentThemes.length > 0 &&
    avatar.contentThemes.some((t) => typeof t !== "string" && !t.canonicalName)
  );
  const [showRemapModal, setShowRemapModal] = useState(false);
  const [remapSelections, setRemapSelections] = useState<Record<number, string>>(() => {
    if (!Array.isArray(avatar.contentThemes)) return {};
    const initial: Record<number, string> = {};
    avatar.contentThemes.forEach((t, i) => {
      if (typeof t !== "string") {
        initial[i] = t.canonicalName ?? t.name ?? "";
      }
    });
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [remapSaving, setRemapSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function startEdit() {
    setName(avatar.avatarName ?? "");
    setSummary(avatar.avatarSummary ?? "");
    setThemes(
      Array.isArray(avatar.contentThemes)
        ? avatar.contentThemes.map((t) => ({
            name: getThemeName(t),
            context: typeof t === "string" ? "" : (t.content_engine_prompt ?? ""),
            enforceBuySideTitles: typeof t === "string" ? isEquityTheme(t) : (t.enforceBuySideTitles ?? isEquityTheme(getThemeName(t))),
          }))
        : []
    );
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
  }

  function removeTheme(idx: number) {
    setThemes((prev) => prev.filter((_, j) => j !== idx));
  }

  async function save() {
    setSaving(true);
    try {
      const themesToSave = themes.map((t) => ({
        name: t.name,
        content_engine_prompt: t.context,
        enforceBuySideTitles: t.enforceBuySideTitles,
      }));
      const res = await fetch("/api/member/avatar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarName: name.trim(), avatarSummary: summary.trim(), contentThemes: themesToSave }),
      });
      if (res.ok) {
        const updated = await res.json();
        onChange({ avatarName: updated.avatarName, avatarSummary: updated.avatarSummary, contentThemes: updated.contentThemes, updatedAt: updated.updatedAt });
        setEditing(false);
        setToast("Saved");
        setTimeout(() => setToast(null), 3000);
      }
    } finally { setSaving(false); }
  }

  const displayThemes = Array.isArray(avatar.contentThemes) ? avatar.contentThemes : [];
  const hasThemes = displayThemes.length > 0;
  const lastUpdated = avatar.updatedAt
    ? new Date(avatar.updatedAt).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })
    : null;

  if (editing) {
    return (
      <div className="bg-white border border-[#6ba3c7]/30 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-[#6ba3c7]/5 border-b border-[#6ba3c7]/15">
          <span className="text-xs font-semibold text-[#6ba3c7] uppercase tracking-wider">Edit Avatar</span>
          <div className="flex items-center gap-2">
            {toast && <span className="text-xs text-green-600 font-medium">{toast}</span>}
            <button onClick={cancelEdit} disabled={saving} className="text-xs text-[#2f3437]/50 hover:text-[#2f3437] transition-colors">Cancel</button>
            <button onClick={save} disabled={saving} className="px-3 py-1.5 bg-[#6ba3c7] text-white text-xs font-semibold rounded-lg hover:bg-[#6ba3c7]/90 disabled:opacity-50 transition-colors">
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#2f3437]/50 uppercase tracking-wider mb-1.5">Avatar Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sarah the Suburban Mover"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#2f3437] focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#2f3437]/50 uppercase tracking-wider mb-1.5">Avatar Description</label>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4}
              placeholder="A description of your avatar's situation, fears, and goals…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#2f3437] focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40 resize-y min-h-[100px]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#2f3437]/50 uppercase tracking-wider mb-2">Content Themes <span className="font-normal text-[#2f3437]/35">({themes.length}/{MAX_THEMES})</span></label>
            <div className="space-y-4 mb-3">
              {themes.map((t, i) => (
                <div key={i} className="border border-[#6ba3c7]/20 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-[#6ba3c7]/5">
                    <span className="w-6 h-6 rounded-full bg-[#6ba3c7]/10 text-[#6ba3c7] text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                    <span className="flex-1 px-3 py-1.5 text-sm font-medium text-[#2f3437]">
                      {CANONICAL_THEMES.find((ct) => ct.name === t.name)?.emoji ?? "📌"} {t.name}
                    </span>
                    <button onClick={() => removeTheme(i)} className="p-1 text-[#2f3437]/30 hover:text-red-400 transition-colors"><XMarkIcon className="w-4 h-4" /></button>
                  </div>
                  <div className="px-3 py-2">
                    <label className="block text-xs text-[#2f3437]/40 mb-1">AI Context &amp; Prompting</label>
                    <textarea value={t.context} onChange={(e) => { const v = e.target.value; setThemes((prev) => prev.map((x, j) => j === i ? { ...x, context: v } : x)); }}
                      rows={3}
                      placeholder="Describe the stresses, angles, tone, and content engine prompting for this theme…"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#2f3437] focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40 resize-y min-h-[60px]" />
                  </div>
                  <div className="px-3 pb-3">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input type="checkbox" checked={t.enforceBuySideTitles}
                        onChange={(e) => { const v = e.target.checked; setThemes((prev) => prev.map((x, j) => j === i ? { ...x, enforceBuySideTitles: v } : x)); }}
                        className="mt-0.5 rounded border-gray-300 text-[#6ba3c7] focus:ring-[#6ba3c7]/40" />
                      <div>
                        <span className="text-xs font-semibold text-[#2f3437]/60">Enforce buy-side titles for this theme</span>
                        <p className="text-xs text-[#2f3437]/40 leading-relaxed mt-0.5">Adds the buy-side hard constraint and title validation for this theme only. Use for sell-side or transition themes like The Equity.</p>
                      </div>
                    </label>
                  </div>
                </div>
              ))}
            </div>
            {(() => {
              const availableThemes = CANONICAL_THEMES.filter(
                (ct) => !themes.some((t) => t.name.toLowerCase() === ct.name.toLowerCase())
              );
              return themes.length < MAX_THEMES && availableThemes.length > 0 ? (
                <select
                  value=""
                  onChange={(e) => {
                    const selected = CANONICAL_THEMES.find((ct) => ct.id === e.target.value);
                    if (selected) {
                      setThemes((prev) => [...prev, {
                        name: selected.name,
                        context: "",
                        enforceBuySideTitles: selected.name === "The Equity",
                      }]);
                    }
                  }}
                  className="w-full border border-dashed border-[#6ba3c7]/40 rounded-lg px-3 py-2 text-sm text-[#2f3437] focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40 bg-white"
                >
                  <option value="" disabled>— choose canonical theme —</option>
                  {availableThemes.map((ct) => (
                    <option key={ct.id} value={ct.id}>
                      {ct.emoji} {ct.name} — {ct.coreStress}
                    </option>
                  ))}
                </select>
              ) : themes.length >= MAX_THEMES ? (
                <p className="text-xs text-[#2f3437]/30 italic py-1">
                  Maximum {MAX_THEMES} themes reached
                </p>
              ) : null;
            })()}
          </div>
        </div>
      </div>
    );
  }

  async function saveRemap() {
    setRemapSaving(true);
    const themes = Array.isArray(avatar.contentThemes) ? [...avatar.contentThemes] : [];
    const updated = themes.map((t, i) => {
      if (typeof t === "string") return { name: t, canonicalName: remapSelections[i] ?? t };
      const canonicalName = remapSelections[i] ?? t.canonicalName ?? t.name;
      return {
        ...t,
        canonicalName,
        name: canonicalName,
        enforceBuySideTitles: t.enforceBuySideTitles ?? (canonicalName === "The Equity"),
        state: t.content_engine_prompt ? ("built" as const) : ("empty" as const),
      };
    });
    const res = await fetch("/api/member/avatar", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentThemes: updated }),
    });
    if (res.ok) {
      const d = await res.json();
      onChange({ ...avatar, contentThemes: d.contentThemes });
      setShowRemapModal(false);
      setShowMigrationBanner(false);
    }
    setRemapSaving(false);
  }

  return (
    <div className="space-y-3">
      {/* Legacy migration banner — shown for avatars with themes missing canonicalName */}
      {showMigrationBanner && (
        <div className="flex items-start justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-xs text-amber-800 leading-relaxed">
            <strong>Theme update needed:</strong> This avatar was built before we locked in our 8 canonical content themes. Map your existing themes to the canonical list so the Theme Builder and Content Engine work properly.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setShowRemapModal(true)} className="text-xs font-semibold text-amber-800 hover:underline whitespace-nowrap">Remap Now</button>
            <button onClick={() => setShowMigrationBanner(false)} className="text-amber-500 hover:text-amber-700 mt-0.5">
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Remap modal */}
      {showRemapModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#2f3437]/10">
              <h2 className="text-sm font-bold text-[#2f3437]">Map themes to canonical list</h2>
              <button onClick={() => setShowRemapModal(false)} className="text-[#2f3437]/40 hover:text-[#2f3437]"><XMarkIcon className="w-5 h-5" /></button>
            </div>
            <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
              <p className="text-xs text-[#2f3437]/60 leading-relaxed">Your existing theme prompts will be preserved — only the name/canonical mapping changes.</p>
              {(Array.isArray(avatar.contentThemes) ? avatar.contentThemes : []).map((t, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-sm text-[#2f3437]/60 shrink-0 w-40 truncate">{getThemeName(t)}</span>
                  <span className="text-[#2f3437]/30">→</span>
                  <select
                    value={remapSelections[i] ?? ""}
                    onChange={(e) => setRemapSelections((prev) => ({ ...prev, [i]: e.target.value }))}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-[#2f3437] focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40 bg-white"
                  >
                    <option value="">— choose canonical theme —</option>
                    {CANONICAL_THEMES.map((ct) => (
                      <option key={ct.id} value={ct.name}>{ct.emoji} {ct.name} — {ct.coreStress}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[#2f3437]/10">
              <button onClick={() => setShowRemapModal(false)} className="text-sm text-[#2f3437]/50 hover:text-[#2f3437]">Cancel</button>
              <button onClick={saveRemap} disabled={remapSaving} className="px-4 py-2 bg-[#6ba3c7] text-white text-sm font-semibold rounded-lg hover:bg-[#6ba3c7]/90 disabled:opacity-50 transition-colors">
                {remapSaving ? "Saving…" : "Confirm Mapping"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Identity card */}
      <div className="bg-white border border-[#2f3437]/10 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#f7f6f3] border-b border-[#2f3437]/8">
          <span className="text-xs font-semibold text-[#2f3437]/50 uppercase tracking-wider">Client Avatar</span>
          <div className="flex items-center gap-2">
            {toast && <span className="text-xs text-green-600 font-medium">{toast}</span>}
            {lastUpdated && <span className="text-xs text-[#2f3437]/30">Updated {lastUpdated}</span>}
            <button onClick={startEdit} className="flex items-center gap-1 text-xs text-[#6ba3c7] hover:text-[#6ba3c7]/70 font-medium transition-colors">
              <PencilIcon className="w-3 h-3" /> Edit
            </button>
          </div>
        </div>
        <div className="px-4 py-3">
          {isEmpty ? (
            <p className="text-sm text-[#2f3437]/40 italic">No avatar saved yet — start a session below to build one.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-lg font-bold text-[#2f3437]">{avatar.avatarName}</p>
              {avatar.avatarSummary && (
                <p className="text-sm text-[#2f3437]/65 leading-relaxed line-clamp-3">{avatar.avatarSummary.replace(/\*\*/g, "")}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content Themes — prominent separate card */}
      <div className={`border rounded-xl overflow-hidden ${!hasThemes ? "border-amber-300" : "border-[#2f3437]/10"}`}>
        <div className={`flex items-center justify-between px-4 py-2.5 border-b ${!hasThemes ? "bg-amber-50 border-amber-200" : "bg-[#f7f6f3] border-[#2f3437]/8"}`}>
          <div>
            <span className="text-xs font-semibold text-[#2f3437]/60 uppercase tracking-wider">Content Themes</span>
            <p className="text-xs text-[#2f3437]/40 mt-0.5">Power the Content Engine with personalised video ideas</p>
          </div>
          {hasThemes && (
            <button onClick={startEdit} className="flex items-center gap-1 text-xs text-[#6ba3c7] hover:text-[#6ba3c7]/70 font-medium transition-colors">
              <PencilIcon className="w-3 h-3" /> Edit
            </button>
          )}
        </div>
        {!hasThemes ? (
          <div className="bg-amber-50 px-4 py-4">
            <p className="text-sm font-semibold text-amber-700 mb-1">⚠ No content themes set</p>
            <p className="text-xs text-amber-600 leading-relaxed">
              Themes are what the Content Engine uses to generate personalised video ideas for your avatar. Start or import an avatar session below — the AI will extract them automatically.
            </p>
          </div>
        ) : (
          <div className="bg-white divide-y divide-[#2f3437]/5">
            {displayThemes.map((t, i) => {
              const tObj = typeof t === "string" ? null : t;
              const hasPrompt = !!tObj?.content_engine_prompt;
              const slotState = tObj?.state ?? (hasPrompt ? "built" : "empty");
              const coreStress = tObj?.coreStress ?? null;
              const whyThisFits = tObj?.whyThisFits ?? null;
              return (
                <div key={i} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-[#6ba3c7]/10 text-[#6ba3c7] text-xs font-bold flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <span className="flex-1 text-sm font-medium text-[#2f3437]">
                      {getThemeEmoji(t) && <span className="mr-1.5">{getThemeEmoji(t)}</span>}
                      {getThemeName(t)}
                    </span>
                    {slotState === "built" ? (
                      <span className="text-xs text-green-600 font-semibold">Built ✓</span>
                    ) : slotState === "building" ? (
                      <span className="text-xs text-amber-600 font-semibold">In progress</span>
                    ) : (
                      <span className="text-xs text-[#2f3437]/35 font-medium">Not built yet</span>
                    )}
                  </div>
                  {slotState === "built" && coreStress && (
                    <p className="text-xs text-[#2f3437]/50 leading-relaxed mt-1 ml-9 italic line-clamp-2">"{coreStress}"</p>
                  )}
                  {slotState === "empty" && whyThisFits && (
                    <p className="text-xs text-[#2f3437]/40 leading-relaxed mt-1 ml-9 line-clamp-2">{whyThisFits}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────────
function isEquityTheme(themeName: string): boolean {
  const lower = themeName.toLowerCase();
  return lower.includes("equity");
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
function AvatarArchitectInner() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawSlot = searchParams.get("testAvatarSlot");
  const testAvatarSlot = rawSlot ? parseInt(rawSlot, 10) : null;
  const testAvatarLabel = searchParams.get("label") ?? "";
  const isTestAvatarMode =
    (session?.user as any)?.role === "admin" &&
    !!testAvatarSlot &&
    !isNaN(testAvatarSlot as number);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [screen, setScreen] = useState<"landing" | "import" | "chat">("landing");
  const [importText, setImportText] = useState("");
  const [detectedAvatar, setDetectedAvatar] = useState<AvatarData | null>(null);
  const [savedAvatar, setSavedAvatar] = useState<SavedAvatar | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [chatError, setChatError] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const convIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function persistConversation(msgs: Message[], avatarName?: string): Promise<void> {
    try {
      if (convIdRef.current) {
        await fetch(`/api/ai-tools/conversations/${convIdRef.current}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: msgs }),
        });
      } else {
        const res = await fetch("/api/ai-tools/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            toolType: "avatar_architect",
            title: avatarName ?? "Avatar Session",
            messages: msgs,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          convIdRef.current = data.id;
          setConversationId(data.id);
          setRefreshCounter((n) => n + 1);
        }
      }
    } catch {
      // best-effort — never block the UI for persistence failures
    }
  }

  function handleLoadConversation(conv: { id: string; messages: any[]; metadata?: any }) {
    const msgs: Message[] = (conv.messages ?? []).filter(
      (m: any) => m.role === "user" || m.role === "assistant"
    );
    convIdRef.current = conv.id;
    setConversationId(conv.id);
    setMessages(msgs);
    setChatError(null);
    setStreamingContent(null);
    setSaved(false);
    setConfirmReplace(false);
    setDetectedAvatar(null);
    setScreen("chat");
  }

  // Theme Builder state
  const [themeBuilderOpen, setThemeBuilderOpen] = useState<number | null>(null); // index of theme being built
  const [themeMessages, setThemeMessages] = useState<Message[]>([]);
  const [themeInput, setThemeInput] = useState("");
  const [themeLoading, setThemeLoading] = useState(false);
  const [pendingThemeData, setPendingThemeData] = useState<{ name: string; coreStress?: string; content_engine_prompt?: string } | null>(null);
  const [themeSaved, setThemeSaved] = useState(false);
  const themeBottomRef = useRef<HTMLDivElement>(null);

  function applyThemeSelection(themeSelection: { selectedThemes: ThemeSelectionItem[] }) {
    const existing = Array.isArray(savedAvatar?.contentThemes) ? [...savedAvatar!.contentThemes!] : [];
    const updated = [...existing];
    for (const t of themeSelection.selectedThemes) {
      const idx = updated.findIndex((e) => {
        if (typeof e === "string") return e === t.canonicalName;
        return e.canonicalName === t.canonicalName || e.name === t.canonicalName;
      });
      if (idx >= 0) {
        const existing_t = updated[idx];
        const obj = typeof existing_t === "string" ? { name: existing_t } : existing_t;
        updated[idx] = {
          ...obj,
          canonicalName: t.canonicalName,
          name: t.canonicalName,
          coreStress: t.coreStress ?? obj.coreStress,
          enforceBuySideTitles: t.enforceBuySideTitles,
          whyThisFits: t.whyThisFits,
          state: obj.content_engine_prompt ? ("built" as const) : ("empty" as const),
        };
      } else {
        updated.push({
          name: t.canonicalName,
          canonicalName: t.canonicalName,
          coreStress: t.coreStress,
          enforceBuySideTitles: t.enforceBuySideTitles,
          whyThisFits: t.whyThisFits,
          content_engine_prompt: null,
          state: "empty" as const,
        });
      }
    }
    if (!isTestAvatarMode) {
      fetch("/api/member/avatar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentThemes: updated }),
      });
    }
    setSavedAvatar((prev) => prev ? { ...prev, contentThemes: updated } : prev);
  }

  useEffect(() => {
    if (isTestAvatarMode) {
      setAvatarLoading(false);
      return;
    }
    fetch("/api/member/avatar")
      .then((r) => r.json())
      .then((d) => {
        if (d && (d.avatarName || d.avatarSummary)) {
          setSavedAvatar(d);
        }
        setAvatarLoading(false);
      })
      .catch(() => setAvatarLoading(false));
  }, [isTestAvatarMode]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, streamingContent]);

  type StreamResult = { message: string; avatarData: AvatarData | null; themeSelection: { selectedThemes: ThemeSelectionItem[] } | null };

  async function streamAvatarAPI(
    msgs: Message[],
    hasBuild: boolean,
    onChunk: (text: string) => void,
    signal: AbortSignal,
  ): Promise<StreamResult> {
    const res = await fetch("/api/ai-tools/avatar-architect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: msgs, hasBuild, messageCount: msgs.length }),
      signal,
    });

    if (!res.ok || !res.body) {
      const b = await res.json().catch(() => ({}));
      throw new Error(b.error ?? `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let lastChunkAt = Date.now();

    // Abort if no chunk arrives for 30 seconds
    const chunkTimer = setInterval(() => {
      if (Date.now() - lastChunkAt > 30_000) {
        reader.cancel("no chunks for 30s");
      }
    }, 1000);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        lastChunkAt = Date.now();

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6)) as { type: string; text?: string; message?: string; avatarData?: AvatarData | null; themeSelection?: { selectedThemes: ThemeSelectionItem[] } | null; };
            if (event.type === "chunk" && event.text) {
              onChunk(event.text);
            } else if (event.type === "done") {
              clearInterval(chunkTimer);
              return { message: event.message ?? "", avatarData: event.avatarData ?? null, themeSelection: event.themeSelection ?? null };
            } else if (event.type === "error") {
              throw new Error(event.message ?? "Unknown stream error");
            }
          } catch (parseErr: any) {
            if (parseErr?.message && !parseErr.message.includes("JSON")) throw parseErr;
          }
        }
      }
      throw new Error("Stream ended without a completion event — please try again.");
    } finally {
      clearInterval(chunkTimer);
    }
  }

  async function startFromScratch() {
    setMessages([]);
    setDetectedAvatar(null);
    setSaved(false);
    setConfirmReplace(false);
    setChatError(null);
    setStreamingContent("");
    convIdRef.current = null;
    setConversationId(null);
    setScreen("chat");
    setLoading(true);

    const controller = new AbortController();
    try {
      const data = await streamAvatarAPI(
        [{ role: "user", content: "Start the session." }],
        false,
        (chunk) => setStreamingContent((prev) => (prev ?? "") + chunk),
        controller.signal,
      );
      const aiMsg: Message = { role: "assistant", content: data.message };
      setMessages([aiMsg]);
      setStreamingContent(null);
      if (data.avatarData) setDetectedAvatar(data.avatarData);
      if (data.themeSelection?.selectedThemes?.length) applyThemeSelection(data.themeSelection);
      await persistConversation([aiMsg], data.avatarData?.avatar_name ?? "Avatar Session");
    } catch (err: any) {
      setChatError(err?.message ?? "Something went wrong — please try again.");
      setStreamingContent(null);
      setScreen("landing");
    } finally {
      setLoading(false);
    }
  }

  async function startFromImport() {
    if (!importText.trim()) return;
    const taggedContent = `[IMPORTED_AVATAR_DOC]\n${importText.trim()}`;
    const userMsg: Message = { role: "user", content: taggedContent };
    setMessages([userMsg]);
    setDetectedAvatar(null);
    setSaved(false);
    setConfirmReplace(false);
    setChatError(null);
    setStreamingContent("");
    convIdRef.current = null;
    setConversationId(null);
    setScreen("chat");
    setLoading(true);

    const controller = new AbortController();
    try {
      const data = await streamAvatarAPI(
        [userMsg],
        false,
        (chunk) => setStreamingContent((prev) => (prev ?? "") + chunk),
        controller.signal,
      );
      const aiMsg: Message = { role: "assistant", content: data.message };
      const finalMsgs: Message[] = [userMsg, aiMsg];
      setMessages(finalMsgs);
      setStreamingContent(null);
      if (data.avatarData) setDetectedAvatar(data.avatarData);
      if (data.themeSelection?.selectedThemes?.length) applyThemeSelection(data.themeSelection);
      await persistConversation(finalMsgs, data.avatarData?.avatar_name ?? "Avatar Session (Import)");
    } catch (err: any) {
      setChatError(err?.message ?? "Something went wrong — please try again.");
      setStreamingContent(null);
      setScreen("landing");
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const userMsg: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setChatError(null);
    setStreamingContent("");
    setLoading(true);

    const hasBuild = detectedAvatar !== null || newMessages.some((m) => m.role === "assistant" && m.content.includes("<AVATAR_DATA>"));
    const controller = new AbortController();
    try {
      const data = await streamAvatarAPI(
        newMessages,
        hasBuild,
        (chunk) => setStreamingContent((prev) => (prev ?? "") + chunk),
        controller.signal,
      );
      const aiMsg: Message = { role: "assistant", content: data.message };
      const finalMsgs = [...newMessages, aiMsg];
      setMessages(finalMsgs);
      setStreamingContent(null);
      if (data.avatarData) setDetectedAvatar(data.avatarData);
      if (data.themeSelection?.selectedThemes?.length) applyThemeSelection(data.themeSelection);
      await persistConversation(finalMsgs, data.avatarData?.avatar_name);
    } catch (err: any) {
      setChatError(err?.message ?? "Something went wrong — please try again.");
      setStreamingContent(null);
    } finally {
      setLoading(false);
    }
  }

  async function retryLastMessage() {
    if (loading || messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== "user") return;
    setChatError(null);
    setStreamingContent("");
    setLoading(true);

    const hasBuild = detectedAvatar !== null || messages.some((m) => m.role === "assistant" && m.content.includes("<AVATAR_DATA>"));
    const controller = new AbortController();
    try {
      const data = await streamAvatarAPI(
        messages,
        hasBuild,
        (chunk) => setStreamingContent((prev) => (prev ?? "") + chunk),
        controller.signal,
      );
      const aiMsg: Message = { role: "assistant", content: data.message };
      const finalMsgs = [...messages, aiMsg];
      setMessages(finalMsgs);
      setStreamingContent(null);
      if (data.avatarData) setDetectedAvatar(data.avatarData);
      if (data.themeSelection?.selectedThemes?.length) applyThemeSelection(data.themeSelection);
      await persistConversation(finalMsgs, data.avatarData?.avatar_name);
    } catch (err: any) {
      setChatError(err?.message ?? "Something went wrong — please try again.");
      setStreamingContent(null);
    } finally {
      setLoading(false);
    }
  }

  function cleanMessage(text: string) {
    return text
      .replace(/<AVATAR_DATA>[\s\S]*?<\/AVATAR_DATA>/g, "")
      .replace(/<THEME_SELECTION>[\s\S]*?<\/THEME_SELECTION>/g, "")
      .trim();
  }

  async function saveAvatar() {
    if (!detectedAvatar) return;
    // In test-avatar mode: skip confirm-replace and save to the test-avatars API
    if (isTestAvatarMode) {
      setSaving(true);
      const shellThemes = (detectedAvatar.content_themes ?? []).map((t: Record<string, unknown>) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { content_engine_prompt: _strip, state: _s, builtAt: _b, ...rest } = t as Record<string, unknown>;
        return { ...rest, content_engine_prompt: null, state: "empty" as const };
      });
      const res = await fetch("/api/admin/test-avatars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotNumber: testAvatarSlot,
          label: testAvatarLabel || `Test Avatar Slot ${testAvatarSlot}`,
          avatarProfile: detectedAvatar,
          avatarName: detectedAvatar.avatar_name,
          avatarSummary: detectedAvatar.avatar_summary,
          contentThemes: shellThemes,
        }),
      });
      setSaving(false);
      if (res.ok) {
        setSaved(true);
        const isAdminRoute = window.location.pathname.startsWith("/admin");
        setTimeout(() => router.push(isAdminRoute ? "/admin/ai-tools" : "/member/ai-tools"), 1500);
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error("[AvatarArchitect] Failed to save test avatar:", errData);
        alert(`Failed to save test avatar: ${errData.error ?? "Unknown error"}`);
      }
      return;
    }

    if (savedAvatar?.avatarName && !confirmReplace) {
      setConfirmReplace(true);
      return;
    }
    setSaving(true);
    // Strip content_engine_prompt and force state: "empty" — only the Theme Builder can flip themes to "built".
    // This is a belt-and-suspenders guard in case an older prompt row in app_settings still emits the field.
    const shellThemes = (detectedAvatar.content_themes ?? []).map((t: Record<string, unknown>) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { content_engine_prompt: _strip, state: _s, builtAt: _b, ...rest } = t as Record<string, unknown>;
      return { ...rest, content_engine_prompt: null, state: "empty" as const };
    });

    await fetch("/api/member/avatar", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        avatarProfile: detectedAvatar,
        avatarName: detectedAvatar.avatar_name,
        avatarSummary: detectedAvatar.avatar_summary,
        contentThemes: shellThemes,
      }),
    });

    await persistConversation(messages, detectedAvatar.avatar_name);

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

  // ─── Theme Builder functions ─────────────────────────────────────────────────
  useEffect(() => {
    themeBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [themeMessages, themeLoading]);

  function buildThemePayload(themeName: string, themeIndex: number) {
    const avatarDoc = savedAvatar?.avatarProfile
      ? (typeof savedAvatar.avatarProfile === "string"
          ? savedAvatar.avatarProfile
          : JSON.stringify(savedAvatar.avatarProfile))
      : [`Avatar Name: ${savedAvatar?.avatarName ?? "Unknown"}`, `Summary: ${savedAvatar?.avatarSummary ?? ""}`].join("\n");

    const themes = Array.isArray(savedAvatar?.contentThemes) ? savedAvatar!.contentThemes! : [];
    const themeObj = themes[themeIndex];
    const enforceBuySide =
      themeObj && typeof themeObj !== "string" && themeObj.enforceBuySideTitles !== undefined
        ? themeObj.enforceBuySideTitles
        : isEquityTheme(themeName);
    const coreStress = themeObj && typeof themeObj !== "string" ? (themeObj.coreStress ?? "") : "";

    const avatarProfile = savedAvatar?.avatarProfile;
    const audiencePrimary =
      avatarProfile && typeof avatarProfile === "object"
        ? ((avatarProfile as Record<string, unknown>).audiencePrimary as string | undefined) ?? ""
        : "";

    const priorBuiltThemes = themes
      .filter((t, i) => i !== themeIndex && typeof t !== "string" && !!(t as Record<string, unknown>).content_engine_prompt)
      .map((t) => ({
        name: getThemeName(t),
        content_engine_prompt: (typeof t !== "string" ? (t.content_engine_prompt ?? "") : ""),
      }));

    return {
      themeName,
      coreStress,
      avatarDoc,
      avatarName: savedAvatar?.avatarName ?? "Avatar",
      audiencePrimary,
      memberName: (session?.user as any)?.name ?? (session?.user as any)?.email ?? "Member",
      city: savedAvatar?.city ?? "Not specified",
      enforceBuySideTitles: enforceBuySide,
      priorBuiltThemes,
    };
  }

  async function startThemeBuilder(idx: number) {
    const themes = Array.isArray(savedAvatar?.contentThemes) ? savedAvatar!.contentThemes! : [];
    const theme = themes[idx];
    const themeName = getThemeName(theme);
    setThemeBuilderOpen(idx);
    setThemeMessages([]);
    setThemeInput("");
    setPendingThemeData(null);
    setThemeSaved(false);
    setThemeLoading(true);

    const startMsg: Message = { role: "user", content: "Start the theme builder session." };
    const payload = {
      messages: [startMsg],
      ...buildThemePayload(themeName, idx),
    };

    const res = await fetch("/api/ai-tools/theme-builder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setThemeMessages([{ role: "assistant", content: data.message }]);
    setThemeLoading(false);
  }

  async function sendThemeMessage() {
    if (!themeInput.trim() || themeLoading || themeBuilderOpen === null) return;
    const themes = Array.isArray(savedAvatar?.contentThemes) ? savedAvatar!.contentThemes! : [];
    const theme = themes[themeBuilderOpen];
    const themeName = getThemeName(theme);

    const userMsg: Message = { role: "user", content: themeInput.trim() };
    const newMessages = [...themeMessages, userMsg];
    setThemeMessages(newMessages);
    setThemeInput("");
    setThemeLoading(true);

    const res = await fetch("/api/ai-tools/theme-builder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: newMessages, ...buildThemePayload(themeName, themeBuilderOpen) }),
    });
    const data = await res.json();
    setThemeMessages([...newMessages, { role: "assistant", content: data.message }]);

    // If theme data was extracted, store as pending for user to save
    if (data.themeData) {
      setPendingThemeData(data.themeData);
      setThemeSaved(false);
    }

    setThemeLoading(false);
  }

  async function saveThemeData() {
    if (!pendingThemeData || themeBuilderOpen === null) return;
    const themes = Array.isArray(savedAvatar?.contentThemes) ? [...savedAvatar!.contentThemes!] : [];
    const existing = themes[themeBuilderOpen];
    const existingObj = typeof existing === "string" ? { name: existing } : { ...existing };
    themes[themeBuilderOpen] = {
      ...existingObj,
      name: pendingThemeData.name ?? existingObj.name,
      canonicalName: (existingObj as Record<string, unknown>).canonicalName ?? pendingThemeData.name ?? existingObj.name,
      coreStress: pendingThemeData.coreStress ?? (existingObj as Record<string, unknown>).coreStress,
      content_engine_prompt: pendingThemeData.content_engine_prompt ?? (existingObj as Record<string, unknown>).content_engine_prompt,
      state: "built" as const,
      builtAt: new Date().toISOString(),
    } as RawTheme;

    if (!isTestAvatarMode) {
      await fetch("/api/member/avatar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentThemes: themes }),
      });
    }
    setSavedAvatar((prev) => prev ? { ...prev, contentThemes: themes } : prev);
    setThemeSaved(true);
  }

  function handleThemeKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendThemeMessage();
    }
  }

  if (screen === "landing") {
    return (
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link href="/member/ai-tools" className="flex items-center gap-1.5 text-xs text-[#2f3437]/50 hover:text-[#6ba3c7] transition-colors mb-3">
            <ArrowLeftIcon className="w-3.5 h-3.5" />
            Back to AI Tools
          </Link>
          <h1 className="text-2xl font-bold text-[#2f3437]">🎯 Avatar Architect</h1>
          <p className="text-sm text-[#2f3437]/60 mt-1">Build your ideal client avatar — it powers every AI tool on this platform</p>
        </div>

        {/* How it works — 2-step instructions */}
        <div className="mb-6 bg-gradient-to-r from-[#6ba3c7]/5 to-[#6ba3c7]/10 border border-[#6ba3c7]/20 rounded-xl p-5">
          <p className="text-xs font-semibold text-[#6ba3c7] uppercase tracking-wider mb-3">How it works</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex gap-3">
              <span className="w-7 h-7 rounded-full bg-[#6ba3c7] text-white text-sm font-bold flex items-center justify-center shrink-0">1</span>
              <div>
                <p className="text-sm font-semibold text-[#2f3437]">Build Your Avatar</p>
                <p className="text-xs text-[#2f3437]/55 leading-relaxed mt-0.5">Use the AI coach to create a deeply detailed profile of your ideal client — who they are, what stresses them, and how they think.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="w-7 h-7 rounded-full bg-[#6ba3c7] text-white text-sm font-bold flex items-center justify-center shrink-0">2</span>
              <div>
                <p className="text-sm font-semibold text-[#2f3437]">Build Your Themes</p>
                <p className="text-xs text-[#2f3437]/55 leading-relaxed mt-0.5">Use the Theme Builder to flesh out each of your content themes (up to 4) with the depth the Content Engine needs to generate personalised video ideas.</p>
              </div>
            </div>
          </div>
        </div>

        <PromptEditor toolKey="avatar_architect_prompt" defaultPrompt="" placeholders={[]} />

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">

          {/* Left — Avatar profile + themes (wider) */}
          <div className="lg:col-span-3">
            {avatarLoading ? (
              <div className="h-48 bg-white border border-[#2f3437]/10 rounded-xl animate-pulse" />
            ) : (
              <AvatarProfileCard avatar={savedAvatar ?? {}} onChange={setSavedAvatar} />
            )}
          </div>

          {/* Right — Actions + Recent */}
          <div className="lg:col-span-2 space-y-4">
            {!avatarLoading && savedAvatar?.avatarName && (
              <div className="px-4 py-3 bg-[#6ba3c7]/8 border border-[#6ba3c7]/25 rounded-xl text-sm text-[#2f3437]/70 leading-relaxed">
                You already have an avatar saved (<strong className="text-[#2f3437]">{savedAvatar.avatarName}</strong>). Either option below will let you update it.
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={startFromScratch}
                className="group w-full text-left p-5 border-2 border-[#2f3437]/10 hover:border-[#6ba3c7]/50 bg-white hover:bg-[#6ba3c7]/3 rounded-xl transition-all duration-200 hover:shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl shrink-0">🚀</span>
                  <div>
                    <p className="font-bold text-[#2f3437] text-sm mb-1 group-hover:text-[#6ba3c7] transition-colors">
                      {savedAvatar?.avatarName ? "Rebuild from Scratch" : "Start from Scratch"}
                    </p>
                    <p className="text-xs text-[#2f3437]/50 leading-relaxed">Guided coaching conversation — the AI will ask you questions and extract your avatar automatically</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setScreen("import")}
                className="group w-full text-left p-5 border-2 border-[#2f3437]/10 hover:border-[#6ba3c7]/50 bg-white hover:bg-[#6ba3c7]/3 rounded-xl transition-all duration-200 hover:shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl shrink-0">📋</span>
                  <div>
                    <p className="font-bold text-[#2f3437] text-sm mb-1 group-hover:text-[#6ba3c7] transition-colors">I Have an Existing Avatar</p>
                    <p className="text-xs text-[#2f3437]/50 leading-relaxed">Paste in notes, docs, or bullet points — the AI will structure it and fill in the gaps</p>
                  </div>
                </div>
              </button>
            </div>

            <RecentConversations
              toolType="avatar_architect"
              refreshTrigger={refreshCounter}
              forceOpen={refreshCounter}
              onLoad={handleLoadConversation}
              label="Recent Sessions"
              emptyLabel="No saved sessions yet — start a new avatar session above."
            />
          </div>
        </div>

        {/* ─── Step 2: Theme Builder ──────────────────────────────────────────── */}
        {!avatarLoading && savedAvatar?.avatarName && Array.isArray(savedAvatar.contentThemes) && savedAvatar.contentThemes.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center gap-3 mb-4">
              <span className="w-7 h-7 rounded-full bg-[#6ba3c7] text-white text-sm font-bold flex items-center justify-center shrink-0">2</span>
              <div>
                <h2 className="text-lg font-bold text-[#2f3437]">Theme Builder</h2>
                <p className="text-xs text-[#2f3437]/55">Select a theme below to build out its depth with the AI coach — stresses, angles, tone, and Content Engine prompts.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {savedAvatar.contentThemes.map((t, i) => {
                const name = getThemeName(t);
                const emoji = getThemeEmoji(t);
                const tObj = typeof t === "string" ? null : t;
                const hasPrompt = !!tObj?.content_engine_prompt;
                const slotState = tObj?.state ?? (hasPrompt ? "built" : "empty");
                const coreStress = tObj?.coreStress ?? null;
                const whyThisFits = tObj?.whyThisFits ?? null;
                const isActive = themeBuilderOpen === i;
                const promptPreview = hasPrompt
                  ? (tObj!.content_engine_prompt as string).replace(/\*\*/g, "").slice(0, 140).trim()
                  : null;

                if (slotState === "built") {
                  return (
                    <div
                      key={i}
                      className={`text-left border-2 rounded-xl transition-all duration-200 overflow-hidden ${
                        isActive ? "border-[#6ba3c7] shadow-sm" : "border-green-200 bg-white hover:border-green-300 hover:shadow-sm"
                      }`}
                    >
                      {/* Built header */}
                      <div className="px-4 pt-4 pb-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                          {emoji && <span className="text-base">{emoji}</span>}
                          <span className="flex-1 text-sm font-semibold text-[#2f3437] leading-tight">{name}</span>
                          <span className="text-xs text-green-600 font-semibold bg-green-50 border border-green-200 px-2 py-0.5 rounded-full shrink-0">Built ✓</span>
                        </div>
                        {coreStress && (
                          <p className="text-xs text-[#2f3437]/55 italic leading-relaxed line-clamp-2 mb-2">"{coreStress}"</p>
                        )}
                        {promptPreview && (
                          <p className="text-xs text-[#2f3437]/40 leading-relaxed line-clamp-2">{promptPreview}…</p>
                        )}
                      </div>
                      {/* Built footer actions */}
                      <div className="flex items-center gap-2 px-4 pb-3 pt-1 border-t border-green-100">
                        <button
                          onClick={() => isActive ? setThemeBuilderOpen(null) : startThemeBuilder(i)}
                          className="text-xs font-semibold text-[#6ba3c7] hover:text-[#4a8ab0] transition-colors"
                        >
                          {isActive ? "Close" : "Edit / Rebuild →"}
                        </button>
                      </div>
                    </div>
                  );
                }

                // Empty or in-progress state
                return (
                  <div
                    key={i}
                    className={`text-left border-2 rounded-xl transition-all duration-200 overflow-hidden ${
                      isActive
                        ? "border-[#6ba3c7] bg-[#6ba3c7]/5 shadow-sm"
                        : slotState === "building"
                          ? "border-amber-200 bg-amber-50/30 hover:border-[#6ba3c7]/50 hover:shadow-sm"
                          : "border-dashed border-[#2f3437]/20 bg-white hover:border-[#6ba3c7]/50 hover:bg-[#6ba3c7]/3 hover:shadow-sm"
                    }`}
                  >
                    {/* Empty/building header */}
                    <div className="px-4 pt-4 pb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-6 h-6 rounded-full bg-[#2f3437]/8 text-[#2f3437]/50 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                        {emoji && <span className="text-base">{emoji}</span>}
                        <span className="flex-1 text-sm font-semibold text-[#2f3437] leading-tight">{name}</span>
                        {slotState === "building" ? (
                          <span className="text-xs text-amber-600 font-semibold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">In progress</span>
                        ) : (
                          <span className="text-xs text-[#2f3437]/35 font-medium bg-[#2f3437]/5 border border-[#2f3437]/10 px-2 py-0.5 rounded-full shrink-0">Not built yet</span>
                        )}
                      </div>
                      {coreStress && (
                        <p className="text-xs text-[#2f3437]/45 italic leading-relaxed line-clamp-2 mb-1.5">"{coreStress}"</p>
                      )}
                      {whyThisFits && (
                        <p className="text-xs text-[#2f3437]/40 leading-relaxed line-clamp-2">{whyThisFits}</p>
                      )}
                    </div>
                    {/* Prominent CTA */}
                    <div className="px-4 pb-4">
                      <button
                        onClick={() => isActive ? setThemeBuilderOpen(null) : startThemeBuilder(i)}
                        className={`w-full py-2 rounded-lg text-xs font-semibold transition-colors ${
                          isActive
                            ? "bg-[#6ba3c7]/20 text-[#6ba3c7] hover:bg-[#6ba3c7]/30"
                            : "bg-[#6ba3c7] text-white hover:bg-[#4a8ab0]"
                        }`}
                      >
                        {isActive ? "Close Builder" : slotState === "building" ? "Continue Building →" : "Build This Theme →"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Theme Builder Chat */}
            {themeBuilderOpen !== null && (
              <div className="mt-4 border border-[#6ba3c7]/30 rounded-xl overflow-hidden bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-[#6ba3c7]/5 border-b border-[#6ba3c7]/15">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-semibold text-[#6ba3c7] uppercase tracking-wider truncate">
                      Building: {getThemeName(savedAvatar.contentThemes[themeBuilderOpen])}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button onClick={() => setThemeBuilderOpen(null)} className="text-xs text-[#2f3437]/50 hover:text-[#2f3437] transition-colors">
                      Close
                    </button>
                  </div>
                </div>

                {/* Chat messages */}
                <div className="max-h-[400px] overflow-y-auto p-4 space-y-3">
                  {themeMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
                          msg.role === "user"
                            ? "bg-[#111] text-white rounded-tr-sm whitespace-pre-wrap"
                            : "bg-[#f7f6f3] border border-[#2f3437]/10 text-[#2f3437] rounded-tl-sm"
                        }`}
                      >
                        {msg.role === "assistant" ? (
                          <MarkdownMessage>{msg.content}</MarkdownMessage>
                        ) : (
                          msg.content
                        )}
                      </div>
                    </div>
                  ))}
                  {themeLoading && (
                    <div className="flex justify-start">
                      <div className="bg-[#f7f6f3] border border-[#2f3437]/10 rounded-lg rounded-tl-sm px-4 py-3">
                        <div className="flex gap-1.5">
                          <span className="w-2 h-2 bg-[#6ba3c7]/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="w-2 h-2 bg-[#6ba3c7]/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="w-2 h-2 bg-[#6ba3c7]/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={themeBottomRef} />
                </div>

                {/* Save theme banner */}
                {pendingThemeData && !themeSaved && (
                  <div className="mx-4 mb-2 flex items-center justify-between gap-3 bg-[#6ba3c7]/10 border border-[#6ba3c7]/30 rounded-lg p-3">
                    <div>
                      <p className="text-sm font-semibold text-[#2f3437]">Theme ready: <strong>{pendingThemeData.name}</strong></p>
                      <p className="text-xs text-[#2f3437]/55 mt-0.5">Save it to your avatar profile so the Content Engine can use it.</p>
                    </div>
                    <button
                      onClick={saveThemeData}
                      className="px-4 py-2 bg-[#6ba3c7] text-white text-xs font-semibold rounded-lg hover:bg-[#6ba3c7]/90 transition-colors shrink-0"
                    >
                      Save Theme
                    </button>
                  </div>
                )}
                {themeSaved && (
                  <div className="mx-4 mb-2 flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
                    <CheckIcon className="w-4 h-4 text-green-600" />
                    <p className="text-sm font-medium text-green-800">Theme saved to your avatar profile.</p>
                  </div>
                )}

                {/* Input */}
                <div className="border-t border-[#2f3437]/10 p-3 flex gap-2">
                  <textarea
                    value={themeInput}
                    onChange={(e) => setThemeInput(e.target.value)}
                    onKeyDown={handleThemeKey}
                    rows={2}
                    placeholder="Type your response…"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#2f3437] placeholder-[#2f3437]/30 focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40 resize-none"
                  />
                  <button
                    onClick={sendThemeMessage}
                    disabled={!themeInput.trim() || themeLoading}
                    className="self-end px-4 py-2 bg-[#6ba3c7] text-white text-sm font-semibold rounded-lg hover:bg-[#6ba3c7]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Send
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (screen === "import") {
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
          <h1 className="text-2xl font-bold text-[#2f3437]">🎯 Avatar Architect</h1>
          <p className="text-sm text-[#2f3437]/60 mt-1">Import your existing avatar notes</p>
        </div>

        <p className="text-sm text-[#2f3437]/70 mb-4 leading-relaxed">
          Paste your avatar notes below — this can be a full avatar document, rough notes, bullet points, or anything you&apos;ve already written about your ideal client. The more you give me, the less I&apos;ll need to ask.
        </p>

        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          rows={20}
          placeholder="Paste your avatar notes here…"
          className="w-full border border-[#2f3437]/20 rounded-lg px-4 py-3 text-sm text-[#2f3437] placeholder-[#2f3437]/30 resize-y focus:outline-none focus:border-[#6ba3c7] transition-colors bg-white leading-relaxed"
        />

        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setScreen("landing")}
            className="flex items-center gap-1.5 text-sm text-[#2f3437]/50 hover:text-[#6ba3c7] transition-colors"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back to options
          </button>
          <button
            onClick={startFromImport}
            disabled={!importText.trim()}
            className="bg-[#6ba3c7] text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#6ba3c7]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Start Building →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      <div className="flex-shrink-0 mb-1">
        <Link
          href={isTestAvatarMode ? "/admin/ai-tools" : "/member/ai-tools"}
          className="flex items-center gap-1.5 text-xs text-[#2f3437]/50 hover:text-[#6ba3c7] transition-colors"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          {isTestAvatarMode ? "Back to Admin AI Tools" : "Back to AI Tools"}
        </Link>
      </div>

      {/* Test avatar mode banner */}
      {isTestAvatarMode && (
        <div className="flex-shrink-0 mb-3 bg-amber-50 border border-amber-300 rounded-lg px-4 py-2.5 flex items-center gap-2">
          <span className="text-sm">🧪</span>
          <p className="text-xs font-semibold text-amber-800">
            Building test avatar: <span className="font-bold">{testAvatarLabel || `Slot ${testAvatarSlot}`}</span>
            <span className="font-normal text-amber-700"> (Slot {testAvatarSlot})</span>
          </p>
          <p className="text-xs text-amber-600 ml-auto">Answer as if you were this client type — all saves go to the test avatar slot, not your profile.</p>
        </div>
      )}

      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-[#2f3437]">🎯 Avatar Architect</h1>
          <p className="text-sm text-[#2f3437]/50">Chat with your AI coach</p>
        </div>
        <button
          onClick={() => { setScreen("landing"); setMessages([]); setDetectedAvatar(null); setSaved(false); setConfirmReplace(false); setImportText(""); setChatError(null); setStreamingContent(null); convIdRef.current = null; setConversationId(null); }}
          className="flex items-center gap-2 text-sm text-[#2f3437]/60 hover:text-[#2f3437] border border-[#2f3437]/20 px-3 py-1.5 rounded-lg transition-colors"
        >
          <ArrowPathIcon className="w-4 h-4" />
          New Session
        </button>
      </div>

      {/* Avatar save banner */}
      {detectedAvatar && !saved && (
        <div className="flex-shrink-0 mb-3 bg-[#6ba3c7]/10 border border-[#6ba3c7]/30 rounded-lg p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-[#2f3437] text-sm">
                ✅ Avatar ready: <strong>{detectedAvatar.avatar_name}</strong>
              </p>
              {isTestAvatarMode ? (
                <p className="text-xs text-[#2f3437]/60 mt-0.5">
                  Save as <strong>{testAvatarLabel || `Slot ${testAvatarSlot}`}</strong> in test avatar slot {testAvatarSlot}.
                </p>
              ) : (
                <p className="text-xs text-[#2f3437]/60 mt-0.5">Save it to your profile so all AI tools can use it.</p>
              )}
              {!isTestAvatarMode && confirmReplace && (
                <p className="text-xs text-amber-700 mt-1">
                  ⚠️ This will replace your current avatar ({savedAvatar?.avatarName}). Are you sure?
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={copyAvatar}
                className="flex items-center gap-1.5 text-xs text-[#2f3437]/60 hover:text-[#2f3437] border border-[#2f3437]/20 px-3 py-1.5 rounded-lg transition-colors"
              >
                {copied ? <CheckIcon className="w-3.5 h-3.5" /> : <ClipboardDocumentIcon className="w-3.5 h-3.5" />}
                {copied ? "Copied!" : "Copy text"}
              </button>
              <button
                onClick={saveAvatar}
                disabled={saving}
                className={`text-xs px-4 py-1.5 rounded-lg font-semibold transition-colors ${
                  !isTestAvatarMode && confirmReplace
                    ? "bg-amber-500 text-white hover:bg-amber-600"
                    : "bg-[#6ba3c7] text-white hover:bg-[#6ba3c7]/90"
                }`}
              >
                {saving ? "Saving..." : isTestAvatarMode ? "Save Test Avatar" : confirmReplace ? "Yes, Replace" : "Save to My Profile"}
              </button>
            </div>
          </div>
        </div>
      )}

      {saved && (
        <>
          <div className="flex-shrink-0 mb-3 bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
            <CheckIcon className="w-5 h-5 text-green-600" />
            <p className="text-sm font-medium text-green-800">
              {isTestAvatarMode
                ? `Test avatar saved as "${testAvatarLabel || `Slot ${testAvatarSlot}`}"! Returning to admin tools…`
                : `Avatar saved! All your AI tools will now use ${detectedAvatar?.avatar_name}.`}
            </p>
          </div>
          {!isTestAvatarMode && (
            <div className="flex-shrink-0 mb-3">
              <NextStepCard
                emoji="🚀"
                title="Generate Content Ideas"
                description="Your avatar is ready. Head to the Content Engine to generate video ideas organised by your content themes."
                href="/member/ai-tools/content-engine"
                buttonLabel="Open Content Engine"
              />
            </div>
          )}
        </>
      )}

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-[#111] text-white rounded-tr-sm whitespace-pre-wrap"
                  : "bg-white border border-[#2f3437]/10 text-[#2f3437] rounded-tl-sm"
              }`}
            >
              {msg.role === "assistant" ? (
                <MarkdownMessage>{msg.content}</MarkdownMessage>
              ) : (
                msg.content.replace(/^\[IMPORTED_AVATAR_DOC\]\n?/, "")
              )}
            </div>
          </div>
        ))}
        {loading && streamingContent !== null && streamingContent.length > 0 && (
          <div className="flex justify-start">
            <div className="bg-white border border-[#2f3437]/10 rounded-lg rounded-tl-sm px-4 py-3 max-w-[85%] whitespace-pre-wrap text-sm leading-relaxed text-[#2f3437]">
              {streamingContent}
              <span className="inline-block w-1.5 h-4 bg-[#6ba3c7] ml-0.5 animate-pulse align-middle" />
            </div>
          </div>
        )}
        {loading && (streamingContent === null || streamingContent.length === 0) && (
          <div className="flex justify-start">
            <div className="bg-white border border-[#2f3437]/10 rounded-lg rounded-tl-sm px-4 py-3">
              <div className="flex gap-1.5 items-center h-4">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-2 h-2 rounded-full bg-[#6ba3c7]/60 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        {chatError && (
          <div className="flex justify-start">
            <div className="bg-red-50 border border-red-200 rounded-lg rounded-tl-sm px-4 py-3 max-w-[80%]">
              <p className="text-sm text-red-700 leading-snug">{chatError}</p>
              <button
                onClick={retryLastMessage}
                className="mt-2 text-xs font-semibold text-red-700 hover:text-red-900 underline"
              >
                Try again →
              </button>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-[#2f3437]/10 pt-4">
        <div className="flex gap-3 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Type your reply... (Enter to send, Shift+Enter for new line)"
            rows={2}
            className="flex-1 bg-white border border-[#2f3437]/20 rounded-lg px-4 py-3 text-sm text-[#2f3437] placeholder-[#2f3437]/30 resize-none focus:outline-none focus:border-[#6ba3c7] transition-colors"
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="flex-shrink-0 w-11 h-11 flex items-center justify-center bg-[#6ba3c7] text-white rounded-lg hover:bg-[#6ba3c7]/90 disabled:opacity-40 transition-colors"
          >
            <PaperAirplaneIcon className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AvatarArchitectPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-gray-400">Loading…</div>}>
      <AvatarArchitectInner />
    </Suspense>
  );
}

"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckIcon, LinkIcon } from "@heroicons/react/24/outline";
import LinkTrackingPage from "@/app/member/link-tracking/page";
import MarkdownTextarea from "@/components/MarkdownTextarea";

interface AvatarData {
  avatarProfile?: Record<string, unknown> | null;
  avatarName?: string | null;
  avatarSummary?: string | null;
  contentThemes?: string[] | null;
  updatedAt?: string | null;
}

interface ProfileData {
  id: string;
  creatorCredentials: string | null;
}

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let last = 0;
  let match;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[2] !== undefined) {
      parts.push(<strong key={key++} className="font-semibold text-[var(--abv-text)] dark:text-[#e2e8f0]">{match[2]}</strong>);
    } else if (match[3] !== undefined) {
      parts.push(<em key={key++}>{match[3]}</em>);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function MarkdownPreview({ text }: { text: string }) {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let listItems: string[] = [];
  let key = 0;

  function flushList() {
    if (listItems.length === 0) return;
    nodes.push(
      <ul key={key++} className="list-disc list-inside space-y-1 my-2 text-sm text-[var(--abv-text)]/80 dark:text-[#a0aec0]">
        {listItems.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>
    );
    listItems = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^####\s+/.test(line)) {
      flushList();
      nodes.push(<h4 key={key++} className="text-xs font-bold uppercase tracking-widest text-[var(--abv-text)]/40 dark:text-[#718096] mt-5 mb-1">{renderInline(line.replace(/^####\s+/, ""))}</h4>);
    } else if (/^###\s+/.test(line)) {
      flushList();
      nodes.push(<h3 key={key++} className="text-sm font-bold text-[var(--abv-text)] dark:text-[#e2e8f0] mt-5 mb-1 border-b border-[var(--abv-text)]/10 dark:border-white/10 pb-1">{renderInline(line.replace(/^###\s+/, ""))}</h3>);
    } else if (/^##\s+/.test(line)) {
      flushList();
      nodes.push(<h2 key={key++} className="text-base font-bold text-[var(--abv-text)] dark:text-[#e2e8f0] mt-6 mb-2 border-b-2 border-[var(--abv-azure)]/40 pb-1">{renderInline(line.replace(/^##\s+/, ""))}</h2>);
    } else if (/^#\s+/.test(line)) {
      flushList();
      nodes.push(<h1 key={key++} className="text-lg font-bold text-[var(--abv-text)] dark:text-[#e2e8f0] mt-6 mb-2">{renderInline(line.replace(/^#\s+/, ""))}</h1>);
    } else if (/^[-*]\s+/.test(line)) {
      listItems.push(line.replace(/^[-*]\s+/, ""));
    } else if (line.trim() === "") {
      flushList();
      if (nodes.length > 0) nodes.push(<div key={key++} className="h-2" />);
    } else {
      flushList();
      nodes.push(<p key={key++} className="text-sm text-[var(--abv-text)]/80 dark:text-[#a0aec0] leading-relaxed">{renderInline(line)}</p>);
    }
  }
  flushList();

  return <div className="space-y-0.5">{nodes}</div>;
}

const SETTINGS_TABS = [
  { id: "general", label: "General Settings" },
  { id: "link-tracking", label: "Link Tracking Setup" },
] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];

function MemberSettingsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeTab: SettingsTab = searchParams.get("tab") === "link-tracking" ? "link-tracking" : "general";

  function switchTab(id: SettingsTab) {
    const url = new URL(window.location.href);
    if (id === "general") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", id);
    }
    router.push(url.pathname + url.search, { scroll: false });
  }

  const [avatar, setAvatar] = useState<AvatarData | null>(null);
  const [avatarText, setAvatarText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [avatarTab, setAvatarTab] = useState<"preview" | "edit">("preview");

  const [credentials, setCredentials] = useState("");
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [savedCredentials, setSavedCredentials] = useState(false);

  const [channelUrl, setChannelUrl] = useState("");
  const [channelHandle, setChannelHandle] = useState<string | null>(null);
  const [channelName, setChannelName] = useState<string | null>(null);
  const [channelThumbnail, setChannelThumbnail] = useState<string | null>(null);
  const [channelLocked, setChannelLocked] = useState(false);
  const [savingChannel, setSavingChannel] = useState(false);
  const [savedChannel, setSavedChannel] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/member/avatar").then((r) => r.json()),
      fetch("/api/member/profile").then((r) => r.json()),
      fetch("/api/member/channel").then((r) => r.json()),
    ]).then(([avatarData, profileData, channelData]: [AvatarData, ProfileData, { youtubeChannelUrl: string | null; youtubeHandle: string | null; youtubeChannelName: string | null; youtubeChannelThumbnail?: string | null; locked?: boolean }]) => {
      setAvatar(avatarData);
      if (avatarData?.avatarProfile) {
        try {
          setAvatarText(
            typeof avatarData.avatarProfile === "string"
              ? (avatarData.avatarProfile as string)
              : JSON.stringify(avatarData.avatarProfile, null, 2)
          );
        } catch { setAvatarText(""); }
      }
      setCredentials(profileData?.creatorCredentials ?? "");
      setChannelUrl(channelData?.youtubeChannelUrl ?? "");
      setChannelHandle(channelData?.youtubeHandle ?? null);
      setChannelName(channelData?.youtubeChannelName ?? null);
      setChannelThumbnail(channelData?.youtubeChannelThumbnail ?? null);
      setChannelLocked(!!channelData?.locked);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function saveAvatar() {
    if (!avatarText.trim()) return;
    setSaving(true);
    setSaved(false);
    let parsed: unknown = avatarText;
    try { parsed = JSON.parse(avatarText); } catch { /* save as string */ }
    await fetch("/api/member/avatar", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatarProfile: parsed }),
    });
    const updated = await fetch("/api/member/avatar").then((r) => r.json());
    setAvatar(updated);
    setSaving(false);
    setSaved(true);
    setAvatarTab("preview");
    setTimeout(() => setSaved(false), 3000);
  }

  async function saveCredentials() {
    setSavingCredentials(true);
    await fetch("/api/member/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creatorCredentials: credentials || null }),
    });
    setSavingCredentials(false);
    setSavedCredentials(true);
    setTimeout(() => setSavedCredentials(false), 3000);
  }

  async function saveChannel() {
    setSavingChannel(true);
    setSavedChannel(false);
    const res = await fetch("/api/member/channel", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ youtubeChannelUrl: channelUrl || null }),
    });
    const data = await res.json();
    if (res.ok) {
      setChannelHandle(data.youtubeHandle ?? null);
      setChannelName(data.youtubeChannelName ?? null);
      setChannelThumbnail(data.youtubeChannelThumbnail ?? null);
      if (data.locked) setChannelLocked(true);
      setSavedChannel(true);
      setTimeout(() => setSavedChannel(false), 3000);
    }
    setSavingChannel(false);
  }

  const hasAvatar = !!avatar?.avatarProfile;
  const themes: unknown[] = Array.isArray(avatar?.contentThemes) ? (avatar!.contentThemes as unknown[]) : [];

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-[var(--abv-text)] dark:text-[#e2e8f0]">Settings</h1>
        <p className="text-[var(--abv-text)]/60 dark:text-[#a0aec0] mt-1">Manage your profile and AI personalisation</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-[#111]/5 dark:bg-white/5 rounded-lg p-1 w-fit overflow-x-auto scrollbar-hide">
        {SETTINGS_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => switchTab(t.id)}
            className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === t.id
                ? "bg-white dark:bg-[#1a1a1a] text-[var(--abv-text)] dark:text-white shadow-sm"
                : "text-[var(--abv-text)]/50 dark:text-white/40 hover:text-[var(--abv-text)] dark:hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Link Tracking tab */}
      {activeTab === "link-tracking" && <LinkTrackingPage />}

      {/* General Settings tab */}
      {activeTab === "general" && <>

      {/* Avatar Profile Section */}
      <div className="bg-white dark:bg-[#1a1a1a] border border-[var(--abv-text)]/10 dark:border-[#2a2a2a] rounded-lg overflow-hidden">
        <div className="px-6 py-5 border-b border-[var(--abv-text)]/10 dark:border-[#2a2a2a]">
          <h2 className="font-semibold text-[var(--abv-text)] dark:text-[#e2e8f0]">Avatar Profile</h2>
          <p className="text-sm text-[var(--abv-text)]/50 dark:text-[#718096] mt-0.5">
            Your ideal client avatar. All AI Tools pull from this automatically.
          </p>
        </div>
        <div className="p-6">
          {loading ? (
            <p className="text-sm text-[var(--abv-text)]/40 dark:text-[#718096] animate-pulse">Loading...</p>
          ) : hasAvatar ? (
            <div className="space-y-5">
              {/* Header row */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-bold text-[var(--abv-text)] dark:text-[#e2e8f0] text-lg">{avatar?.avatarName ?? "Your Avatar"}</h3>
                  {avatar?.updatedAt && (
                    <p className="text-xs text-[var(--abv-text)]/40 dark:text-[#718096] mt-0.5">Last updated {new Date(avatar.updatedAt).toLocaleDateString()}</p>
                  )}
                </div>
                <Link href="/member/ai-tools/avatar-architect" className="text-xs text-[var(--abv-azure)] border border-[var(--abv-azure)]/30 px-3 py-1.5 rounded-lg hover:bg-[var(--abv-dark)]/10 transition-colors whitespace-nowrap">
                  Rebuild Avatar
                </Link>
              </div>

              {/* Content themes */}
              {themes.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[var(--abv-text)]/40 dark:text-[#718096] uppercase tracking-wide mb-2">Content Themes</p>
                  <div className="flex flex-wrap gap-2">
                    {themes.map((t, i) => {
                      const label = typeof t === "string"
                        ? t
                        : t && typeof t === "object" && "name" in t
                          ? `${(t as any).emoji ?? ""} ${(t as any).name ?? ""}`.trim()
                          : null;
                      return label ? (
                        <span key={i} className="bg-[var(--abv-dark)]/10 text-[var(--abv-azure)] text-xs font-medium px-3 py-1 rounded-full">{label}</span>
                      ) : null;
                    })}
                  </div>
                </div>
              )}

              {/* Preview / Edit tabs */}
              <div className="border border-[var(--abv-text)]/10 dark:border-[#2a2a2a] rounded-lg overflow-hidden">
                <div className="flex border-b border-[var(--abv-text)]/10 dark:border-[#2a2a2a]">
                  <button
                    onClick={() => setAvatarTab("preview")}
                    className={`px-4 py-2.5 text-sm font-medium transition-colors ${avatarTab === "preview" ? "bg-[var(--abv-bg)] dark:bg-[#0f1419] text-[var(--abv-text)] dark:text-[#e2e8f0]" : "text-[var(--abv-text)]/50 dark:text-[#718096] hover:text-[var(--abv-text)] dark:hover:text-[#e2e8f0]"}`}
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => setAvatarTab("edit")}
                    className={`px-4 py-2.5 text-sm font-medium transition-colors ${avatarTab === "edit" ? "bg-[var(--abv-bg)] dark:bg-[#0f1419] text-[var(--abv-text)] dark:text-[#e2e8f0]" : "text-[var(--abv-text)]/50 dark:text-[#718096] hover:text-[var(--abv-text)] dark:hover:text-[#e2e8f0]"}`}
                  >
                    Edit
                  </button>
                </div>

                {avatarTab === "preview" ? (
                  <div className="p-5 max-h-[500px] overflow-y-auto bg-[var(--abv-bg)]/50 dark:bg-[#0f1419]/50">
                    {avatarText.trim() ? (
                      <MarkdownPreview text={avatarText} />
                    ) : (
                      <p className="text-sm text-[var(--abv-text)]/40 dark:text-[#718096]">No content yet.</p>
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-[var(--abv-bg)]/30 dark:bg-[#0f1419]/30">
                    <MarkdownTextarea
                      value={avatarText}
                      onChange={setAvatarText}
                      rows={16}
                      ariaLabel="Avatar Profile"
                      placeholder="Your avatar profile…"
                    />
                    <div className="flex items-center justify-between mt-3">
                      {saved && <span className="flex items-center gap-1.5 text-sm text-green-600"><CheckIcon className="w-4 h-4" /> Saved</span>}
                      <div className="ml-auto">
                        <button onClick={saveAvatar} disabled={saving || !avatarText.trim()} className="bg-[var(--abv-dark)] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-[var(--abv-dark)]/90 disabled:opacity-50 transition-colors">
                          {saving ? "Saving..." : "Save Avatar"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-lg p-4 flex items-start gap-3">
                <span className="text-xl">🎯</span>
                <div>
                  <p className="font-semibold text-amber-800 dark:text-amber-400 text-sm">No avatar profile yet</p>
                  <p className="text-amber-700 dark:text-amber-500 text-sm mt-0.5">
                    Use the{" "}
                    <Link href="/member/ai-tools/avatar-architect" className="underline font-medium">Avatar Architect tool</Link>{" "}
                    to build one through a guided coaching conversation, or paste your existing avatar document below.
                  </p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[var(--abv-text)] dark:text-[#e2e8f0] mb-2">Paste your existing avatar document</label>
                <MarkdownTextarea
                  value={avatarText}
                  onChange={setAvatarText}
                  rows={10}
                  placeholder="Paste your avatar document here..."
                  ariaLabel="Avatar Document"
                />
                <div className="flex items-center justify-between mt-3">
                  {saved && <span className="flex items-center gap-1.5 text-sm text-green-600"><CheckIcon className="w-4 h-4" /> Saved</span>}
                  <div className="ml-auto">
                    <button onClick={saveAvatar} disabled={saving || !avatarText.trim()} className="bg-[var(--abv-dark)] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-[var(--abv-dark)]/90 disabled:opacity-50 transition-colors">
                      {saving ? "Saving..." : "Save Avatar"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* YouTube Channel Section */}
      <div className="bg-white dark:bg-[#1a1a1a] border border-[var(--abv-text)]/10 dark:border-[#2a2a2a] rounded-lg overflow-hidden">
        <div className="px-6 py-5 border-b border-[var(--abv-text)]/10 dark:border-[#2a2a2a]">
          <h2 className="font-semibold text-[var(--abv-text)] dark:text-[#e2e8f0]">YouTube Channel</h2>
          <p className="text-sm text-[var(--abv-text)]/50 dark:text-[#718096] mt-0.5">
            Your channel URL is used for audits, top video tracking, and AI tools.
          </p>
        </div>
        <div className="p-6">
          {loading ? (
            <p className="text-sm text-[var(--abv-text)]/40 dark:text-[#718096] animate-pulse">Loading...</p>
          ) : channelLocked ? (
            <div className="space-y-4">
              {/* Locked: read-only display */}
              <div className="flex items-center gap-3 bg-[var(--abv-bg)] dark:bg-[#0f1419] rounded-lg px-4 py-3">
                <div className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden bg-gray-200 dark:bg-[#2a2a2a]">
                  {channelThumbnail ? (
                    <img src={channelThumbnail} alt={channelName ?? "Channel"} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-red-500 flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                      </svg>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--abv-text)] dark:text-[#e2e8f0] truncate">
                    {channelName || channelHandle || channelUrl}
                  </p>
                  {channelHandle && channelName && (
                    <p className="text-xs text-[var(--abv-text)]/50 dark:text-[#718096]">{channelHandle}</p>
                  )}
                  <p className="text-xs text-[var(--abv-text)]/40 dark:text-[#718096] font-mono truncate mt-0.5">{channelUrl}</p>
                </div>
                <a
                  href={channelUrl || `https://youtube.com/${channelHandle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[var(--abv-azure)] hover:underline whitespace-nowrap"
                >
                  View →
                </a>
              </div>
              <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-lg px-4 py-3">
                <svg className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Your channel is locked. To update it, please reach out to your admin.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Not yet set: allow first-time entry */}
              <div>
                <label className="block text-sm font-semibold text-[var(--abv-text)] dark:text-[#e2e8f0] mb-2">
                  Channel URL
                </label>
                <input
                  type="url"
                  value={channelUrl}
                  onChange={(e) => setChannelUrl(e.target.value)}
                  placeholder="https://www.youtube.com/@YourHandle"
                  className="w-full border border-[var(--abv-text)]/20 dark:border-[#2a2a2a] rounded-lg px-4 py-3 text-sm text-[var(--abv-text)] dark:text-[#e2e8f0] placeholder-[var(--abv-text)]/30 dark:bg-[#1a1a1a] focus:outline-none focus:border-[var(--abv-azure)]"
                />
                <p className="text-xs text-[var(--abv-text)]/40 dark:text-[#718096] mt-1.5">
                  Paste your full channel URL, e.g. <span className="font-mono">https://www.youtube.com/@YourHandle</span>. Once saved, only your admin can change this.
                </p>
              </div>
              <div className="flex items-center justify-between">
                {savedChannel && (
                  <span className="flex items-center gap-1.5 text-sm text-green-600">
                    <CheckIcon className="w-4 h-4" /> Saved &amp; synced to GHL
                  </span>
                )}
                <div className="ml-auto">
                  <button
                    onClick={saveChannel}
                    disabled={savingChannel || !channelUrl.trim()}
                    className="bg-[var(--abv-dark)] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-[var(--abv-dark)]/90 disabled:opacity-50 transition-colors"
                  >
                    {savingChannel ? "Saving..." : "Save Channel"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Your Credentials Section */}
      <div className="bg-white dark:bg-[#1a1a1a] border border-[var(--abv-text)]/10 dark:border-[#2a2a2a] rounded-lg overflow-hidden">
        <div className="px-6 py-5 border-b border-[var(--abv-text)]/10 dark:border-[#2a2a2a]">
          <h2 className="font-semibold text-[var(--abv-text)] dark:text-[#e2e8f0]">Your Credentials</h2>
          <p className="text-sm text-[var(--abv-text)]/50 dark:text-[#718096] mt-0.5">
            Years of experience, number of clients helped, designations, brokerage, specialities. The ARC Script Builder uses this automatically.
          </p>
        </div>
        <div className="p-6">
          {loading ? (
            <p className="text-sm text-[var(--abv-text)]/40 dark:text-[#718096] animate-pulse">Loading...</p>
          ) : (
            <>
              <textarea
                value={credentials}
                onChange={(e) => setCredentials(e.target.value)}
                rows={5}
                placeholder="e.g. Licensed for 12 years, helped 300+ families buy and sell in the Denver metro. Certified Luxury Home Specialist (CLHMS). Top 1% at RE/MAX Colorado. Expert in first-time buyers and relocation."
                className="w-full border border-[var(--abv-text)]/20 dark:border-[#2a2a2a] rounded-lg px-4 py-3 text-sm text-[var(--abv-text)] dark:text-[#e2e8f0] placeholder-[var(--abv-text)]/30 dark:bg-[#1a1a1a] focus:outline-none focus:border-[var(--abv-azure)] resize-y"
              />
              <div className="flex items-center justify-between mt-3">
                {savedCredentials && <span className="flex items-center gap-1.5 text-sm text-green-600"><CheckIcon className="w-4 h-4" /> Saved</span>}
                <div className="ml-auto">
                  <button onClick={saveCredentials} disabled={savingCredentials} className="bg-[var(--abv-dark)] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-[var(--abv-dark)]/90 disabled:opacity-50 transition-colors">
                    {savingCredentials ? "Saving..." : "Save Credentials"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Setup Wizard Section */}
      <div className="bg-white dark:bg-[#1a1a1a] border border-[var(--abv-text)]/10 dark:border-[#2a2a2a] rounded-lg">
        <div className="px-6 py-5 flex items-center justify-between">
          <div>
            <p className="font-semibold text-[var(--abv-text)] dark:text-[#e2e8f0]">Setup Wizard</p>
            <p className="text-sm text-[var(--abv-text)]/50 dark:text-[#718096] mt-0.5">
              Re-run the onboarding wizard to update your goals and profile.
            </p>
          </div>
          <a
            href="/member/onboarding"
            className="text-xs text-[var(--abv-azure)] border border-[var(--abv-azure)]/30 px-3 py-1.5 rounded-lg hover:bg-[var(--abv-dark)]/10 transition-colors shrink-0"
          >
            Run Again
          </a>
        </div>
      </div>

      </>}
    </div>
  );
}

export default function MemberSettingsPage() {
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--abv-text)] dark:text-[#e2e8f0]">Settings</h1>
          <p className="text-[var(--abv-text)]/60 dark:text-[#a0aec0] mt-1">Manage your profile and AI personalisation</p>
        </div>
        <div className="h-12 bg-[#111]/5 dark:bg-white/5 rounded-lg animate-pulse w-72" />
      </div>
    }>
      <MemberSettingsPageInner />
    </Suspense>
  );
}

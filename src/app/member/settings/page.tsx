"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { CheckIcon } from "@heroicons/react/24/outline";

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
      parts.push(<strong key={key++} className="font-semibold text-[#1e2a38] dark:text-[#e2e8f0]">{match[2]}</strong>);
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
      <ul key={key++} className="list-disc list-inside space-y-1 my-2 text-sm text-[#1e2a38]/80 dark:text-[#a0aec0]">
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
      nodes.push(<h4 key={key++} className="text-xs font-bold uppercase tracking-widest text-[#1e2a38]/40 dark:text-[#718096] mt-5 mb-1">{renderInline(line.replace(/^####\s+/, ""))}</h4>);
    } else if (/^###\s+/.test(line)) {
      flushList();
      nodes.push(<h3 key={key++} className="text-sm font-bold text-[#1e2a38] dark:text-[#e2e8f0] mt-5 mb-1 border-b border-[#1e2a38]/10 dark:border-white/10 pb-1">{renderInline(line.replace(/^###\s+/, ""))}</h3>);
    } else if (/^##\s+/.test(line)) {
      flushList();
      nodes.push(<h2 key={key++} className="text-base font-bold text-[#1e2a38] dark:text-[#e2e8f0] mt-6 mb-2 border-b-2 border-[#3dc3ff]/40 pb-1">{renderInline(line.replace(/^##\s+/, ""))}</h2>);
    } else if (/^#\s+/.test(line)) {
      flushList();
      nodes.push(<h1 key={key++} className="text-lg font-bold text-[#1e2a38] dark:text-[#e2e8f0] mt-6 mb-2">{renderInline(line.replace(/^#\s+/, ""))}</h1>);
    } else if (/^[-*]\s+/.test(line)) {
      listItems.push(line.replace(/^[-*]\s+/, ""));
    } else if (line.trim() === "") {
      flushList();
      if (nodes.length > 0) nodes.push(<div key={key++} className="h-2" />);
    } else {
      flushList();
      nodes.push(<p key={key++} className="text-sm text-[#1e2a38]/80 dark:text-[#a0aec0] leading-relaxed">{renderInline(line)}</p>);
    }
  }
  flushList();

  return <div className="space-y-0.5">{nodes}</div>;
}

export default function MemberSettingsPage() {
  const [avatar, setAvatar] = useState<AvatarData | null>(null);
  const [avatarText, setAvatarText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [avatarTab, setAvatarTab] = useState<"preview" | "edit">("preview");

  const [credentials, setCredentials] = useState("");
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [savedCredentials, setSavedCredentials] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/member/avatar").then((r) => r.json()),
      fetch("/api/member/profile").then((r) => r.json()),
    ]).then(([avatarData, profileData]: [AvatarData, ProfileData]) => {
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

  const hasAvatar = !!avatar?.avatarProfile;
  const themes: string[] = Array.isArray(avatar?.contentThemes) ? (avatar!.contentThemes as string[]) : [];

  return (
    <div className="space-y-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#1e2a38] dark:text-[#e2e8f0]">Settings</h1>
        <p className="text-[#1e2a38]/60 dark:text-[#a0aec0] mt-1">Manage your profile and AI personalisation</p>
      </div>

      {/* Avatar Profile Section */}
      <div className="bg-white dark:bg-[#242b3d] border border-[#1e2a38]/10 dark:border-[#2d3748] rounded-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-[#1e2a38]/10 dark:border-[#2d3748]">
          <h2 className="font-semibold text-[#1e2a38] dark:text-[#e2e8f0]">Avatar Profile</h2>
          <p className="text-sm text-[#1e2a38]/50 dark:text-[#718096] mt-0.5">
            Your ideal client avatar. All AI Tools pull from this automatically.
          </p>
        </div>
        <div className="p-6">
          {loading ? (
            <p className="text-sm text-[#1e2a38]/40 dark:text-[#718096] animate-pulse">Loading...</p>
          ) : hasAvatar ? (
            <div className="space-y-5">
              {/* Header row */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-bold text-[#1e2a38] dark:text-[#e2e8f0] text-lg">{avatar?.avatarName ?? "Your Avatar"}</h3>
                  {avatar?.updatedAt && (
                    <p className="text-xs text-[#1e2a38]/40 dark:text-[#718096] mt-0.5">Last updated {new Date(avatar.updatedAt).toLocaleDateString()}</p>
                  )}
                </div>
                <Link href="/member/ai-tools/avatar-architect" className="text-xs text-[#3dc3ff] border border-[#3dc3ff]/30 px-3 py-1.5 rounded-lg hover:bg-[#3dc3ff]/10 transition-colors whitespace-nowrap">
                  Rebuild Avatar
                </Link>
              </div>

              {/* Content themes */}
              {themes.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[#1e2a38]/40 dark:text-[#718096] uppercase tracking-wide mb-2">Content Themes</p>
                  <div className="flex flex-wrap gap-2">
                    {themes.map((t) => (
                      <span key={t} className="bg-[#3dc3ff]/10 text-[#3dc3ff] text-xs font-medium px-3 py-1 rounded-full">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview / Edit tabs */}
              <div className="border border-[#1e2a38]/10 dark:border-[#2d3748] rounded-xl overflow-hidden">
                <div className="flex border-b border-[#1e2a38]/10 dark:border-[#2d3748]">
                  <button
                    onClick={() => setAvatarTab("preview")}
                    className={`px-4 py-2.5 text-sm font-medium transition-colors ${avatarTab === "preview" ? "bg-[#f1f1ef] dark:bg-[#1a1f2e] text-[#1e2a38] dark:text-[#e2e8f0]" : "text-[#1e2a38]/50 dark:text-[#718096] hover:text-[#1e2a38] dark:hover:text-[#e2e8f0]"}`}
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => setAvatarTab("edit")}
                    className={`px-4 py-2.5 text-sm font-medium transition-colors ${avatarTab === "edit" ? "bg-[#f1f1ef] dark:bg-[#1a1f2e] text-[#1e2a38] dark:text-[#e2e8f0]" : "text-[#1e2a38]/50 dark:text-[#718096] hover:text-[#1e2a38] dark:hover:text-[#e2e8f0]"}`}
                  >
                    Edit
                  </button>
                </div>

                {avatarTab === "preview" ? (
                  <div className="p-5 max-h-[500px] overflow-y-auto bg-[#f1f1ef]/50 dark:bg-[#1a1f2e]/50">
                    {avatarText.trim() ? (
                      <MarkdownPreview text={avatarText} />
                    ) : (
                      <p className="text-sm text-[#1e2a38]/40 dark:text-[#718096]">No content yet.</p>
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-[#f1f1ef]/30 dark:bg-[#1a1f2e]/30">
                    <textarea
                      value={avatarText}
                      onChange={(e) => setAvatarText(e.target.value)}
                      rows={16}
                      className="w-full border border-[#1e2a38]/20 dark:border-[#2d3748] rounded-xl px-4 py-3 text-sm text-[#1e2a38] dark:text-[#e2e8f0] font-mono bg-white dark:bg-[#242b3d] focus:outline-none focus:border-[#3dc3ff] resize-y"
                    />
                    <div className="flex items-center justify-between mt-3">
                      {saved && <span className="flex items-center gap-1.5 text-sm text-green-600"><CheckIcon className="w-4 h-4" /> Saved</span>}
                      <div className="ml-auto">
                        <button onClick={saveAvatar} disabled={saving || !avatarText.trim()} className="bg-[#3dc3ff] text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-[#3dc3ff]/90 disabled:opacity-50 transition-colors">
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
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-xl p-4 flex items-start gap-3">
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
                <label className="block text-sm font-semibold text-[#1e2a38] dark:text-[#e2e8f0] mb-2">Paste your existing avatar document</label>
                <textarea
                  value={avatarText}
                  onChange={(e) => setAvatarText(e.target.value)}
                  rows={10}
                  placeholder="Paste your avatar document here..."
                  className="w-full border border-[#1e2a38]/20 dark:border-[#2d3748] rounded-xl px-4 py-3 text-sm text-[#1e2a38] dark:text-[#e2e8f0] placeholder-[#1e2a38]/30 dark:bg-[#242b3d] focus:outline-none focus:border-[#3dc3ff] resize-y"
                />
                <div className="flex items-center justify-between mt-3">
                  {saved && <span className="flex items-center gap-1.5 text-sm text-green-600"><CheckIcon className="w-4 h-4" /> Saved</span>}
                  <div className="ml-auto">
                    <button onClick={saveAvatar} disabled={saving || !avatarText.trim()} className="bg-[#3dc3ff] text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-[#3dc3ff]/90 disabled:opacity-50 transition-colors">
                      {saving ? "Saving..." : "Save Avatar"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Your Credentials Section */}
      <div className="bg-white dark:bg-[#242b3d] border border-[#1e2a38]/10 dark:border-[#2d3748] rounded-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-[#1e2a38]/10 dark:border-[#2d3748]">
          <h2 className="font-semibold text-[#1e2a38] dark:text-[#e2e8f0]">Your Credentials</h2>
          <p className="text-sm text-[#1e2a38]/50 dark:text-[#718096] mt-0.5">
            Years of experience, number of clients helped, designations, brokerage, specialities. The ARC Script Builder uses this automatically.
          </p>
        </div>
        <div className="p-6">
          {loading ? (
            <p className="text-sm text-[#1e2a38]/40 dark:text-[#718096] animate-pulse">Loading...</p>
          ) : (
            <>
              <textarea
                value={credentials}
                onChange={(e) => setCredentials(e.target.value)}
                rows={5}
                placeholder="e.g. Licensed for 12 years, helped 300+ families buy and sell in the Denver metro. Certified Luxury Home Specialist (CLHMS). Top 1% at RE/MAX Colorado. Expert in first-time buyers and relocation."
                className="w-full border border-[#1e2a38]/20 dark:border-[#2d3748] rounded-xl px-4 py-3 text-sm text-[#1e2a38] dark:text-[#e2e8f0] placeholder-[#1e2a38]/30 dark:bg-[#242b3d] focus:outline-none focus:border-[#3dc3ff] resize-y"
              />
              <div className="flex items-center justify-between mt-3">
                {savedCredentials && <span className="flex items-center gap-1.5 text-sm text-green-600"><CheckIcon className="w-4 h-4" /> Saved</span>}
                <div className="ml-auto">
                  <button onClick={saveCredentials} disabled={savingCredentials} className="bg-[#3dc3ff] text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-[#3dc3ff]/90 disabled:opacity-50 transition-colors">
                    {savingCredentials ? "Saving..." : "Save Credentials"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

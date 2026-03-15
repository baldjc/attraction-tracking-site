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

export default function MemberSettingsPage() {
  const [avatar, setAvatar] = useState<AvatarData | null>(null);
  const [avatarText, setAvatarText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/member/avatar")
      .then((r) => r.json())
      .then((data) => {
        setAvatar(data);
        if (data?.avatarProfile) {
          try {
            setAvatarText(
              typeof data.avatarProfile === "string"
                ? data.avatarProfile
                : JSON.stringify(data.avatarProfile, null, 2)
            );
          } catch {
            setAvatarText("");
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
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
    setTimeout(() => setSaved(false), 3000);
  }

  const hasAvatar = !!avatar?.avatarProfile;
  const themes: string[] = Array.isArray(avatar?.contentThemes) ? (avatar!.contentThemes as string[]) : [];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#1e2a38]">Settings</h1>
        <p className="text-[#1e2a38]/60 mt-1">Manage your profile and preferences</p>
      </div>

      {/* Avatar Profile Section */}
      <div className="bg-white border border-[#1e2a38]/10 rounded-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-[#1e2a38]/10">
          <h2 className="font-semibold text-[#1e2a38]">Avatar Profile</h2>
          <p className="text-sm text-[#1e2a38]/50 mt-0.5">
            Your ideal client avatar. All AI Tools pull from this automatically.
          </p>
        </div>

        <div className="p-6">
          {loading ? (
            <p className="text-sm text-[#1e2a38]/40 animate-pulse">Loading...</p>
          ) : hasAvatar ? (
            <div className="space-y-5">
              {/* Avatar card */}
              <div className="bg-[#f1f1ef] rounded-xl p-5">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="font-bold text-[#1e2a38] text-lg">{avatar?.avatarName ?? "Your Avatar"}</h3>
                    {avatar?.updatedAt && (
                      <p className="text-xs text-[#1e2a38]/40 mt-0.5">
                        Last updated {new Date(avatar.updatedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <Link
                    href="/member/ai-tools/avatar-architect"
                    className="text-xs text-[#3dc3ff] border border-[#3dc3ff]/30 px-3 py-1.5 rounded-lg hover:bg-[#3dc3ff]/10 transition-colors"
                  >
                    Rebuild Avatar
                  </Link>
                </div>
                {avatar?.avatarSummary && (
                  <p className="text-sm text-[#1e2a38]/70 leading-relaxed">{avatar.avatarSummary}</p>
                )}
                {themes.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-[#1e2a38]/40 uppercase tracking-wide mb-2">Content Themes</p>
                    <div className="flex flex-wrap gap-2">
                      {themes.map((t) => (
                        <span key={t} className="bg-[#3dc3ff]/10 text-[#3dc3ff] text-xs font-medium px-3 py-1 rounded-full">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Edit avatar text */}
              <div>
                <label className="block text-sm font-semibold text-[#1e2a38] mb-2">
                  Edit Avatar Document
                </label>
                <textarea
                  value={avatarText}
                  onChange={(e) => setAvatarText(e.target.value)}
                  rows={10}
                  className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] font-mono focus:outline-none focus:border-[#3dc3ff] resize-y"
                />
                <div className="flex items-center justify-between mt-3">
                  {saved && (
                    <span className="flex items-center gap-1.5 text-sm text-green-600">
                      <CheckIcon className="w-4 h-4" /> Saved
                    </span>
                  )}
                  <div className="ml-auto">
                    <button
                      onClick={saveAvatar}
                      disabled={saving || !avatarText.trim()}
                      className="bg-[#3dc3ff] text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-[#3dc3ff]/90 disabled:opacity-50 transition-colors"
                    >
                      {saving ? "Saving..." : "Save Avatar"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <span className="text-xl">🎯</span>
                <div>
                  <p className="font-semibold text-amber-800 text-sm">No avatar profile yet</p>
                  <p className="text-amber-700 text-sm mt-0.5">
                    Use the{" "}
                    <Link href="/member/ai-tools/avatar-architect" className="underline font-medium">
                      Avatar Architect tool
                    </Link>{" "}
                    to build one through a guided coaching conversation, or paste your existing avatar document below.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#1e2a38] mb-2">
                  Paste your existing avatar document
                </label>
                <textarea
                  value={avatarText}
                  onChange={(e) => setAvatarText(e.target.value)}
                  rows={10}
                  placeholder="Paste your avatar document here..."
                  className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:border-[#3dc3ff] resize-y"
                />
                <div className="flex items-center justify-between mt-3">
                  {saved && (
                    <span className="flex items-center gap-1.5 text-sm text-green-600">
                      <CheckIcon className="w-4 h-4" /> Saved
                    </span>
                  )}
                  <div className="ml-auto">
                    <button
                      onClick={saveAvatar}
                      disabled={saving || !avatarText.trim()}
                      className="bg-[#3dc3ff] text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-[#3dc3ff]/90 disabled:opacity-50 transition-colors"
                    >
                      {saving ? "Saving..." : "Save Avatar"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

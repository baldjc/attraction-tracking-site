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
  thankYouPageUrl: string | null;
  creatorCredentials: string | null;
}

const SNIPPET_DOMAIN = "https://members.attractionbyvideo.com";

export default function MemberSettingsPage() {
  const [avatar, setAvatar] = useState<AvatarData | null>(null);
  const [avatarText, setAvatarText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [thankYouUrl, setThankYouUrl] = useState("");
  const [savingTracking, setSavingTracking] = useState(false);
  const [savedTracking, setSavedTracking] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const [credentials, setCredentials] = useState("");
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [savedCredentials, setSavedCredentials] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/member/avatar").then((r) => r.json()),
      fetch("/api/member/profile").then((r) => r.json()),
    ]).then(([avatarData, profileData]) => {
      setAvatar(avatarData);
      if (avatarData?.avatarProfile) {
        try {
          setAvatarText(
            typeof avatarData.avatarProfile === "string"
              ? avatarData.avatarProfile
              : JSON.stringify(avatarData.avatarProfile, null, 2)
          );
        } catch {
          setAvatarText("");
        }
      }
      setProfile(profileData);
      setThankYouUrl(profileData?.thankYouPageUrl ?? "");
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

  async function saveTracking() {
    setSavingTracking(true);
    await fetch("/api/member/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thankYouPageUrl: thankYouUrl || null }),
    });
    setSavingTracking(false);
    setSavedTracking(true);
    setTimeout(() => setSavedTracking(false), 3000);
  }

  function getSnippet(): string {
    if (!profile?.id) return "";
    const tyAttr = thankYouUrl ? ` data-ty="${thankYouUrl}"` : "";
    return `<script src="${SNIPPET_DOMAIN}/api/t.js" data-id="${profile.id}"${tyAttr} defer></script>`;
  }

  function copySnippet() {
    navigator.clipboard.writeText(getSnippet());
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2500);
  }

  const hasAvatar = !!avatar?.avatarProfile;
  const themes: string[] = Array.isArray(avatar?.contentThemes) ? (avatar!.contentThemes as string[]) : [];

  return (
    <div className="space-y-6">
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

      {/* Your Credentials Section */}
      <div className="bg-white border border-[#1e2a38]/10 rounded-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-[#1e2a38]/10">
          <h2 className="font-semibold text-[#1e2a38]">Your Credentials</h2>
          <p className="text-sm text-[#1e2a38]/50 mt-0.5">
            Years of experience, number of clients helped, designations, brokerage, specialities. The ARC Script Builder uses this automatically.
          </p>
        </div>
        <div className="p-6">
          {loading ? (
            <p className="text-sm text-[#1e2a38]/40 animate-pulse">Loading...</p>
          ) : (
            <>
              <textarea
                value={credentials}
                onChange={(e) => setCredentials(e.target.value)}
                rows={5}
                placeholder="e.g. Licensed for 12 years, helped 300+ families buy and sell in the Denver metro. Certified Luxury Home Specialist (CLHMS). Top 1% at RE/MAX Colorado. Expert in first-time buyers and relocation."
                className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:border-[#3dc3ff] resize-y"
              />
              <div className="flex items-center justify-between mt-3">
                {savedCredentials && (
                  <span className="flex items-center gap-1.5 text-sm text-green-600">
                    <CheckIcon className="w-4 h-4" /> Saved
                  </span>
                )}
                <div className="ml-auto">
                  <button
                    onClick={saveCredentials}
                    disabled={savingCredentials}
                    className="bg-[#3dc3ff] text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-[#3dc3ff]/90 disabled:opacity-50 transition-colors"
                  >
                    {savingCredentials ? "Saving..." : "Save Credentials"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Link Tracking Section */}
      <div className="bg-white border border-[#1e2a38]/10 rounded-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-[#1e2a38]/10">
          <h2 className="font-semibold text-[#1e2a38]">Link Tracking Setup</h2>
          <p className="text-sm text-[#1e2a38]/50 mt-0.5">
            Install this snippet on your website to track clicks, page views, and lead conversions.
          </p>
        </div>

        <div className="p-6 space-y-5">
          {/* Thank You Page URL */}
          <div>
            <label className="block text-sm font-semibold text-[#1e2a38] mb-1.5">
              Thank You Page Path
            </label>
            <p className="text-xs text-[#1e2a38]/40 mb-2">
              The URL path of your thank you / confirmation page (e.g. <code>/thank-you</code>). When a visitor lands on this page, we'll record a conversion.
            </p>
            <input
              type="text"
              value={thankYouUrl}
              onChange={(e) => setThankYouUrl(e.target.value)}
              placeholder="/thank-you"
              className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#3dc3ff]"
            />
            <div className="flex items-center justify-between mt-3">
              {savedTracking && (
                <span className="flex items-center gap-1.5 text-sm text-green-600">
                  <CheckIcon className="w-4 h-4" /> Saved
                </span>
              )}
              <button
                onClick={saveTracking}
                disabled={savingTracking}
                className="ml-auto bg-[#3dc3ff] text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-[#3dc3ff]/90 disabled:opacity-50 transition-colors"
              >
                {savingTracking ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          {/* Tracking Snippet */}
          {profile?.id && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-[#1e2a38]">Tracking Snippet</label>
                <button
                  onClick={copySnippet}
                  className="text-xs text-[#3dc3ff] font-medium hover:text-[#2bb0ec] transition-colors"
                >
                  {copiedSnippet ? "Copied!" : "Copy snippet"}
                </button>
              </div>
              <div className="bg-[#1e2a38] rounded-xl p-4 overflow-x-auto">
                <code className="text-xs text-[#3dc3ff] font-mono whitespace-pre-wrap break-all">
                  {getSnippet()}
                </code>
              </div>
              <p className="text-xs text-[#1e2a38]/40 mt-2">
                Paste this inside the <code className="text-[#1e2a38]/60">&lt;head&gt;</code> tag on every page of your website. The snippet is less than 2KB and loads asynchronously — it won't affect your page speed.
              </p>
            </div>
          )}

          {/* How it works */}
          <div className="bg-[#f8f9fa] rounded-xl p-4">
            <p className="text-xs font-semibold text-[#1e2a38]/60 uppercase tracking-wide mb-2">How it works</p>
            <ol className="space-y-1.5 text-xs text-[#1e2a38]/60">
              <li><span className="font-semibold text-[#1e2a38]/80">1.</span> A viewer clicks your tracked link — we record the click and attach a session.</li>
              <li><span className="font-semibold text-[#1e2a38]/80">2.</span> As they browse your site, each page view is tracked in their session.</li>
              <li><span className="font-semibold text-[#1e2a38]/80">3.</span> When they reach your thank you page, a lead conversion is recorded.</li>
              <li><span className="font-semibold text-[#1e2a38]/80">4.</span> View all conversions and browsing journeys in the Conversions tab.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

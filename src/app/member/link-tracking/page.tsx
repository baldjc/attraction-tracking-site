"use client";

import { useState, useEffect, useRef } from "react";
import { CheckIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";

interface ProfileData {
  id: string;
  thankYouPageUrl: string | null;
}

const SNIPPET_DOMAIN = "https://members.attractionbyvideo.com";

export default function LinkTrackingPage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [thankYouUrl, setThankYouUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const [testWebsiteUrl, setTestWebsiteUrl] = useState("");
  const [testState, setTestState] = useState<"idle" | "running" | "success" | "failure">("idle");
  const [testData, setTestData] = useState<{ refCode: string; testUrl: string; linkId: string; campaignId: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/member/profile")
      .then((r) => r.json())
      .then((d) => {
        setProfile(d);
        setThankYouUrl(d?.thankYouPageUrl ?? "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function getSnippet(): string {
    if (!profile?.id) return "";
    return `<script src="${SNIPPET_DOMAIN}/api/t.js" data-id="${profile.id}" defer></script>`;
  }

  function copySnippet() {
    navigator.clipboard.writeText(getSnippet());
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2500);
  }

  async function saveTracking() {
    setSaving(true);
    await fetch("/api/member/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thankYouPageUrl: thankYouUrl || null }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
  }

  async function cleanupTest(data: { linkId: string; campaignId: string }) {
    await fetch("/api/tracking/test", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  async function startTest() {
    if (!testWebsiteUrl) return;
    setTestState("running");
    setTestData(null);
    stopPolling();

    const res = await fetch("/api/tracking/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ websiteUrl: testWebsiteUrl }),
    });
    if (!res.ok) { setTestState("failure"); return; }
    const data = await res.json();
    setTestData(data);

    let found = false;
    pollRef.current = setInterval(async () => {
      const r = await fetch(`/api/tracking/verify?refCode=${data.refCode}`);
      const d = await r.json();
      if (d.found) {
        found = true;
        stopPolling();
        setTestState("success");
        cleanupTest(data);
      }
    }, 2000);

    timeoutRef.current = setTimeout(() => {
      if (!found) { stopPolling(); setTestState("failure"); }
    }, 30000);
  }

  function resetTest() {
    stopPolling();
    setTestState("idle");
    setTestData(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1e2a38]">Link Tracking</h1>
        <p className="text-[#1e2a38]/60 mt-1">Install the snippet on your website to track clicks, page views, and conversions.</p>
      </div>

      <div className="bg-white border border-[#1e2a38]/10 rounded-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-[#1e2a38]/10">
          <h2 className="font-semibold text-[#1e2a38]">Setup</h2>
          <p className="text-sm text-[#1e2a38]/50 mt-0.5">Configure your thank you page and copy the tracking snippet.</p>
        </div>

        {loading ? (
          <div className="p-6">
            <p className="text-sm text-[#1e2a38]/40 animate-pulse">Loading...</p>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Thank You Page URL */}
            <div>
              <label className="block text-sm font-semibold text-[#1e2a38] mb-1.5">Thank You Page Path</label>
              <p className="text-xs text-[#1e2a38]/40 mb-2">
                The URL path of your thank you / confirmation page (e.g. <code>/thank-you</code>). When a visitor lands on this page, we record a conversion.
              </p>
              <input
                type="text"
                value={thankYouUrl}
                onChange={(e) => setThankYouUrl(e.target.value)}
                placeholder="/thank-you"
                className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#3dc3ff]"
              />
              {!thankYouUrl && !loading && (
                <p className="mt-2 text-xs text-red-600 font-medium">Required for lead tracking. Without this, clicks will be tracked but leads won&apos;t be recorded.</p>
              )}
              <div className="flex items-center justify-between mt-3">
                {saved && (
                  <span className="flex items-center gap-1.5 text-sm text-green-600">
                    <CheckIcon className="w-4 h-4" /> Saved
                  </span>
                )}
                <button
                  onClick={saveTracking}
                  disabled={saving}
                  className="ml-auto bg-[#3dc3ff] text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-[#3dc3ff]/90 disabled:opacity-50 transition-colors"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>

            {/* Tracking Snippet */}
            {profile?.id && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-[#1e2a38]">Tracking Snippet</label>
                  <button onClick={copySnippet} className="text-xs text-[#3dc3ff] font-medium hover:text-[#2bb0ec] transition-colors">
                    {copiedSnippet ? "Copied!" : "Copy snippet"}
                  </button>
                </div>
                <div className="bg-[#1e2a38] rounded-xl p-4 overflow-x-auto">
                  <code className="text-xs text-[#3dc3ff] font-mono whitespace-pre-wrap break-all">{getSnippet()}</code>
                </div>
                {!thankYouUrl && (
                  <div className="mt-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                    <ExclamationTriangleIcon className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">
                      Save your thank you page path above so we know when to record a conversion. The snippet itself stays the same on every page.
                    </p>
                  </div>
                )}
                <p className="text-xs text-[#1e2a38]/40 mt-2">
                  Paste this inside the <code className="text-[#1e2a38]/60">&lt;head&gt;</code> tag on <strong className="text-[#1e2a38]/60">every page</strong> of your website — the same snippet works everywhere. It&apos;s less than 2KB and loads asynchronously.
                </p>
              </div>
            )}

            {/* Test Installation */}
            {profile?.id && (
              <div className="border border-[#1e2a38]/10 rounded-xl p-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-[#1e2a38]">Test Installation</p>
                  <p className="text-xs text-[#1e2a38]/50 mt-0.5">Verify your tracking snippet is correctly installed on your website.</p>
                </div>

                {testState === "idle" && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-[#1e2a38]/60 mb-1.5">Your website URL</label>
                      <input
                        type="url"
                        value={testWebsiteUrl}
                        onChange={(e) => setTestWebsiteUrl(e.target.value)}
                        placeholder="https://yoursite.com"
                        className="w-full border border-[#1e2a38]/20 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#3dc3ff]"
                      />
                      <p className="text-xs text-[#1e2a38]/40 mt-1">Enter any page on your site that has the snippet installed.</p>
                    </div>
                    <button
                      onClick={startTest}
                      disabled={!testWebsiteUrl}
                      className="bg-[#1e2a38] text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-[#1e2a38]/80 disabled:opacity-40 transition-colors"
                    >
                      Test Installation
                    </button>
                  </div>
                )}

                {testState === "running" && testData && (
                  <div className="space-y-3">
                    <div className="bg-[#f8f9fa] rounded-lg p-3">
                      <p className="text-xs font-medium text-[#1e2a38] mb-1.5">Step 1 — Open this link in a new tab:</p>
                      <a href={testData.testUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#3dc3ff] hover:underline break-all font-mono">
                        {testData.testUrl}
                      </a>
                      <p className="text-xs text-[#1e2a38]/40 mt-2">Step 2 — Wait here. We&apos;re checking for your visit every 2 seconds (up to 30s).</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[#1e2a38]/50">
                      <span className="w-3.5 h-3.5 border-2 border-[#3dc3ff] border-t-transparent rounded-full animate-spin shrink-0" />
                      Waiting for test visit…
                    </div>
                  </div>
                )}

                {testState === "success" && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-1">
                    <p className="text-sm font-semibold text-green-800">✓ Snippet is working!</p>
                    <p className="text-xs text-green-700">We detected your test visit. Your tracking is set up correctly.</p>
                    <button onClick={resetTest} className="text-xs text-green-600 underline mt-1">Test again</button>
                  </div>
                )}

                {testState === "failure" && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                    <p className="text-sm font-semibold text-red-800">✗ No visit detected</p>
                    <ul className="space-y-1 text-xs text-red-700">
                      <li>• Make sure the snippet is inside the <code className="bg-red-100 px-1 rounded">&lt;head&gt;</code> tag on the page you tested</li>
                      <li>• Check that <code className="bg-red-100 px-1 rounded">data-id</code> in the snippet matches your member ID</li>
                      <li>• Disable ad blockers or try a different browser</li>
                    </ul>
                    <button onClick={resetTest} className="text-xs text-red-600 underline font-medium">Try again</button>
                  </div>
                )}
              </div>
            )}

            {/* How it works */}
            <div className="bg-[#f8f9fa] rounded-xl p-4">
              <p className="text-xs font-semibold text-[#1e2a38]/60 uppercase tracking-wide mb-2">How it works</p>
              <ol className="space-y-1.5 text-xs text-[#1e2a38]/60">
                <li><span className="font-semibold text-[#1e2a38]/80">1.</span> A viewer clicks your tracked link — we record the click and start a session.</li>
                <li><span className="font-semibold text-[#1e2a38]/80">2.</span> As they browse your site, each page view is logged against their session.</li>
                <li><span className="font-semibold text-[#1e2a38]/80">3.</span> Our server automatically detects when they hit your thank you page path and records a conversion — no extra code needed.</li>
                <li><span className="font-semibold text-[#1e2a38]/80">4.</span> View all conversions and browsing journeys in the Conversions tab.</li>
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

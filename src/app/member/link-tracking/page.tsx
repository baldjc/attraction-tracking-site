"use client";

import { useState, useEffect, useRef } from "react";
import {
  CheckIcon,
  ExclamationTriangleIcon,
  BoltIcon,
  ChevronDownIcon,
  ClipboardDocumentCheckIcon,
  ClipboardDocumentIcon,
  QuestionMarkCircleIcon,
  DocumentDuplicateIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/Button";
import Notice from "@/components/ui/Notice";

interface ProfileData {
  id: string;
  thankYouPageUrl: string | null;
}

const SNIPPET_DOMAIN = "https://members.attractionbyvideo.com";

const PLATFORM_INSTRUCTIONS: { key: string; label: string; instructions: string }[] = [
  {
    key: "ghl",
    label: "GoHighLevel",
    instructions:
      "Open your funnel, click Settings, then find the Head Tracking Code field. Paste the snippet there. This adds it to every page in your funnel automatically.",
  },
  {
    key: "wp",
    label: "WordPress",
    instructions:
      'Install the free "Insert Headers and Footers" plugin from the WordPress plugin directory. Once active, go to Settings → Insert Headers and Footers and paste the snippet into the Header section. It will apply site-wide.',
  },
  {
    key: "squarespace",
    label: "Squarespace",
    instructions:
      "Go to Settings → Advanced → Code Injection. Paste the snippet into the Header field. Squarespace adds this to every page.",
  },
  {
    key: "wix",
    label: "Wix",
    instructions:
      "Go to Settings → Custom Code → Head section. Click + Add Custom Code, paste the snippet, set it to load on All Pages, and save.",
  },
  {
    key: "other",
    label: "Other website platform",
    instructions:
      'Paste the snippet inside the <head> tag of your site\'s global template or layout file. If you\'re not sure where that is, use the "Hand This Off" section below — copy the message and send it to your web person.',
  },
];

export default function LinkTrackingPage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [thankYouPath, setThankYouPath] = useState("");
  const [tyPathError, setTyPathError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [copiedHandoff, setCopiedHandoff] = useState(false);

  const [openAccordions, setOpenAccordions] = useState<Set<string>>(new Set());

  const [testWebsiteUrl, setTestWebsiteUrl] = useState("");
  const [testState, setTestState] = useState<"idle" | "running" | "success" | "failure">("idle");
  const [testData, setTestData] = useState<{ refCode: string; testUrl: string; linkId: string; campaignId: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function loadProfile() {
    try {
      const res = await fetch("/api/member/profile");
      const d = await res.json();
      setProfile(d);
      setThankYouPath(d?.thankYouPageUrl ?? "");
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }

  useEffect(() => { loadProfile(); }, []);

  function toggleAccordion(key: string) {
    setOpenAccordions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function getSnippet(): string {
    if (!profile?.id) return "";
    const ty = thankYouPath || "/thank-you";
    return `<script src="${SNIPPET_DOMAIN}/t.js" data-id="${profile.id}" data-ty="${ty}"></script>`;
  }

  function getHandoffMessage(): string {
    if (!profile?.id) return "";
    const ty = thankYouPath || "/thank-you";
    const isFullUrl = ty.startsWith("http://") || ty.startsWith("https://");
    const fullTyUrl = isFullUrl ? ty : `yourwebsite.com${ty}`;
    return `Hi — I need a small tracking snippet added to my website. Here's what to do:

1. Paste this script tag in the <head> section of every page on the site:

${getSnippet()}

2. Make sure there's a page at ${fullTyUrl} — this is the confirmation page visitors see after they opt in or book a call. The script uses this page to track conversions.

That's it — one snippet, site-wide. Let me know when it's done.`;
  }

  function copySnippet() {
    navigator.clipboard.writeText(getSnippet());
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2500);
  }

  function copyHandoff() {
    navigator.clipboard.writeText(getHandoffMessage());
    setCopiedHandoff(true);
    setTimeout(() => setCopiedHandoff(false), 2500);
  }

  async function savePath() {
    setTyPathError("");
    const isFullUrl = thankYouPath.startsWith("http://") || thankYouPath.startsWith("https://");
    const isPath = thankYouPath.startsWith("/");
    if (thankYouPath && !isFullUrl && !isPath) {
      setTyPathError('Enter a full URL (https://yoursite.com/thank-you) or a path (/thank-you)');
      return;
    }
    setSaving(true);
    const res = await fetch("/api/member/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thankYouPageUrl: thankYouPath || null }),
    });
    const saved = await res.json();
    setSaving(false);
    if (res.ok) {
      setThankYouPath(saved.thankYouPageUrl ?? "");
      setProfile((p: ProfileData | null) => p ? { ...p, thankYouPageUrl: saved.thankYouPageUrl ?? null } : p);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } else {
      setTyPathError("Save failed — please try again.");
    }
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

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--abv-text)] dark:text-white">Link Tracking Setup</h1>
        </div>
        <p className="text-sm text-[var(--abv-text)]/40 dark:text-white/40 animate-pulse">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--abv-text)] dark:text-white">Link Tracking Setup</h1>
        <p className="text-[var(--abv-text)]/60 dark:text-white/60 mt-1 text-sm">
          Install a small snippet on your website so you can see which videos and posts are actually bringing in leads.
        </p>
      </div>

      {/* ─── Section 1: What This Does ─── */}
      <div className="border-l-4 border-[var(--abv-azure)] bg-[var(--abv-dark)]/8 dark:bg-[var(--abv-dark)]/10 rounded-r-xl px-5 py-4">
        <p className="text-sm font-bold text-[var(--abv-text)] dark:text-white mb-2">What This Does</p>
        <p className="text-sm text-[var(--abv-text)]/80 dark:text-white/80 leading-relaxed">
          A URL shortener tells you how many people clicked. This tells you which video or which post drove each click,
          what pages they looked at on your site, and whether they became a lead. You'll know exactly which content is
          bringing in business — not just getting clicks.
        </p>
      </div>

      {/* ─── Section 2: How It Works ─── */}
      <div className="bg-white dark:bg-[#1a1a1a] border border-[var(--abv-text)]/10 dark:border-white/10 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--abv-text)]/10 dark:border-white/10 flex items-center gap-2">
          <BoltIcon className="w-4 h-4 text-[var(--abv-azure)] shrink-0" />
          <p className="text-sm font-bold text-[var(--abv-text)] dark:text-white">How It Works</p>
        </div>
        <div className="px-5 py-4">
          <ol className="space-y-3">
            {[
              "You create a tracking link for each video or post — it's your normal landing page URL with a unique code added to the end.",
              "A viewer clicks it and lands on your lead magnet or website.",
              "The landing page snippet (Step 1 below) records which video sent them and tracks the pages they visit.",
              "They opt in, book a call, or take action — and land on your thank you page.",
              "The thank you page snippet (Step 2 below) records them as a lead and ties them back to the exact video or post that brought them in.",
            ].map((text, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--abv-dark)]/15 text-[var(--abv-azure)] text-xs font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span className="text-sm text-[var(--abv-text)]/80 dark:text-white/80 leading-relaxed">{text}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-[var(--abv-text)]/60 dark:text-white/60 leading-relaxed border-t border-[var(--abv-text)]/8 dark:border-white/8 pt-4">
            Everything shows up in your Campaigns dashboard — clicks, leads, and which content is actually driving results.
          </p>
        </div>
      </div>

      {/* ─── Section 3: Setup ─── */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-[var(--abv-text)] dark:text-white">Setup</h2>

        {/* Step 1 */}
        <div className="bg-white dark:bg-[#1a1a1a] border border-[var(--abv-text)]/10 dark:border-white/10 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--abv-text)]/10 dark:border-white/10">
            <div className="flex items-center gap-2">
              <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--abv-dark)] text-white text-xs font-bold flex items-center justify-center">1</span>
              <p className="text-sm font-bold text-[var(--abv-text)] dark:text-white">Landing Page Snippet</p>
            </div>
            <p className="text-xs text-[var(--abv-text)]/60 dark:text-white/60 mt-2 ml-8 leading-relaxed">
              Paste this on every page of your website. It records when visitors arrive through your tracking links and follows their browsing journey.
            </p>
          </div>
          <div className="px-5 py-4 space-y-3">
            {profile?.id ? (
              <>
                <div className="bg-[#111] dark:bg-[#0f1520] rounded-lg p-4 overflow-x-auto">
                  <code className="text-xs text-[var(--abv-azure)] font-mono whitespace-pre-wrap break-all">{getSnippet()}</code>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={copySnippet}
                    className="flex items-center gap-1.5 text-xs font-semibold text-[var(--abv-azure)] hover:text-[#2bb0ec] transition-colors"
                  >
                    {copiedSnippet ? (
                      <><ClipboardDocumentCheckIcon className="w-4 h-4" /> Copied!</>
                    ) : (
                      <><ClipboardDocumentIcon className="w-4 h-4" /> Copy snippet</>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <div className="text-xs text-[var(--abv-text)]/40 dark:text-white/40 italic">Loading snippet…</div>
            )}

            {/* Platform accordions */}
            <div className="border border-[var(--abv-text)]/10 dark:border-white/10 rounded-lg overflow-hidden divide-y divide-[var(--abv-text)]/10 dark:divide-white/10">
              <p className="px-4 py-2.5 text-xs font-semibold text-[var(--abv-text)]/50 dark:text-white/50 uppercase tracking-wider bg-[#f8f9fa] dark:bg-[#0f1419]">
                Where to paste it
              </p>
              {PLATFORM_INSTRUCTIONS.map((p) => (
                <div key={p.key}>
                  <button
                    onClick={() => toggleAccordion(p.key)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#f8f9fa] dark:hover:bg-white/5 transition-colors"
                  >
                    <span className="text-sm font-medium text-[var(--abv-text)] dark:text-white">{p.label}</span>
                    <ChevronDownIcon
                      className={`w-4 h-4 text-[var(--abv-text)]/40 dark:text-white/40 shrink-0 transition-transform ${openAccordions.has(p.key) ? "rotate-180" : ""}`}
                    />
                  </button>
                  {openAccordions.has(p.key) && (
                    <div className="px-4 pb-4 text-sm text-[var(--abv-text)]/70 dark:text-white/70 leading-relaxed bg-[#f8f9fa]/60 dark:bg-white/3">
                      {p.instructions}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Step 2 */}
        <div className="bg-white dark:bg-[#1a1a1a] border border-[var(--abv-text)]/10 dark:border-white/10 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--abv-text)]/10 dark:border-white/10">
            <div className="flex items-center gap-2">
              <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--abv-dark)] text-white text-xs font-bold flex items-center justify-center">2</span>
              <p className="text-sm font-bold text-[var(--abv-text)] dark:text-white">Thank You Page</p>
            </div>
            <p className="text-xs text-[var(--abv-text)]/60 dark:text-white/60 mt-2 ml-8 leading-relaxed">
              This is the page someone sees after they take action — after they opt in for your guide, book a call, or sign up. That
              page's URL is how the system knows a visitor became a lead.
            </p>
          </div>
          <div className="px-5 py-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--abv-text)]/70 dark:text-white/70 mb-2">
                Your thank you page path
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={thankYouPath}
                  onChange={(e) => { setThankYouPath(e.target.value); setTyPathError(""); }}
                  placeholder="e.g. /thank-you or https://yoursite.com/thank-you"
                  className={`flex-1 border rounded-lg px-4 py-2.5 text-sm focus:outline-none transition-colors dark:bg-[#0f1419] dark:text-white ${
                    tyPathError
                      ? "border-red-400 focus:border-red-400"
                      : "border-[var(--abv-text)]/20 dark:border-white/20 focus:border-[var(--abv-azure)]"
                  }`}
                />
                <Button onClick={savePath} disabled={saving} className="shrink-0">
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
              {tyPathError && (
                <p className="mt-2 text-xs text-red-600 font-medium">{tyPathError}</p>
              )}
              {saved && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-green-600 font-medium">
                  <CheckIcon className="w-3.5 h-3.5" /> Saved — your snippet above has been updated.
                </p>
              )}
              <p className="mt-2 text-xs text-[var(--abv-text)]/50 dark:text-white/50 leading-relaxed">
                Enter a full URL (e.g. <span className="font-mono">https://yoursite.com/thank-you</span>) or just the path (e.g. <span className="font-mono text-[var(--abv-text)]/70 dark:text-white/70">/thank-you</span>). Either format works.
              </p>
              {!thankYouPath && (
                <Notice
                  variant="warning"
                  className="mt-3"
                  icon={<ExclamationTriangleIcon className="w-4 h-4" />}
                >
                  Required for lead tracking. Without this, clicks are recorded but leads won&apos;t be counted.
                  Don&apos;t have a thank you page yet? See &quot;What&apos;s a Thank You Page?&quot; below.
                </Notice>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Section 4: What's a Thank You Page? ─── */}
      <div className="bg-white dark:bg-[#1a1a1a] border border-[var(--abv-text)]/10 dark:border-white/10 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--abv-text)]/10 dark:border-white/10 flex items-center gap-2">
          <QuestionMarkCircleIcon className="w-4 h-4 text-[var(--abv-azure)] shrink-0" />
          <p className="text-sm font-bold text-[var(--abv-text)] dark:text-white">What's a Thank You Page?</p>
        </div>
        <div className="px-5 py-4 space-y-4 text-sm text-[var(--abv-text)]/80 dark:text-white/80 leading-relaxed">
          <p>
            A thank you page is the page someone lands on after they take action on your site. For example:
          </p>
          <ul className="space-y-1.5">
            {[
              `They download your neighbourhood guide → they see a page that says "Check your email!"`,
              "They book a call → they see a confirmation page.",
              `They sign up for your newsletter → they see a "You're in!" page.`,
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--abv-dark)]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p>
            That page is how the system knows a visitor turned into a lead. Without it, we can track clicks but can't tell you who converted.
          </p>
          <div className="border-t border-[var(--abv-text)]/8 dark:border-white/8 pt-4">
            <p className="text-xs font-semibold text-[var(--abv-text)]/50 dark:text-white/50 uppercase tracking-wider mb-3">
              If you don't have one yet, most platforms make it easy:
            </p>
            <ul className="space-y-2 text-sm">
              {[
                { platform: "GoHighLevel", detail: 'Add a "Thank You" step to your funnel after the opt-in form.' },
                { platform: "WordPress", detail: "Create a new page, give it the URL /thank-you, and redirect your form to it." },
                { platform: "Any form tool (Calendly, Typeform, etc.)", detail: 'Set the "redirect after submission" URL to a thank you page on your site.' },
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--abv-dark)]" />
                  <span>
                    <span className="font-semibold text-[var(--abv-text)] dark:text-white">{item.platform}</span> — {item.detail}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-sm text-[var(--abv-text)]/70 dark:text-white/70">
            The page doesn't need to be fancy — it just needs to exist at a consistent URL so the tracking can see it.
          </p>

          {/* Need help callout */}
          <div className="bg-[#f8f9fa] dark:bg-[#0f1419] border border-[var(--abv-text)]/10 dark:border-white/10 rounded-lg px-4 py-4 space-y-3">
            <p className="text-sm font-semibold text-[var(--abv-text)] dark:text-white">Need help setting this up?</p>
            <p className="text-sm text-[var(--abv-text)]/70 dark:text-white/70 leading-relaxed">
              Attraction by Video offers done-with-you services that can help you get your funnel, thank you page, and tracking set up properly.
            </p>
            <a
              href="https://attractionbyvideo.slack.com/team/U092LR97DPH"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 border border-[var(--abv-azure)] text-[var(--abv-azure)] hover:bg-[var(--abv-dark)]/8 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            >
              DM Jared in Slack
            </a>
          </div>
        </div>
      </div>

      {/* ─── Section 5: Hand This Off ─── */}
      <div className="bg-white dark:bg-[#1a1a1a] border border-[var(--abv-text)]/10 dark:border-white/10 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--abv-text)]/10 dark:border-white/10 flex items-center gap-2">
          <DocumentDuplicateIcon className="w-4 h-4 text-[var(--abv-azure)] shrink-0" />
          <p className="text-sm font-bold text-[var(--abv-text)] dark:text-white">Hand This Off</p>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-[var(--abv-text)]/70 dark:text-white/70 leading-relaxed">
            If someone else manages your website, copy the message below and send it to them.
          </p>
          {profile?.id ? (
            <>
              <div className="bg-[#f8f9fa] dark:bg-[#0f1419] border border-[var(--abv-text)]/10 dark:border-white/10 rounded-lg p-4">
                <pre className="text-xs text-[var(--abv-text)]/80 dark:text-white/80 font-mono whitespace-pre-wrap leading-relaxed break-all">
                  {getHandoffMessage()}
                </pre>
              </div>
              <div className="flex items-center justify-between">
                {!thankYouPath && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Save your thank you page path above to personalise this message.
                  </p>
                )}
                <button
                  onClick={copyHandoff}
                  className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-[var(--abv-azure)] hover:text-[#2bb0ec] transition-colors"
                >
                  {copiedHandoff ? (
                    <><ClipboardDocumentCheckIcon className="w-4 h-4" /> Copied!</>
                  ) : (
                    <><ClipboardDocumentIcon className="w-4 h-4" /> Copy message</>
                  )}
                </button>
              </div>
            </>
          ) : (
            <div className="text-xs text-[var(--abv-text)]/40 dark:text-white/40 italic">Loading…</div>
          )}
        </div>
      </div>

      {/* ─── Test Installation ─── */}
      {profile?.id && (
        <div className="bg-white dark:bg-[#1a1a1a] border border-[var(--abv-text)]/10 dark:border-white/10 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--abv-text)]/10 dark:border-white/10">
            <p className="text-sm font-bold text-[var(--abv-text)] dark:text-white">Test Your Installation</p>
            <p className="text-xs text-[var(--abv-text)]/50 dark:text-white/50 mt-0.5">
              Already installed the snippet? Verify it's working correctly.
            </p>
          </div>
          <div className="px-5 py-4 space-y-3">
            {testState === "idle" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--abv-text)]/60 dark:text-white/60 mb-1.5">Your website URL</label>
                  <input
                    type="url"
                    value={testWebsiteUrl}
                    onChange={(e) => setTestWebsiteUrl(e.target.value)}
                    placeholder="https://yoursite.com"
                    className="w-full border border-[var(--abv-text)]/20 dark:border-white/20 dark:bg-[#0f1419] dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--abv-azure)]"
                  />
                  <p className="text-xs text-[var(--abv-text)]/40 dark:text-white/40 mt-1">Enter any page on your site that has the snippet installed.</p>
                </div>
                <button
                  onClick={startTest}
                  disabled={!testWebsiteUrl}
                  className="bg-[#111] dark:bg-white/10 text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-[#111]/80 disabled:opacity-40 transition-colors"
                >
                  Test Installation
                </button>
              </div>
            )}
            {testState === "running" && testData && (
              <div className="space-y-3">
                <div className="bg-[#f8f9fa] dark:bg-[#0f1419] rounded-lg p-3">
                  <p className="text-xs font-medium text-[var(--abv-text)] dark:text-white mb-1.5">Step 1 — Open this link in a new tab:</p>
                  <a href={testData.testUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--abv-azure)] hover:underline break-all font-mono">
                    {testData.testUrl}
                  </a>
                  <p className="text-xs text-[var(--abv-text)]/40 dark:text-white/40 mt-2">Step 2 — Wait here. We're checking for your visit every 2 seconds (up to 30s).</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-[var(--abv-text)]/50 dark:text-white/50">
                  <span className="w-3.5 h-3.5 border-2 border-[var(--abv-azure)] border-t-transparent rounded-full animate-spin shrink-0" />
                  Waiting for test visit…
                </div>
              </div>
            )}
            {testState === "success" && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-600/30 rounded-lg p-3 space-y-1">
                <p className="text-sm font-semibold text-green-800 dark:text-green-400">✓ Snippet is working!</p>
                <p className="text-xs text-green-700 dark:text-green-500">We detected your test visit. Your tracking is set up correctly.</p>
                <button onClick={resetTest} className="text-xs text-green-600 dark:text-green-400 underline mt-1">Test again</button>
              </div>
            )}
            {testState === "failure" && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-600/30 rounded-lg p-3 space-y-2">
                <p className="text-sm font-semibold text-red-800 dark:text-red-400">✗ No visit detected</p>
                <ul className="space-y-1 text-xs text-red-700 dark:text-red-400">
                  <li>• Make sure the snippet is inside the <code className="bg-red-100 dark:bg-red-900/40 px-1 rounded">&lt;head&gt;</code> tag on the page you tested</li>
                  <li>• Check that <code className="bg-red-100 dark:bg-red-900/40 px-1 rounded">data-id</code> in the snippet matches your member ID</li>
                  <li>• Disable ad blockers or try a different browser</li>
                </ul>
                <button onClick={resetTest} className="text-xs text-red-600 dark:text-red-400 underline font-medium">Try again</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

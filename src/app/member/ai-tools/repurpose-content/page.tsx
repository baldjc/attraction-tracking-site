"use client";

import { useState, useEffect, useCallback } from "react";

function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inUl = false;
  let inOl = false;

  const inline = (t: string) =>
    t
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");

  const closeList = () => {
    if (inUl) { out.push("</ul>"); inUl = false; }
    if (inOl) { out.push("</ol>"); inOl = false; }
  };

  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("### ")) { closeList(); out.push(`<h3>${inline(t.slice(4))}</h3>`); }
    else if (t.startsWith("## ")) { closeList(); out.push(`<h2>${inline(t.slice(3))}</h2>`); }
    else if (t.startsWith("# ")) { closeList(); out.push(`<h1>${inline(t.slice(2))}</h1>`); }
    else if (t.startsWith("- ")) {
      if (inOl) { out.push("</ol>"); inOl = false; }
      if (!inUl) { out.push("<ul>"); inUl = true; }
      out.push(`<li>${inline(t.slice(2))}</li>`);
    } else if (/^\d+\.\s/.test(t)) {
      if (inUl) { out.push("</ul>"); inUl = false; }
      if (!inOl) { out.push("<ol>"); inOl = true; }
      out.push(`<li>${inline(t.replace(/^\d+\.\s/, ""))}</li>`);
    } else if (t === "") {
      closeList();
    } else {
      closeList();
      out.push(`<p>${inline(t)}</p>`);
    }
  }
  closeList();
  return out.join("\n");
}

async function copyRichText(markdown: string, fallbackPlain?: string): Promise<void> {
  const html = markdownToHtml(markdown);
  const plain = fallbackPlain ?? markdown;
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([plain], { type: "text/plain" }),
      }),
    ]);
  } catch {
    await navigator.clipboard.writeText(plain);
  }
}

async function copyPlainText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

interface RepurposeProfile {
  name: string;
  business: string;
  listSize: string;
  voice: string;
}

interface SavedLink {
  label: string;
  url: string;
}

interface NewsletterResult {
  subject_line: string;
  preview_text: string;
  body: string;
  ps_line: string;
  sign_off: string;
}

interface LinkedInResult {
  full_article: string;
  reading_time: string;
}

interface PastOutput {
  id: string;
  videoTitle: string;
  toolType: string;
  output: NewsletterResult | LinkedInResult;
  editedOutput: string | null;
  createdAt: string;
}

export default function RepurposeContentPage() {
  const [profile, setProfile] = useState<RepurposeProfile>({ name: "", business: "", listSize: "", voice: "" });
  const [savedLinks, setSavedLinks] = useState<SavedLink[]>([]);
  const [isSetup, setIsSetup] = useState<boolean | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [generateNewsletter, setGenerateNewsletter] = useState(true);
  const [generateLinkedIn, setGenerateLinkedIn] = useState(true);
  const [selectedLinkIndexes, setSelectedLinkIndexes] = useState<number[]>([]);
  const [oneOffLinks, setOneOffLinks] = useState<SavedLink[]>([]);
  const [showLinkManager, setShowLinkManager] = useState(false);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  function triggerCopied(key: string) {
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  function triggerSaved(key: string) {
    setSavedKey(key);
    setTimeout(() => setSavedKey(null), 4000);
  }

  const [loading, setLoading] = useState(false);
  const [newsletterResult, setNewsletterResult] = useState<NewsletterResult | null>(null);
  const [newsletterRecordId, setNewsletterRecordId] = useState<string | null>(null);
  const [linkedInResult, setLinkedInResult] = useState<LinkedInResult | null>(null);
  const [linkedInRecordId, setLinkedInRecordId] = useState<string | null>(null);
  const [newsletterError, setNewsletterError] = useState("");
  const [linkedInError, setLinkedInError] = useState("");
  const [activeTab, setActiveTab] = useState<"newsletter" | "linkedin">("newsletter");

  const [editedNewsletter, setEditedNewsletter] = useState("");
  const [editedLinkedIn, setEditedLinkedIn] = useState("");

  const [pastOutputs, setPastOutputs] = useState<PastOutput[]>([]);
  const [showPastOutputs, setShowPastOutputs] = useState(false);
  const [expandedOutputId, setExpandedOutputId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ai-tools/repurpose-profile")
      .then((r) => r.json())
      .then((data) => {
        setProfile(data.profile);
        setSavedLinks(data.savedLinks || []);
        setIsSetup(data.isSetup);
      });
  }, []);

  const loadPastOutputs = useCallback(() => {
    fetch("/api/ai-tools/repurposed-content")
      .then((r) => r.json())
      .then((data) => setPastOutputs(data.outputs || []));
  }, []);

  useEffect(() => { loadPastOutputs(); }, [loadPastOutputs]);

  async function saveProfile() {
    setSavingProfile(true);
    await fetch("/api/ai-tools/repurpose-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...profile }),
    });
    setIsSetup(true);
    setSavingProfile(false);
  }

  async function saveLinks(links: SavedLink[]) {
    setSavedLinks(links);
    await fetch("/api/ai-tools/repurpose-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ savedLinks: links }),
    });
  }

  async function saveEdit(id: string, editedOutput: string, key: string) {
    setSavingKey(key);
    await fetch("/api/ai-tools/repurposed-content", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, editedOutput }),
    });
    setSavingKey(null);
    triggerSaved(key);
  }

  async function generate() {
    if (!title.trim() || !transcript.trim()) return;
    if (!generateNewsletter && !generateLinkedIn) return;

    setLoading(true);
    setNewsletterResult(null);
    setLinkedInResult(null);
    setNewsletterError("");
    setLinkedInError("");
    setNewsletterRecordId(null);
    setLinkedInRecordId(null);

    const promises: Promise<void>[] = [];

    if (generateNewsletter) {
      promises.push(
        fetch("/api/ai-tools/repurpose-newsletter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript, title }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.result) {
              setNewsletterResult(data.result);
              setNewsletterRecordId(data.id);
              const nl = data.result;
              setEditedNewsletter(
                `Subject: ${nl.subject_line}\nPreview: ${nl.preview_text}\n\n${nl.body}\n\nP.S. ${nl.ps_line}\n\n${nl.sign_off}`
              );
              setActiveTab("newsletter");
            } else {
              setNewsletterError(data.error || "Newsletter generation failed");
            }
          })
          .catch(() => setNewsletterError("Newsletter generation failed"))
      );
    }

    if (generateLinkedIn) {
      const linksForApi = selectedLinkIndexes.map((i) => savedLinks[i]).filter(Boolean);
      promises.push(
        fetch("/api/ai-tools/repurpose-linkedin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript,
            title,
            selectedLinks: linksForApi,
            oneOffLinks: oneOffLinks.filter((l) => l.label && l.url),
          }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.result) {
              setLinkedInResult(data.result);
              setLinkedInRecordId(data.id);
              setEditedLinkedIn(data.result.full_article);
              if (!generateNewsletter) setActiveTab("linkedin");
            } else {
              setLinkedInError(data.error || "LinkedIn article generation failed");
            }
          })
          .catch(() => setLinkedInError("LinkedIn article generation failed"))
      );
    }

    await Promise.allSettled(promises);
    setLoading(false);
    loadPastOutputs();
  }

  async function retryNewsletter() {
    setNewsletterError("");
    setLoading(true);
    try {
      const res = await fetch("/api/ai-tools/repurpose-newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, title }),
      });
      const data = await res.json();
      if (data.result) {
        setNewsletterResult(data.result);
        setNewsletterRecordId(data.id);
        const nl = data.result;
        setEditedNewsletter(
          `Subject: ${nl.subject_line}\nPreview: ${nl.preview_text}\n\n${nl.body}\n\nP.S. ${nl.ps_line}\n\n${nl.sign_off}`
        );
      } else {
        setNewsletterError(data.error || "Retry failed");
      }
    } catch {
      setNewsletterError("Retry failed");
    }
    setLoading(false);
  }

  async function retryLinkedIn() {
    setLinkedInError("");
    setLoading(true);
    try {
      const linksForApi = selectedLinkIndexes.map((i) => savedLinks[i]).filter(Boolean);
      const res = await fetch("/api/ai-tools/repurpose-linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          title,
          selectedLinks: linksForApi,
          oneOffLinks: oneOffLinks.filter((l) => l.label && l.url),
        }),
      });
      const data = await res.json();
      if (data.result) {
        setLinkedInResult(data.result);
        setLinkedInRecordId(data.id);
        setEditedLinkedIn(data.result.full_article);
      } else {
        setLinkedInError(data.error || "Retry failed");
      }
    } catch {
      setLinkedInError("Retry failed");
    }
    setLoading(false);
  }

  function reset() {
    setTitle("");
    setTranscript("");
    setNewsletterResult(null);
    setLinkedInResult(null);
    setNewsletterError("");
    setLinkedInError("");
    setEditedNewsletter("");
    setEditedLinkedIn("");
    setNewsletterRecordId(null);
    setLinkedInRecordId(null);
    setSelectedLinkIndexes([]);
    setOneOffLinks([]);
  }

  const hasResults = newsletterResult || linkedInResult || newsletterError || linkedInError;
  const transcriptLength = transcript.length;
  const overLimit = transcriptLength > 50000;

  if (isSetup === null) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#1e2a38]">♻️ Repurpose Content</h1>
          <p className="text-[#1e2a38]/60 mt-1">Turn your video transcript into a newsletter and LinkedIn article</p>
        </div>
        <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-6 text-center text-[#1e2a38]/40">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#1e2a38]">♻️ Repurpose Content</h1>
        <p className="text-[#1e2a38]/60 mt-1">Turn your video transcript into a newsletter and LinkedIn article</p>
      </div>

      {!isSetup && (
        <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-6">
          <h2 className="font-semibold text-[#1e2a38] mb-4">Quick Setup</h2>
          <p className="text-sm text-[#1e2a38]/60 mb-5">We need a few details to personalise your outputs. You only need to do this once.</p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[#1e2a38] mb-1">Your Name</label>
              <input type="text" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} placeholder="e.g. Jared Chamberlain" className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:border-[#3dc3ff]" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#1e2a38] mb-1">Business Name</label>
              <input type="text" value={profile.business} onChange={(e) => setProfile({ ...profile, business: e.target.value })} placeholder="e.g. Chamberlain Real Estate Group" className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:border-[#3dc3ff]" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#1e2a38] mb-1">Email List Size <span className="font-normal text-[#1e2a38]/40">(optional)</span></label>
              <input type="text" value={profile.listSize} onChange={(e) => setProfile({ ...profile, listSize: e.target.value })} placeholder="e.g. 5,000" className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:border-[#3dc3ff]" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#1e2a38] mb-1">Voice Style</label>
              <select value={profile.voice} onChange={(e) => setProfile({ ...profile, voice: e.target.value })} className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] focus:outline-none focus:border-[#3dc3ff]">
                <option value="">Select a voice style...</option>
                <option value="direct">Direct & Data-Driven</option>
                <option value="warm">Warm & Conversational</option>
                <option value="authoritative">Authoritative & Educational</option>
              </select>
            </div>
            <button onClick={saveProfile} disabled={savingProfile || !profile.name || !profile.business || !profile.voice} className="w-full bg-[#3dc3ff] text-white py-3 rounded-xl font-semibold hover:bg-[#3dc3ff]/90 disabled:opacity-50 transition-colors">
              {savingProfile ? "Saving..." : "Save & Continue"}
            </button>
          </div>
        </div>
      )}

      {isSetup && !hasResults && (
        <div className="space-y-5">
          <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-6">
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-[#1e2a38] mb-2">Video Title</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Paste your video title here..." className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:border-[#3dc3ff] transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#1e2a38] mb-2">
                  Transcript
                  <span className={`font-normal ml-2 ${overLimit ? "text-red-500" : "text-[#1e2a38]/40"}`}>
                    {transcriptLength.toLocaleString()}/50,000
                  </span>
                </label>
                <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Paste your video transcript here..." rows={10} className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:border-[#3dc3ff] transition-colors resize-y" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#1e2a38] mb-2">Generate</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={generateNewsletter} onChange={(e) => setGenerateNewsletter(e.target.checked)} className="w-4 h-4 rounded border-[#1e2a38]/20 text-[#3dc3ff] focus:ring-[#3dc3ff]" />
                    <span className="text-sm text-[#1e2a38]">Newsletter</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={generateLinkedIn} onChange={(e) => setGenerateLinkedIn(e.target.checked)} className="w-4 h-4 rounded border-[#1e2a38]/20 text-[#3dc3ff] focus:ring-[#3dc3ff]" />
                    <span className="text-sm text-[#1e2a38]">LinkedIn Article</span>
                  </label>
                </div>
              </div>

              {generateLinkedIn && (
                <div className="border-t border-[#1e2a38]/10 pt-5">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-semibold text-[#1e2a38]">Links for Article</label>
                    <button onClick={() => setShowLinkManager(!showLinkManager)} className="text-xs text-[#3dc3ff] hover:underline">
                      {showLinkManager ? "Done" : "Manage Saved Links"}
                    </button>
                  </div>

                  {showLinkManager && (
                    <div className="bg-[#f1f1ef] rounded-xl p-4 mb-4 space-y-2">
                      {savedLinks.map((link, i) => (
                        <div key={i} className="flex gap-2">
                          <input type="text" value={link.label} onChange={(e) => { const updated = [...savedLinks]; updated[i] = { ...updated[i], label: e.target.value }; setSavedLinks(updated); }} placeholder="Label" className="flex-1 border border-[#1e2a38]/20 rounded-lg px-3 py-2 text-sm" />
                          <input type="text" value={link.url} onChange={(e) => { const updated = [...savedLinks]; updated[i] = { ...updated[i], url: e.target.value }; setSavedLinks(updated); }} placeholder="URL" className="flex-1 border border-[#1e2a38]/20 rounded-lg px-3 py-2 text-sm" />
                          <button onClick={() => setSavedLinks(savedLinks.filter((_, j) => j !== i))} className="text-red-500 text-sm px-2">Remove</button>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <button onClick={() => setSavedLinks([...savedLinks, { label: "", url: "" }])} className="text-sm text-[#3dc3ff] hover:underline">+ Add Link</button>
                        <button onClick={() => saveLinks(savedLinks.filter((l) => l.label && l.url))} className="text-sm bg-[#3dc3ff] text-white px-3 py-1 rounded-lg hover:bg-[#3dc3ff]/90">Save Links</button>
                      </div>
                    </div>
                  )}

                  {savedLinks.length > 0 && !showLinkManager && (
                    <div className="space-y-1.5 mb-3">
                      {savedLinks.map((link, i) => (
                        <label key={i} className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={selectedLinkIndexes.includes(i)} onChange={(e) => setSelectedLinkIndexes(e.target.checked ? [...selectedLinkIndexes, i] : selectedLinkIndexes.filter((idx) => idx !== i))} className="w-4 h-4 rounded border-[#1e2a38]/20 text-[#3dc3ff] focus:ring-[#3dc3ff]" />
                          <span className="text-sm text-[#1e2a38]">{link.label}</span>
                          <span className="text-xs text-[#1e2a38]/40 truncate">{link.url}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  <div className="mt-3">
                    <p className="text-xs text-[#1e2a38]/40 mb-2">Add links for this article only:</p>
                    {oneOffLinks.map((link, i) => (
                      <div key={i} className="flex gap-2 mb-2">
                        <input type="text" value={link.label} onChange={(e) => { const updated = [...oneOffLinks]; updated[i] = { ...updated[i], label: e.target.value }; setOneOffLinks(updated); }} placeholder="Label" className="flex-1 border border-[#1e2a38]/20 rounded-lg px-3 py-2 text-sm" />
                        <input type="text" value={link.url} onChange={(e) => { const updated = [...oneOffLinks]; updated[i] = { ...updated[i], url: e.target.value }; setOneOffLinks(updated); }} placeholder="URL" className="flex-1 border border-[#1e2a38]/20 rounded-lg px-3 py-2 text-sm" />
                        <button onClick={() => setOneOffLinks(oneOffLinks.filter((_, j) => j !== i))} className="text-red-500 text-sm px-2">Remove</button>
                      </div>
                    ))}
                    <button onClick={() => setOneOffLinks([...oneOffLinks, { label: "", url: "" }])} className="text-xs text-[#3dc3ff] hover:underline">+ Add one-off link</button>
                  </div>
                </div>
              )}

              <button onClick={generate} disabled={loading || !title.trim() || !transcript.trim() || overLimit || (!generateNewsletter && !generateLinkedIn)} className="w-full bg-[#3dc3ff] text-white py-3 rounded-xl font-semibold hover:bg-[#3dc3ff]/90 disabled:opacity-50 transition-colors">
                {loading ? "Generating..." : "Generate"}
              </button>
            </div>
          </div>

          {pastOutputs.length > 0 && (
            <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-6">
              <button onClick={() => setShowPastOutputs(!showPastOutputs)} className="flex items-center justify-between w-full">
                <h2 className="font-semibold text-[#1e2a38]">Past Outputs ({pastOutputs.length})</h2>
                <span className="text-[#1e2a38]/40 text-sm">{showPastOutputs ? "Hide" : "Show"}</span>
              </button>
              {showPastOutputs && (
                <div className="mt-4 space-y-2">
                  {pastOutputs.map((output) => (
                    <div key={output.id} className="border border-[#1e2a38]/10 rounded-xl">
                      <button onClick={() => setExpandedOutputId(expandedOutputId === output.id ? null : output.id)} className="w-full flex items-center justify-between px-4 py-3 text-left">
                        <div>
                          <span className="text-sm font-medium text-[#1e2a38]">{output.videoTitle}</span>
                          <span className="text-xs text-[#1e2a38]/40 ml-2">
                            {output.toolType === "newsletter" ? "Newsletter" : "LinkedIn"} — {new Date(output.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <span className="text-[#1e2a38]/30 text-xs">{expandedOutputId === output.id ? "Collapse" : "Expand"}</span>
                      </button>
                      {expandedOutputId === output.id && (
                        <div className="px-4 pb-4">
                          <pre className="bg-[#f1f1ef] rounded-lg p-4 text-sm text-[#1e2a38] whitespace-pre-wrap overflow-auto max-h-96">
                            {output.editedOutput || (output.toolType === "newsletter"
                              ? (() => { const nl = output.output as NewsletterResult; return `Subject: ${nl.subject_line}\nPreview: ${nl.preview_text}\n\n${nl.body}\n\nP.S. ${nl.ps_line}\n\n${nl.sign_off}`; })()
                              : (output.output as LinkedInResult).full_article)}
                          </pre>
                          <button
                            onClick={async () => {
                              const rawText = output.editedOutput || (output.toolType === "newsletter"
                                ? (() => { const nl = output.output as NewsletterResult; return `Subject: ${nl.subject_line}\nPreview: ${nl.preview_text}\n\n${nl.body}\n\nP.S. ${nl.ps_line}\n\n${nl.sign_off}`; })()
                                : (output.output as LinkedInResult).full_article);
                              if (output.toolType === "linkedin") {
                                await copyRichText(rawText);
                              } else {
                                await copyPlainText(rawText);
                              }
                              triggerCopied(`past-${output.id}`);
                            }}
                            className="mt-2 text-xs text-[#3dc3ff] hover:underline"
                          >
                            {copiedKey === `past-${output.id}` ? "✓ Copied!" : "Copy to clipboard"}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {hasResults && (
        <div className="space-y-5">
          <div className="bg-white border border-[#1e2a38]/10 rounded-2xl overflow-hidden">
            <div className="flex border-b border-[#1e2a38]/10">
              {generateNewsletter && (
                <button onClick={() => setActiveTab("newsletter")} className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === "newsletter" ? "text-[#3dc3ff] border-b-2 border-[#3dc3ff]" : "text-[#1e2a38]/40 hover:text-[#1e2a38]/60"}`}>
                  Newsletter
                </button>
              )}
              {generateLinkedIn && (
                <button onClick={() => setActiveTab("linkedin")} className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === "linkedin" ? "text-[#3dc3ff] border-b-2 border-[#3dc3ff]" : "text-[#1e2a38]/40 hover:text-[#1e2a38]/60"}`}>
                  LinkedIn Article {linkedInResult?.reading_time ? `(${linkedInResult.reading_time})` : ""}
                </button>
              )}
            </div>

            <div className="p-6">
              {activeTab === "newsletter" && (
                <>
                  {loading && !newsletterResult && !newsletterError && (
                    <div className="text-center py-12 text-[#1e2a38]/40">Generating newsletter...</div>
                  )}
                  {newsletterError && (
                    <div className="text-center py-12">
                      <p className="text-red-500 text-sm mb-3">{newsletterError}</p>
                      <button onClick={retryNewsletter} disabled={loading} className="text-sm text-[#3dc3ff] hover:underline">Retry Newsletter</button>
                    </div>
                  )}
                  {newsletterResult && (
                    <div className="space-y-4">
                      <textarea value={editedNewsletter} onChange={(e) => setEditedNewsletter(e.target.value)} rows={16} className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] focus:outline-none focus:border-[#3dc3ff] transition-colors resize-y font-mono" />
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <button onClick={async () => { await copyPlainText(editedNewsletter); triggerCopied("newsletter"); }} className="border border-[#1e2a38]/20 text-[#1e2a38] px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#1e2a38]/5 min-w-[80px]">
                            {copiedKey === "newsletter" ? "✓ Copied!" : "Copy"}
                          </button>
                          <button
                            onClick={() => { if (newsletterRecordId && savingKey !== "newsletter") saveEdit(newsletterRecordId, editedNewsletter, "newsletter"); }}
                            disabled={savingKey === "newsletter"}
                            className="bg-[#3dc3ff] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#3dc3ff]/90 disabled:opacity-60 min-w-[130px] flex items-center justify-center gap-2"
                          >
                            {savingKey === "newsletter" ? (
                              <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving…</>
                            ) : savedKey === "newsletter" ? "✓ Changes Saved" : "Save Changes"}
                          </button>
                        </div>
                        {savedKey === "newsletter" && (
                          <p className="text-xs text-[#1e2a38]/50">Your edits are saved — ready to copy and paste into your email platform.</p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {activeTab === "linkedin" && (
                <>
                  {loading && !linkedInResult && !linkedInError && (
                    <div className="text-center py-12 text-[#1e2a38]/40">Generating LinkedIn article...</div>
                  )}
                  {linkedInError && (
                    <div className="text-center py-12">
                      <p className="text-red-500 text-sm mb-3">{linkedInError}</p>
                      <button onClick={retryLinkedIn} disabled={loading} className="text-sm text-[#3dc3ff] hover:underline">Retry LinkedIn Article</button>
                    </div>
                  )}
                  {linkedInResult && (
                    <div className="space-y-4">
                      <textarea value={editedLinkedIn} onChange={(e) => setEditedLinkedIn(e.target.value)} rows={30} className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] focus:outline-none focus:border-[#3dc3ff] transition-colors resize-y font-mono" />
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <button onClick={async () => { await copyRichText(editedLinkedIn); triggerCopied("linkedin"); }} className="border border-[#1e2a38]/20 text-[#1e2a38] px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#1e2a38]/5 min-w-[80px]">
                            {copiedKey === "linkedin" ? "✓ Copied!" : "Copy"}
                          </button>
                          <button
                            onClick={() => { if (linkedInRecordId && savingKey !== "linkedin") saveEdit(linkedInRecordId, editedLinkedIn, "linkedin"); }}
                            disabled={savingKey === "linkedin"}
                            className="bg-[#3dc3ff] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#3dc3ff]/90 disabled:opacity-60 min-w-[130px] flex items-center justify-center gap-2"
                          >
                            {savingKey === "linkedin" ? (
                              <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving…</>
                            ) : savedKey === "linkedin" ? "✓ Changes Saved" : "Save Changes"}
                          </button>
                        </div>
                        {savedKey === "linkedin" && (
                          <p className="text-xs text-[#1e2a38]/50">Your edits are saved — hit Copy to paste directly into LinkedIn.</p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <button onClick={reset} className="w-full border border-[#1e2a38]/20 text-[#1e2a38] py-3 rounded-xl font-semibold hover:bg-[#1e2a38]/5 transition-colors">
            Generate Another
          </button>
        </div>
      )}
    </div>
  );
}

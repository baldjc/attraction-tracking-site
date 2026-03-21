"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronDownIcon, ChevronUpIcon, ClipboardDocumentIcon, CheckIcon } from "@heroicons/react/24/outline";

function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inUl = false;
  let inOl = false;
  const inline = (t: string) =>
    t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
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

async function copyRichText(markdown: string): Promise<void> {
  const html = markdownToHtml(markdown);
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([markdown], { type: "text/plain" }),
      }),
    ]);
  } catch {
    await navigator.clipboard.writeText(markdown);
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

interface CampaignInfo {
  id: string;
  name: string;
  destinationUrl: string;
  linkCount: number;
}

interface CampaignLinkInfo {
  id: string;
  name: string;
  trackedUrl: string;
  refCode: string;
  clicks: number;
  leads: number;
}

interface ActiveCampaignLink {
  campaignId: string;
  campaignName: string;
  linkId: string;
  linkName: string;
  trackedUrl: string;
  isNew: boolean;
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

interface FacebookResult {
  post_body: string;
  first_comment: string;
  hashtags: string[];
}

interface BlogResult {
  blog_title: string;
  full_article: string;
  meta_description: string;
  reading_time: string;
}

interface PostcardResult {
  front_headline: string;
  front_hook: string;
  back_body: string;
  video_url_placeholder: string;
}

type AnyResult = NewsletterResult | LinkedInResult | FacebookResult | BlogResult | PostcardResult;

interface PastOutput {
  id: string;
  videoTitle: string;
  toolType: string;
  output: AnyResult & { neighbourhood?: string };
  editedOutput: string | null;
  createdAt: string;
}

const TOOL_LABELS: Record<string, string> = {
  newsletter: "Newsletter",
  linkedin: "LinkedIn Article",
  facebook: "Facebook Post",
  blog: "Blog Post (AI-Optimized)",
  postcard: "Neighbourhood Postcard",
};

function nlFormatted(nl: NewsletterResult): string {
  return `Subject: ${nl.subject_line}\nPreview: ${nl.preview_text}\n\n${nl.body}\n\nP.S. ${nl.ps_line}\n\n${nl.sign_off}`;
}

function pastOutputText(output: PastOutput): string {
  if (output.editedOutput) return output.editedOutput;
  const o = output.output as AnyResult & { neighbourhood?: string };
  switch (output.toolType) {
    case "newsletter": return nlFormatted(o as NewsletterResult);
    case "linkedin": return (o as LinkedInResult).full_article;
    case "facebook": {
      const f = o as FacebookResult;
      return `${f.post_body}\n\n---\nFirst comment: ${f.first_comment}\n\nHashtags: ${(f.hashtags || []).map((h) => `#${h}`).join(" ")}`;
    }
    case "blog": {
      const b = o as BlogResult;
      return `${b.blog_title}\n\n${b.full_article}\n\nMeta: ${b.meta_description}`;
    }
    case "postcard": {
      const p = o as PostcardResult;
      return `FRONT\nHeadline: ${p.front_headline}\nHook: ${p.front_hook}\n\nBACK\n${p.back_body}\n\n${p.video_url_placeholder}`;
    }
    default: return JSON.stringify(o, null, 2);
  }
}

function ResultCard({
  title,
  children,
  defaultExpanded = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div className="bg-white dark:bg-[#242b3d] border border-[#1e2a38]/10 dark:border-white/10 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <span className="font-semibold text-[#1e2a38] dark:text-white text-sm">{title}</span>
        {expanded
          ? <ChevronUpIcon className="w-4 h-4 text-[#1e2a38]/40 dark:text-white/40" />
          : <ChevronDownIcon className="w-4 h-4 text-[#1e2a38]/40 dark:text-white/40" />}
      </button>
      {expanded && <div className="px-5 pb-5 border-t border-[#1e2a38]/8 dark:border-white/8 pt-4">{children}</div>}
    </div>
  );
}

function CopyButton({ text, rich, label = "Copy" }: { text: string; rich?: boolean; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    if (rich) await copyRichText(text); else await copyPlainText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1.5 border border-[#1e2a38]/20 dark:border-white/20 text-[#1e2a38] dark:text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#1e2a38]/5 dark:hover:bg-white/5 transition-colors"
    >
      {copied ? <CheckIcon className="w-3.5 h-3.5 text-green-500" /> : <ClipboardDocumentIcon className="w-3.5 h-3.5" />}
      {copied ? "Copied!" : label}
    </button>
  );
}

function SaveButton({ onSave, saving, saved }: { onSave: () => void; saving: boolean; saved: boolean }) {
  return (
    <button
      type="button"
      onClick={onSave}
      disabled={saving}
      className="flex items-center gap-1.5 bg-[#3dc3ff] text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#3dc3ff]/90 disabled:opacity-60 transition-colors min-w-[100px] justify-center"
    >
      {saving
        ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving…</>
        : saved ? <><CheckIcon className="w-3.5 h-3.5" />Saved!</>
        : "Save Changes"}
    </button>
  );
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
  const [generateFacebook, setGenerateFacebook] = useState(false);
  const [generateBlog, setGenerateBlog] = useState(false);
  const [generatePostcard, setGeneratePostcard] = useState(false);
  const [neighbourhood, setNeighbourhood] = useState("");
  const [selectedLinkIndexes, setSelectedLinkIndexes] = useState<number[]>([]);
  const [oneOffLinks, setOneOffLinks] = useState<SavedLink[]>([]);
  const [showLinkManager, setShowLinkManager] = useState(false);

  const [activeCampaignLinks, setActiveCampaignLinks] = useState<ActiveCampaignLink[]>([]);
  const [showCampaignPicker, setShowCampaignPicker] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignInfo[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignsLoaded, setCampaignsLoaded] = useState(false);
  const [pickerCampaignId, setPickerCampaignId] = useState<string>("");
  const [campaignPickerLinks, setCampaignPickerLinks] = useState<CampaignLinkInfo[]>([]);
  const [campaignPickerLinksLoading, setCampaignPickerLinksLoading] = useState(false);
  const [newLinkMode, setNewLinkMode] = useState(false);
  const [newLinkName, setNewLinkName] = useState("");
  const [creatingLink, setCreatingLink] = useState(false);

  const [loading, setLoading] = useState(false);

  const [newsletterResult, setNewsletterResult] = useState<NewsletterResult | null>(null);
  const [newsletterRecordId, setNewsletterRecordId] = useState<string | null>(null);
  const [newsletterError, setNewsletterError] = useState("");
  const [editedNewsletter, setEditedNewsletter] = useState("");
  const [savingNewsletter, setSavingNewsletter] = useState(false);
  const [savedNewsletter, setSavedNewsletter] = useState(false);

  const [linkedInResult, setLinkedInResult] = useState<LinkedInResult | null>(null);
  const [linkedInRecordId, setLinkedInRecordId] = useState<string | null>(null);
  const [linkedInError, setLinkedInError] = useState("");
  const [editedLinkedIn, setEditedLinkedIn] = useState("");
  const [savingLinkedIn, setSavingLinkedIn] = useState(false);
  const [savedLinkedIn, setSavedLinkedIn] = useState(false);

  const [facebookResult, setFacebookResult] = useState<FacebookResult | null>(null);
  const [facebookRecordId, setFacebookRecordId] = useState<string | null>(null);
  const [facebookError, setFacebookError] = useState("");
  const [editedFacebookBody, setEditedFacebookBody] = useState("");
  const [editedFacebookComment, setEditedFacebookComment] = useState("");
  const [savingFacebook, setSavingFacebook] = useState(false);
  const [savedFacebook, setSavedFacebook] = useState(false);

  const [blogResult, setBlogResult] = useState<BlogResult | null>(null);
  const [blogRecordId, setBlogRecordId] = useState<string | null>(null);
  const [blogError, setBlogError] = useState("");
  const [editedBlogTitle, setEditedBlogTitle] = useState("");
  const [editedBlogArticle, setEditedBlogArticle] = useState("");
  const [editedBlogMeta, setEditedBlogMeta] = useState("");
  const [savingBlog, setSavingBlog] = useState(false);
  const [savedBlog, setSavedBlog] = useState(false);

  const [postcardResult, setPostcardResult] = useState<PostcardResult | null>(null);
  const [postcardRecordId, setPostcardRecordId] = useState<string | null>(null);
  const [postcardError, setPostcardError] = useState("");
  const [editedPostcardFrontHeadline, setEditedPostcardFrontHeadline] = useState("");
  const [editedPostcardFrontHook, setEditedPostcardFrontHook] = useState("");
  const [editedPostcardBack, setEditedPostcardBack] = useState("");
  const [savingPostcard, setSavingPostcard] = useState(false);
  const [savedPostcard, setSavedPostcard] = useState(false);

  const [pastOutputs, setPastOutputs] = useState<PastOutput[]>([]);
  const [showPastOutputs, setShowPastOutputs] = useState(false);
  const [expandedOutputId, setExpandedOutputId] = useState<string | null>(null);
  const [copiedPastId, setCopiedPastId] = useState<string | null>(null);

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

  async function openCampaignPicker() {
    setShowCampaignPicker(true);
    setNewLinkMode(false);
    setNewLinkName("");
    setPickerCampaignId("");
    setCampaignPickerLinks([]);
    if (!campaignsLoaded) {
      setCampaignsLoading(true);
      const res = await fetch("/api/campaigns");
      if (res.ok) setCampaigns(await res.json());
      setCampaignsLoaded(true);
      setCampaignsLoading(false);
    }
  }

  async function handlePickerCampaignChange(campaignId: string) {
    setPickerCampaignId(campaignId);
    setNewLinkMode(false);
    setNewLinkName(title ? `${title} — LinkedIn Article` : "");
    setCampaignPickerLinks([]);
    if (!campaignId) return;
    setCampaignPickerLinksLoading(true);
    const res = await fetch(`/api/campaigns/${campaignId}/links`);
    if (res.ok) setCampaignPickerLinks(await res.json());
    setCampaignPickerLinksLoading(false);
  }

  function addExistingCampaignLink(link: CampaignLinkInfo) {
    const campaign = campaigns.find((c) => c.id === pickerCampaignId);
    if (activeCampaignLinks.some((l) => l.linkId === link.id)) return;
    setActiveCampaignLinks((prev) => [
      ...prev,
      {
        campaignId: pickerCampaignId,
        campaignName: campaign?.name ?? "",
        linkId: link.id,
        linkName: link.name,
        trackedUrl: link.trackedUrl,
        isNew: false,
      },
    ]);
    setShowCampaignPicker(false);
    setPickerCampaignId("");
    setCampaignPickerLinks([]);
  }

  async function createCampaignLink() {
    if (!pickerCampaignId || !newLinkName.trim()) return;
    setCreatingLink(true);
    const res = await fetch(`/api/campaigns/${pickerCampaignId}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newLinkName.trim() }),
    });
    if (res.ok) {
      const link = await res.json();
      const campaign = campaigns.find((c) => c.id === pickerCampaignId);
      setActiveCampaignLinks((prev) => [
        ...prev,
        {
          campaignId: pickerCampaignId,
          campaignName: campaign?.name ?? "",
          linkId: link.id,
          linkName: link.name,
          trackedUrl: link.trackedUrl,
          isNew: true,
        },
      ]);
      setShowCampaignPicker(false);
      setPickerCampaignId("");
      setNewLinkName("");
      setCampaignPickerLinks([]);
      setNewLinkMode(false);
    }
    setCreatingLink(false);
  }

  async function saveEdit(id: string, editedOutput: string, setSaving: (v: boolean) => void, setSaved: (v: boolean) => void) {
    setSaving(true);
    await fetch("/api/ai-tools/repurposed-content", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, editedOutput }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 4000);
  }

  const anySelected = generateNewsletter || generateLinkedIn || generateFacebook || generateBlog || generatePostcard;

  async function generate() {
    if (!title.trim() || !transcript.trim()) return;
    if (!anySelected) return;
    if (generatePostcard && !neighbourhood.trim()) return;

    setLoading(true);
    setNewsletterResult(null); setNewsletterError(""); setNewsletterRecordId(null);
    setLinkedInResult(null); setLinkedInError(""); setLinkedInRecordId(null);
    setFacebookResult(null); setFacebookError(""); setFacebookRecordId(null);
    setBlogResult(null); setBlogError(""); setBlogRecordId(null);
    setPostcardResult(null); setPostcardError(""); setPostcardRecordId(null);
    setSavedNewsletter(false); setSavedLinkedIn(false); setSavedFacebook(false); setSavedBlog(false); setSavedPostcard(false);

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
              const nl = data.result as NewsletterResult;
              setEditedNewsletter(nlFormatted(nl));
            } else {
              setNewsletterError(data.error || "Newsletter generation failed");
            }
          })
          .catch(() => setNewsletterError("Newsletter generation failed"))
      );
    }

    if (generateLinkedIn) {
      const linksForApi = selectedLinkIndexes.map((i) => savedLinks[i]).filter(Boolean);
      const campaignLinksForApi = activeCampaignLinks.map((l) => ({ label: l.linkName, url: l.trackedUrl }));
      promises.push(
        fetch("/api/ai-tools/repurpose-linkedin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript,
            title,
            selectedLinks: linksForApi,
            oneOffLinks: [...oneOffLinks.filter((l) => l.label && l.url), ...campaignLinksForApi],
          }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.result) {
              setLinkedInResult(data.result);
              setLinkedInRecordId(data.id);
              setEditedLinkedIn(data.result.full_article);
            } else {
              setLinkedInError(data.error || "LinkedIn article generation failed");
            }
          })
          .catch(() => setLinkedInError("LinkedIn article generation failed"))
      );
    }

    if (generateFacebook) {
      promises.push(
        fetch("/api/ai-tools/repurpose-facebook", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript, title }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.result) {
              setFacebookResult(data.result);
              setFacebookRecordId(data.id);
              setEditedFacebookBody(data.result.post_body);
              setEditedFacebookComment(data.result.first_comment);
            } else {
              setFacebookError(data.error || "Facebook post generation failed");
            }
          })
          .catch(() => setFacebookError("Facebook post generation failed"))
      );
    }

    if (generateBlog) {
      promises.push(
        fetch("/api/ai-tools/repurpose-blog", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript, title }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.result) {
              setBlogResult(data.result);
              setBlogRecordId(data.id);
              setEditedBlogTitle(data.result.blog_title);
              setEditedBlogArticle(data.result.full_article);
              setEditedBlogMeta(data.result.meta_description);
            } else {
              setBlogError(data.error || "Blog post generation failed");
            }
          })
          .catch(() => setBlogError("Blog post generation failed"))
      );
    }

    if (generatePostcard) {
      promises.push(
        fetch("/api/ai-tools/repurpose-postcard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript, title, neighbourhood: neighbourhood.trim() }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.result) {
              setPostcardResult(data.result);
              setPostcardRecordId(data.id);
              setEditedPostcardFrontHeadline(data.result.front_headline);
              setEditedPostcardFrontHook(data.result.front_hook);
              setEditedPostcardBack(data.result.back_body);
            } else {
              setPostcardError(data.error || "Postcard generation failed");
            }
          })
          .catch(() => setPostcardError("Postcard generation failed"))
      );
    }

    await Promise.allSettled(promises);
    setLoading(false);
    loadPastOutputs();
  }

  function reset() {
    setTitle(""); setTranscript("");
    setNewsletterResult(null); setLinkedInResult(null); setFacebookResult(null); setBlogResult(null); setPostcardResult(null);
    setNewsletterError(""); setLinkedInError(""); setFacebookError(""); setBlogError(""); setPostcardError("");
    setEditedNewsletter(""); setEditedLinkedIn(""); setEditedFacebookBody(""); setEditedFacebookComment("");
    setEditedBlogTitle(""); setEditedBlogArticle(""); setEditedBlogMeta("");
    setEditedPostcardFrontHeadline(""); setEditedPostcardFrontHook(""); setEditedPostcardBack("");
    setNewsletterRecordId(null); setLinkedInRecordId(null); setFacebookRecordId(null); setBlogRecordId(null); setPostcardRecordId(null);
    setSavedNewsletter(false); setSavedLinkedIn(false); setSavedFacebook(false); setSavedBlog(false); setSavedPostcard(false);
    setSelectedLinkIndexes([]); setOneOffLinks([]); setActiveCampaignLinks([]);
    setShowCampaignPicker(false); setPickerCampaignId(""); setCampaignPickerLinks([]);
  }

  const hasResults = newsletterResult || linkedInResult || facebookResult || blogResult || postcardResult
    || newsletterError || linkedInError || facebookError || blogError || postcardError;

  const transcriptLength = transcript.length;
  const overLimit = transcriptLength > 50000;

  if (isSetup === null) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#1e2a38] dark:text-white">♻️ Repurpose Content</h1>
          <p className="text-[#1e2a38]/60 dark:text-white/60 mt-1">Turn your video transcript into multiple content formats</p>
        </div>
        <div className="bg-white dark:bg-[#242b3d] border border-[#1e2a38]/10 dark:border-white/10 rounded-2xl p-6 text-center text-[#1e2a38]/40 dark:text-white/40">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#1e2a38] dark:text-white">♻️ Repurpose Content</h1>
        <p className="text-[#1e2a38]/60 dark:text-white/60 mt-1">Turn your video transcript into a newsletter, LinkedIn article, Facebook post, blog post, or neighbourhood postcard</p>
      </div>

      {!isSetup && (
        <div className="bg-white dark:bg-[#242b3d] border border-[#1e2a38]/10 dark:border-white/10 rounded-2xl p-6">
          <h2 className="font-semibold text-[#1e2a38] dark:text-white mb-4">Quick Setup</h2>
          <p className="text-sm text-[#1e2a38]/60 dark:text-white/60 mb-5">We need a few details to personalise your outputs. You only need to do this once.</p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[#1e2a38] dark:text-white mb-1">Your Name</label>
              <input type="text" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} placeholder="e.g. Jared Chamberlain" className="w-full border border-[#1e2a38]/20 dark:border-white/20 bg-white dark:bg-[#1a1f2e] rounded-xl px-4 py-3 text-sm text-[#1e2a38] dark:text-white placeholder-[#1e2a38]/30 dark:placeholder-white/30 focus:outline-none focus:border-[#3dc3ff]" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#1e2a38] dark:text-white mb-1">Business Name</label>
              <input type="text" value={profile.business} onChange={(e) => setProfile({ ...profile, business: e.target.value })} placeholder="e.g. Chamberlain Real Estate Group" className="w-full border border-[#1e2a38]/20 dark:border-white/20 bg-white dark:bg-[#1a1f2e] rounded-xl px-4 py-3 text-sm text-[#1e2a38] dark:text-white placeholder-[#1e2a38]/30 dark:placeholder-white/30 focus:outline-none focus:border-[#3dc3ff]" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#1e2a38] dark:text-white mb-1">Email List Size <span className="font-normal text-[#1e2a38]/40 dark:text-white/40">(optional)</span></label>
              <input type="text" value={profile.listSize} onChange={(e) => setProfile({ ...profile, listSize: e.target.value })} placeholder="e.g. 5,000" className="w-full border border-[#1e2a38]/20 dark:border-white/20 bg-white dark:bg-[#1a1f2e] rounded-xl px-4 py-3 text-sm text-[#1e2a38] dark:text-white placeholder-[#1e2a38]/30 dark:placeholder-white/30 focus:outline-none focus:border-[#3dc3ff]" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#1e2a38] dark:text-white mb-1">Voice Style</label>
              <select value={profile.voice} onChange={(e) => setProfile({ ...profile, voice: e.target.value })} className="w-full border border-[#1e2a38]/20 dark:border-white/20 bg-white dark:bg-[#1a1f2e] rounded-xl px-4 py-3 text-sm text-[#1e2a38] dark:text-white focus:outline-none focus:border-[#3dc3ff]">
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
          <div className="bg-white dark:bg-[#242b3d] border border-[#1e2a38]/10 dark:border-white/10 rounded-2xl p-6">
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-[#1e2a38] dark:text-white mb-2">Video Title</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Paste your video title here..." className="w-full border border-[#1e2a38]/20 dark:border-white/20 bg-white dark:bg-[#1a1f2e] rounded-xl px-4 py-3 text-sm text-[#1e2a38] dark:text-white placeholder-[#1e2a38]/30 dark:placeholder-white/30 focus:outline-none focus:border-[#3dc3ff] transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#1e2a38] dark:text-white mb-2">
                  Transcript
                  <span className={`font-normal ml-2 ${overLimit ? "text-red-500" : "text-[#1e2a38]/40 dark:text-white/40"}`}>
                    {transcriptLength.toLocaleString()}/50,000
                  </span>
                </label>
                <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Paste your video transcript here..." rows={10} className="w-full border border-[#1e2a38]/20 dark:border-white/20 bg-white dark:bg-[#1a1f2e] rounded-xl px-4 py-3 text-sm text-[#1e2a38] dark:text-white placeholder-[#1e2a38]/30 dark:placeholder-white/30 focus:outline-none focus:border-[#3dc3ff] transition-colors resize-y" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#1e2a38] dark:text-white mb-3">Generate</label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {[
                    { key: "newsletter", label: "Newsletter", value: generateNewsletter, setter: setGenerateNewsletter },
                    { key: "linkedin", label: "LinkedIn Article", value: generateLinkedIn, setter: setGenerateLinkedIn },
                    { key: "facebook", label: "Facebook Post", value: generateFacebook, setter: setGenerateFacebook },
                    { key: "blog", label: "Blog Post (AI-Optimized)", value: generateBlog, setter: setGenerateBlog },
                    { key: "postcard", label: "Neighbourhood Postcard", value: generatePostcard, setter: setGeneratePostcard },
                  ].map(({ key, label, value, setter }) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={value}
                        onChange={(e) => setter(e.target.checked)}
                        className="w-4 h-4 rounded border-[#1e2a38]/20 text-[#3dc3ff] focus:ring-[#3dc3ff] shrink-0"
                      />
                      <span className="text-sm text-[#1e2a38] dark:text-white leading-tight">{label}</span>
                    </label>
                  ))}
                </div>

                {generatePostcard && (
                  <div className="mt-3">
                    <label className="block text-xs font-semibold text-[#1e2a38] dark:text-white mb-1.5">
                      What neighbourhood are you sending this to? <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={neighbourhood}
                      onChange={(e) => setNeighbourhood(e.target.value)}
                      placeholder="e.g. Aspen Woods, Tuscany, Bridgeland"
                      className="w-full border border-[#1e2a38]/20 dark:border-white/20 bg-white dark:bg-[#1a1f2e] rounded-xl px-4 py-2.5 text-sm text-[#1e2a38] dark:text-white placeholder-[#1e2a38]/30 dark:placeholder-white/30 focus:outline-none focus:border-[#3dc3ff] transition-colors"
                    />
                  </div>
                )}
              </div>

              {generateLinkedIn && (
                <div className="border-t border-[#1e2a38]/10 dark:border-white/10 pt-5 space-y-4">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-[#1e2a38] dark:text-white">Links for Article</label>
                    <button onClick={() => setShowLinkManager(!showLinkManager)} className="text-xs text-[#3dc3ff] hover:underline">
                      {showLinkManager ? "Done" : "Manage Saved Links"}
                    </button>
                  </div>

                  {/* Saved link manager (edit mode) */}
                  {showLinkManager && (
                    <div className="bg-[#f1f1ef] dark:bg-[#1a1f2e] rounded-xl p-4 space-y-2">
                      {savedLinks.map((link, i) => (
                        <div key={i} className="flex gap-2">
                          <input type="text" value={link.label} onChange={(e) => { const u = [...savedLinks]; u[i] = { ...u[i], label: e.target.value }; setSavedLinks(u); }} placeholder="Label" className="flex-1 border border-[#1e2a38]/20 dark:border-white/20 bg-white dark:bg-[#242b3d] text-[#1e2a38] dark:text-white rounded-lg px-3 py-2 text-sm" />
                          <input type="text" value={link.url} onChange={(e) => { const u = [...savedLinks]; u[i] = { ...u[i], url: e.target.value }; setSavedLinks(u); }} placeholder="URL" className="flex-1 border border-[#1e2a38]/20 dark:border-white/20 bg-white dark:bg-[#242b3d] text-[#1e2a38] dark:text-white rounded-lg px-3 py-2 text-sm" />
                          <button onClick={() => setSavedLinks(savedLinks.filter((_, j) => j !== i))} className="text-red-500 text-sm px-2">Remove</button>
                        </div>
                      ))}
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => setSavedLinks([...savedLinks, { label: "", url: "" }])} className="text-sm text-[#3dc3ff] hover:underline">+ Add Link</button>
                        <button onClick={() => saveLinks(savedLinks.filter((l) => l.label && l.url))} className="text-sm bg-[#3dc3ff] text-white px-3 py-1 rounded-lg hover:bg-[#3dc3ff]/90">Save Links</button>
                      </div>
                    </div>
                  )}

                  {/* Saved links checklist */}
                  {savedLinks.length > 0 && !showLinkManager && (
                    <div className="space-y-1.5">
                      {savedLinks.map((link, i) => (
                        <label key={i} className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={selectedLinkIndexes.includes(i)} onChange={(e) => setSelectedLinkIndexes(e.target.checked ? [...selectedLinkIndexes, i] : selectedLinkIndexes.filter((idx) => idx !== i))} className="w-4 h-4 rounded border-[#1e2a38]/20 text-[#3dc3ff] focus:ring-[#3dc3ff]" />
                          <span className="text-sm text-[#1e2a38] dark:text-white">{link.label}</span>
                          <span className="text-xs text-[#1e2a38]/40 dark:text-white/40 truncate">{link.url}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {/* Active campaign links */}
                  {activeCampaignLinks.length > 0 && (
                    <div className="space-y-1.5">
                      {activeCampaignLinks.map((l) => (
                        <div key={l.linkId} className="flex items-center gap-2 bg-[#3dc3ff]/8 dark:bg-[#3dc3ff]/15 border border-[#3dc3ff]/20 rounded-lg px-3 py-2">
                          <span className="text-xs font-medium text-[#3dc3ff] shrink-0">Campaign</span>
                          <span className="text-xs text-[#1e2a38]/50 dark:text-white/50 shrink-0">{l.campaignName}</span>
                          <span className="text-xs font-medium text-[#1e2a38] dark:text-white flex-1 truncate">{l.linkName}</span>
                          {l.isNew && <span className="text-[10px] font-semibold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded-full shrink-0">New</span>}
                          <button onClick={() => setActiveCampaignLinks((prev) => prev.filter((x) => x.linkId !== l.linkId))} className="text-[#1e2a38]/30 dark:text-white/30 hover:text-red-500 text-sm shrink-0 ml-1">✕</button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Campaign picker inline */}
                  {showCampaignPicker ? (
                    <div className="bg-[#f1f1ef] dark:bg-[#1a1f2e] rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-[#1e2a38] dark:text-white">Add Campaign Link</p>
                        <button onClick={() => { setShowCampaignPicker(false); setPickerCampaignId(""); setCampaignPickerLinks([]); setNewLinkMode(false); }} className="text-xs text-[#1e2a38]/40 dark:text-white/40 hover:text-[#1e2a38] dark:hover:text-white">Cancel</button>
                      </div>

                      {/* Campaign dropdown */}
                      <div>
                        <label className="block text-xs text-[#1e2a38]/60 dark:text-white/60 mb-1">Select Campaign</label>
                        {campaignsLoading ? (
                          <p className="text-xs text-[#1e2a38]/40 dark:text-white/40">Loading campaigns…</p>
                        ) : campaigns.length === 0 ? (
                          <p className="text-xs text-[#1e2a38]/40 dark:text-white/40">No campaigns found. <a href="/member/campaigns" className="text-[#3dc3ff] hover:underline">Create one →</a></p>
                        ) : (
                          <select
                            value={pickerCampaignId}
                            onChange={(e) => handlePickerCampaignChange(e.target.value)}
                            className="w-full border border-[#1e2a38]/20 dark:border-white/20 bg-white dark:bg-[#242b3d] text-[#1e2a38] dark:text-white rounded-lg px-3 py-2 text-sm"
                          >
                            <option value="">Choose a campaign…</option>
                            {campaigns.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        )}
                      </div>

                      {/* Links in selected campaign */}
                      {pickerCampaignId && (
                        <div className="space-y-2">
                          {campaignPickerLinksLoading ? (
                            <p className="text-xs text-[#1e2a38]/40 dark:text-white/40">Loading links…</p>
                          ) : (
                            <>
                              {campaignPickerLinks.length > 0 && !newLinkMode && (
                                <div className="space-y-1">
                                  <p className="text-xs text-[#1e2a38]/60 dark:text-white/60">Existing links — pick one or create new</p>
                                  {campaignPickerLinks.map((link) => {
                                    const alreadyAdded = activeCampaignLinks.some((l) => l.linkId === link.id);
                                    return (
                                      <button
                                        key={link.id}
                                        onClick={() => !alreadyAdded && addExistingCampaignLink(link)}
                                        disabled={alreadyAdded}
                                        className={`w-full text-left flex items-center justify-between gap-2 rounded-lg px-3 py-2 border transition-colors ${alreadyAdded ? "border-[#1e2a38]/10 dark:border-white/10 opacity-40 cursor-not-allowed" : "border-[#1e2a38]/15 dark:border-white/15 hover:border-[#3dc3ff] hover:bg-[#3dc3ff]/5 cursor-pointer"}`}
                                      >
                                        <span className="text-sm text-[#1e2a38] dark:text-white truncate">{link.name}</span>
                                        <span className="text-xs text-[#1e2a38]/40 dark:text-white/40 shrink-0">{link.clicks} clicks</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Create new link */}
                              {!newLinkMode ? (
                                <button onClick={() => { setNewLinkMode(true); setNewLinkName(title ? `${title} — LinkedIn Article` : ""); }} className="text-xs text-[#3dc3ff] hover:underline">
                                  + Create new link in this campaign
                                </button>
                              ) : (
                                <div className="space-y-2 pt-1 border-t border-[#1e2a38]/10 dark:border-white/10">
                                  <p className="text-xs text-[#1e2a38]/60 dark:text-white/60">Name this link (tracks clicks from this specific content)</p>
                                  <input
                                    type="text"
                                    value={newLinkName}
                                    onChange={(e) => setNewLinkName(e.target.value)}
                                    placeholder="e.g. How to Buy Without Selling First — LinkedIn Article"
                                    className="w-full border border-[#1e2a38]/20 dark:border-white/20 bg-white dark:bg-[#242b3d] text-[#1e2a38] dark:text-white rounded-lg px-3 py-2 text-sm"
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      onClick={createCampaignLink}
                                      disabled={creatingLink || !newLinkName.trim()}
                                      className="bg-[#3dc3ff] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-[#3dc3ff]/90 disabled:opacity-50 transition-colors"
                                    >
                                      {creatingLink ? "Creating…" : "Create & Add Link"}
                                    </button>
                                    <button onClick={() => setNewLinkMode(false)} className="text-xs text-[#1e2a38]/40 dark:text-white/40 hover:text-[#1e2a38] dark:hover:text-white px-2">
                                      Back
                                    </button>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <button onClick={openCampaignPicker} className="text-xs text-[#3dc3ff] hover:underline">
                      + Add Campaign Link
                    </button>
                  )}

                  {/* One-off links */}
                  <div>
                    <p className="text-xs text-[#1e2a38]/40 dark:text-white/40 mb-2">Add links for this article only:</p>
                    {oneOffLinks.map((link, i) => (
                      <div key={i} className="flex gap-2 mb-2">
                        <input type="text" value={link.label} onChange={(e) => { const u = [...oneOffLinks]; u[i] = { ...u[i], label: e.target.value }; setOneOffLinks(u); }} placeholder="Label" className="flex-1 border border-[#1e2a38]/20 dark:border-white/20 bg-white dark:bg-[#1a1f2e] text-[#1e2a38] dark:text-white rounded-lg px-3 py-2 text-sm" />
                        <input type="text" value={link.url} onChange={(e) => { const u = [...oneOffLinks]; u[i] = { ...u[i], url: e.target.value }; setOneOffLinks(u); }} placeholder="URL" className="flex-1 border border-[#1e2a38]/20 dark:border-white/20 bg-white dark:bg-[#1a1f2e] text-[#1e2a38] dark:text-white rounded-lg px-3 py-2 text-sm" />
                        <button onClick={() => setOneOffLinks(oneOffLinks.filter((_, j) => j !== i))} className="text-red-500 text-sm px-2">Remove</button>
                      </div>
                    ))}
                    <button onClick={() => setOneOffLinks([...oneOffLinks, { label: "", url: "" }])} className="text-xs text-[#3dc3ff] hover:underline">+ Add one-off link</button>
                  </div>
                </div>
              )}

              <button
                onClick={generate}
                disabled={loading || !title.trim() || !transcript.trim() || overLimit || !anySelected || (generatePostcard && !neighbourhood.trim())}
                className="w-full bg-[#3dc3ff] text-white py-3 rounded-xl font-semibold hover:bg-[#3dc3ff]/90 disabled:opacity-50 transition-colors"
              >
                {loading ? "Generating..." : "Generate"}
              </button>
            </div>
          </div>

          {pastOutputs.length > 0 && (
            <div className="bg-white dark:bg-[#242b3d] border border-[#1e2a38]/10 dark:border-white/10 rounded-2xl p-6">
              <button onClick={() => setShowPastOutputs(!showPastOutputs)} className="flex items-center justify-between w-full">
                <h2 className="font-semibold text-[#1e2a38] dark:text-white">Past Outputs ({pastOutputs.length})</h2>
                <span className="text-[#1e2a38]/40 dark:text-white/40 text-sm">{showPastOutputs ? "Hide" : "Show"}</span>
              </button>
              {showPastOutputs && (
                <div className="mt-4 space-y-2">
                  {pastOutputs.map((output) => (
                    <div key={output.id} className="border border-[#1e2a38]/10 dark:border-white/10 rounded-xl">
                      <button onClick={() => setExpandedOutputId(expandedOutputId === output.id ? null : output.id)} className="w-full flex items-center justify-between px-4 py-3 text-left">
                        <div>
                          <span className="text-sm font-medium text-[#1e2a38] dark:text-white">{output.videoTitle}</span>
                          <span className="text-xs text-[#1e2a38]/40 dark:text-white/40 ml-2">
                            {TOOL_LABELS[output.toolType] ?? output.toolType}
                            {output.toolType === "postcard" && (output.output as { neighbourhood?: string }).neighbourhood
                              ? ` — ${(output.output as { neighbourhood?: string }).neighbourhood}`
                              : ""}{" "}
                            — {new Date(output.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <span className="text-[#1e2a38]/30 dark:text-white/30 text-xs">{expandedOutputId === output.id ? "Collapse" : "Expand"}</span>
                      </button>
                      {expandedOutputId === output.id && (
                        <div className="px-4 pb-4">
                          <pre className="bg-[#f1f1ef] dark:bg-[#1a1f2e] rounded-lg p-4 text-sm text-[#1e2a38] dark:text-white whitespace-pre-wrap overflow-auto max-h-96">
                            {pastOutputText(output)}
                          </pre>
                          <button
                            onClick={async () => {
                              const text = pastOutputText(output);
                              await copyPlainText(text);
                              setCopiedPastId(output.id);
                              setTimeout(() => setCopiedPastId(null), 2000);
                            }}
                            className="mt-2 text-xs text-[#3dc3ff] hover:underline"
                          >
                            {copiedPastId === output.id ? "✓ Copied!" : "Copy to clipboard"}
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
        <div className="space-y-4">
          {loading && (
            <div className="text-center py-4 text-sm text-[#1e2a38]/50 dark:text-white/50 animate-pulse">
              Generating your content — this may take a minute for longer formats…
            </div>
          )}

          {(generateNewsletter) && (
            <ResultCard title="Newsletter">
              {loading && !newsletterResult && !newsletterError && (
                <div className="text-center py-8 text-[#1e2a38]/40 dark:text-white/40 text-sm animate-pulse">Generating newsletter…</div>
              )}
              {newsletterError && (
                <div className="text-center py-6">
                  <p className="text-red-500 text-sm mb-2">{newsletterError}</p>
                </div>
              )}
              {newsletterResult && (
                <div className="space-y-3">
                  <textarea value={editedNewsletter} onChange={(e) => setEditedNewsletter(e.target.value)} rows={16} className="w-full border border-[#1e2a38]/20 dark:border-white/20 bg-white dark:bg-[#1a1f2e] rounded-xl px-4 py-3 text-sm text-[#1e2a38] dark:text-white focus:outline-none focus:border-[#3dc3ff] transition-colors resize-y font-mono" />
                  <div className="flex gap-2">
                    <CopyButton text={editedNewsletter} />
                    <SaveButton
                      onSave={() => saveEdit(newsletterRecordId!, editedNewsletter, setSavingNewsletter, setSavedNewsletter)}
                      saving={savingNewsletter}
                      saved={savedNewsletter}
                    />
                  </div>
                </div>
              )}
            </ResultCard>
          )}

          {(generateLinkedIn) && (
            <ResultCard title={`LinkedIn Article${linkedInResult?.reading_time ? ` (${linkedInResult.reading_time})` : ""}`}>
              {loading && !linkedInResult && !linkedInError && (
                <div className="text-center py-8 text-[#1e2a38]/40 dark:text-white/40 text-sm animate-pulse">Generating LinkedIn article…</div>
              )}
              {linkedInError && (
                <div className="text-center py-6">
                  <p className="text-red-500 text-sm mb-2">{linkedInError}</p>
                </div>
              )}
              {linkedInResult && (
                <div className="space-y-3">
                  <textarea value={editedLinkedIn} onChange={(e) => setEditedLinkedIn(e.target.value)} rows={28} className="w-full border border-[#1e2a38]/20 dark:border-white/20 bg-white dark:bg-[#1a1f2e] rounded-xl px-4 py-3 text-sm text-[#1e2a38] dark:text-white focus:outline-none focus:border-[#3dc3ff] transition-colors resize-y" />
                  <p className="text-xs text-[#1e2a38]/40 dark:text-white/40">Plain text — paste directly into LinkedIn&apos;s article editor.</p>
                  <div className="flex gap-2">
                    <CopyButton text={editedLinkedIn} label="Copy Article" />
                    <SaveButton
                      onSave={() => saveEdit(linkedInRecordId!, editedLinkedIn, setSavingLinkedIn, setSavedLinkedIn)}
                      saving={savingLinkedIn}
                      saved={savedLinkedIn}
                    />
                  </div>
                </div>
              )}
            </ResultCard>
          )}

          {(generateFacebook) && (
            <ResultCard title="Facebook Post">
              {loading && !facebookResult && !facebookError && (
                <div className="text-center py-8 text-[#1e2a38]/40 dark:text-white/40 text-sm animate-pulse">Generating Facebook post…</div>
              )}
              {facebookError && (
                <div className="text-center py-6">
                  <p className="text-red-500 text-sm mb-2">{facebookError}</p>
                </div>
              )}
              {facebookResult && (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-[#1e2a38]/50 dark:text-white/50 uppercase tracking-wide mb-1.5">Post body</p>
                    <textarea value={editedFacebookBody} onChange={(e) => setEditedFacebookBody(e.target.value)} rows={8} className="w-full border border-[#1e2a38]/20 dark:border-white/20 bg-white dark:bg-[#1a1f2e] rounded-xl px-4 py-3 text-sm text-[#1e2a38] dark:text-white focus:outline-none focus:border-[#3dc3ff] transition-colors resize-y" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[#1e2a38]/50 dark:text-white/50 uppercase tracking-wide mb-1.5">Paste this as your first comment</p>
                    <textarea value={editedFacebookComment} onChange={(e) => setEditedFacebookComment(e.target.value)} rows={2} className="w-full border border-[#1e2a38]/20 dark:border-white/20 bg-white dark:bg-[#1a1f2e] rounded-xl px-4 py-3 text-sm text-[#1e2a38] dark:text-white focus:outline-none focus:border-[#3dc3ff] transition-colors resize-y" />
                    <p className="text-xs text-[#1e2a38]/40 dark:text-white/40 mt-1">Facebook suppresses reach for posts with links in the body — paste this as the first comment instead.</p>
                  </div>
                  {facebookResult.hashtags?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-[#1e2a38]/50 dark:text-white/50 uppercase tracking-wide mb-1">Hashtags</p>
                      <p className="text-sm text-[#3dc3ff]">{facebookResult.hashtags.map((h) => `#${h}`).join(" ")}</p>
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    <CopyButton text={editedFacebookBody} label="Copy Post" />
                    <CopyButton text={editedFacebookComment} label="Copy Comment" />
                    <SaveButton
                      onSave={() => {
                        const combined = `${editedFacebookBody}\n\n---\nFirst comment: ${editedFacebookComment}\n\nHashtags: ${(facebookResult.hashtags || []).map((h) => `#${h}`).join(" ")}`;
                        saveEdit(facebookRecordId!, combined, setSavingFacebook, setSavedFacebook);
                      }}
                      saving={savingFacebook}
                      saved={savedFacebook}
                    />
                  </div>
                </div>
              )}
            </ResultCard>
          )}

          {(generateBlog) && (
            <ResultCard title={`Blog Post (AI-Optimized)${blogResult?.reading_time ? ` — ${blogResult.reading_time}` : ""}`}>
              {loading && !blogResult && !blogError && (
                <div className="text-center py-8 text-[#1e2a38]/40 dark:text-white/40 text-sm animate-pulse">Generating blog post…</div>
              )}
              {blogError && (
                <div className="text-center py-6">
                  <p className="text-red-500 text-sm mb-2">{blogError}</p>
                </div>
              )}
              {blogResult && (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-[#1e2a38]/50 dark:text-white/50 uppercase tracking-wide mb-1.5">Blog title</p>
                    <input value={editedBlogTitle} onChange={(e) => setEditedBlogTitle(e.target.value)} className="w-full border border-[#1e2a38]/20 dark:border-white/20 bg-white dark:bg-[#1a1f2e] rounded-xl px-4 py-2.5 text-sm font-semibold text-[#1e2a38] dark:text-white focus:outline-none focus:border-[#3dc3ff] transition-colors" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[#1e2a38]/50 dark:text-white/50 uppercase tracking-wide mb-1.5">Full article</p>
                    <textarea value={editedBlogArticle} onChange={(e) => setEditedBlogArticle(e.target.value)} rows={32} className="w-full border border-[#1e2a38]/20 dark:border-white/20 bg-white dark:bg-[#1a1f2e] rounded-xl px-4 py-3 text-sm text-[#1e2a38] dark:text-white focus:outline-none focus:border-[#3dc3ff] transition-colors resize-y" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[#1e2a38]/50 dark:text-white/50 uppercase tracking-wide mb-1.5">Meta description <span className="font-normal normal-case text-[#1e2a38]/30 dark:text-white/30">({editedBlogMeta.length}/160 chars)</span></p>
                    <textarea value={editedBlogMeta} onChange={(e) => setEditedBlogMeta(e.target.value)} rows={2} className="w-full border border-[#1e2a38]/20 dark:border-white/20 bg-white dark:bg-[#1a1f2e] rounded-xl px-4 py-3 text-sm text-[#1e2a38] dark:text-white focus:outline-none focus:border-[#3dc3ff] transition-colors resize-none" />
                  </div>
                  <p className="text-xs text-[#1e2a38]/40 dark:text-white/40">Plain text — paste directly into WordPress, Squarespace, Wix, or any CMS editor.</p>
                  <div className="flex gap-2">
                    <CopyButton text={`${editedBlogTitle}\n\n${editedBlogArticle}`} label="Copy Article" />
                    <SaveButton
                      onSave={() => {
                        const combined = `${editedBlogTitle}\n\n${editedBlogArticle}\n\nMeta: ${editedBlogMeta}`;
                        saveEdit(blogRecordId!, combined, setSavingBlog, setSavedBlog);
                      }}
                      saving={savingBlog}
                      saved={savedBlog}
                    />
                  </div>
                </div>
              )}
            </ResultCard>
          )}

          {(generatePostcard) && (
            <ResultCard title={`Neighbourhood Postcard${neighbourhood ? ` — ${neighbourhood}` : ""}`}>
              {loading && !postcardResult && !postcardError && (
                <div className="text-center py-8 text-[#1e2a38]/40 dark:text-white/40 text-sm animate-pulse">Generating postcard copy…</div>
              )}
              {postcardError && (
                <div className="text-center py-6">
                  <p className="text-red-500 text-sm mb-2">{postcardError}</p>
                </div>
              )}
              {postcardResult && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-[#1e2a38] dark:bg-[#0f1520] rounded-2xl p-5 text-white min-h-[140px] flex flex-col justify-between">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-3">Front</p>
                        <p className="font-bold text-base leading-snug mb-2">{editedPostcardFrontHeadline}</p>
                        <p className="text-sm text-white/80 leading-relaxed">{editedPostcardFrontHook}</p>
                      </div>
                    </div>
                    <div className="bg-[#f1f1ef] dark:bg-[#242b3d] border border-[#1e2a38]/10 dark:border-white/10 rounded-2xl p-5 min-h-[140px] flex flex-col justify-between">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#1e2a38]/40 dark:text-white/40 mb-3">Back</p>
                        <p className="text-sm text-[#1e2a38] dark:text-white leading-relaxed">{editedPostcardBack}</p>
                      </div>
                      <p className="text-xs text-[#3dc3ff] mt-3 font-medium">{postcardResult.video_url_placeholder}</p>
                    </div>
                  </div>
                  <p className="text-xs text-[#1e2a38]/40 dark:text-white/40">Copy this text into your postcard design tool (Canva, etc.)</p>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-[#1e2a38]/50 dark:text-white/50 uppercase tracking-wide mb-1.5">Edit front copy</p>
                      <input value={editedPostcardFrontHeadline} onChange={(e) => setEditedPostcardFrontHeadline(e.target.value)} placeholder="Front headline" className="w-full border border-[#1e2a38]/20 dark:border-white/20 bg-white dark:bg-[#1a1f2e] rounded-xl px-4 py-2.5 text-sm text-[#1e2a38] dark:text-white focus:outline-none focus:border-[#3dc3ff] transition-colors mb-2" />
                      <textarea value={editedPostcardFrontHook} onChange={(e) => setEditedPostcardFrontHook(e.target.value)} rows={2} placeholder="Front hook" className="w-full border border-[#1e2a38]/20 dark:border-white/20 bg-white dark:bg-[#1a1f2e] rounded-xl px-4 py-2.5 text-sm text-[#1e2a38] dark:text-white focus:outline-none focus:border-[#3dc3ff] transition-colors resize-none" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[#1e2a38]/50 dark:text-white/50 uppercase tracking-wide mb-1.5">Edit back copy</p>
                      <textarea value={editedPostcardBack} onChange={(e) => setEditedPostcardBack(e.target.value)} rows={3} className="w-full border border-[#1e2a38]/20 dark:border-white/20 bg-white dark:bg-[#1a1f2e] rounded-xl px-4 py-2.5 text-sm text-[#1e2a38] dark:text-white focus:outline-none focus:border-[#3dc3ff] transition-colors resize-none" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <CopyButton text={`FRONT\nHeadline: ${editedPostcardFrontHeadline}\nHook: ${editedPostcardFrontHook}\n\nBACK\n${editedPostcardBack}\n\n${postcardResult.video_url_placeholder}`} label="Copy All" />
                    <SaveButton
                      onSave={() => {
                        const combined = `FRONT\nHeadline: ${editedPostcardFrontHeadline}\nHook: ${editedPostcardFrontHook}\n\nBACK\n${editedPostcardBack}\n\n${postcardResult!.video_url_placeholder}`;
                        saveEdit(postcardRecordId!, combined, setSavingPostcard, setSavedPostcard);
                      }}
                      saving={savingPostcard}
                      saved={savedPostcard}
                    />
                  </div>
                </div>
              )}
            </ResultCard>
          )}

          <button onClick={reset} className="w-full border border-[#1e2a38]/20 dark:border-white/20 text-[#1e2a38] dark:text-white py-3 rounded-xl font-semibold hover:bg-[#1e2a38]/5 dark:hover:bg-white/5 transition-colors">
            Generate Another
          </button>
        </div>
      )}
    </div>
  );
}

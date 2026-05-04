"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDownIcon, ChevronUpIcon, ClipboardDocumentIcon, CheckIcon } from "@heroicons/react/24/outline";
import NextStepCard from "@/components/ai-tools/NextStepCard";
import LinkedPlanBanner from "@/components/ai-tools/LinkedPlanBanner";
import InlineUpgradeBanner from "@/components/upgrade/InlineUpgradeBanner";
import MarkdownTextarea from "@/components/MarkdownTextarea";

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
  leadMagnetUrl: string | null;
  linkCount: number;
}

type OutputType = "newsletter" | "linkedin" | "facebook" | "blog";

const OUTPUT_CONFIG: Record<OutputType, { source: string; destinationOverride: string; labelSuffix: string; multiLink: boolean }> = {
  newsletter: { source: "email",    destinationOverride: "lead_magnet", labelSuffix: "Newsletter",      multiLink: false },
  linkedin:   { source: "linkedin", destinationOverride: "landing_page", labelSuffix: "LinkedIn Article", multiLink: true  },
  facebook:   { source: "facebook", destinationOverride: "landing_page", labelSuffix: "Facebook Post",   multiLink: false },
  blog:       { source: "blog",     destinationOverride: "landing_page", labelSuffix: "Blog Post",       multiLink: true  },
};

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
  blog: "Blog Post",
  postcard: "Postcard",
};

const TOOL_COLORS: Record<string, { base: string; active: string }> = {
  newsletter: {
    base: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50",
    active: "bg-amber-500 text-white dark:bg-amber-500",
  },
  linkedin: {
    base: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50",
    active: "bg-blue-500 text-white dark:bg-blue-500",
  },
  facebook: {
    base: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-900/50",
    active: "bg-indigo-500 text-white dark:bg-indigo-500",
  },
  blog: {
    base: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50",
    active: "bg-emerald-500 text-white dark:bg-emerald-500",
  },
  postcard: {
    base: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50",
    active: "bg-purple-500 text-white dark:bg-purple-500",
  },
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
    <div className="bg-white dark:bg-[#1a1a1a] border border-[#2f3437]/10 dark:border-white/10 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <span className="font-semibold text-[#2f3437] dark:text-white text-sm">{title}</span>
        {expanded
          ? <ChevronUpIcon className="w-4 h-4 text-[#2f3437]/40 dark:text-white/40" />
          : <ChevronDownIcon className="w-4 h-4 text-[#2f3437]/40 dark:text-white/40" />}
      </button>
      {expanded && <div className="px-5 pb-5 border-t border-[#2f3437]/8 dark:border-white/8 pt-4">{children}</div>}
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
      className="flex items-center gap-1.5 border border-[#2f3437]/20 dark:border-white/20 text-[#2f3437] dark:text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#111]/5 dark:hover:bg-white/5 transition-colors"
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
      className="flex items-center gap-1.5 bg-[#6ba3c7] text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#6ba3c7]/90 disabled:opacity-60 transition-colors min-w-[100px] justify-center"
    >
      {saving
        ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving…</>
        : saved ? <><CheckIcon className="w-3.5 h-3.5" />Saved!</>
        : "Save Changes"}
    </button>
  );
}

function RepurposeContentPageInner() {
  const searchParams = useSearchParams();
  const planId = searchParams.get("planId");

  const [profile, setProfile] = useState<RepurposeProfile>({ name: "", business: "", listSize: "", voice: "" });
  const [savedLinks, setSavedLinks] = useState<SavedLink[]>([]);
  const [isSetup, setIsSetup] = useState<boolean | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [toolFlags, setToolFlags] = useState({ newsletter: true, linkedin: true, facebook: true, blog: true, postcard: true });
  const [generateNewsletter, setGenerateNewsletter] = useState(true);
  const [generateLinkedIn, setGenerateLinkedIn] = useState(true);
  const [generateFacebook, setGenerateFacebook] = useState(false);
  const [generateBlog, setGenerateBlog] = useState(false);
  const [generatePostcard, setGeneratePostcard] = useState(false);
  const [neighbourhood, setNeighbourhood] = useState("");
  const [selectedLinkIndexes, setSelectedLinkIndexes] = useState<number[]>([]);
  const [oneOffLinks, setOneOffLinks] = useState<SavedLink[]>([]);
  const [showLinkManager, setShowLinkManager] = useState(false);

  // LinkedIn multi-links (existing)
  const [activeCampaignLinks, setActiveCampaignLinks] = useState<ActiveCampaignLink[]>([]);
  // Blog multi-links (new)
  const [blogActiveCampaignLinks, setBlogActiveCampaignLinks] = useState<ActiveCampaignLink[]>([]);
  const [blogSelectedLinkIndexes, setBlogSelectedLinkIndexes] = useState<number[]>([]);
  const [blogOneOffLinks, setBlogOneOffLinks] = useState<SavedLink[]>([]);
  const [showBlogLinkManager, setShowBlogLinkManager] = useState(false);
  // Newsletter + Facebook single links
  const [newsletterActiveLink, setNewsletterActiveLink] = useState<ActiveCampaignLink | null>(null);
  const [facebookActiveLink, setFacebookActiveLink] = useState<ActiveCampaignLink | null>(null);

  // Shared campaign picker state
  const [pickerForOutput, setPickerForOutput] = useState<OutputType | null>(null);
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

  const [lastPickedCampaignId, setLastPickedCampaignId] = useState<string>("");

  useEffect(() => {
    if (newLinkMode && pickerForOutput) {
      const suffix = OUTPUT_CONFIG[pickerForOutput].labelSuffix;
      setNewLinkName(title ? `${title} — ${suffix}` : "");
    }
  }, [newLinkMode, pickerForOutput]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("repurpose_prefill");
      if (raw) {
        sessionStorage.removeItem("repurpose_prefill");
        const data = JSON.parse(raw);
        if (data.title) setTitle(data.title);
        if (data.transcript) setTranscript(data.transcript);
      }
    } catch { /* ignore */ }
  }, []);

  const [loading, setLoading] = useState(false);
  // Sprint 3 Part C: track which formats persisted to the linked plan
  const [planSaveResults, setPlanSaveResults] = useState<Record<string, boolean>>({});

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

  const [feedbackNewsletter, setFeedbackNewsletter] = useState("");
  const [feedbackLinkedIn, setFeedbackLinkedIn] = useState("");
  const [feedbackFacebook, setFeedbackFacebook] = useState("");
  const [feedbackBlog, setFeedbackBlog] = useState("");
  const [feedbackPostcard, setFeedbackPostcard] = useState("");

  const [redoingNewsletter, setRedoingNewsletter] = useState(false);
  const [redoingLinkedIn, setRedoingLinkedIn] = useState(false);
  const [redoingFacebook, setRedoingFacebook] = useState(false);
  const [redoingBlog, setRedoingBlog] = useState(false);
  const [redoingPostcard, setRedoingPostcard] = useState(false);

  const [generatingNewsletter, setGeneratingNewsletter] = useState(false);
  const [generatingLinkedIn, setGeneratingLinkedIn] = useState(false);
  const [generatingFacebook, setGeneratingFacebook] = useState(false);
  const [generatingBlog, setGeneratingBlog] = useState(false);
  const [generatingPostcard, setGeneratingPostcard] = useState(false);

  const [hydratedFromPlan, setHydratedFromPlan] = useState(false);

  const [pastOutputs, setPastOutputs] = useState<PastOutput[]>([]);
  const [showPastOutputs, setShowPastOutputs] = useState(false);
  const [expandedSession, setExpandedSession] = useState<{ key: string; tool: string } | null>(null);

  useEffect(() => {
    fetch("/api/ai-tools/repurpose-profile")
      .then((r) => r.json())
      .then((data) => {
        setProfile(data.profile);
        setSavedLinks(data.savedLinks || []);
        setIsSetup(data.isSetup);
        if (data.toolFlags) {
          setToolFlags(data.toolFlags);
          if (!data.toolFlags.newsletter) setGenerateNewsletter(false);
          if (!data.toolFlags.linkedin) setGenerateLinkedIn(false);
        }
      });
  }, []);

  const loadPastOutputs = useCallback(() => {
    fetch("/api/ai-tools/repurposed-content")
      .then((r) => r.json())
      .then((data) => setPastOutputs(data.outputs || []));
  }, []);

  useEffect(() => { loadPastOutputs(); }, [loadPastOutputs]);

  // When opened from the planner with a planId, restore the latest
  // generated outputs for this video title so the user picks up where they
  // left off instead of seeing a blank slate. Runs once after past outputs
  // have loaded and the prefill has populated the title.
  useEffect(() => {
    if (hydratedFromPlan) return;
    if (!planId) return;
    if (!title.trim()) return;
    if (pastOutputs.length === 0) return;
    const matching = pastOutputs.filter((o) => o.videoTitle === title);
    if (matching.length === 0) return;
    const latestByTool: Record<string, PastOutput> = {};
    for (const o of matching) {
      const existing = latestByTool[o.toolType];
      if (!existing || new Date(o.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
        latestByTool[o.toolType] = o;
      }
    }
    if (latestByTool.newsletter) {
      const o = latestByTool.newsletter;
      const nl = o.output as NewsletterResult;
      setNewsletterResult(nl);
      setNewsletterRecordId(o.id);
      setEditedNewsletter(o.editedOutput || nlFormatted(nl));
    }
    if (latestByTool.linkedin) {
      const o = latestByTool.linkedin;
      const li = o.output as LinkedInResult;
      setLinkedInResult(li);
      setLinkedInRecordId(o.id);
      setEditedLinkedIn(o.editedOutput || li.full_article);
    }
    if (latestByTool.facebook) {
      const o = latestByTool.facebook;
      const fb = o.output as FacebookResult;
      setFacebookResult(fb);
      setFacebookRecordId(o.id);
      setEditedFacebookBody(fb.post_body);
      setEditedFacebookComment(fb.first_comment);
    }
    if (latestByTool.blog) {
      const o = latestByTool.blog;
      const b = o.output as BlogResult;
      setBlogResult(b);
      setBlogRecordId(o.id);
      setEditedBlogTitle(b.blog_title);
      setEditedBlogArticle(b.full_article);
      setEditedBlogMeta(b.meta_description);
    }
    if (latestByTool.postcard) {
      const o = latestByTool.postcard;
      const p = o.output as PostcardResult;
      setPostcardResult(p);
      setPostcardRecordId(o.id);
      setEditedPostcardFrontHeadline(p.front_headline);
      setEditedPostcardFrontHook(p.front_hook);
      setEditedPostcardBack(p.back_body);
      const nb = (o.output as PostcardResult & { neighbourhood?: string }).neighbourhood;
      if (nb && !neighbourhood.trim()) setNeighbourhood(nb);
    }
    setHydratedFromPlan(true);
  }, [planId, title, pastOutputs, hydratedFromPlan, neighbourhood]);

  useEffect(() => {
    setFeedbackNewsletter("");
    setFeedbackLinkedIn("");
    setFeedbackFacebook("");
    setFeedbackBlog("");
    setFeedbackPostcard("");
  }, [transcript, title]);

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

  async function openCampaignPicker(outputType: OutputType) {
    setPickerForOutput(outputType);
    setShowCampaignPicker(true);
    setNewLinkMode(false);
    setNewLinkName("");
    const preselect = lastPickedCampaignId || "";
    setPickerCampaignId(preselect);
    setCampaignPickerLinks([]);
    if (!campaignsLoaded) {
      setCampaignsLoading(true);
      const res = await fetch("/api/campaigns");
      if (res.ok) setCampaigns(await res.json());
      setCampaignsLoaded(true);
      setCampaignsLoading(false);
    }
    if (preselect) {
      setCampaignPickerLinksLoading(true);
      const res = await fetch(`/api/campaigns/${preselect}/links`);
      if (res.ok) setCampaignPickerLinks(await res.json());
      setCampaignPickerLinksLoading(false);
    }
  }

  async function handlePickerCampaignChange(campaignId: string) {
    setPickerCampaignId(campaignId);
    setNewLinkMode(false);
    const suffix = pickerForOutput ? OUTPUT_CONFIG[pickerForOutput].labelSuffix : "LinkedIn Article";
    setNewLinkName(title ? `${title} — ${suffix}` : "");
    setCampaignPickerLinks([]);
    if (!campaignId) return;
    setLastPickedCampaignId(campaignId);
    setCampaignPickerLinksLoading(true);
    const res = await fetch(`/api/campaigns/${campaignId}/links`);
    if (res.ok) setCampaignPickerLinks(await res.json());
    setCampaignPickerLinksLoading(false);
  }

  function closePicker() {
    setShowCampaignPicker(false);
    setPickerCampaignId("");
    setCampaignPickerLinks([]);
    setNewLinkMode(false);
    setPickerForOutput(null);
  }

  function addExistingCampaignLink(link: CampaignLinkInfo) {
    const campaign = campaigns.find((c) => c.id === pickerCampaignId);
    const newEntry: ActiveCampaignLink = {
      campaignId: pickerCampaignId,
      campaignName: campaign?.name ?? "",
      linkId: link.id,
      linkName: link.name,
      trackedUrl: link.trackedUrl,
      isNew: false,
    };
    if (pickerForOutput === "linkedin") {
      if (activeCampaignLinks.some((l) => l.linkId === link.id)) return;
      setActiveCampaignLinks((prev) => [...prev, newEntry]);
    } else if (pickerForOutput === "blog") {
      if (blogActiveCampaignLinks.some((l) => l.linkId === link.id)) return;
      setBlogActiveCampaignLinks((prev) => [...prev, newEntry]);
    } else if (pickerForOutput === "newsletter") {
      setNewsletterActiveLink(newEntry);
    } else if (pickerForOutput === "facebook") {
      setFacebookActiveLink(newEntry);
    }
    closePicker();
  }

  async function createCampaignLink() {
    if (!pickerCampaignId || !newLinkName.trim()) return;
    setCreatingLink(true);
    const cfg = pickerForOutput ? OUTPUT_CONFIG[pickerForOutput] : OUTPUT_CONFIG.linkedin;
    const res = await fetch(`/api/campaigns/${pickerCampaignId}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newLinkName.trim(),
        source: cfg.source,
        destinationOverride: cfg.destinationOverride,
      }),
    });
    if (res.ok) {
      const link = await res.json();
      const campaign = campaigns.find((c) => c.id === pickerCampaignId);
      const newEntry: ActiveCampaignLink = {
        campaignId: pickerCampaignId,
        campaignName: campaign?.name ?? "",
        linkId: link.id,
        linkName: link.name,
        trackedUrl: link.trackedUrl,
        isNew: true,
      };
      if (pickerForOutput === "linkedin") {
        setActiveCampaignLinks((prev) => [...prev, newEntry]);
      } else if (pickerForOutput === "blog") {
        setBlogActiveCampaignLinks((prev) => [...prev, newEntry]);
      } else if (pickerForOutput === "newsletter") {
        setNewsletterActiveLink(newEntry);
      } else if (pickerForOutput === "facebook") {
        setFacebookActiveLink(newEntry);
      }
      closePicker();
      setNewLinkName("");
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

  const anySelected =
    (toolFlags.newsletter && generateNewsletter) ||
    (toolFlags.linkedin && generateLinkedIn) ||
    (toolFlags.facebook && generateFacebook) ||
    (toolFlags.blog && generateBlog) ||
    (toolFlags.postcard && generatePostcard);

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

    if (toolFlags.newsletter && generateNewsletter) {
      setGeneratingNewsletter(true);
      promises.push(
        fetch("/api/ai-tools/repurpose-newsletter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript,
            title,
            newsletterUrl: newsletterActiveLink?.trackedUrl || null,
            contentPlanId: planId || undefined,
          }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.result) {
              setNewsletterResult(data.result);
              setNewsletterRecordId(data.id);
              const nl = data.result as NewsletterResult;
              setEditedNewsletter(nlFormatted(nl));
              if (data.savedToPlan) setPlanSaveResults((p) => ({ ...p, newsletter: true }));
            } else {
              setNewsletterError(data.error || "Newsletter generation failed");
            }
          })
          .catch(() => setNewsletterError("Newsletter generation failed"))
          .finally(() => setGeneratingNewsletter(false))
      );
    }

    if (toolFlags.linkedin && generateLinkedIn) {
      const linksForApi = selectedLinkIndexes.map((i) => savedLinks[i]).filter(Boolean);
      const campaignLinksForApi = activeCampaignLinks.map((l) => ({ label: l.linkName, url: l.trackedUrl }));
      setGeneratingLinkedIn(true);
      promises.push(
        fetch("/api/ai-tools/repurpose-linkedin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript,
            title,
            selectedLinks: linksForApi,
            oneOffLinks: campaignLinksForApi,
            contentPlanId: planId || undefined,
          }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.result) {
              setLinkedInResult(data.result);
              setLinkedInRecordId(data.id);
              setEditedLinkedIn(data.result.full_article);
              if (data.savedToPlan) setPlanSaveResults((p) => ({ ...p, linkedin: true }));
            } else {
              setLinkedInError(data.error || "LinkedIn article generation failed");
            }
          })
          .catch(() => setLinkedInError("LinkedIn article generation failed"))
          .finally(() => setGeneratingLinkedIn(false))
      );
    }

    if (toolFlags.facebook && generateFacebook) {
      setGeneratingFacebook(true);
      promises.push(
        fetch("/api/ai-tools/repurpose-facebook", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript,
            title,
            link: facebookActiveLink
              ? { label: facebookActiveLink.linkName, url: facebookActiveLink.trackedUrl }
              : null,
            contentPlanId: planId || undefined,
          }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.result) {
              setFacebookResult(data.result);
              setFacebookRecordId(data.id);
              setEditedFacebookBody(data.result.post_body);
              setEditedFacebookComment(data.result.first_comment);
              if (data.savedToPlan) setPlanSaveResults((p) => ({ ...p, facebook: true }));
            } else {
              setFacebookError(data.error || "Facebook post generation failed");
            }
          })
          .catch(() => setFacebookError("Facebook post generation failed"))
          .finally(() => setGeneratingFacebook(false))
      );
    }

    if (toolFlags.blog && generateBlog) {
      const blogSavedLinksForApi = blogSelectedLinkIndexes.map((i) => savedLinks[i]).filter(Boolean);
      const blogCampaignLinksForApi = blogActiveCampaignLinks.map((l) => ({ label: l.linkName, url: l.trackedUrl }));
      setGeneratingBlog(true);
      promises.push(
        fetch("/api/ai-tools/repurpose-blog", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript,
            title,
            selectedLinks: blogSavedLinksForApi,
            oneOffLinks: blogCampaignLinksForApi,
            contentPlanId: planId || undefined,
          }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.result) {
              setBlogResult(data.result);
              setBlogRecordId(data.id);
              setEditedBlogTitle(data.result.blog_title);
              setEditedBlogArticle(data.result.full_article);
              setEditedBlogMeta(data.result.meta_description);
              if (data.savedToPlan) setPlanSaveResults((p) => ({ ...p, blog: true }));
            } else {
              setBlogError(data.error || "Blog post generation failed");
            }
          })
          .catch(() => setBlogError("Blog post generation failed"))
          .finally(() => setGeneratingBlog(false))
      );
    }

    if (toolFlags.postcard && generatePostcard) {
      setGeneratingPostcard(true);
      promises.push(
        fetch("/api/ai-tools/repurpose-postcard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript, title, neighbourhood: neighbourhood.trim(), contentPlanId: planId || undefined }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.result) {
              setPostcardResult(data.result);
              setPostcardRecordId(data.id);
              setEditedPostcardFrontHeadline(data.result.front_headline);
              setEditedPostcardFrontHook(data.result.front_hook);
              setEditedPostcardBack(data.result.back_body);
              if (data.savedToPlan) setPlanSaveResults((p) => ({ ...p, postcard: true }));
            } else {
              setPostcardError(data.error || "Postcard generation failed");
            }
          })
          .catch(() => setPostcardError("Postcard generation failed"))
          .finally(() => setGeneratingPostcard(false))
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
    setFeedbackNewsletter(""); setFeedbackLinkedIn(""); setFeedbackFacebook(""); setFeedbackBlog(""); setFeedbackPostcard("");
    setGeneratingNewsletter(false); setGeneratingLinkedIn(false); setGeneratingFacebook(false); setGeneratingBlog(false); setGeneratingPostcard(false);
    setHydratedFromPlan(true);
    setSelectedLinkIndexes([]); setOneOffLinks([]); setActiveCampaignLinks([]);
    setBlogActiveCampaignLinks([]); setBlogSelectedLinkIndexes([]); setBlogOneOffLinks([]);
    setNewsletterActiveLink(null); setFacebookActiveLink(null);
    setShowCampaignPicker(false); setPickerCampaignId(""); setCampaignPickerLinks([]);
    setPickerForOutput(null); setLastPickedCampaignId("");
  }

  async function redoNewsletter() {
    if (!transcript.trim() || !title.trim()) return;
    setRedoingNewsletter(true);
    setNewsletterError("");
    try {
      const res = await fetch("/api/ai-tools/repurpose-newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          title,
          newsletterUrl: newsletterActiveLink?.trackedUrl || null,
          contentPlanId: planId || undefined,
          feedback: feedbackNewsletter.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.result) {
        setNewsletterResult(data.result);
        setNewsletterRecordId(data.id);
        setEditedNewsletter(nlFormatted(data.result as NewsletterResult));
        setSavedNewsletter(false);
        if (data.savedToPlan) setPlanSaveResults((p) => ({ ...p, newsletter: true }));
      } else {
        setNewsletterError(data.error || "Newsletter regeneration failed");
      }
    } catch {
      setNewsletterError("Newsletter regeneration failed");
    } finally {
      setRedoingNewsletter(false);
    }
  }

  async function redoLinkedIn() {
    if (!transcript.trim() || !title.trim()) return;
    setRedoingLinkedIn(true);
    setLinkedInError("");
    try {
      const linksForApi = selectedLinkIndexes.map((i) => savedLinks[i]).filter(Boolean);
      const campaignLinksForApi = activeCampaignLinks.map((l) => ({ label: l.linkName, url: l.trackedUrl }));
      const res = await fetch("/api/ai-tools/repurpose-linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          title,
          selectedLinks: linksForApi,
          oneOffLinks: campaignLinksForApi,
          contentPlanId: planId || undefined,
          feedback: feedbackLinkedIn.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.result) {
        setLinkedInResult(data.result);
        setLinkedInRecordId(data.id);
        setEditedLinkedIn(data.result.full_article);
        setSavedLinkedIn(false);
        if (data.savedToPlan) setPlanSaveResults((p) => ({ ...p, linkedin: true }));
      } else {
        setLinkedInError(data.error || "LinkedIn article regeneration failed");
      }
    } catch {
      setLinkedInError("LinkedIn article regeneration failed");
    } finally {
      setRedoingLinkedIn(false);
    }
  }

  async function redoFacebook() {
    if (!transcript.trim() || !title.trim()) return;
    setRedoingFacebook(true);
    setFacebookError("");
    try {
      const res = await fetch("/api/ai-tools/repurpose-facebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          title,
          link: facebookActiveLink
            ? { label: facebookActiveLink.linkName, url: facebookActiveLink.trackedUrl }
            : null,
          contentPlanId: planId || undefined,
          feedback: feedbackFacebook.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.result) {
        setFacebookResult(data.result);
        setFacebookRecordId(data.id);
        setEditedFacebookBody(data.result.post_body);
        setEditedFacebookComment(data.result.first_comment);
        setSavedFacebook(false);
        if (data.savedToPlan) setPlanSaveResults((p) => ({ ...p, facebook: true }));
      } else {
        setFacebookError(data.error || "Facebook post regeneration failed");
      }
    } catch {
      setFacebookError("Facebook post regeneration failed");
    } finally {
      setRedoingFacebook(false);
    }
  }

  async function redoBlog() {
    if (!transcript.trim() || !title.trim()) return;
    setRedoingBlog(true);
    setBlogError("");
    try {
      const blogSavedLinksForApi = blogSelectedLinkIndexes.map((i) => savedLinks[i]).filter(Boolean);
      const blogCampaignLinksForApi = blogActiveCampaignLinks.map((l) => ({ label: l.linkName, url: l.trackedUrl }));
      const res = await fetch("/api/ai-tools/repurpose-blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          title,
          selectedLinks: blogSavedLinksForApi,
          oneOffLinks: blogCampaignLinksForApi,
          contentPlanId: planId || undefined,
          feedback: feedbackBlog.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.result) {
        setBlogResult(data.result);
        setBlogRecordId(data.id);
        setEditedBlogTitle(data.result.blog_title);
        setEditedBlogArticle(data.result.full_article);
        setEditedBlogMeta(data.result.meta_description);
        setSavedBlog(false);
        if (data.savedToPlan) setPlanSaveResults((p) => ({ ...p, blog: true }));
      } else {
        setBlogError(data.error || "Blog post regeneration failed");
      }
    } catch {
      setBlogError("Blog post regeneration failed");
    } finally {
      setRedoingBlog(false);
    }
  }

  async function redoPostcard() {
    if (!transcript.trim() || !title.trim() || !neighbourhood.trim()) return;
    setRedoingPostcard(true);
    setPostcardError("");
    try {
      const res = await fetch("/api/ai-tools/repurpose-postcard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          title,
          neighbourhood: neighbourhood.trim(),
          contentPlanId: planId || undefined,
          feedback: feedbackPostcard.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.result) {
        setPostcardResult(data.result);
        setPostcardRecordId(data.id);
        setEditedPostcardFrontHeadline(data.result.front_headline);
        setEditedPostcardFrontHook(data.result.front_hook);
        setEditedPostcardBack(data.result.back_body);
        setSavedPostcard(false);
        if (data.savedToPlan) setPlanSaveResults((p) => ({ ...p, postcard: true }));
      } else {
        setPostcardError(data.error || "Postcard regeneration failed");
      }
    } catch {
      setPostcardError("Postcard regeneration failed");
    } finally {
      setRedoingPostcard(false);
    }
  }

  const hasResults = newsletterResult || linkedInResult || facebookResult || blogResult || postcardResult
    || newsletterError || linkedInError || facebookError || blogError || postcardError;

  const transcriptLength = transcript.length;
  const overLimit = transcriptLength > 50000;

  const TOOL_ORDER = ["newsletter", "linkedin", "facebook", "blog", "postcard"];
  const sessions = useMemo(() => {
    const groups = new Map<string, PastOutput[]>();
    for (const output of pastOutputs) {
      const dateStr = new Date(output.createdAt).toLocaleDateString();
      const key = `${output.videoTitle}|||${dateStr}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(output);
    }
    return Array.from(groups.entries()).map(([key, items]) => ({
      key,
      title: items[0].videoTitle,
      date: new Date(items[0].createdAt).toLocaleDateString(),
      items: [...items].sort(
        (a, b) => TOOL_ORDER.indexOf(a.toolType) - TOOL_ORDER.indexOf(b.toolType)
      ),
    }));
  }, [pastOutputs]);

  if (isSetup === null) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#2f3437] dark:text-white">♻️ Repurpose Content</h1>
          <p className="text-[#2f3437]/60 dark:text-white/60 mt-1">Turn your video transcript into multiple content formats</p>
        </div>
        <div className="bg-white dark:bg-[#1a1a1a] border border-[#2f3437]/10 dark:border-white/10 rounded-lg p-6 text-center text-[#2f3437]/40 dark:text-white/40">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#2f3437] dark:text-white">♻️ Repurpose Content</h1>
        <p className="text-[#2f3437]/60 dark:text-white/60 mt-1">Turn your video transcript into a newsletter, LinkedIn article, Facebook post, blog post, or neighbourhood postcard</p>
      </div>

      {planId && <LinkedPlanBanner planId={planId} />}
      <InlineUpgradeBanner message="Want repurposed content to save back into your Content Planner? That's a Production feature." />

      {!isSetup && (
        <div className="bg-white dark:bg-[#1a1a1a] border border-[#2f3437]/10 dark:border-white/10 rounded-lg p-6">
          <h2 className="font-semibold text-[#2f3437] dark:text-white mb-4">Quick Setup</h2>
          <p className="text-sm text-[#2f3437]/60 dark:text-white/60 mb-5">We need a few details to personalise your outputs. You only need to do this once.</p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[#2f3437] dark:text-white mb-1">Your Name</label>
              <input type="text" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} placeholder="e.g. Jared Chamberlain" className="w-full border border-[#2f3437]/20 dark:border-white/20 bg-white dark:bg-[#0f1419] rounded-lg px-4 py-3 text-sm text-[#2f3437] dark:text-white placeholder-[#2f3437]/30 dark:placeholder-white/30 focus:outline-none focus:border-[#6ba3c7]" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#2f3437] dark:text-white mb-1">Business Name</label>
              <input type="text" value={profile.business} onChange={(e) => setProfile({ ...profile, business: e.target.value })} placeholder="e.g. Chamberlain Real Estate Group" className="w-full border border-[#2f3437]/20 dark:border-white/20 bg-white dark:bg-[#0f1419] rounded-lg px-4 py-3 text-sm text-[#2f3437] dark:text-white placeholder-[#2f3437]/30 dark:placeholder-white/30 focus:outline-none focus:border-[#6ba3c7]" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#2f3437] dark:text-white mb-1">Email List Size <span className="font-normal text-[#2f3437]/40 dark:text-white/40">(optional)</span></label>
              <input type="text" value={profile.listSize} onChange={(e) => setProfile({ ...profile, listSize: e.target.value })} placeholder="e.g. 5,000" className="w-full border border-[#2f3437]/20 dark:border-white/20 bg-white dark:bg-[#0f1419] rounded-lg px-4 py-3 text-sm text-[#2f3437] dark:text-white placeholder-[#2f3437]/30 dark:placeholder-white/30 focus:outline-none focus:border-[#6ba3c7]" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#2f3437] dark:text-white mb-1">Voice Style</label>
              <select value={profile.voice} onChange={(e) => setProfile({ ...profile, voice: e.target.value })} className="w-full border border-[#2f3437]/20 dark:border-white/20 bg-white dark:bg-[#0f1419] rounded-lg px-4 py-3 text-sm text-[#2f3437] dark:text-white focus:outline-none focus:border-[#6ba3c7]">
                <option value="">Select a voice style...</option>
                <option value="direct">Direct & Data-Driven</option>
                <option value="warm">Warm & Conversational</option>
                <option value="authoritative">Authoritative & Educational</option>
              </select>
            </div>
            <button onClick={saveProfile} disabled={savingProfile || !profile.name || !profile.business || !profile.voice} className="w-full bg-[#6ba3c7] text-white py-3 rounded-lg font-semibold hover:bg-[#6ba3c7]/90 disabled:opacity-50 transition-colors">
              {savingProfile ? "Saving..." : "Save & Continue"}
            </button>
          </div>
        </div>
      )}

      {isSetup && !hasResults && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-[#1a1a1a] border border-[#2f3437]/10 dark:border-white/10 rounded-lg p-6">
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-[#2f3437] dark:text-white mb-2">Video Title</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Paste your video title here..." className="w-full border border-[#2f3437]/20 dark:border-white/20 bg-white dark:bg-[#0f1419] rounded-lg px-4 py-3 text-sm text-[#2f3437] dark:text-white placeholder-[#2f3437]/30 dark:placeholder-white/30 focus:outline-none focus:border-[#6ba3c7] transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#2f3437] dark:text-white mb-2">
                  Transcript
                  <span className={`font-normal ml-2 ${overLimit ? "text-red-500" : "text-[#2f3437]/40 dark:text-white/40"}`}>
                    {transcriptLength.toLocaleString()}/50,000
                  </span>
                </label>
                <MarkdownTextarea value={transcript} onChange={setTranscript} placeholder="Paste your video transcript here..." rows={10} ariaLabel="Transcript" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#2f3437] dark:text-white mb-3">Generate</label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {[
                    { key: "newsletter" as const, label: "Newsletter", value: generateNewsletter, setter: setGenerateNewsletter },
                    { key: "linkedin" as const, label: "LinkedIn Article", value: generateLinkedIn, setter: setGenerateLinkedIn },
                    { key: "facebook" as const, label: "Facebook Post", value: generateFacebook, setter: setGenerateFacebook },
                    { key: "blog" as const, label: "Blog Post (AI-Optimized)", value: generateBlog, setter: setGenerateBlog },
                    { key: "postcard" as const, label: "Neighbourhood Postcard", value: generatePostcard, setter: setGeneratePostcard },
                  ].filter(({ key }) => toolFlags[key] !== false).map(({ key, label, value, setter }) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={value}
                        onChange={(e) => setter(e.target.checked)}
                        className="w-4 h-4 rounded border-[#2f3437]/20 text-[#6ba3c7] focus:ring-[#6ba3c7] shrink-0"
                      />
                      <span className="text-sm text-[#2f3437] dark:text-white leading-tight">{label}</span>
                    </label>
                  ))}
                </div>

                {generatePostcard && (
                  <div className="mt-3">
                    <label className="block text-xs font-semibold text-[#2f3437] dark:text-white mb-1.5">
                      What neighbourhood are you sending this to? <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={neighbourhood}
                      onChange={(e) => setNeighbourhood(e.target.value)}
                      placeholder="e.g. Aspen Woods, Tuscany, Bridgeland"
                      className="w-full border border-[#2f3437]/20 dark:border-white/20 bg-white dark:bg-[#0f1419] rounded-lg px-4 py-2.5 text-sm text-[#2f3437] dark:text-white placeholder-[#2f3437]/30 dark:placeholder-white/30 focus:outline-none focus:border-[#6ba3c7] transition-colors"
                    />
                  </div>
                )}
              </div>

              {/* ── Shared campaign picker panel ── */}
              {showCampaignPicker && (
                <div className="border-t border-[#2f3437]/10 dark:border-white/10 pt-5">
                  <div className="bg-[#f7f6f3] dark:bg-[#0f1419] rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-[#2f3437] dark:text-white">Add Campaign Link</p>
                      <button onClick={closePicker} className="text-xs text-[#2f3437]/40 dark:text-white/40 hover:text-[#2f3437] dark:hover:text-white">Cancel</button>
                    </div>
                    <div>
                      <label className="block text-xs text-[#2f3437]/60 dark:text-white/60 mb-1">Select Campaign</label>
                      {campaignsLoading ? (
                        <p className="text-xs text-[#2f3437]/40 dark:text-white/40">Loading campaigns…</p>
                      ) : campaigns.length === 0 ? (
                        <p className="text-xs text-[#2f3437]/40 dark:text-white/40">No campaigns found. <a href="/member/campaigns" className="text-[#6ba3c7] hover:underline">Create one →</a></p>
                      ) : (
                        <select value={pickerCampaignId} onChange={(e) => handlePickerCampaignChange(e.target.value)} className="w-full border border-[#2f3437]/20 dark:border-white/20 bg-white dark:bg-[#1a1a1a] text-[#2f3437] dark:text-white rounded-lg px-3 py-2 text-sm">
                          <option value="">Choose a campaign…</option>
                          {campaigns.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                        </select>
                      )}
                    </div>
                    {pickerCampaignId && (
                      <div className="space-y-2">
                        {campaignPickerLinksLoading ? (
                          <p className="text-xs text-[#2f3437]/40 dark:text-white/40">Loading links…</p>
                        ) : (
                          <>
                            {campaignPickerLinks.length > 0 && !newLinkMode && (
                              <div className="space-y-1">
                                <p className="text-xs text-[#2f3437]/60 dark:text-white/60">Existing links — pick one or create new</p>
                                {campaignPickerLinks.map((link) => {
                                  const currentLinks = pickerForOutput === "linkedin" ? activeCampaignLinks : pickerForOutput === "blog" ? blogActiveCampaignLinks : [];
                                  const alreadyAdded = currentLinks.some((l) => l.linkId === link.id);
                                  return (
                                    <button key={link.id} onClick={() => !alreadyAdded && addExistingCampaignLink(link)} disabled={alreadyAdded}
                                      className={`w-full text-left flex items-center justify-between gap-2 rounded-lg px-3 py-2 border transition-colors ${alreadyAdded ? "border-[#2f3437]/10 dark:border-white/10 opacity-40 cursor-not-allowed" : "border-[#2f3437]/15 dark:border-white/15 hover:border-[#6ba3c7] hover:bg-[#6ba3c7]/5 cursor-pointer"}`}>
                                      <span className="text-sm text-[#2f3437] dark:text-white truncate">{link.name}</span>
                                      <span className="text-xs text-[#2f3437]/40 dark:text-white/40 shrink-0">{link.clicks} clicks</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            {!newLinkMode ? (
                              <button onClick={() => { setNewLinkMode(true); const suffix = pickerForOutput ? OUTPUT_CONFIG[pickerForOutput].labelSuffix : ""; setNewLinkName(title ? `${title} — ${suffix}` : ""); }} className="text-xs text-[#6ba3c7] hover:underline">
                                + Create new link in this campaign
                              </button>
                            ) : (
                              <div className="space-y-2 pt-1 border-t border-[#2f3437]/10 dark:border-white/10">
                                <p className="text-xs text-[#2f3437]/60 dark:text-white/60">Name this link (tracks clicks from this specific content)</p>
                                <input type="text" value={newLinkName} onChange={(e) => setNewLinkName(e.target.value)} placeholder={`e.g. ${title || "Video Title"} — ${pickerForOutput ? OUTPUT_CONFIG[pickerForOutput].labelSuffix : ""}`} className="w-full border border-[#2f3437]/20 dark:border-white/20 bg-white dark:bg-[#1a1a1a] text-[#2f3437] dark:text-white rounded-lg px-3 py-2 text-sm" />
                                <div className="flex gap-2">
                                  <button onClick={createCampaignLink} disabled={creatingLink || !newLinkName.trim()} className="bg-[#6ba3c7] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-[#6ba3c7]/90 disabled:opacity-50 transition-colors">
                                    {creatingLink ? "Creating…" : "Create & Add Link"}
                                  </button>
                                  <button onClick={() => setNewLinkMode(false)} className="text-xs text-[#2f3437]/40 dark:text-white/40 hover:text-[#2f3437] dark:hover:text-white px-2">Back</button>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Per-output link sections ── */}
              {(generateNewsletter || generateLinkedIn || generateFacebook || generateBlog) && !showCampaignPicker && (
                <div className="border-t border-[#2f3437]/10 dark:border-white/10 pt-5 space-y-5">

                  {/* Newsletter link */}
                  {generateNewsletter && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-[#2f3437] dark:text-white">Newsletter Link <span className="font-normal text-[#2f3437]/40 dark:text-white/40">(optional)</span></p>
                      {(() => {
                        const camp = campaigns.find((c) => c.id === newsletterActiveLink?.campaignId);
                        const noLeadMagnet = camp && !camp.leadMagnetUrl;
                        return (
                          <>
                            {newsletterActiveLink ? (
                              <div className="flex items-center gap-2 bg-[#6ba3c7]/8 dark:bg-[#6ba3c7]/15 border border-[#6ba3c7]/20 rounded-lg px-3 py-2">
                                <span className="text-xs font-medium text-[#6ba3c7] shrink-0">Campaign</span>
                                <span className="text-xs text-[#2f3437]/50 dark:text-white/50 shrink-0">{newsletterActiveLink.campaignName}</span>
                                <span className="text-xs font-medium text-[#2f3437] dark:text-white flex-1 truncate">{newsletterActiveLink.linkName}</span>
                                {newsletterActiveLink.isNew && <span className="text-[10px] font-semibold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded-full shrink-0">New</span>}
                                <button onClick={() => setNewsletterActiveLink(null)} className="text-[#2f3437]/30 dark:text-white/30 hover:text-red-500 text-sm shrink-0 ml-1">✕</button>
                              </div>
                            ) : (
                              <button onClick={() => openCampaignPicker("newsletter")} className="text-xs text-[#6ba3c7] hover:underline">+ Add Campaign Link</button>
                            )}
                            {noLeadMagnet && (
                              <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-lg px-3 py-2">
                                This campaign has no Lead Magnet URL set. The newsletter link will point to the Landing Page instead. <a href={`/member/campaigns/${camp!.id}`} className="underline">Update campaign →</a>
                              </p>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {/* LinkedIn links */}
                  {generateLinkedIn && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-[#2f3437] dark:text-white">LinkedIn Article Links <span className="font-normal text-[#2f3437]/40 dark:text-white/40">(optional)</span></p>
                        <button onClick={() => setShowLinkManager(!showLinkManager)} className="text-xs text-[#6ba3c7] hover:underline">{showLinkManager ? "Done" : "Manage Saved Links"}</button>
                      </div>
                      {showLinkManager && (
                        <div className="bg-[#f7f6f3] dark:bg-[#0f1419] rounded-lg p-4 space-y-2">
                          {savedLinks.map((link, i) => (
                            <div key={i} className="flex gap-2">
                              <input type="text" value={link.label} onChange={(e) => { const u = [...savedLinks]; u[i] = { ...u[i], label: e.target.value }; setSavedLinks(u); }} placeholder="Label" className="flex-1 border border-[#2f3437]/20 dark:border-white/20 bg-white dark:bg-[#1a1a1a] text-[#2f3437] dark:text-white rounded-lg px-3 py-2 text-sm" />
                              <input type="text" value={link.url} onChange={(e) => { const u = [...savedLinks]; u[i] = { ...u[i], url: e.target.value }; setSavedLinks(u); }} placeholder="URL" className="flex-1 border border-[#2f3437]/20 dark:border-white/20 bg-white dark:bg-[#1a1a1a] text-[#2f3437] dark:text-white rounded-lg px-3 py-2 text-sm" />
                              <button onClick={() => setSavedLinks(savedLinks.filter((_, j) => j !== i))} className="text-red-500 text-sm px-2">Remove</button>
                            </div>
                          ))}
                          <div className="flex gap-2 pt-1">
                            <button onClick={() => setSavedLinks([...savedLinks, { label: "", url: "" }])} className="text-sm text-[#6ba3c7] hover:underline">+ Add Link</button>
                            <button onClick={() => saveLinks(savedLinks.filter((l) => l.label && l.url))} className="text-sm bg-[#6ba3c7] text-white px-3 py-1 rounded-lg hover:bg-[#6ba3c7]/90">Save Links</button>
                          </div>
                        </div>
                      )}
                      {savedLinks.length > 0 && !showLinkManager && (
                        <div className="space-y-1.5">
                          {savedLinks.map((link, i) => (
                            <label key={i} className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" checked={selectedLinkIndexes.includes(i)} onChange={(e) => setSelectedLinkIndexes(e.target.checked ? [...selectedLinkIndexes, i] : selectedLinkIndexes.filter((idx) => idx !== i))} className="w-4 h-4 rounded border-[#2f3437]/20 text-[#6ba3c7] focus:ring-[#6ba3c7]" />
                              <span className="text-sm text-[#2f3437] dark:text-white">{link.label}</span>
                              <span className="text-xs text-[#2f3437]/40 dark:text-white/40 truncate">{link.url}</span>
                            </label>
                          ))}
                        </div>
                      )}
                      {activeCampaignLinks.length > 0 && (
                        <div className="space-y-1.5">
                          {activeCampaignLinks.map((l) => (
                            <div key={l.linkId} className="flex items-center gap-2 bg-[#6ba3c7]/8 dark:bg-[#6ba3c7]/15 border border-[#6ba3c7]/20 rounded-lg px-3 py-2">
                              <span className="text-xs font-medium text-[#6ba3c7] shrink-0">Campaign</span>
                              <span className="text-xs text-[#2f3437]/50 dark:text-white/50 shrink-0">{l.campaignName}</span>
                              <span className="text-xs font-medium text-[#2f3437] dark:text-white flex-1 truncate">{l.linkName}</span>
                              {l.isNew && <span className="text-[10px] font-semibold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded-full shrink-0">New</span>}
                              <button onClick={() => setActiveCampaignLinks((prev) => prev.filter((x) => x.linkId !== l.linkId))} className="text-[#2f3437]/30 dark:text-white/30 hover:text-red-500 text-sm shrink-0 ml-1">✕</button>
                            </div>
                          ))}
                        </div>
                      )}
                      <button onClick={() => openCampaignPicker("linkedin")} className="text-xs text-[#6ba3c7] hover:underline">+ Add Campaign Link</button>
                    </div>
                  )}

                  {/* Facebook link */}
                  {generateFacebook && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-[#2f3437] dark:text-white">Facebook Post Link <span className="font-normal text-[#2f3437]/40 dark:text-white/40">(optional — placed in first comment)</span></p>
                      {facebookActiveLink ? (
                        <div className="flex items-center gap-2 bg-[#6ba3c7]/8 dark:bg-[#6ba3c7]/15 border border-[#6ba3c7]/20 rounded-lg px-3 py-2">
                          <span className="text-xs font-medium text-[#6ba3c7] shrink-0">Campaign</span>
                          <span className="text-xs text-[#2f3437]/50 dark:text-white/50 shrink-0">{facebookActiveLink.campaignName}</span>
                          <span className="text-xs font-medium text-[#2f3437] dark:text-white flex-1 truncate">{facebookActiveLink.linkName}</span>
                          {facebookActiveLink.isNew && <span className="text-[10px] font-semibold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded-full shrink-0">New</span>}
                          <button onClick={() => setFacebookActiveLink(null)} className="text-[#2f3437]/30 dark:text-white/30 hover:text-red-500 text-sm shrink-0 ml-1">✕</button>
                        </div>
                      ) : (
                        <button onClick={() => openCampaignPicker("facebook")} className="text-xs text-[#6ba3c7] hover:underline">+ Add Campaign Link</button>
                      )}
                    </div>
                  )}

                  {/* Blog links */}
                  {generateBlog && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-[#2f3437] dark:text-white">Blog Post Links <span className="font-normal text-[#2f3437]/40 dark:text-white/40">(optional)</span></p>
                        <button onClick={() => setShowBlogLinkManager(!showBlogLinkManager)} className="text-xs text-[#6ba3c7] hover:underline">{showBlogLinkManager ? "Done" : "Manage Saved Links"}</button>
                      </div>
                      {showBlogLinkManager && (
                        <div className="bg-[#f7f6f3] dark:bg-[#0f1419] rounded-lg p-4 space-y-2">
                          {savedLinks.map((link, i) => (
                            <div key={i} className="flex gap-2">
                              <input type="text" value={link.label} onChange={(e) => { const u = [...savedLinks]; u[i] = { ...u[i], label: e.target.value }; setSavedLinks(u); }} placeholder="Label" className="flex-1 border border-[#2f3437]/20 dark:border-white/20 bg-white dark:bg-[#1a1a1a] text-[#2f3437] dark:text-white rounded-lg px-3 py-2 text-sm" />
                              <input type="text" value={link.url} onChange={(e) => { const u = [...savedLinks]; u[i] = { ...u[i], url: e.target.value }; setSavedLinks(u); }} placeholder="URL" className="flex-1 border border-[#2f3437]/20 dark:border-white/20 bg-white dark:bg-[#1a1a1a] text-[#2f3437] dark:text-white rounded-lg px-3 py-2 text-sm" />
                              <button onClick={() => setSavedLinks(savedLinks.filter((_, j) => j !== i))} className="text-red-500 text-sm px-2">Remove</button>
                            </div>
                          ))}
                          <div className="flex gap-2 pt-1">
                            <button onClick={() => setSavedLinks([...savedLinks, { label: "", url: "" }])} className="text-sm text-[#6ba3c7] hover:underline">+ Add Link</button>
                            <button onClick={() => saveLinks(savedLinks.filter((l) => l.label && l.url))} className="text-sm bg-[#6ba3c7] text-white px-3 py-1 rounded-lg hover:bg-[#6ba3c7]/90">Save Links</button>
                          </div>
                        </div>
                      )}
                      {savedLinks.length > 0 && !showBlogLinkManager && (
                        <div className="space-y-1.5">
                          {savedLinks.map((link, i) => (
                            <label key={i} className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" checked={blogSelectedLinkIndexes.includes(i)} onChange={(e) => setBlogSelectedLinkIndexes(e.target.checked ? [...blogSelectedLinkIndexes, i] : blogSelectedLinkIndexes.filter((idx) => idx !== i))} className="w-4 h-4 rounded border-[#2f3437]/20 text-[#6ba3c7] focus:ring-[#6ba3c7]" />
                              <span className="text-sm text-[#2f3437] dark:text-white">{link.label}</span>
                              <span className="text-xs text-[#2f3437]/40 dark:text-white/40 truncate">{link.url}</span>
                            </label>
                          ))}
                        </div>
                      )}
                      {blogActiveCampaignLinks.length > 0 && (
                        <div className="space-y-1.5">
                          {blogActiveCampaignLinks.map((l) => (
                            <div key={l.linkId} className="flex items-center gap-2 bg-[#6ba3c7]/8 dark:bg-[#6ba3c7]/15 border border-[#6ba3c7]/20 rounded-lg px-3 py-2">
                              <span className="text-xs font-medium text-[#6ba3c7] shrink-0">Campaign</span>
                              <span className="text-xs text-[#2f3437]/50 dark:text-white/50 shrink-0">{l.campaignName}</span>
                              <span className="text-xs font-medium text-[#2f3437] dark:text-white flex-1 truncate">{l.linkName}</span>
                              {l.isNew && <span className="text-[10px] font-semibold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded-full shrink-0">New</span>}
                              <button onClick={() => setBlogActiveCampaignLinks((prev) => prev.filter((x) => x.linkId !== l.linkId))} className="text-[#2f3437]/30 dark:text-white/30 hover:text-red-500 text-sm shrink-0 ml-1">✕</button>
                            </div>
                          ))}
                        </div>
                      )}
                      <button onClick={() => openCampaignPicker("blog")} className="text-xs text-[#6ba3c7] hover:underline">+ Add Campaign Link</button>
                    </div>
                  )}

                </div>
              )}

              <button
                onClick={generate}
                disabled={loading || !title.trim() || !transcript.trim() || overLimit || !anySelected || (generatePostcard && !neighbourhood.trim())}
                className="w-full bg-[#6ba3c7] text-white py-3 rounded-lg font-semibold hover:bg-[#6ba3c7]/90 disabled:opacity-50 transition-colors"
              >
                {loading ? "Generating..." : "Generate"}
              </button>
            </div>
          </div>

          {sessions.length > 0 && (
            <div className="bg-white dark:bg-[#1a1a1a] border border-[#2f3437]/10 dark:border-white/10 rounded-lg overflow-hidden">
              <button
                onClick={() => setShowPastOutputs(!showPastOutputs)}
                className="w-full flex items-center justify-between px-5 py-4 text-left"
              >
                <div>
                  <h2 className="font-semibold text-[#2f3437] dark:text-white text-sm">Content Library</h2>
                  <p className="text-xs text-[#2f3437]/40 dark:text-white/40 mt-0.5">
                    {sessions.length} video{sessions.length !== 1 ? "s" : ""} · saved for 60 days
                  </p>
                </div>
                {showPastOutputs
                  ? <ChevronUpIcon className="w-4 h-4 text-[#2f3437]/40 dark:text-white/40 shrink-0" />
                  : <ChevronDownIcon className="w-4 h-4 text-[#2f3437]/40 dark:text-white/40 shrink-0" />}
              </button>

              {showPastOutputs && (
                <div className="border-t border-[#2f3437]/8 dark:border-white/8 divide-y divide-[#2f3437]/6 dark:divide-white/6">
                  {sessions.map((session) => {
                    const activeToolType = expandedSession?.key === session.key ? expandedSession.tool : null;
                    const activeRecord = activeToolType
                      ? session.items.find((i) => i.toolType === activeToolType) ?? null
                      : null;

                    return (
                      <div key={session.key} className="px-5 py-4">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <p className="text-sm font-medium text-[#2f3437] dark:text-white leading-snug">
                            {session.title}
                          </p>
                          <span className="text-xs text-[#2f3437]/35 dark:text-white/35 shrink-0 mt-0.5 whitespace-nowrap">
                            {session.date}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {session.items.map((item) => {
                            const isActive = activeToolType === item.toolType;
                            const colors = TOOL_COLORS[item.toolType] ?? {
                              base: "bg-[#111]/8 text-[#2f3437]/60 dark:bg-white/10 dark:text-white/60 hover:bg-[#111]/15",
                              active: "bg-[#6ba3c7] text-white",
                            };
                            return (
                              <button
                                key={item.id}
                                onClick={() =>
                                  setExpandedSession(
                                    isActive ? null : { key: session.key, tool: item.toolType }
                                  )
                                }
                                className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
                                  isActive ? colors.active : colors.base
                                }`}
                              >
                                {TOOL_LABELS[item.toolType] ?? item.toolType}
                              </button>
                            );
                          })}
                        </div>

                        {activeRecord && (
                          <div className="mt-3 bg-[#f8f9fa] dark:bg-[#0f1419] rounded-lg overflow-hidden">
                            <div className="max-h-72 overflow-y-auto p-4">
                              <pre className="text-xs text-[#2f3437] dark:text-white whitespace-pre-wrap leading-relaxed">
                                {pastOutputText(activeRecord)}
                              </pre>
                            </div>
                            <div className="flex items-center justify-between px-4 py-3 border-t border-[#2f3437]/8 dark:border-white/8">
                              <CopyButton text={pastOutputText(activeRecord)} label="Copy" />
                              <button
                                onClick={() => setExpandedSession(null)}
                                className="text-xs text-[#2f3437]/40 dark:text-white/40 hover:text-[#2f3437] dark:hover:text-white transition-colors"
                              >
                                Close
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {hasResults && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <button
              onClick={reset}
              className="flex items-center gap-1.5 text-sm text-[#2f3437]/55 dark:text-white/55 hover:text-[#6ba3c7] dark:hover:text-[#6ba3c7] transition-colors font-medium"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              New content
            </button>
            {loading && (
              <span className="text-sm text-[#2f3437]/50 dark:text-white/50 animate-pulse">
                Generating — this may take a minute…
              </span>
            )}
          </div>

          {planId && Object.values(planSaveResults).some(Boolean) && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              <p className="text-sm text-green-700 font-medium flex-1">
                Saved to your Content Plan: {Object.entries(planSaveResults).filter(([, v]) => v).map(([k]) => TOOL_LABELS[k] ?? k).join(", ")}
              </p>
              <a href={`/member/content-planner?plan=${planId}`} className="text-xs font-semibold text-green-700 underline hover:no-underline shrink-0">
                View in Planner →
              </a>
            </div>
          )}

          {loading && !newsletterResult && !linkedInResult && !facebookResult && !blogResult && !postcardResult && (
            <div className="text-center py-4 text-sm text-[#2f3437]/50 dark:text-white/50 animate-pulse">
              Generating your content — this may take a minute for longer formats…
            </div>
          )}

          {(generateNewsletter) && (
            <ResultCard title="Newsletter">
              {loading && !newsletterResult && !newsletterError && (
                <div className="text-center py-8 text-[#2f3437]/40 dark:text-white/40 text-sm animate-pulse">Generating newsletter…</div>
              )}
              {newsletterError && (
                <div className="text-center py-6">
                  <p className="text-red-500 text-sm mb-2">{newsletterError}</p>
                </div>
              )}
              {newsletterResult && (
                <div className="space-y-3">
                  <MarkdownTextarea value={editedNewsletter} onChange={setEditedNewsletter} rows={16} ariaLabel="Newsletter" />
                  <div className="flex gap-2">
                    <CopyButton text={editedNewsletter} />
                    <SaveButton
                      onSave={() => saveEdit(newsletterRecordId!, editedNewsletter, setSavingNewsletter, setSavedNewsletter)}
                      saving={savingNewsletter}
                      saved={savedNewsletter}
                    />
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-white/10">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#2f3437]/60 dark:text-white/50 mb-1.5">
                      Redo with feedback (optional)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={feedbackNewsletter}
                        onChange={(e) => setFeedbackNewsletter(e.target.value)}
                        placeholder="e.g. shorter, lead with the equity hook, drop the bullet list"
                        maxLength={1000}
                        disabled={redoingNewsletter || generatingNewsletter}
                        className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/15 bg-white dark:bg-white/5 text-[#2f3437] dark:text-white placeholder:text-[#2f3437]/40 focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40"
                      />
                      <button
                        type="button"
                        onClick={redoNewsletter}
                        disabled={redoingNewsletter || generatingNewsletter || !transcript.trim() || !title.trim()}
                        className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#6ba3c7] hover:bg-[#5a92b6] disabled:bg-[#6ba3c7]/40 disabled:cursor-not-allowed text-white transition-colors flex items-center gap-1.5"
                        aria-label="Regenerate this output using the feedback above"
                      >
                        {redoingNewsletter ? (
                          <>
                            <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            Redoing…
                          </>
                        ) : (
                          <>↻ Redo</>
                        )}
                      </button>
                    </div>
                    <p className="text-[10px] text-[#2f3437]/40 dark:text-white/40 mt-1">
                      Replaces this output. Your feedback stays so you can refine and run it again.
                    </p>
                  </div>
                </div>
              )}
            </ResultCard>
          )}

          {(generateLinkedIn) && (
            <ResultCard title={`LinkedIn Article${linkedInResult?.reading_time ? ` (${linkedInResult.reading_time})` : ""}`}>
              {loading && !linkedInResult && !linkedInError && (
                <div className="text-center py-8 text-[#2f3437]/40 dark:text-white/40 text-sm animate-pulse">Generating LinkedIn article…</div>
              )}
              {linkedInError && (
                <div className="text-center py-6">
                  <p className="text-red-500 text-sm mb-2">{linkedInError}</p>
                </div>
              )}
              {linkedInResult && (
                <div className="space-y-3">
                  <MarkdownTextarea value={editedLinkedIn} onChange={setEditedLinkedIn} rows={28} ariaLabel="LinkedIn Article" />
                  <p className="text-xs text-[#2f3437]/40 dark:text-white/40">Plain text — paste directly into LinkedIn&apos;s article editor.</p>
                  <div className="flex gap-2">
                    <CopyButton text={editedLinkedIn} label="Copy Article" />
                    <SaveButton
                      onSave={() => saveEdit(linkedInRecordId!, editedLinkedIn, setSavingLinkedIn, setSavedLinkedIn)}
                      saving={savingLinkedIn}
                      saved={savedLinkedIn}
                    />
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-white/10">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#2f3437]/60 dark:text-white/50 mb-1.5">
                      Redo with feedback (optional)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={feedbackLinkedIn}
                        onChange={(e) => setFeedbackLinkedIn(e.target.value)}
                        placeholder="e.g. punchier opening, more local examples, cut the closing CTA"
                        maxLength={1000}
                        disabled={redoingLinkedIn || generatingLinkedIn}
                        className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/15 bg-white dark:bg-white/5 text-[#2f3437] dark:text-white placeholder:text-[#2f3437]/40 focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40"
                      />
                      <button
                        type="button"
                        onClick={redoLinkedIn}
                        disabled={redoingLinkedIn || generatingLinkedIn || !transcript.trim() || !title.trim()}
                        className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#6ba3c7] hover:bg-[#5a92b6] disabled:bg-[#6ba3c7]/40 disabled:cursor-not-allowed text-white transition-colors flex items-center gap-1.5"
                        aria-label="Regenerate this output using the feedback above"
                      >
                        {redoingLinkedIn ? (
                          <>
                            <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            Redoing…
                          </>
                        ) : (
                          <>↻ Redo</>
                        )}
                      </button>
                    </div>
                    <p className="text-[10px] text-[#2f3437]/40 dark:text-white/40 mt-1">
                      Replaces this output. Your feedback stays so you can refine and run it again.
                    </p>
                  </div>
                </div>
              )}
            </ResultCard>
          )}

          {(generateFacebook) && (
            <ResultCard title="Facebook Post">
              {loading && !facebookResult && !facebookError && (
                <div className="text-center py-8 text-[#2f3437]/40 dark:text-white/40 text-sm animate-pulse">Generating Facebook post…</div>
              )}
              {facebookError && (
                <div className="text-center py-6">
                  <p className="text-red-500 text-sm mb-2">{facebookError}</p>
                </div>
              )}
              {facebookResult && (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-[#2f3437]/50 dark:text-white/50 uppercase tracking-wide mb-1.5">Post body</p>
                    <MarkdownTextarea value={editedFacebookBody} onChange={setEditedFacebookBody} rows={8} ariaLabel="Facebook Post Body" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[#2f3437]/50 dark:text-white/50 uppercase tracking-wide mb-1.5">Paste this as your first comment</p>
                    <MarkdownTextarea value={editedFacebookComment} onChange={setEditedFacebookComment} rows={2} ariaLabel="Facebook First Comment" />
                    <p className="text-xs text-[#2f3437]/40 dark:text-white/40 mt-1">Facebook suppresses reach for posts with links in the body — paste this as the first comment instead.</p>
                  </div>
                  {facebookResult.hashtags?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-[#2f3437]/50 dark:text-white/50 uppercase tracking-wide mb-1">Hashtags</p>
                      <p className="text-sm text-[#6ba3c7]">{facebookResult.hashtags.map((h) => `#${h}`).join(" ")}</p>
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
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-white/10">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#2f3437]/60 dark:text-white/50 mb-1.5">
                      Redo with feedback (optional)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={feedbackFacebook}
                        onChange={(e) => setFeedbackFacebook(e.target.value)}
                        placeholder="e.g. shorter, lose the question opener, no hashtags"
                        maxLength={1000}
                        disabled={redoingFacebook || generatingFacebook}
                        className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/15 bg-white dark:bg-white/5 text-[#2f3437] dark:text-white placeholder:text-[#2f3437]/40 focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40"
                      />
                      <button
                        type="button"
                        onClick={redoFacebook}
                        disabled={redoingFacebook || generatingFacebook || !transcript.trim() || !title.trim()}
                        className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#6ba3c7] hover:bg-[#5a92b6] disabled:bg-[#6ba3c7]/40 disabled:cursor-not-allowed text-white transition-colors flex items-center gap-1.5"
                        aria-label="Regenerate this output using the feedback above"
                      >
                        {redoingFacebook ? (
                          <>
                            <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            Redoing…
                          </>
                        ) : (
                          <>↻ Redo</>
                        )}
                      </button>
                    </div>
                    <p className="text-[10px] text-[#2f3437]/40 dark:text-white/40 mt-1">
                      Replaces this output. Your feedback stays so you can refine and run it again.
                    </p>
                  </div>
                </div>
              )}
            </ResultCard>
          )}

          {(generateBlog) && (
            <ResultCard title={`Blog Post (AI-Optimized)${blogResult?.reading_time ? ` — ${blogResult.reading_time}` : ""}`}>
              {loading && !blogResult && !blogError && (
                <div className="text-center py-8 text-[#2f3437]/40 dark:text-white/40 text-sm animate-pulse">Generating blog post…</div>
              )}
              {blogError && (
                <div className="text-center py-6">
                  <p className="text-red-500 text-sm mb-2">{blogError}</p>
                </div>
              )}
              {blogResult && (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-[#2f3437]/50 dark:text-white/50 uppercase tracking-wide mb-1.5">Blog title</p>
                    <input value={editedBlogTitle} onChange={(e) => setEditedBlogTitle(e.target.value)} className="w-full border border-[#2f3437]/20 dark:border-white/20 bg-white dark:bg-[#0f1419] rounded-lg px-4 py-2.5 text-sm font-semibold text-[#2f3437] dark:text-white focus:outline-none focus:border-[#6ba3c7] transition-colors" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[#2f3437]/50 dark:text-white/50 uppercase tracking-wide mb-1.5">Full article</p>
                    <MarkdownTextarea value={editedBlogArticle} onChange={setEditedBlogArticle} rows={32} ariaLabel="Blog Article" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[#2f3437]/50 dark:text-white/50 uppercase tracking-wide mb-1.5">Meta description <span className="font-normal normal-case text-[#2f3437]/30 dark:text-white/30">({editedBlogMeta.length}/160 chars)</span></p>
                    <MarkdownTextarea value={editedBlogMeta} onChange={setEditedBlogMeta} rows={2} ariaLabel="Meta Description" />
                  </div>
                  <p className="text-xs text-[#2f3437]/40 dark:text-white/40">Plain text — paste directly into WordPress, Squarespace, Wix, or any CMS editor.</p>
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
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-white/10">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#2f3437]/60 dark:text-white/50 mb-1.5">
                      Redo with feedback (optional)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={feedbackBlog}
                        onChange={(e) => setFeedbackBlog(e.target.value)}
                        placeholder="e.g. punchier title, fewer subheadings, add more local data"
                        maxLength={1000}
                        disabled={redoingBlog || generatingBlog}
                        className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/15 bg-white dark:bg-white/5 text-[#2f3437] dark:text-white placeholder:text-[#2f3437]/40 focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40"
                      />
                      <button
                        type="button"
                        onClick={redoBlog}
                        disabled={redoingBlog || generatingBlog || !transcript.trim() || !title.trim()}
                        className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#6ba3c7] hover:bg-[#5a92b6] disabled:bg-[#6ba3c7]/40 disabled:cursor-not-allowed text-white transition-colors flex items-center gap-1.5"
                        aria-label="Regenerate this output using the feedback above"
                      >
                        {redoingBlog ? (
                          <>
                            <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            Redoing…
                          </>
                        ) : (
                          <>↻ Redo</>
                        )}
                      </button>
                    </div>
                    <p className="text-[10px] text-[#2f3437]/40 dark:text-white/40 mt-1">
                      Replaces this output. Your feedback stays so you can refine and run it again.
                    </p>
                  </div>
                </div>
              )}
            </ResultCard>
          )}

          {(generatePostcard) && (
            <ResultCard title={`Neighbourhood Postcard${neighbourhood ? ` — ${neighbourhood}` : ""}`}>
              {loading && !postcardResult && !postcardError && (
                <div className="text-center py-8 text-[#2f3437]/40 dark:text-white/40 text-sm animate-pulse">Generating postcard copy…</div>
              )}
              {postcardError && (
                <div className="text-center py-6">
                  <p className="text-red-500 text-sm mb-2">{postcardError}</p>
                </div>
              )}
              {postcardResult && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-[#111] dark:bg-[#0f1520] rounded-lg p-5 text-white min-h-[140px] flex flex-col justify-between">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-3">Front</p>
                        <p className="font-bold text-base leading-snug mb-2">{editedPostcardFrontHeadline}</p>
                        <p className="text-sm text-white/80 leading-relaxed">{editedPostcardFrontHook}</p>
                      </div>
                    </div>
                    <div className="bg-[#f7f6f3] dark:bg-[#1a1a1a] border border-[#2f3437]/10 dark:border-white/10 rounded-lg p-5 min-h-[140px] flex flex-col justify-between">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#2f3437]/40 dark:text-white/40 mb-3">Back</p>
                        <p className="text-sm text-[#2f3437] dark:text-white leading-relaxed">{editedPostcardBack}</p>
                      </div>
                      <p className="text-xs text-[#6ba3c7] mt-3 font-medium">{postcardResult.video_url_placeholder}</p>
                    </div>
                  </div>
                  <p className="text-xs text-[#2f3437]/40 dark:text-white/40">Copy this text into your postcard design tool (Canva, etc.)</p>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-[#2f3437]/50 dark:text-white/50 uppercase tracking-wide mb-1.5">Edit front copy</p>
                      <input value={editedPostcardFrontHeadline} onChange={(e) => setEditedPostcardFrontHeadline(e.target.value)} placeholder="Front headline" className="w-full border border-[#2f3437]/20 dark:border-white/20 bg-white dark:bg-[#0f1419] rounded-lg px-4 py-2.5 text-sm text-[#2f3437] dark:text-white focus:outline-none focus:border-[#6ba3c7] transition-colors mb-2" />
                      <MarkdownTextarea value={editedPostcardFrontHook} onChange={setEditedPostcardFrontHook} rows={2} placeholder="Front hook" ariaLabel="Postcard Front Hook" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[#2f3437]/50 dark:text-white/50 uppercase tracking-wide mb-1.5">Edit back copy</p>
                      <MarkdownTextarea value={editedPostcardBack} onChange={setEditedPostcardBack} rows={3} ariaLabel="Postcard Back Copy" />
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
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-white/10">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#2f3437]/60 dark:text-white/50 mb-1.5">
                      Redo with feedback (optional)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={feedbackPostcard}
                        onChange={(e) => setFeedbackPostcard(e.target.value)}
                        placeholder="e.g. softer hook, mention move-up buyers explicitly"
                        maxLength={1000}
                        disabled={redoingPostcard || generatingPostcard}
                        className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/15 bg-white dark:bg-white/5 text-[#2f3437] dark:text-white placeholder:text-[#2f3437]/40 focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40"
                      />
                      <button
                        type="button"
                        onClick={redoPostcard}
                        disabled={redoingPostcard || generatingPostcard || !transcript.trim() || !title.trim() || !neighbourhood.trim()}
                        className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#6ba3c7] hover:bg-[#5a92b6] disabled:bg-[#6ba3c7]/40 disabled:cursor-not-allowed text-white transition-colors flex items-center gap-1.5"
                        aria-label="Regenerate this output using the feedback above"
                      >
                        {redoingPostcard ? (
                          <>
                            <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            Redoing…
                          </>
                        ) : (
                          <>↻ Redo</>
                        )}
                      </button>
                    </div>
                    <p className="text-[10px] text-[#2f3437]/40 dark:text-white/40 mt-1">
                      Replaces this output. Your feedback stays so you can refine and run it again.
                    </p>
                  </div>
                </div>
              )}
            </ResultCard>
          )}

          <NextStepCard
            emoji="📅"
            title="Plan Your Next Video"
            description="Head to the Content Planner to schedule your next piece of content and keep your production pipeline moving."
            href="/member/content-planner"
            buttonLabel="Open Content Planner"
          />

          <button onClick={reset} className="w-full border border-[#2f3437]/20 dark:border-white/20 text-[#2f3437] dark:text-white py-3 rounded-lg font-semibold hover:bg-[#111]/5 dark:hover:bg-white/5 transition-colors">
            Generate Another
          </button>
        </div>
      )}
    </div>
  );
}

export default function RepurposeContentPage() {
  return (
    <Suspense>
      <RepurposeContentPageInner />
    </Suspense>
  );
}

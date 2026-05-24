"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { XMarkIcon, ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import {
  STATUS_STYLES,
  getStatusOptions,
  hasEditDueDate,
  hasDriveFolder,
} from "@/lib/content-plan-utils";
import ProgressTrack from "@/components/content-planner/ProgressTrack";
import { resolveProgressSteps, getSuggestedNextStep, type PlanArtifactsByType } from "@/lib/plan-state";
import { buildToolUrl } from "@/lib/tool-handoff";
import MarkdownTextarea from "@/components/MarkdownTextarea";
import RichMarkdownEditor from "@/components/RichMarkdownEditor";
import { getScoreBadgeClasses } from "@/lib/score-badge";
import { useIsMobile } from "@/hooks/useIsMobile";

/**
 * Convert the stored repurpose-artifact content (which the API saves as a
 * JSON.stringified object — e.g. {subject_line, body, sign_off} for the
 * newsletter) into clean copy-paste-ready plain text. If the content isn't
 * JSON (already plain text, or saved by a future revision), it is returned
 * unchanged so the user always sees a sensible body in the viewer.
 */
function formatRepurposeArtifactForView(type: string, raw: string): string {
  if (!raw) return "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (!parsed || typeof parsed !== "object") return raw;
  const p = parsed as Record<string, unknown>;
  const str = (k: string) => (typeof p[k] === "string" ? (p[k] as string).trim() : "");
  const lines = (parts: Array<string | false | null | undefined>) =>
    parts.filter((x): x is string => Boolean(x)).join("\n").replace(/\n{3,}/g, "\n\n").trim();

  if (type === "repurpose_newsletter") {
    const subject = str("subject_line");
    const preview = str("preview_text");
    const body = str("body");
    const ps = str("ps_line");
    const sign = str("sign_off");
    return lines([
      subject && `Subject: ${subject}`,
      preview && `Preview: ${preview}`,
      "",
      body,
      "",
      ps && `P.S. ${ps}`,
      sign,
    ]);
  }
  if (type === "repurpose_linkedin") {
    return str("full_article") || raw;
  }
  if (type === "repurpose_facebook") {
    const post = str("post_body");
    const comment = str("first_comment");
    const tags = Array.isArray(p.hashtags)
      ? (p.hashtags as unknown[]).filter((h) => typeof h === "string").map((h) => `#${h}`).join(" ")
      : "";
    return lines([
      post,
      "",
      comment && `First comment: ${comment}`,
      tags && `Hashtags: ${tags}`,
    ]);
  }
  if (type === "repurpose_blog") {
    const title = str("blog_title");
    const article = str("full_article");
    const meta = str("meta_description");
    return lines([title, "", article, "", meta && `Meta: ${meta}`]);
  }
  if (type === "repurpose_postcard") {
    const headline = str("front_headline");
    const hook = str("front_hook");
    const back = str("back_body");
    const url = str("video_url_placeholder");
    return lines([
      "FRONT",
      headline && `Headline: ${headline}`,
      hook && `Hook: ${hook}`,
      "",
      "BACK",
      back,
      "",
      url,
    ]);
  }
  return raw;
}

// Lightweight summary of a related plan, used for both the `bingeVideo`
// (selected target) and `bingedFromList` (reverse-link) relations on a plan.
// Kept tiny so list payloads stay small.
export interface BingeVideoSummary {
  id: string;
  title: string;
  theme: string | null;
  status: string;
}

export interface ContentPlan {
  id: string;
  title: string;
  status: string;
  theme: string | null;
  shootDate: string | null;
  shootLocation: string | null;
  publishDate: string | null;
  editDueDate: string | null;
  priority: string | null;
  dramaMode?: boolean;
  notes: string | null;
  script: string | null;
  researchNotes: string | null;
  thoughts?: string | null;
  manualSteps?: string[] | null;
  thumbnailWords: string | null;
  footageLink: string | null;
  driveFolderLink: string | null;
  linkedCampaignId?: string | null;
  // Binge chain: the previous video this one points viewers back to (forward
  // link), and every other video that has selected THIS plan as its binge
  // target (reverse links). The list endpoint includes both relations so the
  // modal can render them on open without a follow-up fetch.
  bingeVideoId?: string | null;
  bingeVideo?: BingeVideoSummary | null;
  bingedFromList?: BingeVideoSummary[];
  // Drive file currently picked as the video's thumbnail (id + friendly name
  // so list views can show the chosen filename even when the image hasn't
  // loaded yet). Resolved to a real image via /api/.../thumbnail.
  thumbnailFileId?: string | null;
  thumbnailFileName?: string | null;
  // Used as the cache-buster on the proxied thumbnail URL so list views
  // re-fetch the image immediately after a save.
  updatedAt?: string | null;
  // Wave 2 wizard lineage — non-null on plans created from the wizard.
  // Read-only on the modal; used to detect Wave 2 plans + drive the
  // "Idea card lineage" panel via /api/.../lineage.
  rotationSlot?: string | null;
  titlePromise?: string | null;
  visualPeak?: string | null;
  linkedStoryLeadId?: string | null;
  linkedFactIds?: unknown;
}

// Wave 2.5 — payload returned by GET /api/member/content-plans/[id]/lineage.
// Surfaces the story lead + cited facts the wizard pinned to this plan so
// the modal can render a read-only "Idea card lineage" panel without
// re-doing the wizard joins client-side.
interface IdeaLineage {
  rotationSlot: string;
  themeLabel: string;
  titlePromise: string | null;
  visualPeak: string | null;
  thumbnailCallouts: string[];
  storyLead: {
    id: string;
    pattern: string;
    whyItMattersPreview: string;
  } | null;
  facts: Array<{
    id: string;
    neighbourhood: string;
    metricName: string;
    metricLabel: string;
    metricValueString: string;
    monthYear: string;
  }>;
  totalCited: number;
}

interface ThemeOption {
  name: string;
  emoji?: string | null;
  colour?: string | null;
}

interface Props {
  plan: ContentPlan;
  serviceTier: string;
  apiBase: string;
  isAdmin?: boolean;
  memberId?: string;
  themes?: ThemeOption[];
  showProgressTrack?: boolean;
  onClose: () => void;
  onSaved: (updated: ContentPlan) => void;
  onDeleted?: (id: string) => void;
}

function toDateInput(val: string | null) {
  if (!val) return "";
  return new Date(val).toISOString().slice(0, 10);
}

const TOOL_ROUTES: Partial<Record<string, string>> = {
  script: "/member/ai-tools/arc-script-builder",
  review: "/member/ai-tools/script-review",
  title: "/member/ai-tools/title-thumbnail-analyzer",
  description: "/member/ai-tools/description-generator",
  repurpose: "/member/ai-tools/repurpose-content",
};

const ALL_TOOLS = [
  { key: "script", label: "Build Script", icon: "📝" },
  { key: "review", label: "Script Review", icon: "📋" },
  { key: "title", label: "Title & Thumbnail", icon: "🎯" },
  { key: "description", label: "Description Generator", icon: "✍️" },
  { key: "repurpose", label: "Repurpose Content", icon: "♻️" },
];

// First non-blank line of a markdown blob, with leading list/heading/quote
// punctuation stripped. Used as the one-line preview for collapsed
// long-text sections so the card stays compact until the user expands.
function previewLine(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  const firstLine = trimmed.split("\n").find((l) => l.trim()) ?? "";
  return firstLine.replace(/^[#>*\-\s]+/, "").trim();
}

// Compact pill that shows the first line of the section's content (or a
// placeholder when empty) and acts as the click target to expand into the
// full editor. Used by every collapsible long-text block in the modal.
function CollapsedPreview({ value, placeholder, onExpand }: { value: string; placeholder: string; onExpand: () => void }) {
  const preview = previewLine(value);
  return (
    <button
      type="button"
      onClick={onExpand}
      className="w-full text-left flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white hover:border-[#6ba3c7]/50 hover:bg-[#6ba3c7]/5 transition-colors px-3 py-2"
    >
      <span className={`text-xs truncate ${preview ? "text-[#2f3437]" : "italic text-[#2f3437]/40"}`}>
        {preview || placeholder}
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6ba3c7] shrink-0">Edit</span>
    </button>
  );
}

// Colored dot used inside the Status chip + popover so the status chip
// reads at a glance. Maps known statuses to a calm hex; falls back to a
// neutral gray for anything custom we haven't seen.
const STATUS_DOT_COLOR: Record<string, string> = {
  "Idea": "#94a3b8",
  "Drafting": "#a78bfa",
  "Ready to Shoot": "#f59e0b",
  "Shooting": "#f59e0b",
  "Shot - In Post": "#0ea5e9",
  "Ready to Post": "#22c55e",
  "Posted": "#185FA5",
  "Archived": "#9ca3af",
};
function statusDotColor(status: string | null | undefined): string {
  if (!status) return "#cbd5e1";
  return STATUS_DOT_COLOR[status] ?? "#94a3b8";
}

// Compact pill used for the chip strip directly under the title. Acts as
// a button that opens an inline popover (rendered via children render-prop)
// for editing the underlying field. Keeps Status / Theme / Publish date /
// Location off the form grid so the modal opens compact.
function ChipPopover({
  label,
  value,
  dotColor,
  children,
}: {
  label: string;
  value: React.ReactNode;
  dotColor?: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); e.stopPropagation(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 hover:bg-gray-200 transition-colors px-2.5 py-1 text-[12px] text-[#2f3437]/80"
        aria-haspopup="true"
        aria-expanded={open}
      >
        {dotColor && (
          <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} aria-hidden />
        )}
        <span className="text-[#2f3437]/55">{label}:</span>
        <span className="text-[#2f3437] truncate max-w-[140px]">{value}</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[200px] overflow-hidden">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

// One row in the Notion-style content list. Collapsed: label on left, a
// one-line preview (or empty hint) on right. Expanded: pushes its body
// down inline. Only one row in the list expands at a time — controlled
// from the parent via `expanded` + `onToggle`. `action` is an optional
// AI-generator link (e.g. "Generate Research Prompt →") shown at the
// top right of the expanded body.
function ContentRow({
  label,
  value,
  emptyHint,
  expanded,
  onToggle,
  action,
  children,
}: {
  label: string;
  value: string;
  emptyHint: string;
  expanded: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const preview = previewLine(value);
  const filled = preview.length > 0;
  return (
    <li className="bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-gray-50/60 transition-colors"
        aria-expanded={expanded}
      >
        <span className={`text-[13px] shrink-0 ${filled ? "font-medium text-[#2f3437]" : "text-[#2f3437]/65"}`}>{label}</span>
        <span className="flex items-center gap-2 min-w-0">
          {filled ? (
            <span className="text-[12px] text-[#2f3437]/60 truncate text-right" style={{ maxWidth: "60%", minWidth: 0 }}>
              {preview}
            </span>
          ) : (
            <span className="text-[12px] text-[#2f3437]/40 truncate text-right">{emptyHint}</span>
          )}
          <span className={`text-[#2f3437]/35 transition-transform shrink-0 ${expanded ? "rotate-90" : ""}`}>▸</span>
        </span>
      </button>
      {expanded && (
        <div className="px-3.5 pb-3 pt-1 border-t border-gray-100 space-y-1.5">
          {action && <div className="flex justify-end">{action}</div>}
          {children}
        </div>
      )}
    </li>
  );
}

export default function ContentPlanEditModal({ plan, serviceTier, apiBase, isAdmin, memberId, themes: themesProp = [], showProgressTrack: showProgressTrackProp = false, onClose, onSaved, onDeleted }: Props) {
  // Self-fetch themes when caller didn't supply any (e.g. opened from Pipeline,
  // auto-open URL link, or other entry points). Falls back to caller-supplied list.
  const [fetchedThemes, setFetchedThemes] = useState<ThemeOption[]>([]);
  const themes = themesProp.length > 0 ? themesProp : fetchedThemes;
  useEffect(() => {
    if (themesProp.length > 0 || isAdmin) return;
    fetch("/api/member/content-plans/themes")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.themes) setFetchedThemes(d.themes); })
      .catch(() => {});
  }, [themesProp.length, isAdmin]);

  // Self-fetch the progress-track flag if the caller didn't pass it explicitly
  // so the milestone dots appear regardless of which view opened the modal.
  const [flagShowProgress, setFlagShowProgress] = useState(false);
  const showProgressTrack = showProgressTrackProp || flagShowProgress;
  useEffect(() => {
    if (showProgressTrackProp) return;
    fetch("/api/member/feature-flags")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.flags?.progress_track_v1) setFlagShowProgress(true); })
      .catch(() => {});
  }, [showProgressTrackProp]);

  const router = useRouter();
  const isMobile = useIsMobile();
  const [form, setForm] = useState({
    title: plan.title,
    status: plan.status,
    theme: plan.theme ?? "",
    publishDate: toDateInput(plan.publishDate),
    shootDate: toDateInput(plan.shootDate),
    shootLocation: plan.shootLocation ?? "",
    editDueDate: toDateInput(plan.editDueDate),
    priority: plan.priority ?? "",
    dramaMode: Boolean(plan.dramaMode ?? false),
    notes: plan.notes ?? "",
    script: plan.script ?? "",
    youtubeDescription: (plan as any).youtubeDescription ?? "",
    researchNotes: plan.researchNotes ?? "",
    thoughts: plan.thoughts ?? "",
    thumbnailWords: plan.thumbnailWords ?? "",
    footageLink: plan.footageLink ?? "",
    linkedCampaignId: plan.linkedCampaignId ?? "",
    bingeVideoId: plan.bingeVideoId ?? "",
    manualSteps: Array.isArray((plan as any).manualSteps) ? ((plan as any).manualSteps as string[]) : [],
  });
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string }>>([]);

  // Binge Video selector state. Options are loaded lazily the first time the
  // dropdown opens (one fetch per modal session) so users who never touch the
  // field don't pay for the extra roundtrip.
  const [bingeOpen, setBingeOpen] = useState(false);
  const [bingeQuery, setBingeQuery] = useState("");
  const [bingeOptions, setBingeOptions] = useState<BingeVideoSummary[]>([]);
  const [bingeLoaded, setBingeLoaded] = useState(false);
  const [bingeLoading, setBingeLoading] = useState(false);
  const bingeRef = useRef<HTMLDivElement>(null);
  const bingeSearchRef = useRef<HTMLInputElement>(null);

  // Lazy-load the option list the first time the dropdown is opened.
  useEffect(() => {
    if (!bingeOpen || bingeLoaded || bingeLoading) return;
    setBingeLoading(true);
    fetch(`${apiBase}/list-for-binge-selector?excludeId=${encodeURIComponent(plan.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (Array.isArray(d?.plans)) {
          setBingeOptions(d.plans as BingeVideoSummary[]);
          setBingeLoaded(true);
        }
      })
      .catch(() => {})
      .finally(() => setBingeLoading(false));
  }, [bingeOpen, bingeLoaded, bingeLoading, apiBase, plan.id]);

  // Close the dropdown on outside click + Escape, and auto-focus the search
  // input when it opens so members can start typing immediately.
  useEffect(() => {
    if (!bingeOpen) return;
    const onDown = (e: MouseEvent) => {
      if (bingeRef.current && !bingeRef.current.contains(e.target as Node)) {
        setBingeOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setBingeOpen(false); e.stopPropagation(); }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    // Defer focus to next tick so the input is mounted.
    const t = window.setTimeout(() => bingeSearchRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.clearTimeout(t);
    };
  }, [bingeOpen]);

  // Resolve the currently-selected binge target. Prefer the freshly-loaded
  // option (latest title/theme) over the snapshot bundled with the plan, but
  // fall back to the snapshot so the chip renders even before the options
  // list has been fetched.
  const selectedBinge: BingeVideoSummary | null = (() => {
    const id = form.bingeVideoId;
    if (!id) return null;
    const fromOpts = bingeOptions.find((o) => o.id === id);
    if (fromOpts) return fromOpts;
    return plan.bingeVideo ?? null;
  })();

  // Render a theme name with its emoji prefix (when known) so binge options
  // and reverse-link rows match the rest of the modal's theme styling.
  function formatTheme(themeName: string | null): string {
    if (!themeName) return "";
    const t = themes.find((x) => x.name === themeName);
    return t?.emoji ? `${t.emoji} ${themeName}` : themeName;
  }

  // Filter options by case-insensitive substring match on title.
  const filteredBingeOptions = (() => {
    const q = bingeQuery.trim().toLowerCase();
    if (!q) return bingeOptions;
    return bingeOptions.filter((o) => o.title.toLowerCase().includes(q));
  })();

  // "Open" affordance on a Binged FROM row: navigate to the same auto-open
  // URL pattern the planner client already supports (?plan=<id>) and close
  // the current modal. The parent listens for that param and re-opens with
  // the new plan, so the user lands directly in the linked video's editor.
  function handleOpenLinkedPlan(targetId: string) {
    onClose();
    if (typeof window !== "undefined") {
      const u = new URL(window.location.href);
      u.searchParams.set("plan", targetId);
      router.replace(`${u.pathname}${u.search}`);
    }
  }

  useEffect(() => {
    // Sprint 3 Part D: load user's campaigns for the lead-magnet linker dropdown.
    // Skipped in admin context (admins use a different campaigns scope).
    if (isAdmin) return;
    fetch("/api/campaigns")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => Array.isArray(d) && setCampaigns(d.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))))
      .catch(() => {});
  }, [isAdmin]);
  const [driveFolderLink, setDriveFolderLink] = useState(plan.driveFolderLink);
  // Locally tracked thumbnail pick — applied immediately on click so the
  // preview updates without a save round-trip; persisted on next save.
  const [thumbnailFileId, setThumbnailFileId] = useState<string | null>(plan.thumbnailFileId ?? null);
  const [thumbnailFileName, setThumbnailFileName] = useState<string | null>(plan.thumbnailFileName ?? null);
  // Bumped after each save so the proxied image refetches even when the file
  // id hasn't changed (Drive contents may have been replaced).
  const [thumbVersion, setThumbVersion] = useState(0);
  // Tracks which long-text sections are currently expanded into their full
  // editor. Default-collapsed for every key so the modal opens compact; the
  // user clicks the preview pill (or the header Expand button) to edit.
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const isSectionExpanded = (key: string) => !!expandedSections[key];
  const toggleSection = (key: string) => setExpandedSections((s) => ({ ...s, [key]: !s[key] }));
  // Title-bar character counter only renders while the title input is
  // focused, per the Zone 2 spec — keeps the hero row quiet at rest.
  const [titleFocused, setTitleFocused] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  // Single-row expansion for the new Content list (Notion-style). Only one
  // of the five rows can be open at a time so the list stays compact.
  const [contentRowExpanded, setContentRowExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderError, setFolderError] = useState("");
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [artifacts, setArtifacts] = useState<PlanArtifactsByType>({});
  const [viewingArtifact, setViewingArtifact] = useState<{ id: string; type: string; content: string; label: string } | null>(null);
  const [editingArtifactContent, setEditingArtifactContent] = useState("");
  const [savingArtifact, setSavingArtifact] = useState(false);
  const [savedArtifact, setSavedArtifact] = useState(false);
  const [artifactSaveError, setArtifactSaveError] = useState<string | null>(null);
  // Tracks the currently visible artifact id so async save handlers can
  // verify the user hasn't switched away before applying their results.
  const viewingArtifactIdRef = useRef<string | null>(null);
  useEffect(() => {
    viewingArtifactIdRef.current = viewingArtifact?.id ?? null;
  }, [viewingArtifact]);
  const savedTimeoutRef = useRef<number | null>(null);
  // Gate the artifact-viewer portal until after first client mount so SSR
  // doesn't try to read document.body.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [copiedArtifact, setCopiedArtifact] = useState(false);
  const copiedTimeoutRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (copiedTimeoutRef.current) window.clearTimeout(copiedTimeoutRef.current);
  }, []);
  const [showAllTools, setShowAllTools] = useState(false);
  const [teamNotes, setTeamNotes] = useState<Array<{ id: string; note: string; createdAt: string; author: { name: string } }>>([]);
  const [driveFiles, setDriveFiles] = useState<Array<{ id: string; name: string; webViewLink: string | null; modifiedTime: string | null; mimeType: string | null }> | null>(null);
  const [driveFilesLoading, setDriveFilesLoading] = useState(false);
  const [avatarData, setAvatarData] = useState<any>(null);
  const [researchPromptCopied, setResearchPromptCopied] = useState(false);
  const [researchPromptError, setResearchPromptError] = useState("");

  // Wave 2.5 — "Idea card lineage" panel. Only fetched when the plan
  // was created by the Wave 2 wizard (rotationSlot is non-null), so v1
  // plans pay zero network cost on open.
  const [lineage, setLineage] = useState<IdeaLineage | null>(null);
  const [showAllLineageFacts, setShowAllLineageFacts] = useState(false);
  useEffect(() => {
    // Always clear at plan-change start so a stale lineage from a previous
    // plan can never bleed through (e.g. fetch fails / returns lineage:null
    // for the new plan). Also reset the show-more toggle so the new plan
    // starts collapsed.
    setLineage(null);
    setShowAllLineageFacts(false);
    if (!plan.rotationSlot) return;
    let cancelled = false;
    fetch(`/api/member/content-plans/${plan.id}/lineage`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setLineage(d?.lineage ? (d.lineage as IdeaLineage) : null);
      })
      .catch(() => { if (!cancelled) setLineage(null); });
    return () => { cancelled = true; };
  }, [plan.id, plan.rotationSlot]);

  useEffect(() => {
    if (isAdmin) return;
    fetch("/api/member/avatar")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setAvatarData(d); })
      .catch(() => {});
  }, [isAdmin]);

  async function generateResearchPrompt() {
    setResearchPromptError("");
    const t = form.title.trim();
    const tp = form.notes.trim();
    if (!t) {
      setResearchPromptError("Add a title first");
      setTimeout(() => setResearchPromptError(""), 2500);
      return;
    }

    const avatarSection = avatarData?.avatarName
      ? `Name: ${avatarData.avatarName}\n${avatarData.full_document || avatarData.avatarSummary || JSON.stringify(avatarData, null, 2)}`
      : "(No avatar saved — write for a general real estate audience.)";

    const themeLine = form.theme ? `Theme / Series: ${form.theme}` : "";
    const publishLine = form.publishDate ? `Planned publish date: ${form.publishDate}` : "";
    const todayLine = `Today's date (for recency of stats): ${new Date().toISOString().slice(0, 10)}`;

    const prompt = `You are a senior real-estate research analyst preparing a deep research brief for a YouTube video. Your job is to gather **specific, verifiable, recent, sourced data** that I can confidently say on camera. Generic advice or vague summaries are not acceptable.

=== VIDEO CONTEXT ===
Title: "${t}"
${themeLine}
${publishLine}
${todayLine}

${tp ? `=== TALKING POINTS / OUTLINE (the spine of the video) ===\n${tp}\n` : "=== TALKING POINTS ===\n(None provided — infer the most important angles from the title and avatar.)\n"}
=== TARGET AVATAR (who is watching) ===
${avatarSection}

=== WHAT I NEED FROM YOU ===
Produce a research brief I can hand to a script writer. For **each talking point above** (or, if none, for the 5–7 strongest sub-topics implied by the title), deliver every section below. Do not skip sections. If a section has no good data, say "no reliable data found" — do not invent.

1. **HARD STATS & DATA (must be sourced)**
   - Specific numbers, percentages, dollar/local-currency amounts, year-over-year deltas, transaction volumes, days-on-market, price-to-income ratios, mortgage/interest rates, inventory counts, absorption rates, etc.
   - Prefer **local market data** for the avatar's city/metro/region; fall back to state/province, then national. Detect the country and region from the avatar and title — this video could be for any realtor in any city in North America (US, Canada, or Mexico).
   - For every figure: include the **source name, date, and a working URL**. Use the most authoritative source for that geography, for example:
     • **Local market** — the local MLS, association of REALTORS®, or real estate board (e.g. CAR/NAR local chapters in the US; CREB, TRREB, REBGV, QPAREB in Canada; AMPI in Mexico).
     • **National market** — NAR, Redfin, Zillow, Realtor.com, FRED, U.S. Census, HUD (US); CREA, CMHC, Statistics Canada (Canada); INEGI, SHF (Mexico).
     • **Rates / macro** — Federal Reserve / Freddie Mac PMMS (US); Bank of Canada (Canada); Banco de México (Mexico).
     • **Policy / regulatory** — state real estate commissions, CFPB, IRS (US); provincial regulators like RECO/RECA/BCFSA, CRA (Canada); CONDUSEF, CNBV (Mexico).
   - Distinguish "as of [date]" from older data. Flag anything older than 12 months as "dated — use with caution."

2. **MARKET CONTEXT & RECENT NEWS (last 6–12 months)**
   - What has changed recently in this specific market that makes this video timely? Central bank rate moves, policy or tax changes (e.g. NAR commission settlement, state/provincial transfer-tax updates, first-time buyer programs, zoning reform, rent control, foreign buyer rules), new lending products, headline transactions or local development news.
   - Each item with date + source URL, and note whether it is local, regional, or national.

3. **MAIN ARGUMENT & UNIQUE ANGLE**
   - The single sharpest thesis the data supports. What contrarian, counter-intuitive, or under-told point can I credibly make?
   - Why this angle wins for *this* avatar specifically.

4. **AVATAR PAIN POINTS, FEARS & DESIRES**
   - The internal monologue of the avatar on this topic — fears, frustrations, secret hopes, money worries, status concerns, family pressure.
   - Tie each pain point to a specific stat or quote above so it lands with proof.

5. **MYTHS & MISCONCEPTIONS TO BUST**
   - What "common knowledge" is wrong or incomplete on this topic? State the myth, then the counter-truth with a source.

6. **CONVENTIONAL WISDOM (what other agents / mainstream media are saying)**
   - 3–5 representative takes from competing voices (other Realtors on YouTube, big brokerages, news outlets, banks). Quote or paraphrase + link.
   - This is so I can position *against* the noise, not repeat it.

7. **CONCRETE EXAMPLES, CASE STUDIES & MICRO-STORIES**
   - Real (or realistic, clearly hypothetical) buyer/seller scenarios with numbers — list price vs sold price, carrying costs, bidding-war outcomes, rent vs buy math, mortgage stress-test pass/fail examples.
   - Anonymised is fine; specificity is the point.

8. **VISUAL / B-ROLL & ON-SCREEN DATA SUGGESTIONS**
   - Charts, graphs, screenshots, headlines, neighbourhood shots, or props that would visualise the strongest points. Note which stat each visual supports.

9. **NOTABLE QUOTES & PHRASINGS**
   - Standout lines from analysts, economists, agents, or buyers/sellers worth quoting verbatim. Include attribution + source.

10. **OPEN QUESTIONS / GAPS**
    - What couldn't you find? What should the agent verify locally before recording (e.g., this week's local board stats, current rate sheets)?

=== OUTPUT FORMAT ===
- Markdown, with one ## H2 per talking point and the 10 numbered sections above as ### H3s under each.
- Every stat on its own bullet with: \`figure — short context — Source Name, Date — URL\`.
- Be concise, but complete. No fluff, no filler intros, no closing summary. Just the brief.
- If something is uncertain, say so explicitly. Never fabricate sources or numbers.`;

    try {
      await navigator.clipboard.writeText(prompt);
      setResearchPromptCopied(true);
      setTimeout(() => setResearchPromptCopied(false), 2500);
    } catch {
      setResearchPromptError("Could not copy");
      setTimeout(() => setResearchPromptError(""), 2500);
    }
  }

  useEffect(() => {
    // Clear any prior plan's artifacts immediately so a stale Repurposed
    // Content list never leaks across plan switches or when the endpoint
    // returns 403 (e.g. tool_planner_linkage flag off).
    setArtifacts({});
    fetch(`/api/member/content-plans/${plan.id}/artifacts`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.artifacts) setArtifacts(d.artifacts); })
      .catch(() => {});
  }, [plan.id]);

  useEffect(() => {
    if (isAdmin) return;
    fetch(`/api/member/content-plans/${plan.id}/team-notes`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.notes) setTeamNotes(d.notes); })
      .catch(() => {});
  }, [plan.id, isAdmin]);

  // Sprint 6 — fetch Drive folder contents when a folder exists. API returns
  // an empty list when the drive_auto_upload flag is off, which transparently
  // collapses the section.
  useEffect(() => {
    if (!driveFolderLink) { setDriveFiles(null); return; }
    setDriveFilesLoading(true);
    fetch(`/api/member/content-plans/${plan.id}/drive-files`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setDriveFiles(d.files ?? []); })
      .catch(() => {})
      .finally(() => setDriveFilesLoading(false));
  }, [plan.id, driveFolderLink]);

  // Seed/reset the editable copy + status flags whenever the user opens or
  // closes the artifact viewer so the editor starts on the latest saved
  // content and clears stale "Saved"/error states between artifacts. Also
  // cancels any pending "Saved" auto-clear timeout so it can't fire against
  // a different artifact later.
  useEffect(() => {
    if (savedTimeoutRef.current !== null) {
      window.clearTimeout(savedTimeoutRef.current);
      savedTimeoutRef.current = null;
    }
    if (viewingArtifact) {
      setEditingArtifactContent(viewingArtifact.content);
      setSavedArtifact(false);
      setArtifactSaveError(null);
    } else {
      setEditingArtifactContent("");
      setSavingArtifact(false);
      setSavedArtifact(false);
      setArtifactSaveError(null);
    }
  }, [viewingArtifact]);

  // Defensive cleanup: cancel any pending "Saved" auto-clear if the parent
  // modal unmounts while a save is in flight, to avoid setState-after-unmount.
  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current !== null) {
        window.clearTimeout(savedTimeoutRef.current);
        savedTimeoutRef.current = null;
      }
    };
  }, []);

  // Persist edits to the underlying plan artifact. After a successful save we
  // refresh the artifact list so the side panel reflects the new content and
  // updated timestamp without requiring the user to reopen the plan.
  async function saveArtifactEdits() {
    if (!viewingArtifact) return;
    // Capture which artifact is being saved and what content is being sent
    // so that if the user switches to another artifact (or closes the
    // modal) before this request resolves, we can drop the late response
    // instead of clobbering the new artifact's editor or showing a stale
    // "Saved" badge on the wrong item.
    const savingId = viewingArtifact.id;
    const contentAtSave = editingArtifactContent;
    setSavingArtifact(true);
    setSavedArtifact(false);
    setArtifactSaveError(null);
    try {
      const res = await fetch(
        `/api/member/content-plans/${plan.id}/artifacts/${savingId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: contentAtSave }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save");
      }
      const refreshed = await fetch(`/api/member/content-plans/${plan.id}/artifacts`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (refreshed?.artifacts) setArtifacts(refreshed.artifacts);
      // Only apply UI feedback if the user is still viewing the same artifact
      // they were saving — otherwise drop the response silently so we don't
      // overwrite a different artifact's editor or flash a misleading badge.
      if (viewingArtifactIdRef.current === savingId) {
        setViewingArtifact((prev) =>
          prev && prev.id === savingId ? { ...prev, content: contentAtSave } : prev
        );
        setSavedArtifact(true);
        if (savedTimeoutRef.current !== null) {
          window.clearTimeout(savedTimeoutRef.current);
        }
        savedTimeoutRef.current = window.setTimeout(() => {
          setSavedArtifact(false);
          savedTimeoutRef.current = null;
        }, 2500);
      }
    } catch (err) {
      if (viewingArtifactIdRef.current === savingId) {
        setArtifactSaveError(err instanceof Error ? err.message : "Failed to save");
      }
    } finally {
      if (viewingArtifactIdRef.current === savingId) {
        setSavingArtifact(false);
      }
    }
  }

  const REPURPOSE_LABELS: Record<string, string> = {
    repurpose_newsletter: "📧 Newsletter",
    repurpose_linkedin:   "💼 LinkedIn Article",
    repurpose_facebook:   "📘 Facebook Post",
    repurpose_blog:       "📰 Blog Post",
    repurpose_postcard:   "📮 Postcard",
  };

  const repurposeArtifacts = Object.entries(artifacts)
    .filter(([type]) => type.startsWith("repurpose_"))
    .map(([type, list]) => ({ type, latest: list?.[0] ?? null }))
    .filter((x) => x.latest && (x.latest.content?.toString().trim().length ?? 0) > 0);

  // Sprint 3 Part A: extract latest script_review score for badge display
  const latestReviewScore = (() => {
    const review = artifacts?.script_review?.[0];
    if (!review) return null;
    const meta = (review.metadata ?? {}) as { overallScore?: number | null };
    const score = typeof meta.overallScore === "number" ? meta.overallScore : null;
    return score;
  })();

  // Seed the appropriate sessionStorage prefill for a given tool key so the
  // destination tool can pick up title / notes / script as expected. Used by
  // every launch point in the modal — inline field buttons, the progress
  // track's "Suggested next" link, and the "All tools for this plan" grid —
  // so the hand-off works no matter which entry the user clicks.
  function seedToolPrefill(key: string) {
    if (typeof window === "undefined") return;
    if (key === "script") {
      const talkingPoints = form.notes.split("\n").map((l) => l.trim()).filter(Boolean);
      sessionStorage.setItem(
        "arc_prefill",
        JSON.stringify({ planId: plan.id, title: form.title, talkingPoints, dramaMode: form.dramaMode })
      );
    } else if (key === "title") {
      sessionStorage.setItem(
        "title_prefill",
        JSON.stringify({
          planId: plan.id,
          title: form.title,
          // Carry the script (used as the intro transcript) and the
          // member's planned thumbnail words so the analyzer can pre-fill
          // both fields instead of starting from blank.
          transcript: form.script,
          thumbnailWords: form.thumbnailWords,
          dramaMode: form.dramaMode,
        })
      );
    } else if (key === "review") {
      sessionStorage.setItem(
        "script_review_prefill",
        JSON.stringify({ planId: plan.id, title: form.title, script: form.script, dramaMode: form.dramaMode })
      );
    } else if (key === "description") {
      sessionStorage.setItem(
        "description_prefill",
        JSON.stringify({ title: form.title, transcript: form.script, contentPlanId: plan.id, dramaMode: form.dramaMode })
      );
    } else if (key === "repurpose") {
      sessionStorage.setItem(
        "repurpose_prefill",
        JSON.stringify({ planId: plan.id, title: form.title, transcript: form.script, dramaMode: form.dramaMode })
      );
    }
  }

  function launchTool(key: string) {
    const route = TOOL_ROUTES[key];
    if (!route) return;
    seedToolPrefill(key);
    router.push(buildToolUrl(route, { planId: plan.id, returnTo: "/member/content-planner" }));
  }

  function handleStepClick(key: string) {
    launchTool(key);
  }

  // Toggle a manual progress-step check. We compute `next` inside the
  // functional updater so back-to-back clicks (Review then Title before React
  // re-renders) don't both read the same stale `form.manualSteps` and clobber
  // each other. The PUT is fired from the updater with the freshly-computed
  // list; on failure we rewind to the snapshot we captured on entry.
  async function handleToggleManualStep(key: string) {
    let prevSnapshot: string[] = [];
    let nextSnapshot: string[] = [];
    setForm((f) => {
      prevSnapshot = f.manualSteps;
      nextSnapshot = f.manualSteps.includes(key)
        ? f.manualSteps.filter((k) => k !== key)
        : [...f.manualSteps, key];
      return { ...f, manualSteps: nextSnapshot };
    });
    try {
      const res = await fetch(`${apiBase}/${plan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manualSteps: nextSnapshot }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setForm((f) => ({ ...f, manualSteps: prevSnapshot }));
      setError("Couldn't save your check — try again.");
    }
  }

  const manualStepSet = new Set(form.manualSteps);
  const progressSteps = showProgressTrack
    ? resolveProgressSteps(
        { id: plan.id, status: form.status, script: form.script },
        artifacts,
        handleStepClick,
        manualStepSet,
        handleToggleManualStep
      )
    : [];
  const suggestedNext = showProgressTrack ? getSuggestedNextStep(progressSteps) : null;

  const showEditDue = hasEditDueDate(serviceTier);
  const useDrive = hasDriveFolder(serviceTier);
  const statusOptions = getStatusOptions(serviceTier);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  async function handleSave(): Promise<boolean> {
    if (!form.title.trim()) { setError("Title is required."); return false; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${apiBase}/${plan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          status: form.status,
          theme: form.theme || null,
          publishDate: form.publishDate || null,
          shootDate: form.shootDate || null,
          shootLocation: form.shootLocation || null,
          editDueDate: form.editDueDate || null,
          priority: form.priority || null,
          dramaMode: Boolean(form.dramaMode),
          notes: form.notes || null,
          script: form.script || null,
          youtubeDescription: form.youtubeDescription || null,
          researchNotes: form.researchNotes || null,
          thoughts: form.thoughts || null,
          thumbnailWords: form.thumbnailWords || null,
          footageLink: form.footageLink || null,
          linkedCampaignId: form.linkedCampaignId || null,
          bingeVideoId: form.bingeVideoId || null,
          thumbnailFileId: thumbnailFileId || null,
          thumbnailFileName: thumbnailFileName || null,
          // Include manualSteps in every Save so the PUT response (which the
          // parent uses as the authoritative plan) always carries the latest
          // manual checks. Without this, a Save that races with a per-step
          // toggle PUT can hand the parent a stale plan whose manualSteps
          // arrived before the user's click — and the boxes appear unchecked
          // when the modal is re-opened.
          manualSteps: form.manualSteps,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      if (data.plan?.driveFolderLink) setDriveFolderLink(data.plan.driveFolderLink);
      setThumbVersion((v) => v + 1);
      onSaved(data.plan);
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
      return false;
    } finally {
      setSaving(false);
    }
  }

  // Backdrop click → auto-save then close. If the save fails (e.g. missing
  // required title), keep the modal open and surface the error instead of
  // silently discarding the user's edits.
  async function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return; // ignore clicks bubbling from the panel
    if (saving) return;
    const ok = await handleSave();
    if (ok) onClose();
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`${apiBase}/${plan.id}`, { method: "DELETE" });
      onDeleted?.(plan.id);
      onClose();
    } catch { setError("Failed to delete"); } finally {
      setDeleting(false);
    }
  }

  async function handleCreateFolder() {
    setCreatingFolder(true);
    setFolderError("");
    try {
      const mid = memberId ?? apiBase.match(/members\/([^/]+)/)?.[1];
      if (!mid) throw new Error("Cannot determine member ID");
      const res = await fetch(`/api/admin/members/${mid}/content-plans/${plan.id}/drive-folder`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create folder");
      setDriveFolderLink(data.driveFolderLink);
    } catch (e: unknown) {
      setFolderError(e instanceof Error ? e.message : "Failed to create folder");
    } finally {
      setCreatingFolder(false);
    }
  }

  const field = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/30";

  function pushToAITool(tool: "title" | "script-builder" | "script-review") {
    // Delegate to the unified launcher so prefill seeding stays in one place.
    if (tool === "title") launchTool("title");
    else if (tool === "script-builder") launchTool("script");
    else launchTool("review");
  }

  function downloadScript(format: "md" | "txt" | "pdf") {
    setShowDownloadMenu(false);
    const title = form.title || "script";
    const script = form.script || "";
    const safeName = title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

    if (format === "md") {
      const content = `# ${title}\n\n${script}`;
      const blob = new Blob([content], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${safeName}.md`; a.click();
      URL.revokeObjectURL(url);
    } else if (format === "txt") {
      const content = `${title}\n${"=".repeat(title.length)}\n\n${script}`;
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${safeName}.txt`; a.click();
      URL.revokeObjectURL(url);
    } else {
      const win = window.open("", "_blank");
      if (!win) return;
      win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>
        body { font-family: Georgia, serif; max-width: 700px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.7; }
        h1 { font-size: 1.6rem; margin-bottom: 1.5rem; border-bottom: 2px solid #eee; padding-bottom: 0.5rem; }
        pre { white-space: pre-wrap; word-break: break-word; font-family: inherit; font-size: 1rem; margin: 0; }
        @media print { body { margin: 20px; } }
      </style></head><body><h1>${title}</h1><pre>${script.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre></body></html>`);
      win.document.close();
      win.focus();
      setTimeout(() => { win.print(); }, 300);
    }
  }

  return (
    <div
      onClick={handleBackdropClick}
      className={
        isMobile
          ? "fixed inset-0 bg-white z-50 overflow-y-auto"
          : "fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto lg:pl-[260px]"
      }
    >
      <div
        className={
          isMobile
            ? "bg-white w-full min-h-full flex flex-col"
            // Bound the desktop modal to the viewport and turn it into a flex
            // column so the footer (Save / Cancel / Delete) can stick to the
            // bottom while the body scrolls — see Zone 9 of the redesign spec.
            : "bg-white rounded-xl shadow-xl w-full max-w-lg lg:max-w-3xl xl:max-w-4xl my-8 max-h-[90vh] flex flex-col"
        }
      >
        <div
          className={
            isMobile
              ? "sticky top-0 z-20 bg-white/95 backdrop-blur-sm flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100"
              : "flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100"
          }
          style={isMobile ? { paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" } : undefined}
        >
          <h3 className="text-base font-semibold text-[#2f3437]">Edit Video</h3>
          <button onClick={onClose} className="text-[#2f3437]/40 hover:text-[#2f3437] p-1 -mr-1">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        <div className={isMobile ? "px-4 py-4 space-y-4 pb-32" : "px-6 py-5 space-y-4 flex-1 overflow-y-auto"}>

            {/* Zone 2 — Title row + thumbnail chip + focus-only character counter.
                Sits directly under the modal header so the most important field
                (what is this video called?) is the first thing the user sees. */}
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <input
                  ref={titleInputRef}
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  onFocus={() => setTitleFocused(true)}
                  onBlur={() => setTitleFocused(false)}
                  placeholder="Untitled video"
                  className="w-full bg-transparent border-0 focus:ring-0 px-0 py-1 font-medium text-[#2f3437] placeholder:text-[#2f3437]/30"
                  style={{ fontSize: 19, lineHeight: 1.3 }}
                  aria-label="Video title"
                />
                {titleFocused ? (
                  <div className={`text-[11px] mt-0.5 ${form.title.length > 80 ? "text-red-500" : form.title.length > 60 ? "text-amber-500" : "text-[#2f3437]/40"}`}>
                    {form.title.length} / 60 characters
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => titleInputRef.current?.focus()}
                    className="mt-0.5 text-[10px] uppercase tracking-wider text-[#2f3437]/40 hover:text-[#185FA5] transition-colors"
                    title="Edit title"
                  >
                    Edit
                  </button>
                )}
              </div>
              {/* 64×36 thumbnail preview chip on the right edge of the title row. */}
              {thumbnailFileId ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/member/content-plans/${plan.id}/thumbnail?v=${thumbVersion}`}
                  alt="Selected thumbnail"
                  className="shrink-0 rounded-md bg-gray-100 object-cover border border-gray-200"
                  style={{ width: 112, height: 63 }}
                />
              ) : (
                <div
                  className="shrink-0 rounded-md bg-gray-50 border border-dashed border-gray-300 flex items-center justify-center text-[9px] uppercase tracking-wider text-[#2f3437]/40"
                  style={{ width: 112, height: 63 }}
                  aria-label="No thumbnail set"
                >
                  Thumb
                </div>
              )}
            </div>

            {/* Zone 2c — Chip strip. Status / Theme / Drama Mode / Publish date /
                Shoot location each render as a clickable pill that opens an
                inline popover. Replaces the old full-width fields for these
                properties. */}
            <div className="flex flex-wrap items-center gap-2">
              <ChipPopover
                label="Status"
                value={form.status || "—"}
                dotColor={statusDotColor(form.status)}
              >
                {(close) => (
                  <div className="p-1 min-w-[200px] max-h-72 overflow-y-auto">
                    {statusOptions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => { setForm((f) => ({ ...f, status: s })); close(); }}
                        className={`w-full text-left px-3 py-1.5 text-xs rounded hover:bg-gray-50 flex items-center gap-2 ${form.status === s ? "bg-[#185FA5]/5 text-[#185FA5] font-medium" : "text-[#2f3437]"}`}
                      >
                        <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: statusDotColor(s) }} aria-hidden />
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </ChipPopover>

              <ChipPopover
                label="Theme"
                value={form.theme ? formatTheme(form.theme) : "No theme"}
              >
                {(close) => (
                  <div className="p-1 min-w-[220px] max-h-72 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => { setForm((f) => ({ ...f, theme: "" })); close(); }}
                      className={`w-full text-left px-3 py-1.5 text-xs rounded hover:bg-gray-50 ${!form.theme ? "bg-[#185FA5]/5 text-[#185FA5] font-medium" : "italic text-[#2f3437]/55"}`}
                    >
                      — none —
                    </button>
                    {themes.length > 0 ? themes.map((t) => (
                      <button
                        key={t.name}
                        type="button"
                        onClick={() => { setForm((f) => ({ ...f, theme: t.name })); close(); }}
                        className={`w-full text-left px-3 py-1.5 text-xs rounded hover:bg-gray-50 ${form.theme === t.name ? "bg-[#185FA5]/5 text-[#185FA5] font-medium" : "text-[#2f3437]"}`}
                      >
                        {t.emoji ? `${t.emoji} ${t.name}` : t.name}
                      </button>
                    )) : (
                      <p className="px-3 py-2 text-[11px] italic text-[#2f3437]/45">No themes yet — add some in Settings.</p>
                    )}
                  </div>
                )}
              </ChipPopover>

              {/* Drama Mode is binary, so it's a self-toggling chip rather than
                  a popover. Click toggles On/Off. */}
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, dramaMode: !f.dramaMode }))}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] transition-colors ${form.dramaMode ? "bg-[#185FA5]/10 text-[#185FA5] font-medium" : "bg-gray-100 text-[#2f3437]/80 hover:bg-gray-200"}`}
                role="switch"
                aria-checked={form.dramaMode}
                title="Drama Mode — flag as the monthly wide-net video"
              >
                <span className="text-[#2f3437]/55">Drama:</span>
                <span>{form.dramaMode ? "On" : "Off"}</span>
              </button>

              <ChipPopover
                label="Publish"
                value={form.publishDate || "Not set"}
              >
                {(close) => (
                  <div className="p-2 min-w-[200px]">
                    <input
                      type="date"
                      value={form.publishDate}
                      onChange={(e) => setForm((f) => ({ ...f, publishDate: e.target.value }))}
                      className={field}
                      autoFocus
                    />
                    <div className="flex justify-between gap-2 mt-2">
                      <button type="button" onClick={() => { setForm((f) => ({ ...f, publishDate: "" })); }} className="text-[11px] text-[#2f3437]/50 hover:text-red-500">Clear</button>
                      <button type="button" onClick={close} className="text-[11px] font-medium text-[#185FA5] hover:underline">Done</button>
                    </div>
                  </div>
                )}
              </ChipPopover>

              <ChipPopover
                label="Location"
                value={form.shootLocation || "Not set"}
              >
                {(close) => (
                  <div className="p-1 min-w-[200px]">
                    {[
                      { value: "", label: "Not set", italic: true },
                      { value: "In Studio", label: "In Studio" },
                      { value: "Out of Studio", label: "Out of Studio" },
                    ].map((opt) => (
                      <button
                        key={opt.value || "none"}
                        type="button"
                        onClick={() => { setForm((f) => ({ ...f, shootLocation: opt.value })); close(); }}
                        className={`w-full text-left px-3 py-1.5 text-xs rounded hover:bg-gray-50 ${form.shootLocation === opt.value ? "bg-[#185FA5]/5 text-[#185FA5] font-medium" : opt.italic ? "italic text-[#2f3437]/55" : "text-[#2f3437]"}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </ChipPopover>

              {/* Right-side affordances on the same row: Title analyser link
                  (legacy mode) or Review-score badge (Progress Track mode). */}
              {!showProgressTrack && (
                <button type="button" onClick={() => pushToAITool("title")} className="ml-auto text-[11px] text-[#185FA5] hover:underline">Analyse title →</button>
              )}
              {showProgressTrack && latestReviewScore !== null && (
                <span
                  title="Latest Script Review score"
                  className={`ml-auto inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded ${getScoreBadgeClasses(latestReviewScore)}`}
                >
                  Review {latestReviewScore.toFixed(1)}/10
                </span>
              )}
            </div>

            {/* Wave 2.5 — Idea card lineage. Read-only panel that shows the
                theme, title promise, visual peak, thumbnail callouts, the
                Story Lead the wizard anchored on, and the cited market
                facts. Only rendered for plans the wizard created (i.e.
                rotationSlot is non-null on the plan + lineage payload
                resolved). v1 plans see nothing. */}
            {lineage && (
              <div className="rounded-xl border border-[#185FA5]/20 bg-[#185FA5]/[0.03] px-4 py-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#185FA5]">
                    🎯 Idea card lineage
                  </p>
                  <span className="inline-flex items-center rounded-md bg-[#185FA5]/10 px-2 py-0.5 text-[11px] font-semibold text-[#185FA5]">
                    {lineage.themeLabel}
                  </span>
                </div>

                {lineage.titlePromise && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#2f3437]/50 mb-0.5">Title promise</p>
                    <p className="text-xs text-[#2f3437] leading-snug">{lineage.titlePromise}</p>
                  </div>
                )}

                {lineage.visualPeak && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#2f3437]/50 mb-0.5">Visual peak</p>
                    <p className="text-xs text-[#2f3437] leading-snug">{lineage.visualPeak}</p>
                  </div>
                )}

                {lineage.thumbnailCallouts.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#2f3437]/50 mb-1">Thumbnail words</p>
                    <div className="flex flex-wrap gap-1.5">
                      {lineage.thumbnailCallouts.map((c, i) => (
                        <span key={i} className="inline-flex items-center rounded-md bg-white border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-[#2f3437]">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {lineage.storyLead && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#2f3437]/50 mb-0.5">Story lead</p>
                    <p className="text-xs text-[#2f3437] leading-snug font-medium">{lineage.storyLead.pattern}</p>
                    {lineage.storyLead.whyItMattersPreview && (
                      <p className="text-[11px] text-[#2f3437]/65 leading-snug mt-0.5">
                        {lineage.storyLead.whyItMattersPreview}
                      </p>
                    )}
                  </div>
                )}

                {lineage.totalCited > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#2f3437]/50 mb-1">
                      Cited facts ({lineage.facts.length}/{lineage.totalCited})
                    </p>
                    <ul className="space-y-1">
                      {(showAllLineageFacts ? lineage.facts : lineage.facts.slice(0, 5)).map((f) => (
                        <li key={f.id} className="text-[11px] text-[#2f3437] leading-snug flex flex-wrap items-baseline gap-x-1.5">
                          <span className="font-medium">{f.neighbourhood}</span>
                          <span className="text-[#2f3437]/60">·</span>
                          <span>{f.metricLabel}</span>
                          {f.metricValueString && (
                            <>
                              <span className="text-[#2f3437]/60">·</span>
                              <span className="font-mono text-[#2f3437]/80">{f.metricValueString}</span>
                            </>
                          )}
                          {f.monthYear && (
                            <span className="text-[#2f3437]/45">({f.monthYear})</span>
                          )}
                        </li>
                      ))}
                    </ul>
                    {lineage.facts.length > 5 && (
                      <button
                        type="button"
                        onClick={() => setShowAllLineageFacts((v) => !v)}
                        className="mt-1 text-[11px] font-medium text-[#185FA5] hover:underline"
                      >
                        {showAllLineageFacts ? "Show less" : `Show ${lineage.facts.length - 5} more`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Notes from team banner — surfaced near the top so members see
                feedback the moment they open the modal. */}
            {!isAdmin && teamNotes.length > 0 && (
              <div className="rounded-xl border border-[#6ba3c7]/25 bg-[#6ba3c7]/5 px-4 py-3 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-[#6ba3c7]">📝 Notes from your team</p>
                <ul className="space-y-2">
                  {teamNotes.map((n) => (
                    <li key={n.id} className="text-sm text-[#2f3437]">
                      <p className="whitespace-pre-wrap leading-relaxed">{n.note}</p>
                      <p className="text-[11px] text-[#2f3437]/50 mt-0.5">
                        {n.author.name} · {new Date(n.createdAt).toLocaleDateString()}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Zone 3 — Workflow stepper. Neutral white surface with hairlines;
                circles/check marks/connectors are blue (no green anywhere). */}
            {showProgressTrack && progressSteps.length > 0 && (
              <div className="-mx-6 px-6 py-4 space-y-3 border-y border-gray-200 bg-white">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#2f3437]/50">
                    Workflow{(() => {
                      const total = progressSteps.length;
                      const currentIdx = progressSteps.findIndex((s) => s.status === "current");
                      const doneCount = progressSteps.filter((s) => s.status === "done").length;
                      const stepNum = currentIdx >= 0 ? currentIdx + 1 : Math.min(doneCount + 1, total);
                      return ` · Step ${stepNum} of ${total}`;
                    })()}
                  </span>
                  {suggestedNext && TOOL_ROUTES[suggestedNext.key] && (
                    <button
                      type="button"
                      onClick={() => launchTool(suggestedNext.key)}
                      className="flex items-center gap-1.5 text-xs font-medium text-white bg-[#185FA5] hover:bg-[#134d87] px-3.5 py-1.5 rounded-md transition-colors"
                    >
                      {ALL_TOOLS.find((t) => t.key === suggestedNext.key)?.label} →
                    </button>
                  )}
                </div>
                <ProgressTrack steps={progressSteps} />
                <div>
                  <button
                    type="button"
                    onClick={() => setShowAllTools((v) => !v)}
                    className="text-[11px] text-[#185FA5] hover:underline transition-colors"
                  >
                    {showAllTools ? "Hide tools ▴" : "Show tools ▾"}
                  </button>
                  {showAllTools && (
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      {ALL_TOOLS.map((tool) => (
                        <button
                          key={tool.key}
                          type="button"
                          onClick={() => launchTool(tool.key)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-[#2f3437]/70 bg-white border border-gray-200 rounded-lg hover:border-[#6ba3c7] hover:text-[#6ba3c7] transition-colors"
                        >
                          <span>{tool.icon}</span>
                          <span>{tool.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Zone 4 — Project folder. Collapsed-by-default neutral row.
                Header uses sibling button + anchor (no nested anchor-in-button). */}
            {driveFolderLink && driveFiles && driveFiles.length > 0 && (() => {
              const expanded = isSectionExpanded("projectFolder");
              const fileCount = driveFiles.length;
              return (
                <div className="rounded-lg border border-gray-200 bg-white">
                  <div className="flex items-center justify-between gap-2 pr-3">
                    <button
                      type="button"
                      onClick={() => toggleSection("projectFolder")}
                      className="flex-1 min-w-0 flex items-center justify-start gap-2 px-4 py-2.5 text-left hover:bg-gray-50/60 transition-colors rounded-lg"
                      aria-expanded={expanded}
                    >
                      <span className={`text-[#2f3437]/40 transition-transform ${expanded ? "rotate-90" : ""}`}>▸</span>
                      <span className="text-[13px] font-medium text-[#2f3437]">Project folder</span>
                      <span className="text-[12px] text-[#2f3437]/50 truncate">
                        {fileCount} file{fileCount === 1 ? "" : "s"}{thumbnailFileId ? " · thumbnail set" : ""}
                      </span>
                    </button>
                    <a
                      href={driveFolderLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#185FA5] hover:underline shrink-0 py-2"
                    >
                      <svg viewBox="0 0 87.3 78" className="w-3.5 h-3.5" aria-hidden>
                        <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                        <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z" fill="#00ac47"/>
                        <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                        <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                        <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                        <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                      </svg>
                      Open in Drive ↗
                    </a>
                  </div>
                  {expanded && (
                    <div className="px-4 pb-3 pt-1 space-y-2 border-t border-gray-100">
                      {thumbnailFileId && (
                        <div className="flex items-center gap-3 bg-gray-50 rounded-md border border-gray-200 p-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/member/content-plans/${plan.id}/thumbnail?v=${thumbVersion}`}
                            alt="Selected thumbnail"
                            className="w-20 h-12 object-cover rounded bg-gray-100"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] uppercase tracking-wider font-semibold text-[#2f3437]/60">Thumbnail</p>
                            <p className="text-xs text-[#2f3437] truncate" title={thumbnailFileName ?? ""}>
                              {thumbnailFileName ?? "Selected file"}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => { setThumbnailFileId(null); setThumbnailFileName(null); }}
                            className="text-[11px] font-medium text-[#2f3437]/50 hover:text-red-500 px-1.5"
                            title="Remove thumbnail"
                          >Clear</button>
                        </div>
                      )}
                      <ul className="space-y-0.5">
                        {driveFiles.map((f) => {
                          const isImage = (f.mimeType ?? "").startsWith("image/");
                          const isPicked = f.id === thumbnailFileId;
                          return (
                            <li key={f.id} className="text-xs text-[#2f3437]/80 flex items-center justify-between gap-2 px-1 py-1 rounded hover:bg-gray-50">
                              <a
                                href={f.webViewLink ?? driveFolderLink}
                                target="_blank"
                                rel="noreferrer"
                                className="truncate hover:text-[#185FA5] hover:underline flex-1 min-w-0"
                                title={f.name}
                              >{isImage ? "🖼️" : "📄"} {f.name}</a>
                              <div className="flex items-center gap-2 shrink-0">
                                {isImage && (
                                  isPicked ? (
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#2f3437]/70 bg-gray-100 px-1.5 py-0.5 rounded">Thumbnail</span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => { setThumbnailFileId(f.id); setThumbnailFileName(f.name); }}
                                      className="text-[10px] font-medium text-[#185FA5] hover:underline"
                                    >Set as thumbnail</button>
                                  )
                                )}
                                {f.modifiedTime && (
                                  <span className="text-[10px] text-[#2f3437]/40">{new Date(f.modifiedTime).toLocaleDateString()}</span>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                      {driveFilesLoading && <p className="text-[10px] text-[#2f3437]/40 italic">Refreshing…</p>}
                      {thumbnailFileId && (
                        <p className="text-[10px] text-[#2f3437]/40 italic">Save to apply your thumbnail across the planner.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Zone 5 — Schedule. Three date cards on a neutral white surface.
                Publish date is also editable from the chip strip; this is the
                canonical picker that always shows all three dates side-by-side. */}
            <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#2f3437]/60">Schedule</p>
              <div className={`grid gap-3 grid-cols-1 ${showEditDue ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                <div>
                  <label className="block text-[11px] font-medium text-[#2f3437]/70 mb-1">Shoot date</label>
                  <input type="date" value={form.shootDate} onChange={(e) => setForm((f) => ({ ...f, shootDate: e.target.value }))} className={field} />
                </div>
                {showEditDue && (
                  <div>
                    <label className="block text-[11px] font-medium text-[#2f3437]/70 mb-1">Edit due</label>
                    <input type="date" value={form.editDueDate} onChange={(e) => setForm((f) => ({ ...f, editDueDate: e.target.value }))} className={field} />
                  </div>
                )}
                <div>
                  <label className="block text-[11px] font-medium text-[#2f3437]/70 mb-1">Publish date</label>
                  <input type="date" value={form.publishDate} onChange={(e) => setForm((f) => ({ ...f, publishDate: e.target.value }))} className={field} />
                </div>
              </div>
            </div>

            {/* Zone 6 — Content list. Notion-style: one bordered card with five
                collapsible single-line rows. Only one row is open at a time. */}
            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <p className="px-3.5 pt-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#2f3437]/60">Content</p>
              <ul className="divide-y divide-gray-100 border-t border-gray-100">
                <ContentRow
                  label="Talking points / outline"
                  value={form.notes}
                  emptyHint="Empty · click to add"
                  expanded={contentRowExpanded === "notes"}
                  onToggle={() => setContentRowExpanded((c) => c === "notes" ? null : "notes")}
                  action={!showProgressTrack ? (
                    <button type="button" onClick={(e) => { e.stopPropagation(); pushToAITool("script-builder"); }} className="text-xs text-[#185FA5] hover:underline">Build Script →</button>
                  ) : null}
                >
                  <MarkdownTextarea
                    value={form.notes}
                    onChange={(v) => setForm((f) => ({ ...f, notes: v }))}
                    rows={5}
                    className={field}
                    placeholder="Key details, action items…"
                    ariaLabel="Talking Points"
                  />
                </ContentRow>

                <ContentRow
                  label="Research notes"
                  value={form.researchNotes}
                  emptyHint="Empty · click to add"
                  expanded={contentRowExpanded === "researchNotes"}
                  onToggle={() => setContentRowExpanded((c) => c === "researchNotes" ? null : "researchNotes")}
                  action={
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); generateResearchPrompt(); }}
                      className="text-xs text-[#185FA5] hover:underline disabled:opacity-50"
                      title="Build a deep-research prompt and copy to clipboard"
                    >
                      {researchPromptCopied
                        ? "Copied — paste into Manus / Perplexity"
                        : researchPromptError
                        ? researchPromptError
                        : "Generate Research Prompt →"}
                    </button>
                  }
                >
                  <MarkdownTextarea
                    value={form.researchNotes}
                    onChange={(v) => setForm((f) => ({ ...f, researchNotes: v }))}
                    rows={5}
                    className={field}
                    placeholder="Paste your research here — statistics, sources, talking points, Manus/Perplexity output…"
                    ariaLabel="Research Notes"
                  />
                </ContentRow>

                <ContentRow
                  label="Script"
                  value={form.script}
                  emptyHint="Empty · click to add"
                  expanded={contentRowExpanded === "script"}
                  onToggle={() => setContentRowExpanded((c) => c === "script" ? null : "script")}
                  action={!showProgressTrack ? (
                    <button type="button" onClick={(e) => { e.stopPropagation(); pushToAITool("script-review"); }} className="text-xs text-[#185FA5] hover:underline">Script Review →</button>
                  ) : null}
                >
                  <MarkdownTextarea
                    value={form.script}
                    onChange={(v) => setForm((f) => ({ ...f, script: v }))}
                    rows={12}
                    className={field}
                    placeholder="Write your video script here…"
                    ariaLabel="Script"
                  />
                  {form.script.trim() && (
                    <div className="relative mt-1.5 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setShowDownloadMenu((v) => !v)}
                        className="flex items-center gap-1.5 text-xs text-[#2f3437]/50 hover:text-[#185FA5] transition-colors"
                      >
                        <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                        Download Script
                      </button>
                      {showDownloadMenu && (
                        <div className="absolute right-0 top-6 z-10 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[130px]">
                          {(["md", "txt", "pdf"] as const).map((fmt) => (
                            <button
                              key={fmt}
                              type="button"
                              onClick={() => downloadScript(fmt)}
                              className="w-full text-left px-3 py-1.5 text-xs text-[#2f3437] hover:bg-gray-50 transition-colors"
                            >
                              .{fmt}{fmt === "pdf" ? " (print)" : ""}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </ContentRow>

                <ContentRow
                  label="YouTube description"
                  value={form.youtubeDescription}
                  emptyHint={form.script ? "Empty · generate with AI" : "Empty · click to add"}
                  expanded={contentRowExpanded === "youtubeDescription"}
                  onToggle={() => setContentRowExpanded((c) => c === "youtubeDescription" ? null : "youtubeDescription")}
                  action={!form.youtubeDescription && form.script ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        sessionStorage.setItem("description_prefill", JSON.stringify({
                          title: form.title || "",
                          transcript: form.script || "",
                          contentPlanId: plan.id,
                        }));
                        window.location.href = "/member/ai-tools/description-generator";
                      }}
                      className="text-xs text-[#185FA5] hover:underline"
                    >
                      Generate with AI →
                    </button>
                  ) : null}
                >
                  <MarkdownTextarea
                    value={form.youtubeDescription}
                    onChange={(v) => setForm((f) => ({ ...f, youtubeDescription: v }))}
                    rows={4}
                    className={field}
                    placeholder="YouTube video description…"
                    ariaLabel="YouTube Description"
                  />
                </ContentRow>

                <ContentRow
                  label="Thumbnail words"
                  value={form.thumbnailWords}
                  emptyHint="Empty · 3–5 words"
                  expanded={contentRowExpanded === "thumbnailWords"}
                  onToggle={() => setContentRowExpanded((c) => c === "thumbnailWords" ? null : "thumbnailWords")}
                >
                  <input
                    type="text"
                    value={form.thumbnailWords}
                    onChange={(e) => setForm((f) => ({ ...f, thumbnailWords: e.target.value }))}
                    className={field}
                    placeholder="3–5 words, or quick ideas…"
                  />
                </ContentRow>
              </ul>
            </div>

            {/* Zone 7 — Linking & campaigns. 2×2 grid: Binge Video / Binged From
                on the top row, Lead Magnet / Drive Folder (or Footage Link) on
                the bottom. All four outbound links live in one card. */}
            <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#2f3437]/60">Linking &amp; campaigns</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Binge Video card — links this video to the previous video the
                    member wants to drive viewers back to. */}
                <div ref={bingeRef} className="relative rounded-md bg-gray-50 px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-[#2f3437]/55 mb-1">Binge video</p>
                  {selectedBinge && !bingeOpen ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => { setBingeQuery(""); setBingeOpen(true); }}
                        className="min-w-0 flex-1 text-left"
                        title="Change binge target"
                      >
                        <p className="text-[13px] text-[#2f3437] truncate">{selectedBinge.title}</p>
                        <p className="text-[11px] text-[#2f3437]/55 truncate">
                          {formatTheme(selectedBinge.theme) || <span className="italic">No theme</span>}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, bingeVideoId: "" }))}
                        className="shrink-0 p-1 rounded hover:bg-white text-[#2f3437]/50 hover:text-red-600 transition-colors"
                        aria-label="Clear binge video"
                      >
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setBingeQuery(""); setBingeOpen((v) => !v); }}
                      className="w-full text-left text-[13px] text-[#2f3437]/50 hover:text-[#185FA5] flex items-center justify-between gap-2"
                    >
                      <span className="truncate">{bingeLoading ? "Loading videos…" : "Select a video to binge to…"}</span>
                      <svg className="w-3.5 h-3.5 text-[#2f3437]/45 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
                    </button>
                  )}
                  {bingeOpen && (
                    <div className="absolute left-0 right-0 z-20 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 flex flex-col overflow-hidden">
                      <input
                        ref={bingeSearchRef}
                        type="text"
                        value={bingeQuery}
                        onChange={(e) => setBingeQuery(e.target.value)}
                        placeholder="Search by title…"
                        className="w-full px-3 py-2 text-sm border-b border-gray-100 focus:outline-none"
                      />
                      <div className="overflow-y-auto">
                        {bingeLoading && bingeOptions.length === 0 ? (
                          <p className="px-3 py-3 text-xs text-[#2f3437]/45 italic">Loading…</p>
                        ) : filteredBingeOptions.length === 0 ? (
                          <p className="px-3 py-3 text-xs text-[#2f3437]/45 italic">
                            {bingeOptions.length === 0
                              ? "No other videos to link yet — create more videos in the planner first."
                              : "No matches."}
                          </p>
                        ) : (
                          <ul>
                            {filteredBingeOptions.map((opt) => {
                              const active = opt.id === form.bingeVideoId;
                              return (
                                <li key={opt.id}>
                                  <button
                                    type="button"
                                    onClick={() => { setForm((f) => ({ ...f, bingeVideoId: opt.id })); setBingeOpen(false); }}
                                    className={`w-full text-left px-3 py-2 hover:bg-[#185FA5]/5 transition-colors ${active ? "bg-[#185FA5]/10" : ""}`}
                                  >
                                    <p className="text-sm font-medium text-[#2f3437] truncate">{opt.title}</p>
                                    <p className="text-[11px] text-[#2f3437]/55 truncate">
                                      {formatTheme(opt.theme) || <span className="italic">No theme</span>}
                                    </p>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Binged FROM card — read-only list of videos that point back. */}
                <div className="rounded-md bg-gray-50 px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-[#2f3437]/55 mb-1">Binged from</p>
                  {plan.bingedFromList && plan.bingedFromList.length > 0 ? (
                    <ul className="space-y-1.5">
                      {plan.bingedFromList.map((b) => (
                        <li key={b.id} className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] text-[#2f3437] truncate">{b.title}</p>
                            <p className="text-[11px] text-[#2f3437]/55 truncate">
                              {formatTheme(b.theme) || <span className="italic">No theme</span>}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleOpenLinkedPlan(b.id)}
                            className="shrink-0 text-[11px] font-medium text-[#185FA5] hover:underline"
                          >
                            Open →
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[12px] italic text-[#2f3437]/45">No videos point here yet</p>
                  )}
                </div>

                {/* Lead magnet card. Hidden in admin contexts (admins use a
                    separate campaigns scope). */}
                {!isAdmin && (
                  <div className="rounded-md bg-gray-50 px-3 py-2.5">
                    <p className="text-[11px] uppercase tracking-wider font-semibold text-[#2f3437]/55 mb-1">Lead magnet campaign</p>
                    <select
                      value={form.linkedCampaignId}
                      onChange={(e) => setForm((f) => ({ ...f, linkedCampaignId: e.target.value }))}
                      className={field}
                    >
                      <option value="">— None —</option>
                      {campaigns.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Footage / Drive folder card. Switches based on whether the
                    member's tier uses managed Drive folders. */}
                {useDrive ? (
                  <div className="rounded-md bg-gray-50 px-3 py-2.5">
                    <p className="text-[11px] uppercase tracking-wider font-semibold text-[#2f3437]/55 mb-1">Drive folder</p>
                    {driveFolderLink ? (
                      <a
                        href={driveFolderLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[13px] text-[#185FA5] hover:underline"
                      >
                        <svg viewBox="0 0 87.3 78" className="w-3.5 h-3.5 shrink-0" aria-hidden>
                          <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                          <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z" fill="#00ac47"/>
                          <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                          <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                          <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                          <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                        </svg>
                        <span className="truncate">Open Drive folder ↗</span>
                      </a>
                    ) : isAdmin ? (
                      <div>
                        <button
                          type="button"
                          onClick={handleCreateFolder}
                          disabled={creatingFolder}
                          className="text-[13px] text-[#185FA5] hover:underline disabled:opacity-50"
                        >
                          {creatingFolder ? "Creating folder…" : "Create Drive folder"}
                        </button>
                        {folderError && <p className="text-xs text-red-600 mt-1">{folderError}</p>}
                      </div>
                    ) : (
                      <p className="text-[12px] italic text-[#2f3437]/45">Created automatically when status moves to shooting / post.</p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-md bg-gray-50 px-3 py-2.5">
                    <p className="text-[11px] uppercase tracking-wider font-semibold text-[#2f3437]/55 mb-1">Footage link</p>
                    <input
                      type="text"
                      value={form.footageLink}
                      onChange={(e) => setForm((f) => ({ ...f, footageLink: e.target.value }))}
                      className={field}
                      placeholder="https://…"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Zone 8 — Notes & Thoughts. Single collapsed block at the bottom. */}
            <div>
              {!isSectionExpanded("thoughts") ? (
                <CollapsedPreview
                  value={form.thoughts}
                  placeholder="Scratchpad — ideas, reminders, anything…"
                  onExpand={() => toggleSection("thoughts")}
                />
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[#2f3437]/60">Notes &amp; thoughts</span>
                    <button type="button" onClick={() => toggleSection("thoughts")} className="text-[11px] text-[#2f3437]/50 hover:text-[#185FA5]">Collapse</button>
                  </div>
                  <MarkdownTextarea
                    value={form.thoughts}
                    onChange={(v) => setForm((f) => ({ ...f, thoughts: v }))}
                    rows={4}
                    className={field}
                    placeholder="Anything you want to remember about this video…"
                    ariaLabel="Notes and Thoughts"
                  />
                </div>
              )}
            </div>

            {/* Repurpose artifacts — shown at the very bottom when present. */}
            {repurposeArtifacts.length > 0 && (
              <div className="rounded-xl border border-[#a78bfa]/25 bg-[#a78bfa]/5 px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#7c5fde]">
                    ♻️ Repurposed Content
                  </p>
                  <button
                    type="button"
                    onClick={() => launchTool("repurpose")}
                    className="text-[11px] font-semibold text-[#7c5fde] hover:underline"
                  >
                    Open Repurpose Tool →
                  </button>
                </div>
                <ul className="space-y-1.5">
                  {repurposeArtifacts.map(({ type, latest }) => {
                    const meta = (latest!.metadata ?? {}) as { feedback_used?: string | null };
                    const feedback = meta.feedback_used?.trim() || "";
                    const updated = latest!.updatedAt ? new Date(latest!.updatedAt as string) : null;
                    return (
                      <li key={latest!.id} className="text-xs text-[#2f3437]/85">
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setViewingArtifact({
                              id: latest!.id,
                              type,
                              content: formatRepurposeArtifactForView(type, latest!.content?.toString() ?? ""),
                              label: REPURPOSE_LABELS[type] ?? type,
                            })}
                            className="font-medium hover:text-[#7c5fde] hover:underline truncate text-left"
                            title={`View ${REPURPOSE_LABELS[type] ?? type}`}
                          >
                            {REPURPOSE_LABELS[type] ?? type}
                          </button>
                          {updated && (
                            <span className="text-[10px] text-[#2f3437]/40 shrink-0">
                              {updated.toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        {feedback && (
                          <p className="text-[10px] italic text-[#2f3437]/55 mt-0.5 truncate" title={feedback}>
                            Last revision: &ldquo;{feedback}&rdquo;
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

        <div
          className={
            isMobile
              ? "sticky bottom-0 z-20 bg-white/95 backdrop-blur-sm flex items-center justify-between px-4 py-3 border-t border-gray-100"
              : "flex items-center justify-between px-6 pb-5 pt-2 border-t border-gray-100"
          }
          style={isMobile ? { paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" } : undefined}
        >
          {onDeleted ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600">Are you sure?</span>
                <button onClick={handleDelete} disabled={deleting} className="text-xs text-red-600 font-medium hover:underline disabled:opacity-50">
                  {deleting ? "Deleting…" : "Yes, delete"}
                </button>
                <button onClick={() => setConfirmDelete(false)} className="text-xs text-[#2f3437]/50 hover:text-[#2f3437]">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="text-xs text-[#2f3437]/40 hover:text-red-600 transition-colors">Delete video</button>
            )
          ) : <div />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-[#2f3437]/60 hover:text-[#2f3437] border border-gray-200 rounded-lg">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-[#2f3437] text-white rounded-lg hover:bg-[#1a1f22] disabled:opacity-50 transition-colors">
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>

      {viewingArtifact && mounted && createPortal(
        // Open the artifact viewer as the full-screen editor directly so the
        // user can read and copy the whole piece without first clicking
        // "Expand" inside a smaller modal. Layout mirrors the expanded view
        // used by MarkdownTextarea (max-w-5xl, ~94vh). Portaled to <body> so
        // the parent planner modal's lg:pl-[260px] sidebar offset does not
        // squeeze it against the right edge of the viewport.
        <div
          className="fixed inset-0 z-[300] bg-black/60 flex items-center justify-center p-3 sm:p-6"
          onClick={() => setViewingArtifact(null)}
        >
          <div
            className="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-2xl w-full max-w-5xl h-[94vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[#eaeaea] dark:border-white/10">
              <h3 className="text-sm font-semibold text-[#2f3437] dark:text-white truncate">
                {viewingArtifact.label}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(editingArtifactContent);
                      setCopiedArtifact(true);
                      if (copiedTimeoutRef.current) window.clearTimeout(copiedTimeoutRef.current);
                      copiedTimeoutRef.current = window.setTimeout(() => setCopiedArtifact(false), 2000);
                    } catch {}
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    copiedArtifact
                      ? "bg-[#6ba3c7]/15 text-[#6ba3c7]"
                      : "text-[#6ba3c7] hover:bg-[#6ba3c7]/10"
                  }`}
                >
                  {copiedArtifact ? "Copied!" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={() => setViewingArtifact(null)}
                  className="p-1.5 rounded hover:bg-[#eaeaea]/60 dark:hover:bg-white/10 text-[#2f3437]/60 dark:text-white/60"
                  aria-label="Close"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden p-5">
              <RichMarkdownEditor
                value={editingArtifactContent}
                onChange={(v) => {
                  setEditingArtifactContent(v);
                  if (savedArtifact) setSavedArtifact(false);
                  if (artifactSaveError) setArtifactSaveError(null);
                }}
                placeholder="Edit your content..."
                ariaLabel={`Edit ${viewingArtifact.label}`}
              />
            </div>
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-[#eaeaea] dark:border-white/10">
              <div className="text-xs">
                {artifactSaveError ? (
                  <span className="text-red-600 dark:text-red-400">{artifactSaveError}</span>
                ) : savedArtifact ? (
                  <span className="text-green-600 dark:text-green-400 font-medium">Saved ✓</span>
                ) : editingArtifactContent !== viewingArtifact.content ? (
                  <span className="text-[#2f3437]/50 dark:text-white/40">Unsaved changes</span>
                ) : (
                  <span className="text-[#2f3437]/40 dark:text-white/30">Esc or click outside to close</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setViewingArtifact(null)}
                  className="px-3 py-1.5 text-xs font-medium text-[#2f3437] dark:text-white/80 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={saveArtifactEdits}
                  disabled={savingArtifact || editingArtifactContent === viewingArtifact.content}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[#7c5fde] hover:bg-[#6b4fce] disabled:bg-[#7c5fde]/40 disabled:cursor-not-allowed text-white transition-colors"
                >
                  {savingArtifact ? "Saving..." : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

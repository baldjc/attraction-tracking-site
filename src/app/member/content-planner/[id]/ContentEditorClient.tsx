"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import RichMarkdownEditor from "@/components/RichMarkdownEditor";
import { stripToDialogue } from "@/lib/script-content-rules";
import type { ContentPlan } from "@/components/content-planner/ContentPlanEditModal";
import { getStatusOptions, hasEditDueDate, PRODUCTION_TIERS, getPlanThumbnailUrl } from "@/lib/content-plan-utils";
import { hasDriveFolderAccess } from "@/lib/service-tier";
import { useToast } from "@/components/ToastProvider";
import { buildMlsVerifyLine, formatMlsPeriod } from "@/lib/mls-verify-reminder";
import { writeJarvisRefineSeed } from "@/lib/jarvis/seed";
import { getStatusPillStyle, getThemeVisual } from "@/lib/content-plan-style";
import { useIsMobile } from "@/hooks/useIsMobile";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type Lineage = {
  rotationSlot: string;
  themeLabel: string;
  titlePromise: string | null;
  visualPeak: string | null;
  thumbnailCallouts: string[];
  storyLead: { id: string; pattern: string; whyItMattersPreview: string } | null;
  facts: Array<{
    id: string;
    neighbourhood: string;
    metricName: string;
    metricLabel: string;
    metricValueString: string;
    monthYear: string;
  }>;
  totalCited: number;
};

type Theme = { value: string; label: string; emoji?: string | null; colour?: string | null };
type Campaign = { id: string; name: string; pitchOneLiner: string | null };
type BingeOption = { id: string; title: string; theme: string | null };
type AvatarData = {
  avatarName?: string | null;
  avatarSummary?: string | null;
  full_document?: string | null;
  city?: string | null;
} | null;

const FOUNDATIONS_TIERS = ["foundations"];
// ─────────────────────────────────────────────────────────────────────────────
// Local auto-save hook
// AbortController-based single-flight save, 2-second debounce, on-blur flush.
// ─────────────────────────────────────────────────────────────────────────────
type SaveState = "idle" | "saving" | "saved" | "error";

function useAutoSave<T>({
  value,
  save,
  debounceMs = 2000,
}: {
  value: T;
  save: (value: T, signal: AbortSignal) => Promise<void>;
  debounceMs?: number;
}) {
  const [state, setState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastSavedSnapshotRef = useRef<string>(JSON.stringify(value));
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);
  const latestValueRef = useRef<T>(value);

  latestValueRef.current = value;

  const runSave = useCallback(async () => {
    // Coalesce: if a save is in-flight, mark pending and let the in-flight one
    // schedule the follow-up after it returns.
    if (inFlightRef.current) {
      pendingRef.current = true;
      return;
    }
    inFlightRef.current = true;
    setState("saving");
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const snapshot = latestValueRef.current;
    const snapshotStr = JSON.stringify(snapshot);
    try {
      await save(snapshot, ctrl.signal);
      if (ctrl.signal.aborted) return;
      lastSavedSnapshotRef.current = snapshotStr;
      setLastSavedAt(Date.now());
      setState("saved");
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      setState("error");
    } finally {
      inFlightRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        // If something changed during the save, kick another one.
        if (JSON.stringify(latestValueRef.current) !== lastSavedSnapshotRef.current) {
          runSave();
        }
      }
    }
  }, [save]);

  // Debounced trigger on value change.
  useEffect(() => {
    if (JSON.stringify(value) === lastSavedSnapshotRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(runSave, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, debounceMs, runSave]);

  // Flush immediately (used on blur / unmount).
  const flush = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (JSON.stringify(latestValueRef.current) === lastSavedSnapshotRef.current) return;
    await runSave();
  }, [runSave]);

  // Best-effort save before tab close.
  useEffect(() => {
    const onUnload = () => { void flush(); };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [flush]);

  const retry = useCallback(() => { void runSave(); }, [runSave]);

  return { state, lastSavedAt, flush, retry };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function toDateInput(d: string | null | undefined): string {
  if (!d) return "";
  const date = new Date(d);
  if (!Number.isFinite(date.getTime())) return "";
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatLongDate(d: string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
  });
}

function relativeAgo(ts: number | null, now: number): string {
  if (!ts) return "Not saved yet";
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 5) return "Saved just now";
  if (s < 60) return `Saved ${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `Saved ${m}m ago`;
  const h = Math.floor(m / 60);
  return `Saved ${h}h ago`;
}

function wordCount(s: string | null | undefined): number {
  if (!s) return 0;
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Controlled-ish contentEditable H1 used for the hero title.
 *
 * Why a custom component: rendering React children into a `contentEditable`
 * node is unsafe — every re-render rewrites the DOM under the user's caret
 * and can drop or duplicate keystrokes. Instead we mount an empty H1, write
 * its initial text via a ref, commit on `onInput`, and only re-sync from
 * props while the element is NOT focused. The auto-azure decoration is
 * shown as a non-editable overlay when blurred, so we keep the visual
 * treatment without ever mutating the editable node mid-typing. */
function TitleEditor({
  value, onCommit, placeholder, style, inputRef,
}: {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  inputRef?: React.RefObject<HTMLHeadingElement | null>;
}) {
  const localRef = useRef<HTMLHeadingElement | null>(null);
  const setRefs = useCallback(
    (el: HTMLHeadingElement | null) => {
      localRef.current = el;
      if (inputRef) {
        (inputRef as React.MutableRefObject<HTMLHeadingElement | null>).current = el;
      }
    },
    [inputRef],
  );
  const [focused, setFocused] = useState(false);

  // Initial paint + external-change resync (only when not focused).
  useEffect(() => {
    const el = localRef.current;
    if (!el) return;
    if (focused) return;
    const dom = el.textContent ?? "";
    if (dom !== value) el.textContent = value;
  }, [value, focused]);

  const baseStyle: React.CSSProperties = {
    fontFamily: "var(--font-display, inherit)",
    fontWeight: 900,
    fontSize: 38,
    letterSpacing: "-0.025em",
    lineHeight: 1.1,
    margin: "16px 0 14px",
    outline: "none",
    minHeight: 44,
    ...style,
  };

  return (
    <div style={{ position: "relative" }}>
      <h1
        ref={setRefs}
        contentEditable
        suppressContentEditableWarning
        spellCheck
        onFocus={() => setFocused(true)}
        onInput={(e) => {
          const v = (e.currentTarget as HTMLHeadingElement).textContent ?? "";
          if (v !== value) onCommit(v);
        }}
        onBlur={(e) => {
          setFocused(false);
          const v = e.currentTarget.textContent ?? "";
          if (v !== value) onCommit(v);
        }}
        style={{
          ...baseStyle,
          // While not focused, hide the raw editable text and let the
          // decorated overlay below show through. Keeps the caret stable
          // and prevents React re-renders from rewriting the live DOM.
          color: focused ? undefined : "transparent",
          caretColor: "white",
        }}
      />
      {!focused && (
        <h1
          aria-hidden
          onMouseDown={(e) => {
            // Defer focus until after mousedown so the click lands inside
            // the editable node and the caret is placed correctly.
            e.preventDefault();
            localRef.current?.focus();
          }}
          style={{
            ...baseStyle,
            position: "absolute",
            inset: 0,
            pointerEvents: "auto",
            cursor: "text",
            color: value ? "white" : "rgba(255,255,255,0.4)",
          }}
        >
          {value ? renderAutoAzureTitle(value) : (placeholder ?? "")}
        </h1>
      )}
    </div>
  );
}

/** Render the title with auto-azure on the FIRST dollar amount, then the
 *  first 4-digit number, then the first capitalised neighbourhood-ish token.
 *  Render-only; never mutates the saved title. */
function renderAutoAzureTitle(title: string): React.ReactNode {
  if (!title) return null;
  const patterns: RegExp[] = [
    /\$[\d,]+(?:\.\d+)?[kKmM]?/, // $850k, $1,250,000
    /\b\d{3,}(?:\.\d+)?[kKmM]?\b/, // 850k, 2024
    /\b[A-Z][a-z]{3,}(?:\s[A-Z][a-z]{3,})?\b/, // Bridgeland, Mount Pleasant
  ];
  let matchIdx = -1;
  let matchStr = "";
  for (const p of patterns) {
    const m = title.match(p);
    if (m && m.index !== undefined) {
      matchIdx = m.index;
      matchStr = m[0];
      break;
    }
  }
  if (matchIdx < 0) return title;
  return (
    <>
      {title.slice(0, matchIdx)}
      <span style={{ color: "var(--abv-azure)" }}>{matchStr}</span>
      {title.slice(matchIdx + matchStr.length)}
    </>
  );
}

// Turn a plain string into a mix of text + styled tag pills. STAT pills gain a
// leading ✓ when the text immediately after the tag references a cited fact
// (i.e. contains a number within the next ~80 chars).
function splitTags(s: string): React.ReactNode[] {
  const re = /\[(LEAD MAGNET[^\]]*|SIDEWAYS CREDIBILITY|MID-VIDEO HOOK|STAT)\]/g;
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(s)) !== null) {
    if (m.index > lastIdx) parts.push(s.slice(lastIdx, m.index));
    const tagText = m[1];
    const styles = inlineTagStyle(tagText);
    let label = tagText;
    if (tagText === "STAT") {
      const after = s.slice(m.index + m[0].length, m.index + m[0].length + 80);
      if (/\d/.test(after)) label = `✓ ${tagText}`;
    }
    parts.push(
      <span key={`t-${key++}`} style={{
        display: "inline-block",
        padding: "1px 7px",
        borderRadius: 4,
        fontSize: 10,
        fontFamily: "var(--font-mono, ui-monospace)",
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        marginRight: 4,
        ...styles,
      }}>{`[${label}]`}</span>
    );
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < s.length) parts.push(s.slice(lastIdx));
  return parts;
}

// Recursively walk rendered markdown children and replace bracket tags inside
// any string node with styled pills (handles tags nested inside bold/links/etc).
function injectTags(children: React.ReactNode): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (typeof child === "string") return splitTags(child);
    if (React.isValidElement(child)) {
      const el = child as React.ReactElement<{ children?: React.ReactNode }>;
      if (el.props?.children) {
        return React.cloneElement(el, { ...el.props, children: injectTags(el.props.children) });
      }
    }
    return child;
  });
}

// react-markdown component overrides: apply the .script-body look via inline
// styles and run tag injection on text-bearing elements.
const MARKDOWN_COMPONENTS = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 style={{ fontFamily: "var(--font-display, inherit)", fontWeight: 800, fontSize: 24, letterSpacing: "-0.02em", margin: "20px 0 12px" }}>{injectTags(children)}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 style={{ fontFamily: "var(--font-display, inherit)", fontWeight: 800, fontSize: 20, letterSpacing: "-0.018em", margin: "18px 0 10px" }}>{injectTags(children)}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 style={{ fontFamily: "var(--font-display, inherit)", fontWeight: 800, fontSize: 18, letterSpacing: "-0.015em", margin: "16px 0 10px" }}>{injectTags(children)}</h3>
  ),
  h4: ({ children }: { children?: React.ReactNode }) => (
    <h4 style={{ fontFamily: "var(--font-display, inherit)", fontWeight: 800, fontSize: 16, letterSpacing: "-0.015em", margin: "16px 0 8px" }}>{injectTags(children)}</h4>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p style={{ margin: "0 0 12px", lineHeight: 1.7, maxWidth: "64ch" }}>{injectTags(children)}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul style={{ margin: "0 0 12px", paddingLeft: 22, lineHeight: 1.7, listStyle: "disc" }}>{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol style={{ margin: "0 0 12px", paddingLeft: 22, lineHeight: 1.7, listStyle: "decimal" }}>{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li style={{ margin: "0 0 4px" }}>{injectTags(children)}</li>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong style={{ fontWeight: 700 }}>{injectTags(children)}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em style={{ fontStyle: "italic" }}>{injectTags(children)}</em>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote style={{ margin: "0 0 12px", paddingLeft: 14, borderLeft: "3px solid var(--abv-border)", color: "var(--abv-text-muted)" }}>{children}</blockquote>
  ),
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <a href={href} target="_blank" rel="noreferrer" style={{ color: "var(--abv-azure)", textDecoration: "underline" }}>{injectTags(children)}</a>
  ),
  hr: () => <hr style={{ border: "none", borderTop: "1px solid var(--abv-border)", margin: "18px 0" }} />,
};

function inlineTagStyle(tag: string): React.CSSProperties {
  if (tag.startsWith("LEAD MAGNET")) {
    return { background: "rgba(168,85,247,0.12)", color: "#7C3AED" };
  }
  if (tag === "SIDEWAYS CREDIBILITY") {
    return { background: "rgba(245,158,11,0.14)", color: "#B45309" };
  }
  if (tag === "MID-VIDEO HOOK") {
    return { background: "rgba(220,38,38,0.12)", color: "#B91C1C" };
  }
  if (tag === "STAT") {
    return { background: "rgba(16,185,129,0.14)", color: "#047857" };
  }
  return { background: "rgba(0,0,0,0.06)", color: "#374151" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
type Form = {
  title: string;
  status: string;
  theme: string;
  shootDate: string;
  editDueDate: string;
  publishDate: string;
  propertyTypeFocus: string;
  shootLocation: string;
  script: string;
  notes: string;
  thumbnailWords: string;
  researchNotes: string;
  thoughts: string;
  youtubeDescription: string;
  pinnedComment: string;
  bingeVideoId: string;
  linkedCampaignId: string;
};

export default function ContentEditorClient({
  initialPlan,
  serviceTier,
  scriptBuilderV2Enabled,
}: {
  initialPlan: ContentPlan;
  serviceTier: string;
  scriptBuilderV2Enabled: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const apiBase = "/api/member/content-plans";
  const planId = initialPlan.id;

  const [plan, setPlan] = useState<ContentPlan>(initialPlan);
  const [form, setForm] = useState<Form>(() => ({
    title: initialPlan.title ?? "",
    status: initialPlan.status ?? "Idea",
    theme: initialPlan.theme ?? "",
    shootDate: toDateInput(initialPlan.shootDate),
    editDueDate: toDateInput(initialPlan.editDueDate),
    publishDate: toDateInput(initialPlan.publishDate),
    propertyTypeFocus: initialPlan.propertyTypeFocus ?? "",
    shootLocation: initialPlan.shootLocation ?? "",
    script: initialPlan.script ?? "",
    notes: initialPlan.notes ?? "",
    thumbnailWords: initialPlan.thumbnailWords ?? "",
    researchNotes: initialPlan.researchNotes ?? "",
    thoughts: initialPlan.thoughts ?? "",
    youtubeDescription: (initialPlan as unknown as { youtubeDescription?: string | null }).youtubeDescription ?? "",
    pinnedComment: (initialPlan as unknown as { pinnedComment?: string | null }).pinnedComment ?? "",
    bingeVideoId: initialPlan.bingeVideoId ?? "",
    linkedCampaignId: initialPlan.linkedCampaignId ?? "",
  }));
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<"planning" | "packaging" | "tools" | "publishing">("planning");
  const [lineage, setLineage] = useState<Lineage | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [bingeOptions, setBingeOptions] = useState<BingeOption[]>([]);
  const [bingeLoaded, setBingeLoaded] = useState(false);
  const [avatarData, setAvatarData] = useState<AvatarData>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [researchPromptCopied, setResearchPromptCopied] = useState(false);
  const [researchPromptError, setResearchPromptError] = useState("");
  const [now, setNow] = useState(Date.now());

  // Humanised data period of the facts this plan's script is grounded on (the
  // latest cited upload month), for the standing "verify against your live MLS"
  // line near the script's Sources block. Null → period-less fallback.
  const groundedPeriod = useMemo(() => {
    const months = (lineage?.facts ?? []).map((f) => f.monthYear).filter(Boolean);
    if (months.length === 0) return null;
    months.sort();
    return formatMlsPeriod(months[months.length - 1]);
  }, [lineage]);

  const statusOptions = useMemo(() => getStatusOptions(serviceTier), [serviceTier]);
  const isFoundations = FOUNDATIONS_TIERS.includes(serviceTier);
  const isProduction = PRODUCTION_TIERS.includes(serviceTier);
  const canUseDrive = hasDriveFolderAccess(serviceTier);
  const showEditDue = hasEditDueDate(serviceTier);

  // ── data hydration ────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${apiBase}/${planId}/lineage`)
      .then((r) => r.json())
      .then((d) => setLineage(d?.lineage ?? null))
      .catch(() => {});
    fetch(`${apiBase}/themes`)
      .then((r) => r.json())
      .then((d) => {
        // The themes API returns { name, emoji, colour }. The dropdown reads
        // { value, label } — map name→value/label so options render text
        // (previously blank because value/label were undefined).
        if (Array.isArray(d?.themes)) {
          setThemes(
            d.themes
              .map((t: { name?: string; emoji?: string | null; colour?: string | null }) => {
                const name = typeof t?.name === "string" ? t.name.trim() : "";
                if (!name) return null;
                return { value: name, label: name, emoji: t?.emoji ?? null, colour: t?.colour ?? null };
              })
              .filter((t: Theme | null): t is Theme => t !== null),
          );
        }
      })
      .catch(() => {});
    fetch("/api/campaigns")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (Array.isArray(d)) setCampaigns(d as Campaign[]);
        else if (Array.isArray(d?.campaigns)) setCampaigns(d.campaigns as Campaign[]);
      })
      .catch(() => {});
    fetch("/api/member/avatar")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setAvatarData(d as AvatarData); })
      .catch(() => {});
  }, [planId]);

  const loadBingeOptions = useCallback(() => {
    if (bingeLoaded) return;
    fetch(`${apiBase}/list-for-binge-selector?excludeId=${encodeURIComponent(planId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (Array.isArray(d?.plans)) {
          setBingeOptions(d.plans as BingeOption[]);
          setBingeLoaded(true);
        }
      })
      .catch(() => {});
  }, [planId, bingeLoaded]);

  // Tab-title mirrors current title.
  useEffect(() => {
    document.title = form.title ? `${form.title} · Editor` : "Editor";
  }, [form.title]);

  // Tick the "Saved Ns ago" ticker.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(t);
  }, []);

  // ── save logic ────────────────────────────────────────────────────────────
  const save = useCallback(async (v: Form, signal: AbortSignal) => {
    const body: Record<string, unknown> = {
      title: v.title.trim() || "Untitled",
      status: v.status,
      theme: v.theme || null,
      shootDate: v.shootDate || null,
      editDueDate: v.editDueDate || null,
      publishDate: v.publishDate || null,
      propertyTypeFocus: v.propertyTypeFocus || null,
      shootLocation: v.shootLocation || null,
      script: v.script,
      notes: v.notes,
      thumbnailWords: v.thumbnailWords,
      researchNotes: v.researchNotes,
      thoughts: v.thoughts,
      youtubeDescription: v.youtubeDescription,
      pinnedComment: v.pinnedComment,
      bingeVideoId: v.bingeVideoId || null,
      linkedCampaignId: v.linkedCampaignId || null,
    };
    const res = await fetch(`${apiBase}/${planId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw new Error(`Save failed: ${res.status}`);
    const data = await res.json();
    // Thumbnail variants / winner are mutated through their own routes and kept
    // fresh in `plan` via patchPlan. This PUT never touches them, so preserve the
    // locally-held values instead of letting a possibly-stale autosave response
    // body overwrite them (which would make PackagingTab re-hydrate stale on remount).
    if (data?.plan) {
      setPlan((prev) => ({
        ...(data.plan as ContentPlan),
        thumbnailVariants: (prev as unknown as { thumbnailVariants?: unknown }).thumbnailVariants,
        thumbnailWinnerId: (prev as unknown as { thumbnailWinnerId?: unknown }).thumbnailWinnerId,
      } as ContentPlan));
    }
    // The status save succeeded but a background Drive auto-create may have
    // failed — surface it as a non-blocking warning instead of dropping it.
    if (data?.driveError) {
      toast.error(driveErrorMessage(data.driveError));
    }
  }, [planId, toast]);

  const { state: saveState, lastSavedAt, flush, retry } = useAutoSave({
    value: form, save, debounceMs: 2000,
  });

  // Helper to update form fields and trigger debounce automatically.
  const update = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Merge server-confirmed fields back into the held plan so they survive a
  // tab switch (each tab unmounts/remounts and re-reads from `plan`). Thumbnail
  // uploads/scores/winner picks write straight to the DB via their own routes,
  // so without this the parent `plan` would go stale and the PackagingTab would
  // re-hydrate empty after leaving and returning to the tab.
  const patchPlan = useCallback((partial: Record<string, unknown>) => {
    setPlan((p) => ({ ...p, ...partial } as ContentPlan));
  }, []);

  // ── delete / quick actions ────────────────────────────────────────────────
  const handleExport = () => {
    const blob = new Blob(
      [`# ${form.title}\n\n${form.script || ""}`],
      { type: "text/markdown" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(form.title || "script").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const handleDuplicate = () => {
    alert("Duplicate is coming soon. For now use Add Blank Video on the planner.");
  };
  const handleDelete = async () => {
    if (!confirm("Delete this video? It's removed from your planner. Your coaching team can restore it if you change your mind — the script, research, and AI-generated content stay saved.")) return;
    try {
      const res = await fetch(`${apiBase}/${planId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      toast.success("Video deleted. Ask your team to restore it if you need it back.");
      router.push("/member/content-planner");
    } catch {
      toast.error("Could not delete. Please try again.");
    }
  };

  const generateResearchPrompt = async () => {
    setResearchPromptError("");
    const t = form.title.trim();
    if (!t) {
      setResearchPromptError("Add a title first");
      setTimeout(() => setResearchPromptError(""), 2500);
      return;
    }
    const tp = form.notes.trim();
    const avatarSection = avatarData?.avatarName
      ? `Name: ${avatarData.avatarName}\n${avatarData.full_document || avatarData.avatarSummary || JSON.stringify(avatarData, null, 2)}`
      : "(No avatar saved — write for a general real estate audience.)";
    const themeLine = form.theme ? `Theme / Series: ${form.theme}` : "";
    const publishLine = form.publishDate ? `Planned publish date: ${form.publishDate}` : "";
    const todayLine = `Today's date (for recency of stats): ${new Date().toISOString().slice(0, 10)}`;
    const prompt = `You are a senior real-estate research analyst preparing a deep research brief for a YouTube video. Your job is to gather **specific, verifiable, recent, sourced data** that I can confidently say on camera.

=== VIDEO CONTEXT ===
Title: "${t}"
${themeLine}
${publishLine}
${todayLine}

${tp ? `=== TALKING POINTS / OUTLINE ===\n${tp}\n` : "=== TALKING POINTS ===\n(None provided — infer from the title and avatar.)\n"}
=== TARGET AVATAR ===
${avatarSection}

=== WHAT I NEED ===
For each talking point, deliver: (1) hard stats with sources + dates + URLs, (2) recent market context (last 6–12 months), (3) main argument & unique angle, (4) avatar pain points tied to stats, (5) myths to bust, (6) conventional wisdom to position against, (7) concrete examples with numbers, (8) visual / b-roll suggestions, (9) quotable lines with attribution, (10) open questions to verify locally.

Output as markdown with ## per talking point, ### per section. Every stat: \`figure — context — Source Name, Date — URL\`. Do not fabricate sources or numbers.`;
    try {
      await navigator.clipboard.writeText(prompt);
      setResearchPromptCopied(true);
      setTimeout(() => setResearchPromptCopied(false), 2500);
    } catch {
      setResearchPromptError("Could not copy");
      setTimeout(() => setResearchPromptError(""), 2500);
    }
  };

  // The "the" thumbnail for the hero: a picked Drive thumbnail, else the A/B
  // winner, else the first uploaded option. Reads from `plan` (kept fresh by
  // patchPlan after uploads) so it updates live when a thumbnail is added.
  const heroThumbnailUrl = useMemo(() => getPlanThumbnailUrl(plan), [plan]);

  const titleH1Ref = useRef<HTMLHeadingElement | null>(null);
  const scriptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const publishDateRef = useRef<HTMLInputElement | null>(null);
  const editDueDateRef = useRef<HTMLInputElement | null>(null);
  const shootDateRef = useRef<HTMLInputElement | null>(null);
  const statusSelectRef = useRef<HTMLSelectElement | null>(null);
  const researchNotesRef = useRef<HTMLTextAreaElement | null>(null);

  // ↻ Regenerate → open THIS video in Jarvis (Content Manager) in "refine this
  // script" mode rather than doing a blind one-shot rebuild. We flush any
  // pending autosave first (so Jarvis loads the latest script), stash a
  // member-scoped refine seed carrying this planId, then route to the chat. On
  // member approval the refined draft saves BACK to this same planner video
  // (save.ts → routeApprovedDraftToPlanner), never a duplicate.
  const handleRegenerate = useCallback(async () => {
    if (!scriptBuilderV2Enabled) {
      alert("Script Builder v2 isn't enabled for your tier yet.");
      return;
    }
    if (
      !confirm(
        "Open this script in the Content Manager to refine it? You'll be able to tell it what to change, and the updated script saves back to this same video.",
      )
    )
      return;
    await flush();
    // userId is present on the GET /content-plans/[id] response at runtime even
    // though it's absent from the ContentPlan TS type.
    const memberId = (initialPlan as unknown as { userId?: string }).userId ?? "";
    writeJarvisRefineSeed(
      memberId,
      planId,
      "I'd like to refine the script for one of my planner videos.",
    );
    router.push("/member/jarvis?thread=new");
  }, [scriptBuilderV2Enabled, flush, initialPlan, planId, router]);

  // ── back navigation ───────────────────────────────────────────────────────
  const handleBack = async () => {
    await flush();
    router.push("/member/content-planner");
  };

  // ── render ────────────────────────────────────────────────────────────────
  const savedLabel = saveState === "saving"
    ? "Saving…"
    : saveState === "error"
      ? null
      : relativeAgo(lastSavedAt, now);

  return (
    <div style={{ background: "var(--abv-bg, #FAF7F2)", minHeight: "100vh" }}>
      {/* ── top bar ─────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 32px", borderBottom: "1px solid var(--abv-border)",
        background: "white",
      }}>
        <button
          onClick={handleBack}
          className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--abv-text-muted)] hover:text-[var(--abv-text)]"
        >
          ← Content Planner
        </button>
        <div className="flex items-center gap-3">
          {saveState === "error" ? (
            <button
              onClick={retry}
              className="text-[11px] font-semibold"
              style={{ color: "var(--abv-leads, #DC2626)", fontFamily: "var(--font-mono, ui-monospace)" }}
            >
              ⚠ Save failed — retry
            </button>
          ) : (
            <span
              className="text-[11px]"
              style={{
                fontFamily: "var(--font-mono, ui-monospace)",
                color: saveState === "saving" ? "var(--abv-azure)" : "var(--abv-text-muted)",
              }}
            >
              {savedLabel}
            </span>
          )}
          <div style={{ position: "relative" }}>
            <button
              aria-label="More actions"
              onClick={() => setMoreOpen((v) => !v)}
              className="w-8 h-8 rounded-full hover:bg-[var(--abv-bg-warm)] text-[var(--abv-text-muted)]"
            >⋯</button>
            {moreOpen && (
              <>
                <div
                  onClick={() => setMoreOpen(false)}
                  style={{ position: "fixed", inset: 0, zIndex: 40 }}
                />
                <div style={{
                  position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 41,
                  background: "white", border: "1px solid var(--abv-border)",
                  borderRadius: 8, minWidth: 160, padding: 4,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                }}>
                  <MoreItem onClick={() => { setMoreOpen(false); handleDuplicate(); }}>Duplicate</MoreItem>
                  <MoreItem danger onClick={() => { setMoreOpen(false); void handleDelete(); }}>Delete</MoreItem>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: isMobile ? "16px 16px 64px" : "24px 32px 80px" }}>
        {/* ── dark hero ─────────────────────────────────────────────────── */}
        <section style={{
          background: "var(--abv-ink, #1A1A1A)",
          color: "white",
          borderRadius: 16,
          padding: "28px 32px",
          marginBottom: 18,
        }}>
          <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: isMobile ? 16 : 24 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <TitleEditor
                value={form.title}
                placeholder="Untitled video"
                inputRef={titleH1Ref}
                onCommit={(v) => {
                  if (v === form.title) return;
                  setForm((f) => ({ ...f, title: v }));
                }}
              />
              <div style={{
                display: "flex", gap: 18, flexWrap: "wrap",
                fontSize: 12, color: "rgba(255,255,255,0.6)",
                fontFamily: "var(--font-mono, ui-monospace)",
              }}>
                <span>Publish · {formatLongDate(form.publishDate)}</span>
                <span>Shoot · {formatLongDate(form.shootDate)}</span>
                <span>{wordCount(form.script).toLocaleString()} words</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: isMobile ? "flex-start" : "flex-end" }}>
              {heroThumbnailUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={heroThumbnailUrl}
                  alt="Video thumbnail"
                  style={{
                    width: 160,
                    aspectRatio: "16 / 9",
                    objectFit: "cover",
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.18)",
                    display: "block",
                    background: "rgba(0,0,0,0.3)",
                  }}
                />
              )}
            </div>
          </div>
        </section>

        {/* ── two-pane layout ──────────────────────────────────────────── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) 340px",
          gap: isMobile ? 16 : 24,
          alignItems: "start",
        }}>
          {/* LEFT: script pane */}
          <ScriptPane
            value={form.script}
            onChange={(v) => update("script", v)}
            onBlur={() => void flush()}
            planId={planId}
            title={form.title}
            textareaRef={scriptTextareaRef}
            onExport={handleExport}
            onRegenerate={handleRegenerate}
            dataPeriod={groundedPeriod}
          />

          {/* RIGHT: sidebar */}
          <aside
            style={{
              position: isMobile ? "static" : "sticky",
              top: 16,
              alignSelf: "start",
              display: "grid",
              gap: 12,
              maxHeight: isMobile ? undefined : "calc(100vh - 32px)",
              overflowY: isMobile ? undefined : "auto",
            }}
          >
            <TabStrip
              active={activeTab}
              onChange={setActiveTab}
            />

            {activeTab === "planning" && (
              <PlanningTab
                planId={planId}
                canUseDrive={canUseDrive}
                plan={plan}
                form={form}
                update={update}
                statusOptions={statusOptions}
                themes={themes}
                campaigns={campaigns}
                bingeOptions={bingeOptions}
                loadBingeOptions={loadBingeOptions}
                showEditDue={showEditDue}
                onDelete={handleDelete}
                onBlur={() => void flush()}
                onGenerateResearchPrompt={generateResearchPrompt}
                researchPromptCopied={researchPromptCopied}
                researchPromptError={researchPromptError}
                statusSelectRef={statusSelectRef}
                shootDateRef={shootDateRef}
                editDueDateRef={editDueDateRef}
                publishDateRef={publishDateRef}
                researchNotesRef={researchNotesRef}
              />
            )}

            {activeTab === "packaging" && (
              <PackagingTab
                planId={planId}
                plan={plan}
                form={form}
                update={update}
                onBlur={() => void flush()}
                onPersist={patchPlan}
              />
            )}

            {activeTab === "tools" && (
              <ToolsTab planId={planId} lineage={lineage} />
            )}

            {activeTab === "publishing" && (
              <PublishingTab
                planId={planId}
                form={form}
                update={update}
                onBlur={() => void flush()}
              />
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────
// ── Teleprompter Mode ────────────────────────────────────────────────────────
// Reduce a stored script to the clean, spoken-only text members read aloud:
// stripToDialogue() removes [VISUAL: …] cues and every internal slot marker
// ([STRESSOR BEAT], [LEAD MAGNET n/3], …), headings, and the ## Sources
// footnote. We then drop leftover markdown emphasis/markers so nothing but the
// words shows on the prompter.
function toTeleprompterText(script: string): string {
  const { dialogue } = stripToDialogue(script || "");
  return dialogue
    .replace(/\*\*/g, "")          // bold markers
    .replace(/`+/g, "")            // inline code ticks
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // any stray heading markers
    .replace(/^\s*[-*+]\s+/gm, "") // bullet list markers
    .replace(/^\s*>\s?/gm, "")     // blockquote markers
    .replace(/\n{3,}/g, "\n\n")    // collapse big gaps
    .trim();
}

function buildTeleprompterHtml(title: string, text: string): string {
  // Inject the script as a JSON string and set it via textContent so script
  // contents can never break out of the document or run as markup.
  const safeText = JSON.stringify(text).replace(/</g, "\\u003c");
  const safeTitle = (title || "Script")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Teleprompter — ${safeTitle}</title>
<style>
  :root { --fs: 44px; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: #000; color: #fff; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  #bar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 10;
    display: flex; gap: 16px; align-items: center; justify-content: center; flex-wrap: wrap;
    padding: 10px 16px; background: rgba(18,18,18,0.96); border-bottom: 1px solid #2a2a2a;
    font-size: 13px;
  }
  #bar .group { display: flex; align-items: center; gap: 8px; }
  #bar label { color: #9a9a9a; }
  #bar button {
    background: #222; color: #fff; border: 1px solid #444; border-radius: 6px;
    padding: 6px 12px; font-size: 13px; cursor: pointer;
  }
  #bar button:hover { background: #333; }
  #play { min-width: 96px; font-weight: 600; }
  input[type=range] { accent-color: #fff; cursor: pointer; }
  #scroller { height: 100%; overflow-y: auto; padding-top: 60px; scroll-behavior: auto; }
  #content {
    max-width: 920px; margin: 0 auto; padding: 12vh 36px 85vh;
    font-size: var(--fs); line-height: 1.6; font-weight: 500;
    text-align: center; white-space: pre-wrap; word-wrap: break-word; letter-spacing: 0.01em;
  }
  #hint { color: #6a6a6a; }
</style>
</head>
<body>
  <div id="bar">
    <div class="group"><button id="play">▶ Play</button></div>
    <div class="group">
      <label for="speed">Speed</label>
      <input id="speed" type="range" min="1" max="20" value="6" />
    </div>
    <div class="group">
      <label>Size</label>
      <button id="smaller" title="Smaller text">A−</button>
      <button id="bigger" title="Larger text">A+</button>
    </div>
    <div class="group"><span id="hint">Spacebar = play / pause</span></div>
  </div>
  <div id="scroller"><div id="content"></div></div>
  <script>
    (function () {
      var TEXT = ${safeText};
      var scroller = document.getElementById('scroller');
      var content = document.getElementById('content');
      var playBtn = document.getElementById('play');
      var speed = document.getElementById('speed');
      content.textContent = TEXT || 'This script is empty.';
      var playing = false, raf = null, acc = 0, fs = 44;
      function atBottom() {
        return scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
      }
      function step() {
        if (!playing) return;
        acc += Number(speed.value) / 4; // px per frame, tuned by the speed slider
        if (acc >= 1) { scroller.scrollTop += Math.floor(acc); acc -= Math.floor(acc); }
        if (atBottom()) { stop(); return; }
        raf = requestAnimationFrame(step);
      }
      function play() {
        if (playing) return;
        if (atBottom()) scroller.scrollTop = 0;
        playing = true; playBtn.textContent = '❚❚ Pause'; raf = requestAnimationFrame(step);
      }
      function stop() {
        playing = false; playBtn.textContent = '▶ Play';
        if (raf) { cancelAnimationFrame(raf); raf = null; }
      }
      function toggle() { playing ? stop() : play(); }
      function setFs(v) {
        fs = Math.max(20, Math.min(120, v));
        document.documentElement.style.setProperty('--fs', fs + 'px');
      }
      playBtn.addEventListener('click', toggle);
      document.getElementById('bigger').addEventListener('click', function () { setFs(fs + 4); });
      document.getElementById('smaller').addEventListener('click', function () { setFs(fs - 4); });
      window.addEventListener('keydown', function (e) {
        if (e.code === 'Space') { e.preventDefault(); toggle(); }
        else if (e.key === '+' || e.key === '=') { setFs(fs + 4); }
        else if (e.key === '-' || e.key === '_') { setFs(fs - 4); }
      });
    })();
  </script>
</body>
</html>`;
}

function ScriptPane({
  value, onChange, onBlur, planId, title, textareaRef, onExport, onRegenerate, dataPeriod,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  planId: string;
  title: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  onExport: () => void;
  onRegenerate: () => void;
  dataPeriod?: string | null;
}) {
  const words = wordCount(value);
  // Data-grounded scripts carry a "## Sources" footnote (the engine appends it,
  // never read aloud). Show the standing "verify against your live MLS" line as
  // a UI element only when that footnote is present — not on hand-written drafts.
  const isGrounded = /(^|\n)\s*(#{1,6}\s*Sources|\*\*Sources:?\*\*)\s*(\n|$)/i.test(value);
  const minutes = Math.max(1, Math.round(words / 175));
  const cameraSec = Math.round(words / 150 * 60);
  const cm = Math.floor(cameraSec / 60);
  const cs = String(cameraSec % 60).padStart(2, "0");

  // Two-state script body: rendered markdown (view) ↔ raw textarea (edit).
  const [mode, setMode] = useState<"view" | "edit">("view");

  const handleCopy = () => {
    // Copy raw markdown — that's what members paste into a teleprompter.
    navigator.clipboard.writeText(value);
  };

  const enterEdit = () => {
    setMode("edit");
    // Focus the textarea once it has mounted.
    requestAnimationFrame(() => {
      const el = textareaRef?.current;
      if (el) {
        el.focus();
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    });
  };

  // Open the spoken-only script in a dedicated read-only teleprompter window.
  // Never touches the stored script.
  const openTeleprompter = () => {
    // NOTE: do NOT pass "noopener" — that makes window.open() return null, so we
    // lose the handle needed to write the teleprompter document (the tab still
    // opens, but stays blank). We control the written content, so it's safe.
    const win = window.open("", "_blank");
    if (!win) {
      // Popup blocked — fall back to copying so the work isn't lost.
      window.alert("Please allow pop-ups for this site to open Teleprompter Mode.");
      return;
    }
    win.document.open();
    win.document.write(buildTeleprompterHtml(title, toTeleprompterText(value)));
    win.document.close();
  };

  return (
    <section style={{ display: "grid", gap: 12 }}>
      {/* toolbar */}
      <div style={{
        background: "white", border: "1px solid var(--abv-border)",
        borderRadius: 10, padding: "6px 8px",
        display: "flex", gap: 4, flexWrap: "wrap", alignSelf: "flex-start",
      }}>
        <ToolbarBtn label="↻ Regenerate" onClick={onRegenerate} />
        <Link
          href={`/member/content-tools/script-review?planId=${planId}`}
          style={{
            padding: "6px 12px", borderRadius: 8, fontSize: 11,
            fontWeight: 600, color: "var(--abv-text-muted)",
          }}
          className="hover:bg-[var(--abv-bg-warm)] hover:text-[var(--abv-text)]"
        >Self-Review</Link>
        <ToolbarBtn label="Copy" onClick={handleCopy} />
        <ToolbarBtn label="Export" onClick={onExport} />
        <ToolbarBtn label="🎬 Teleprompter" onClick={openTeleprompter} />
        {mode === "edit"
          ? <ToolbarBtn label="✓ Done" onClick={() => { onBlur(); setMode("view"); }} emphasis />
          : <ToolbarBtn label="✎ Edit" onClick={enterEdit} emphasis />}
      </div>

      {/* editor */}
      <div style={{
        background: "white", border: "1px solid var(--abv-border)",
        borderRadius: 14, padding: 24, overflow: "hidden", minWidth: 0,
      }}>
        {mode === "edit" ? (
          // Reuse the existing WYSIWYG editor (tiptap, markdown round-trip) so
          // members edit formatted text, not raw markdown. onChange flows back
          // into form.script → debounced autosave persists in place; "✓ Done"
          // flushes immediately. Hidden textarea preserves the focus ref +
          // raw-value contract the rest of the pane relies on.
          <>
            <textarea ref={textareaRef} value={value} readOnly hidden aria-hidden tabIndex={-1} />
            <RichMarkdownEditor
              value={value}
              onChange={onChange}
              placeholder={`Start writing your script for "${title || "this video"}"…`}
              ariaLabel="Edit script"
              minHeight="480px"
            />
          </>
        ) : value.trim() ? (
          <div
            onClick={enterEdit}
            title="Click to edit"
            style={{
              minHeight: 480, cursor: "text",
              fontFamily: "var(--font-sans, ui-sans-serif)",
              fontSize: 14, color: "var(--abv-text)",
            }}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
              {value}
            </ReactMarkdown>
          </div>
        ) : (
          <div
            onClick={enterEdit}
            style={{
              minHeight: 480, cursor: "text",
              fontFamily: "var(--font-sans, ui-sans-serif)",
              fontSize: 14, lineHeight: 1.7, color: "var(--abv-text-muted)",
            }}
          >
            {`Start writing your script for "${title || "this video"}"…`}
          </div>
        )}
        <div style={{
          display: "flex", gap: 18, marginTop: 16,
          fontSize: 11, fontFamily: "var(--font-mono, ui-monospace)",
          color: "var(--abv-text-muted)",
          borderTop: "1px solid var(--abv-border)",
          paddingTop: 12,
        }}>
          <span><b style={{ color: "var(--abv-text)" }}>{words.toLocaleString()}</b> words</span>
          <span>~ <b style={{ color: "var(--abv-text)" }}>{minutes} min</b> read</span>
          <span>~ <b style={{ color: "var(--abv-text)" }}>{cm}:{cs}</b> on camera</span>
        </div>
      </div>

      {/* Standing accuracy line — rendered as a UI element near the Sources
          block, NOT baked into the script text (so it can't be edited away and
          doesn't eat the word count). Only on data-grounded scripts. */}
      {isGrounded && (
        <div style={{
          background: "var(--abv-azure-tint, #E0F2FE)",
          border: "1px solid rgba(59,130,246,0.2)",
          borderRadius: 10,
          padding: "10px 14px",
          fontSize: 12, lineHeight: 1.6,
          color: "var(--abv-text-secondary, #475569)",
        }}>
          {buildMlsVerifyLine(dataPeriod)}
        </div>
      )}
    </section>
  );
}

function ToolbarBtn({ label, onClick, emphasis }: { label: string; onClick?: () => void; emphasis?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 12px", borderRadius: 8, fontSize: 11,
        fontWeight: 600,
        color: emphasis ? "var(--abv-text)" : "var(--abv-text-muted)",
        background: emphasis ? "var(--abv-bg-warm)" : "transparent",
      }}
      className="hover:bg-[var(--abv-bg-warm)] hover:text-[var(--abv-text)]"
    >{label}</button>
  );
}

function TabStrip({
  active, onChange,
}: {
  active: string;
  onChange: (t: "planning" | "packaging" | "tools" | "publishing") => void;
}) {
  const tabs: Array<{ id: "planning" | "packaging" | "tools" | "publishing"; label: string }> = [
    { id: "planning", label: "Planning" },
    { id: "packaging", label: "Packaging" },
    { id: "tools", label: "Tools" },
    { id: "publishing", label: "Publishing" },
  ];
  return (
    <div style={{
      background: "white", border: "1px solid var(--abv-border)",
      borderRadius: 12, padding: 4,
      display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 2,
    }}>
      {tabs.map((t) => {
        const isOn = active === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              padding: "8px 4px",
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              background: isOn ? "var(--abv-ink)" : "transparent",
              color: isOn ? "white" : "var(--abv-text-muted)",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
            }}
          >
            <span>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Panel({ title, headerRight, children }: {
  title: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background: "white", border: "1px solid var(--abv-border)",
      borderRadius: 12, overflow: "hidden",
    }}>
      <div style={{
        padding: "10px 14px",
        borderBottom: "1px solid var(--abv-border)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "transparent",
      }}>
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
          textTransform: "uppercase", color: "var(--abv-text-muted)",
        }}>{title}</span>
        {headerRight}
      </div>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "8px 14px",
      borderBottom: "1px solid var(--abv-border)",
      fontSize: 12,
    }}>
      <span style={{ color: "var(--abv-text-muted)" }}>{k}</span>
      <span style={{ color: "var(--abv-text)", fontWeight: 500 }}>{v}</span>
    </div>
  );
}

function PlanningTab({
  planId, canUseDrive, plan, form, update, statusOptions, themes,
  campaigns, bingeOptions, loadBingeOptions, showEditDue,
  onDelete, onBlur,
  onGenerateResearchPrompt, researchPromptCopied, researchPromptError,
  statusSelectRef, shootDateRef, editDueDateRef, publishDateRef, researchNotesRef,
}: {
  planId: string;
  canUseDrive: boolean;
  plan: ContentPlan;
  form: Form;
  update: <K extends keyof Form>(k: K, v: Form[K]) => void;
  statusOptions: string[];
  themes: Theme[];
  campaigns: Campaign[];
  bingeOptions: BingeOption[];
  loadBingeOptions: () => void;
  showEditDue: boolean;
  onDelete: () => void;
  onBlur: () => void;
  onGenerateResearchPrompt: () => void;
  researchPromptCopied: boolean;
  researchPromptError: string;
  statusSelectRef?: React.RefObject<HTMLSelectElement | null>;
  shootDateRef?: React.RefObject<HTMLInputElement | null>;
  editDueDateRef?: React.RefObject<HTMLInputElement | null>;
  publishDateRef?: React.RefObject<HTMLInputElement | null>;
  researchNotesRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const selectedCampaign = campaigns.find((c) => c.id === form.linkedCampaignId) ?? null;
  const selectedBinge = (() => {
    const id = form.bingeVideoId;
    if (!id) return null;
    return bingeOptions.find((o) => o.id === id) ?? plan.bingeVideo ?? null;
  })();
  return (
    <>
      <Panel title="Status & dates">
        <div style={{ padding: "12px 14px 6px" }}>
          <select
            ref={statusSelectRef}
            value={form.status}
            onChange={(e) => update("status", e.target.value)}
            onBlur={onBlur}
            style={{
              padding: "5px 12px", borderRadius: 6,
              border: "none",
              fontSize: 11, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.04em",
              color: getStatusPillStyle(form.status).fg,
              background: getStatusPillStyle(form.status).bg,
            }}
          >
            {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <DateRow label="Film" value={form.shootDate} onChange={(v) => update("shootDate", v)} onBlur={onBlur} inputRef={shootDateRef} />
        {showEditDue && (
          <DateRow label="Edit due" value={form.editDueDate} onChange={(v) => update("editDueDate", v)} onBlur={onBlur} inputRef={editDueDateRef} />
        )}
        <DateRow label="Publish" value={form.publishDate} onChange={(v) => update("publishDate", v)} onBlur={onBlur} inputRef={publishDateRef} />
      </Panel>

      {canUseDrive && <DriveFolderSection planId={planId} />}

      <Panel title="Theme & location">
        <div style={{ padding: "8px 14px" }}>
          <label style={{
            display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
            textTransform: "uppercase", color: "var(--abv-text-muted)", marginBottom: 4,
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%", display: "inline-block",
              background: form.theme ? getThemeVisual(form.theme).fg : "var(--abv-text-dim)",
            }} />
            Video Theme
          </label>
          <select
            value={form.theme}
            onChange={(e) => update("theme", e.target.value)}
            onBlur={onBlur}
            style={{ width: "100%", fontSize: 12, padding: "6px 8px", border: "1px solid var(--abv-border)", borderRadius: 6 }}
          >
            <option value="">— Theme —</option>
            {themes.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
            {form.theme && !themes.find((t) => t.value === form.theme) && (
              <option value={form.theme}>{form.theme}</option>
            )}
          </select>
        </div>
        <Row k="Location" v={
          <select
            value={form.shootLocation}
            onChange={(e) => update("shootLocation", e.target.value)}
            onBlur={onBlur}
            style={{ fontSize: 12, border: "1px solid var(--abv-border)", borderRadius: 6, padding: "3px 6px" }}
          >
            <option value="">Not set</option>
            <option value="In Studio">In Studio</option>
            <option value="Out of Studio">Out of Studio</option>
          </select>
        } />
      </Panel>

      <Panel title="Notes & Thoughts">
        <div style={{ padding: 12 }}>
          <textarea
            value={form.thoughts}
            onChange={(e) => update("thoughts", e.target.value)}
            onBlur={onBlur}
            placeholder="Your raw thoughts, hooks, angles…"
            style={{
              width: "100%", minHeight: 90, padding: 10,
              border: "1px solid var(--abv-border)", borderRadius: 6,
              fontSize: 12, lineHeight: 1.5, resize: "vertical",
              fontFamily: "var(--font-sans, ui-sans-serif)", boxSizing: "border-box",
            }}
          />
        </div>
      </Panel>

      <Panel title="Research notes" headerRight={
        <button
          onClick={onGenerateResearchPrompt}
          style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
            textTransform: "uppercase", color: "var(--abv-ai-tools)",
          }}
        >
          {researchPromptCopied ? "✓ Copied" : researchPromptError ? researchPromptError : "Copy prompt"}
        </button>
      }>
        <div style={{ padding: 12 }}>
          <textarea
            ref={researchNotesRef}
            value={form.researchNotes}
            onChange={(e) => update("researchNotes", e.target.value)}
            onBlur={onBlur}
            placeholder="Paste deep research, stats, sources…"
            style={{
              width: "100%", minHeight: 90, padding: 10,
              border: "1px solid var(--abv-border)", borderRadius: 6,
              fontSize: 12, lineHeight: 1.5, resize: "vertical",
              fontFamily: "var(--font-sans, ui-sans-serif)", boxSizing: "border-box",
            }}
          />
        </div>
      </Panel>

      <Panel title="Binge target">
        <div style={{ padding: 12 }}>
          <select
            value={form.bingeVideoId}
            onChange={(e) => update("bingeVideoId", e.target.value)}
            onFocus={loadBingeOptions}
            onBlur={onBlur}
            style={{ width: "100%", fontSize: 12, padding: "6px 8px", border: "1px solid var(--abv-border)", borderRadius: 6 }}
          >
            <option value="">— Select a video to binge to —</option>
            {selectedBinge && !bingeOptions.find((o) => o.id === selectedBinge.id) && (
              <option value={selectedBinge.id}>{selectedBinge.title}</option>
            )}
            {bingeOptions.map((o) => (
              <option key={o.id} value={o.id}>{o.title}</option>
            ))}
          </select>
        </div>
      </Panel>

      <Panel title="Binge connections">
        <div style={{ padding: 14, fontSize: 12, color: "var(--abv-text-muted)" }}>
          {plan.bingedFromList && plan.bingedFromList.length > 0 ? (
            <>
              <div style={{ fontSize: 10, textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>Binging from</div>
              {plan.bingedFromList.map((b) => (
                <div key={b.id} style={{ marginBottom: 8, color: "var(--abv-text)" }}>{b.title}</div>
              ))}
            </>
          ) : null}
          {plan.bingeVideo && (
            <>
              <div style={{ fontSize: 10, textTransform: "uppercase", fontWeight: 700, marginTop: 8, marginBottom: 6 }}>Binging to</div>
              <div style={{ color: "var(--abv-text)" }}>{plan.bingeVideo.title}</div>
            </>
          )}
          {!plan.bingeVideo && (!plan.bingedFromList || plan.bingedFromList.length === 0) && (
            <span>No binge connections yet.</span>
          )}
        </div>
      </Panel>

      <Panel title="Lead magnet">
        <div style={{ padding: 12 }}>
          <select
            value={form.linkedCampaignId}
            onChange={(e) => update("linkedCampaignId", e.target.value)}
            onBlur={onBlur}
            style={{ width: "100%", fontSize: 12, padding: "6px 8px", border: "1px solid var(--abv-border)", borderRadius: 6 }}
          >
            <option value="">— None —</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {campaigns.length === 0 && (
            <p style={{ marginTop: 6, fontSize: 11, fontStyle: "italic", color: "var(--abv-text-muted)" }}>
              No campaigns yet — create one on the{" "}
              <a href="/member/campaigns" style={{ color: "var(--abv-azure)", textDecoration: "underline" }}>Campaigns page</a>.
            </p>
          )}
          {selectedCampaign && !selectedCampaign.pitchOneLiner && (
            <p style={{ marginTop: 6, fontSize: 11, fontStyle: "italic", color: "#B45309" }}>
              No calibrated pitch defined.{" "}
              <a href={`/member/campaigns/${selectedCampaign.id}`} style={{ textDecoration: "underline" }}>Edit detail</a>.
            </p>
          )}
        </div>
      </Panel>

      <Panel title="Danger zone">
        <div style={{ padding: 14 }}>
          <p style={{ fontSize: 11, color: "var(--abv-text-muted)", lineHeight: 1.5, marginBottom: 10 }}>
            Deleting removes this plan from your planner. Your coaching team can restore it if you
            change your mind — the script, research, and AI-generated content stay saved.
          </p>
          <QuickBtn onClick={onDelete} danger>Delete this plan</QuickBtn>
        </div>
      </Panel>
    </>
  );
}

type DriveFile = { id: string; name: string; webViewLink: string | null; modifiedTime: string | null; mimeType: string | null };

// Drive folder card — Production-tier only. Surfaces the plan's Google Drive
// project folder and its contents (including thumbnails pushed there on upload)
// right inside the editor, and lets the member spin one up on demand if it
// hasn't been created yet.
// Member-facing copy for each structured Drive error category returned by the
// API ({ error: <category>, message }). We key off the stable category and fall
// back to the server message, then a generic line.
const DRIVE_ERROR_UI: Record<string, string> = {
  not_configured: "Google Drive isn't fully set up yet — your coaching team needs to finish connecting it.",
  auth_failed: "We couldn't sign in to Google Drive. Your team may need to re-authorize the connection.",
  permission_denied: "We don't have permission to manage the Drive folder. Your team may need to re-share it.",
  quota_exceeded: "The connected Google Drive is out of storage. Your team needs to free up space.",
  rate_limited: "Google Drive is busy right now. Wait a moment and try again.",
  not_found: "The Drive parent folder couldn't be found. Your team may need to reset the Drive setup.",
  unknown: "Something went wrong creating the Drive folder. Please try again.",
  tier_restricted: "Drive folders are a Production-tier feature.",
};

function driveErrorMessage(data: { error?: string; message?: string } | null | undefined): string {
  if (!data) return DRIVE_ERROR_UI.unknown;
  if (data.error && DRIVE_ERROR_UI[data.error]) return DRIVE_ERROR_UI[data.error];
  return data.message || DRIVE_ERROR_UI.unknown;
}

function DriveFolderSection({ planId }: { planId: string }) {
  const [folderUrl, setFolderUrl] = useState<string | null>(null);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/member/content-plans/${planId}/drive-files`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Couldn't load the Drive folder.");
        return r.json();
      })
      .then((d) => {
        setFolderUrl(d?.folderUrl ?? null);
        setFiles(Array.isArray(d?.files) ? (d.files as DriveFile[]) : []);
      })
      .catch(() => setError("Couldn't load the Drive folder."))
      .finally(() => setLoading(false));
  }, [planId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/member/content-plans/${planId}/drive-folder`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(driveErrorMessage(data));
      setFolderUrl(data.driveFolderLink ?? null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : DRIVE_ERROR_UI.unknown);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Panel title="Drive folder" headerRight={
      folderUrl ? (
        <a href={folderUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--abv-ai-tools)", fontWeight: 600 }}>
          Open ↗
        </a>
      ) : null
    }>
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {error && <div style={{ fontSize: 11, color: "var(--abv-leads, #DC2626)" }}>{error}</div>}
        {loading ? (
          <div style={{ fontSize: 12, color: "var(--abv-text-muted)" }}>Loading…</div>
        ) : !folderUrl ? (
          <>
            <div style={{ fontSize: 12, color: "var(--abv-text-muted)", lineHeight: 1.5 }}>
              No Drive folder yet. Create one to store footage, thumbnails, and assets for this video.
            </div>
            <div>
              <QuickBtn onClick={() => void handleCreate()}>
                {creating ? "Creating…" : "+ Create Drive folder"}
              </QuickBtn>
            </div>
          </>
        ) : files.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--abv-text-muted)", lineHeight: 1.5 }}>
            Folder is empty. Uploaded thumbnails and assets will appear here.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {files.map((f) => (
              <a
                key={f.id}
                href={f.webViewLink ?? folderUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                  padding: "6px 8px", border: "1px solid var(--abv-border)", borderRadius: 6,
                  fontSize: 12, color: "var(--abv-text)",
                }}
                className="hover:bg-[var(--abv-bg-warm)]"
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                <span style={{ color: "var(--abv-ai-tools)", flexShrink: 0 }}>↗</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

function DateRow({
  label, value, onChange, onBlur, inputRef,
}: {
  label: string; value: string;
  onChange: (v: string) => void; onBlur: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "8px 14px", borderBottom: "1px solid var(--abv-border)",
      fontSize: 12,
    }}>
      <span style={{ color: "var(--abv-text-muted)" }}>{label}</span>
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        style={{
          fontFamily: "var(--font-mono, ui-monospace)", fontSize: 11,
          fontVariantNumeric: "tabular-nums",
          border: "1px solid var(--abv-border-strong)", borderRadius: 8, padding: "3px 6px",
        }}
      />
    </div>
  );
}

function QuickBtn({ children, onClick, danger, accent }: { children: React.ReactNode; onClick: () => void; danger?: boolean; accent?: boolean }) {
  const borderColor = danger
    ? "var(--abv-leads-tint, #FECACA)"
    : accent ? "var(--abv-azure)" : "var(--abv-border)";
  const textColor = danger
    ? "var(--abv-leads, #DC2626)"
    : accent ? "var(--abv-azure)" : "var(--abv-text)";
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 10px",
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        background: "white",
        fontSize: 11, fontWeight: 600,
        color: textColor,
      }}
      className="hover:bg-[var(--abv-bg-warm)]"
    >{children}</button>
  );
}

function MoreItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "block", width: "100%", textAlign: "left",
        padding: "8px 12px", borderRadius: 6,
        fontSize: 12, fontWeight: 500,
        color: danger ? "var(--abv-leads, #DC2626)" : "var(--abv-text)",
      }}
      className="hover:bg-[var(--abv-bg-warm)]"
    >{children}</button>
  );
}

function ToolsTab({ planId, lineage }: { planId: string; lineage: Lineage | null }) {
  const tools: Array<{ icon: string; name: string; desc: string; href: string; primary?: boolean }> = [
    { icon: "✅", name: "Script Review", desc: "Score this script before you film", href: `/member/content-tools/script-review?planId=${planId}`, primary: true },
    { icon: "📝", name: "ARC Builder", desc: "Rebuild from outline", href: `/member/content-tools/arc-script-builder?planId=${planId}` },
    { icon: "🔬", name: "Title & Thumb", desc: "A/B test the hook visually", href: `/member/content-tools/title-thumbnail-analyzer?planId=${planId}` },
    { icon: "🎯", name: "Avatar Architect", desc: "Recheck against your avatar", href: `/member/content-tools/avatar-architect` },
    { icon: "🔁", name: "Repurpose", desc: "One video into shorts, threads, emails", href: `/member/content-tools/repurpose-content?planId=${planId}` },
    { icon: "📄", name: "Description Generator", desc: "YouTube descriptions, ready to paste", href: `/member/content-tools/description-generator?planId=${planId}` },
  ];
  return (
    <>
      <Panel title="Send to AI tools" headerRight={
        <span style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 9, color: "var(--abv-text-muted)" }}>uses script</span>
      }>
        <div style={{ display: "grid", gap: 4, padding: 6 }}>
          {tools.map((t) => (
            <Link
              key={t.name}
              href={t.href}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 10px", borderRadius: 8,
                background: t.primary ? "var(--abv-azure-tint)" : "transparent",
              }}
              className="hover:bg-[var(--abv-bg-warm)]"
            >
              <span style={{ fontSize: 16 }}>{t.icon}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: t.primary ? "var(--abv-azure)" : "var(--abv-text)" }}>
                  {t.name}
                </div>
                <div style={{ fontSize: 11, color: "var(--abv-text-muted)" }}>{t.desc}</div>
              </span>
              <span style={{ color: "var(--abv-text-muted)" }}>→</span>
            </Link>
          ))}
        </div>
      </Panel>

      {lineage && lineage.facts.length > 0 && (
        <Panel title="Linked facts">
          <div style={{ padding: 12, display: "grid", gap: 6 }}>
            {lineage.facts.slice(0, 3).map((f) => (
              <div key={f.id} style={{
                padding: "8px 10px", background: "var(--abv-bg-warm)",
                borderRadius: 6, fontSize: 11, lineHeight: 1.4,
              }}>
                {f.metricLabel} in {f.neighbourhood}: <b>{f.metricValueString}</b>
                {f.monthYear && <span style={{ color: "var(--abv-text-muted)" }}> · {f.monthYear}</span>}
              </div>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}

type ClientThumbnailVariant = {
  id: string;
  fileName: string;
  mimeType: string;
  storage: "object" | "drive";
  score?: number | null;
  scoreNotes?: string | null;
  createdAt: string;
};

function parseClientVariants(raw: unknown): ClientThumbnailVariant[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (v): v is ClientThumbnailVariant =>
      !!v && typeof v === "object" && typeof (v as ClientThumbnailVariant).id === "string",
  );
}

const YT_DESC_MAX = 5000;
const PINNED_MAX = 1000;
const MAX_THUMBS = 3;

function PackagingTab({
  planId, plan, form, update, onBlur, onPersist,
}: {
  planId: string;
  plan: ContentPlan;
  form: Form;
  update: <K extends keyof Form>(k: K, v: Form[K]) => void;
  onBlur: () => void;
  onPersist: (partial: Record<string, unknown>) => void;
}) {
  const apiBase = "/api/member/content-plans";
  const [variants, setVariants] = useState<ClientThumbnailVariant[]>(() =>
    parseClientVariants((plan as unknown as { thumbnailVariants?: unknown }).thumbnailVariants),
  );
  const [winnerId, setWinnerId] = useState<string | null>(
    (plan as unknown as { thumbnailWinnerId?: string | null }).thumbnailWinnerId ?? null,
  );
  const [uploading, setUploading] = useState(false);
  const [scoringId, setScoringId] = useState<string | null>(null);
  const [thumbError, setThumbError] = useState<string | null>(null);
  const [channel, setChannel] = useState<{ name: string | null; avatar: string | null }>({
    name: null,
    avatar: null,
  });
  const fileRef = useRef<HTMLInputElement>(null);

  // Load the member's own YouTube channel name + avatar so the A/B previews can
  // be rendered as realistic YouTube cards.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/member/channel")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) {
          setChannel({
            name: d.youtubeChannelName ?? null,
            avatar: d.youtubeChannelThumbnail ?? null,
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpload = async (file: File) => {
    setThumbError(null);
    // Direct-to-Object-Storage upload: the file bytes go straight to storage via
    // a signed PUT URL and never pass through the app handler — that body-ingress
    // hop is what stalled the old multipart POST in production. The app only does
    // two tiny JSON calls (presign + finalize), then fires an optional Drive copy.
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setThumbError("Only PNG or JPG images are allowed.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setThumbError("Image must be 5MB or smaller.");
      return;
    }
    setUploading(true);
    try {
      // 1. Presign — validate + mint a short-lived signed PUT URL.
      const presignRes = await fetch(`${apiBase}/${planId}/thumbnails/presign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type, size: file.size, fileName: file.name }),
      });
      const presign = await presignRes.json();
      if (!presignRes.ok) {
        const msg = presign?.error || "Upload failed";
        throw new Error(presign?.ticket ? `${msg} (ref: ${presign.ticket})` : msg);
      }
      const { uploadUrl, variantId } = presign as { uploadUrl: string; variantId: string };

      // 2. PUT the bytes directly to Object Storage. Abort after 60s so a stalled
      // upload can never leave the button stuck on "Uploading…" forever.
      const putCtrl = new AbortController();
      const putTimeout = setTimeout(() => putCtrl.abort(), 60_000);
      let putRes: Response;
      try {
        putRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
          signal: putCtrl.signal,
        });
      } finally {
        clearTimeout(putTimeout);
      }
      if (!putRes.ok) throw new Error("Upload to storage failed — please try again.");

      // 3. Finalize — server confirms + re-validates the object, then persists.
      const finRes = await fetch(`${apiBase}/${planId}/thumbnails/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId, contentType: file.type, fileName: file.name }),
      });
      const fin = await finRes.json();
      if (!finRes.ok) {
        const msg = fin?.error || "Upload failed";
        throw new Error(fin?.ticket ? `${msg} (ref: ${fin.ticket})` : msg);
      }
      setVariants(parseClientVariants(fin.variants));
      onPersist({ thumbnailVariants: fin.variants });

      // 4. Off the critical path: mirror into Google Drive when the plan has a
      // folder. Fire-and-forget — failures never block the member.
      if (fin.drivePending) {
        void fetch(`${apiBase}/${planId}/thumbnails/drive-copy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ variantId }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (d?.ok && Array.isArray(d.variants)) {
              setVariants(parseClientVariants(d.variants));
              onPersist({ thumbnailVariants: d.variants });
            }
          })
          .catch(() => {});
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setThumbError("Upload timed out — please try again.");
      } else {
        setThumbError(e instanceof Error ? e.message : "Upload failed");
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleScore = async (id: string) => {
    setThumbError(null);
    setScoringId(id);
    try {
      const res = await fetch(`${apiBase}/${planId}/thumbnails/${id}/score`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Scoring failed");
      setVariants(parseClientVariants(data.variants));
      onPersist({ thumbnailVariants: data.variants });
    } catch (e) {
      setThumbError(e instanceof Error ? e.message : "Scoring failed");
    } finally {
      setScoringId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setThumbError(null);
    try {
      const res = await fetch(`${apiBase}/${planId}/thumbnails/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Delete failed");
      setVariants(parseClientVariants(data.variants));
      setWinnerId(data.thumbnailWinnerId ?? null);
      onPersist({ thumbnailVariants: data.variants, thumbnailWinnerId: data.thumbnailWinnerId ?? null });
    } catch (e) {
      setThumbError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const handleDownload = (id: string) => {
    const a = document.createElement("a");
    a.href = `${apiBase}/${planId}/thumbnails/${id}?download=1`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <>
      <Panel title="Title ideas">
        <div style={{ padding: 12 }}>
          <textarea
            value={form.thumbnailWords}
            onChange={(e) => update("thumbnailWords", e.target.value)}
            onBlur={onBlur}
            placeholder="Title and thumbnail ideas — hooks, angles, word options…"
            style={{
              width: "100%", minHeight: 90, padding: 10,
              border: "1px solid var(--abv-border)", borderRadius: 6,
              fontSize: 12, lineHeight: 1.5, resize: "vertical",
              fontFamily: "var(--font-sans, ui-sans-serif)", boxSizing: "border-box",
            }}
          />
        </div>
      </Panel>

      <Panel title="Thumbnail A/B" headerRight={
        <span style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 9, color: "var(--abv-text-muted)" }}>{variants.length} / {MAX_THUMBS}</span>
      }>
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {thumbError && (
            <div style={{ fontSize: 11, color: "var(--abv-leads, #DC2626)" }}>{thumbError}</div>
          )}
          {variants.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--abv-text-muted)", lineHeight: 1.5 }}>
              Upload up to {MAX_THUMBS} thumbnail options as a JPG as YouTube prefers JPG files. Score each one and choose what to upload.
            </div>
          )}
          {variants.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {variants.map((v, idx) => {
                const isWinner = winnerId === v.id;
                return (
                  <div key={v.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
                        textTransform: "uppercase", color: "var(--abv-text-muted)",
                      }}>Option {idx + 1}</span>
                      {isWinner && (
                        <span style={{
                          background: "var(--abv-azure)", color: "white",
                          fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4, letterSpacing: "0.04em",
                        }}>WINNER</span>
                      )}
                      {typeof v.score === "number" && (
                        <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: "var(--abv-text-muted)" }}>
                          Score {v.score}
                        </span>
                      )}
                    </div>
                    {/* Realistic YouTube preview card */}
                    <div style={{
                      borderRadius: 12, overflow: "hidden", background: "white",
                      border: `1px solid ${isWinner ? "var(--abv-azure)" : "var(--abv-border)"}`,
                      boxShadow: isWinner ? "0 0 0 1px var(--abv-azure)" : "none",
                    }}>
                      <div style={{ position: "relative", aspectRatio: "16/9", background: "#000" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`${apiBase}/${planId}/thumbnails/${v.id}`}
                          alt={v.fileName}
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        />
                        <span style={{
                          position: "absolute", bottom: 8, right: 8,
                          background: "rgba(0,0,0,0.8)", color: "white",
                          fontSize: 11, fontWeight: 600, padding: "1px 5px", borderRadius: 4, lineHeight: 1.4,
                        }}>10:24</span>
                      </div>
                      <div style={{ display: "flex", gap: 10, padding: 12 }}>
                        {channel.avatar ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={channel.avatar}
                            alt={channel.name ?? "Channel"}
                            style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, objectFit: "cover" }}
                          />
                        ) : (
                          <div style={{
                            width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                            background: "var(--abv-azure)", color: "white",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 15, fontWeight: 700,
                          }}>{(channel.name ?? "Y").charAt(0).toUpperCase()}</div>
                        )}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{
                            fontSize: 14, fontWeight: 600, lineHeight: 1.3, color: "var(--abv-text)",
                            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                          }}>{form.title?.trim() || "Your video title appears here"}</div>
                          <div style={{ fontSize: 12, color: "var(--abv-text-muted)", marginTop: 4 }}>
                            {channel.name ?? "Your channel"}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--abv-text-muted)" }}>
                            12K views · 2 days ago
                          </div>
                        </div>
                      </div>
                    </div>
                    {v.scoreNotes && (
                      <div style={{ fontSize: 10, color: "var(--abv-text-muted)", lineHeight: 1.4 }}>
                        {v.scoreNotes}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <QuickBtn onClick={() => void handleScore(v.id)}>
                        {scoringId === v.id ? "Scoring…" : typeof v.score === "number" ? "Re-score" : "Score"}
                      </QuickBtn>
                      <QuickBtn onClick={() => handleDownload(v.id)}>Download</QuickBtn>
                      <QuickBtn danger onClick={() => void handleDelete(v.id)}>Delete</QuickBtn>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {variants.length < MAX_THUMBS && (
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleUpload(f);
                }}
              />
              <QuickBtn onClick={() => fileRef.current?.click()}>
                {uploading ? "Uploading…" : "+ Upload thumbnail"}
              </QuickBtn>
            </div>
          )}
        </div>
      </Panel>

    </>
  );
}

function PublishingTab({
  planId, form, update, onBlur,
}: {
  planId: string;
  form: Form;
  update: <K extends keyof Form>(k: K, v: Form[K]) => void;
  onBlur: () => void;
}) {
  const apiBase = "/api/member/content-plans";
  const [drafting, setDrafting] = useState(false);

  const handleDraftComment = async () => {
    setDrafting(true);
    try {
      const res = await fetch(`${apiBase}/${planId}/pinned-comment`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Generation failed");
      update("pinnedComment", String(data.comment ?? "").slice(0, PINNED_MAX));
      onBlur();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setDrafting(false);
    }
  };

  const ytLen = form.youtubeDescription.length;
  const pinnedLen = form.pinnedComment.length;

  return (
    <>
      <Panel title="YouTube description" headerRight={
        <span style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 9, color: ytLen > YT_DESC_MAX ? "var(--abv-leads, #DC2626)" : "var(--abv-text-muted)" }}>{ytLen} / {YT_DESC_MAX}</span>
      }>
        <div style={{ padding: 12 }}>
          <textarea
            value={form.youtubeDescription}
            onChange={(e) => update("youtubeDescription", e.target.value)}
            onBlur={onBlur}
            placeholder="Write or paste the YouTube description for this video…"
            rows={6}
            style={{
              width: "100%", resize: "vertical", padding: 10, fontSize: 12,
              lineHeight: 1.5, border: "1px solid var(--abv-border)", borderRadius: 6,
              color: "var(--abv-text)", background: "white", fontFamily: "inherit",
            }}
          />
        </div>
        <div style={{
          padding: "8px 14px", borderTop: "1px solid var(--abv-border)",
          display: "flex", justifyContent: "flex-end",
        }}>
          <Link
            href={`/member/content-tools/description-generator?planId=${planId}`}
            style={{ fontSize: 11, color: "var(--abv-azure)", fontWeight: 600 }}
          >
            ✍️ Generate with Tool
          </Link>
        </div>
      </Panel>

      <Panel title="Pinned first comment" headerRight={
        <span style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 9, color: pinnedLen > PINNED_MAX ? "var(--abv-leads, #DC2626)" : "var(--abv-text-muted)" }}>{pinnedLen} / {PINNED_MAX}</span>
      }>
        <div style={{ padding: 12 }}>
          <textarea
            value={form.pinnedComment}
            onChange={(e) => update("pinnedComment", e.target.value.slice(0, PINNED_MAX))}
            onBlur={onBlur}
            placeholder="The first comment you'll pin under the video to spark replies…"
            rows={4}
            style={{
              width: "100%", resize: "vertical", padding: 10, fontSize: 12,
              lineHeight: 1.5, border: "1px solid var(--abv-border)", borderRadius: 6,
              color: "var(--abv-text)", background: "white", fontFamily: "inherit",
            }}
          />
        </div>
        <div style={{
          padding: "8px 14px", borderTop: "1px solid var(--abv-border)",
          display: "flex", justifyContent: "flex-end",
        }}>
          <QuickBtn accent onClick={() => void handleDraftComment()}>
            {drafting ? "Drafting…" : "✍️ Generate with Tool"}
          </QuickBtn>
        </div>
      </Panel>
    </>
  );
}

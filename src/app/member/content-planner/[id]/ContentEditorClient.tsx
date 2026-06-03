"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ContentPlan } from "@/components/content-planner/ContentPlanEditModal";
import { getStatusOptions, hasEditDueDate, PRODUCTION_TIERS, getPlanThumbnailUrl } from "@/lib/content-plan-utils";
import { hasDriveFolderAccess } from "@/lib/service-tier";
import { useToast } from "@/components/ToastProvider";

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
const STATUS_DOT: Record<string, string> = {
  Idea: "#9CA3AF",
  Scripted: "#06B6D4",
  Drafting: "#06B6D4",
  "Ready to Shoot": "#22C55E",
  Shooting: "#F59E0B",
  "Shot - In Post": "#F59E0B",
  Filmed: "#F59E0B",
  Editing: "#A855F7",
  "Ready to Post": "#3B82F6",
  Scheduled: "#3B82F6",
  Posted: "#10B981",
  Published: "#10B981",
  Archived: "#9CA3AF",
};

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
    <p style={{ margin: "0 0 12px", lineHeight: 1.7 }}>{injectTags(children)}</p>
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
// Workflow stepper — 7 steps with completion logic
// ─────────────────────────────────────────────────────────────────────────────
const STEPS = [
  { key: "idea", label: "Idea" },
  { key: "research", label: "Research" },
  { key: "script", label: "Script" },
  { key: "shoot", label: "Shoot" },
  { key: "post", label: "Post-prod" },
  { key: "publish", label: "Publish" },
  { key: "review", label: "Review" },
];

function stepStatus(plan: ContentPlan): Record<string, "done" | "current" | "todo"> {
  // Lightweight inference. "current" = the first non-done step. Everything
  // earlier is "done", everything later is "todo".
  const wc = wordCount(plan.script);
  const done = {
    idea: Boolean(plan.title && plan.title.trim().length > 0),
    research: Boolean(plan.notes || plan.researchNotes),
    script: wc >= 200,
    shoot: ["Filmed", "Shot - In Post", "Editing", "Ready to Post", "Scheduled", "Posted", "Published"].includes(plan.status),
    post: ["Editing", "Ready to Post", "Scheduled", "Posted", "Published"].includes(plan.status),
    publish: ["Posted", "Published"].includes(plan.status),
    review: false, // No signal yet on the planner side.
  };
  const out: Record<string, "done" | "current" | "todo"> = {};
  let foundCurrent = false;
  for (const s of STEPS) {
    const k = s.key as keyof typeof done;
    if (done[k]) {
      out[s.key] = "done";
    } else if (!foundCurrent) {
      out[s.key] = "current";
      foundCurrent = true;
    } else {
      out[s.key] = "todo";
    }
  }
  return out;
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
  const [activeTab, setActiveTab] = useState<"planning" | "connecting" | "tools" | "publish">("planning");
  const [lineage, setLineage] = useState<Lineage | null>(null);
  const [lineageOpen, setLineageOpen] = useState(true);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [bingeOptions, setBingeOptions] = useState<BingeOption[]>([]);
  const [bingeLoaded, setBingeLoaded] = useState(false);
  const [avatarData, setAvatarData] = useState<AvatarData>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [researchPromptCopied, setResearchPromptCopied] = useState(false);
  const [researchPromptError, setResearchPromptError] = useState("");
  const [now, setNow] = useState(Date.now());

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
    // body overwrite them (which would make PublishTab re-hydrate stale on remount).
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
  // so without this the parent `plan` would go stale and the PublishTab would
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
    alert("Duplicate is coming soon. For now use Add Video on the planner.");
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

  // ── v2 builder navigation ─────────────────────────────────────────────────
  const handleBuildV2 = async () => {
    await flush();
    router.push(`/member/content-planner/wizard/script?planId=${planId}`);
  };

  // ── completion / next-action mapping ──────────────────────────────────────
  // Read step state from the live form (merged with the persisted plan so we
  // still see server-side fields like bingeVideo). Without this merge the
  // hero/stepper lag every unsaved keystroke and feel wrong.
  const livePlan: ContentPlan = useMemo(
    () => ({
      ...plan,
      title: form.title,
      status: form.status,
      script: form.script,
      notes: form.notes,
    }),
    [plan, form.title, form.status, form.script, form.notes],
  );
  const steps = stepStatus(livePlan);
  const currentStepKey = STEPS.find((s) => steps[s.key] === "current")?.key ?? "review";
  const nextActionLabel = ({
    idea: "Add a working title →",
    research: "Add research notes →",
    script: "Continue writing →",
    shoot: "Mark as shot →",
    post: "Mark as edited →",
    publish: "Mark as posted →",
    review: "All done — review next batch →",
  } as Record<string, string>)[currentStepKey];

  // The "the" thumbnail for the hero: a picked Drive thumbnail, else the A/B
  // winner, else the first uploaded option. Reads from `plan` (kept fresh by
  // patchPlan after uploads) so it updates live when a thumbnail is added.
  const heroThumbnailUrl = useMemo(() => getPlanThumbnailUrl(plan), [plan]);

  const titleH1Ref = useRef<HTMLHeadingElement | null>(null);
  const scriptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lineageRef = useRef<HTMLDivElement | null>(null);
  const publishDateRef = useRef<HTMLInputElement | null>(null);
  const editDueDateRef = useRef<HTMLInputElement | null>(null);
  const shootDateRef = useRef<HTMLInputElement | null>(null);
  const statusSelectRef = useRef<HTMLSelectElement | null>(null);
  const researchNotesRef = useRef<HTMLTextAreaElement | null>(null);

  const scrollAndFocus = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => {
      try { (el as HTMLInputElement).focus({ preventScroll: true }); } catch { /* noop */ }
    }, 350);
  }, []);

  const focusPlanningPanel = useCallback((target: HTMLElement | null) => {
    setActiveTab("planning");
    window.setTimeout(() => scrollAndFocus(target), 50);
  }, [scrollAndFocus]);

  const handleStepClick = useCallback((stepKey: string, state: "done" | "current" | "todo") => {
    if (state === "todo") return;
    switch (stepKey) {
      case "idea":
        scrollAndFocus(titleH1Ref.current);
        break;
      case "research":
        if (lineageRef.current) scrollAndFocus(lineageRef.current);
        else scrollAndFocus(researchNotesRef.current);
        break;
      case "script":
        scrollAndFocus(scriptTextareaRef.current);
        break;
      case "shoot":
        focusPlanningPanel(shootDateRef.current);
        break;
      case "post":
        focusPlanningPanel(editDueDateRef.current ?? publishDateRef.current);
        break;
      case "publish":
        focusPlanningPanel(publishDateRef.current);
        break;
      case "review":
        focusPlanningPanel(statusSelectRef.current);
        break;
    }
  }, [scrollAndFocus, focusPlanningPanel]);

  const handleRegenerate = useCallback(async () => {
    if (!scriptBuilderV2Enabled) {
      alert("Script Builder v2 isn't enabled for your tier yet.");
      return;
    }
    const msg = form.script.trim()
      ? "Regenerate this script? Current content will be replaced. (You can undo from autosave history within 60s.)"
      : "Build a new script with the v2 pipeline?";
    if (!confirm(msg)) return;
    await handleBuildV2();
  }, [scriptBuilderV2Enabled, form.script, handleBuildV2]);

  // Click handler for the hero CTA. Each step routes the cursor to the
  // most-likely next input, or advances `status` when the leftover work
  // is production-side (shoot/post/publish) — those only flip when the
  // member confirms the milestone, so we just bump status and let
  // auto-save persist it on the next debounce tick.
  const handleNextAction = () => {
    switch (currentStepKey) {
      case "idea":
        titleH1Ref.current?.focus();
        break;
      case "research":
      case "script":
        scriptTextareaRef.current?.focus();
        break;
      case "shoot":
        update("status", "Shot - In Post");
        break;
      case "post":
        update("status", "Ready to Post");
        break;
      case "publish":
        update("status", "Posted");
        break;
      default:
        break;
    }
  };

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

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 32px 80px" }}>
        {/* ── dark hero ─────────────────────────────────────────────────── */}
        <section style={{
          background: "var(--abv-ink, #1A1A1A)",
          color: "white",
          borderRadius: 16,
          padding: "28px 32px",
          marginBottom: 18,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24 }}>
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
            <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
              <button
                onClick={handleNextAction}
                style={{
                  background: "var(--abv-azure, #3B82F6)",
                  color: "white",
                  borderRadius: 999,
                  padding: "10px 18px",
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                {nextActionLabel}
              </button>
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

        {/* ── workflow stepper ─────────────────────────────────────────── */}
        <section style={{
          background: "white", border: "1px solid var(--abv-border)",
          borderRadius: 14, padding: "16px 24px", marginBottom: 18,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12,
        }}>
          {STEPS.map((s, idx) => {
            const st = steps[s.key];
            const dot = st === "done"
              ? { bg: "var(--abv-azure)", fg: "white", ring: "transparent" }
              : st === "current"
                ? { bg: "white", fg: "var(--abv-azure)", ring: "var(--abv-azure)" }
                : { bg: "var(--abv-bg-warm)", fg: "var(--abv-text-muted)", ring: "transparent" };
            const clickable = st !== "todo";
            return (
              <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
                <button
                  type="button"
                  onClick={() => handleStepClick(s.key, st)}
                  disabled={!clickable}
                  aria-label={`Jump to ${s.label}`}
                  title={clickable ? `Jump to ${s.label}` : `${s.label} — not yet available`}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: "transparent", padding: 0, border: 0,
                    cursor: clickable ? "pointer" : "not-allowed",
                  }}
                >
                  <span style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: dot.bg, color: dot.fg,
                    border: `1.5px solid ${dot.ring}`,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700,
                    fontFamily: "var(--font-mono, ui-monospace)",
                  }}>{st === "done" ? "✓" : idx + 1}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: st === "todo" ? "var(--abv-text-muted)" : "var(--abv-text)",
                  }}>{s.label}</span>
                </button>
                {idx < STEPS.length - 1 && (
                  <span style={{
                    flex: 1, height: 1,
                    background: steps[STEPS[idx + 1].key] !== "todo" ? "var(--abv-azure)" : "var(--abv-border)",
                    opacity: 0.5,
                  }} />
                )}
              </div>
            );
          })}
        </section>

        {/* ── lineage accordion ────────────────────────────────────────── */}
        {lineage && (
          <section ref={lineageRef} style={{
            background: "var(--abv-azure-tint, #E0F2FE)",
            border: "1px solid rgba(59,130,246,0.2)",
            borderRadius: 12, marginBottom: 18, overflow: "hidden",
          }}>
            <button
              onClick={() => setLineageOpen((o) => !o)}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 18px",
                color: "var(--abv-azure)",
                fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              <span>↳ Idea card · {lineage.themeLabel}</span>
              <span style={{
                transition: "transform 0.2s",
                transform: lineageOpen ? "rotate(180deg)" : "none",
              }}>▾</span>
            </button>
            {lineageOpen && (
              <div style={{
                padding: "0 18px 16px", color: "var(--abv-text)",
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16,
              }}>
                {lineage.titlePromise && (
                  <Fact label="Title promise" value={lineage.titlePromise} />
                )}
                {lineage.visualPeak && (
                  <Fact label="Visual peak" value={lineage.visualPeak} />
                )}
                {lineage.storyLead && (
                  <Fact label="Story lead" value={`${lineage.storyLead.pattern} — ${lineage.storyLead.whyItMattersPreview}`} />
                )}
                {lineage.thumbnailCallouts.length > 0 && (
                  <Fact label="Thumbnail callouts" value={lineage.thumbnailCallouts.join(" · ")} />
                )}
              </div>
            )}
          </section>
        )}

        {/* ── two-pane layout ──────────────────────────────────────────── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 340px",
          gap: 24,
          alignItems: "start",
        }}>
          {/* LEFT: script pane */}
          <ScriptPane
            value={form.script}
            onChange={(v) => update("script", v)}
            onBlur={() => void flush()}
            onBuildV2={scriptBuilderV2Enabled ? handleBuildV2 : null}
            planId={planId}
            title={form.title}
            textareaRef={scriptTextareaRef}
            onExport={handleExport}
            onRegenerate={handleRegenerate}
          />

          {/* RIGHT: sidebar */}
          <aside style={{ position: "sticky", top: 16, display: "grid", gap: 12 }}>
            <TabStrip
              active={activeTab}
              onChange={setActiveTab}
            />

            {activeTab === "planning" && (
              <PlanningTab
                planId={planId}
                canUseDrive={canUseDrive}
                form={form}
                update={update}
                statusOptions={statusOptions}
                themes={themes}
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

            {activeTab === "connecting" && (
              <ConnectingTab
                plan={plan}
                form={form}
                update={update}
                campaigns={campaigns}
                bingeOptions={bingeOptions}
                loadBingeOptions={loadBingeOptions}
                onBlur={() => void flush()}
              />
            )}

            {activeTab === "tools" && (
              <ToolsTab planId={planId} lineage={lineage} />
            )}

            {activeTab === "publish" && (
              <PublishTab
                planId={planId}
                plan={plan}
                form={form}
                update={update}
                onBlur={() => void flush()}
                onPersist={patchPlan}
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
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
        textTransform: "uppercase", color: "var(--abv-text-muted)",
        marginBottom: 4,
      }}>{label}</div>
      <div style={{ fontSize: 13, lineHeight: 1.5 }}>{value}</div>
    </div>
  );
}

function ScriptPane({
  value, onChange, onBlur, onBuildV2, planId, title, textareaRef, onExport, onRegenerate,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  onBuildV2: (() => void) | null;
  planId: string;
  title: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  onExport: () => void;
  onRegenerate: () => void;
}) {
  const words = wordCount(value);
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

  return (
    <section style={{ display: "grid", gap: 12 }}>
      {/* v2 builder strip */}
      {onBuildV2 && (
        <div style={{
          background: "var(--abv-azure-tint, #E0F2FE)",
          border: "1px solid rgba(59,130,246,0.2)",
          borderRadius: 10,
          padding: "10px 14px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          <div style={{
            fontSize: 12, color: "var(--abv-azure)", fontWeight: 600,
          }}>
            v2 Builder · structured outline → script
          </div>
          <button
            onClick={onBuildV2}
            style={{
              background: "var(--abv-azure)", color: "white",
              padding: "7px 14px", borderRadius: 999,
              fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >{value ? "Rebuild →" : "Build (v2) →"}</button>
        </div>
      )}

      {/* toolbar */}
      <div style={{
        background: "white", border: "1px solid var(--abv-border)",
        borderRadius: 999, padding: "6px 8px",
        display: "flex", gap: 4, alignSelf: "flex-start",
      }}>
        <ToolbarBtn label="↻ Regenerate" onClick={onRegenerate} />
        <Link
          href={`/member/content-tools/script-review?planId=${planId}`}
          style={{
            padding: "6px 12px", borderRadius: 999, fontSize: 11,
            fontWeight: 600, color: "var(--abv-azure)",
          }}
        >Self-Review</Link>
        <ToolbarBtn label="Copy" onClick={handleCopy} />
        <ToolbarBtn label="Export" onClick={onExport} />
        {mode === "edit"
          ? <ToolbarBtn label="✓ Done" onClick={() => setMode("view")} />
          : <ToolbarBtn label="✎ Edit" onClick={enterEdit} />}
      </div>

      {/* editor */}
      <div style={{
        background: "white", border: "1px solid var(--abv-border)",
        borderRadius: 14, padding: 24, overflow: "hidden", minWidth: 0,
      }}>
        {mode === "edit" ? (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => { onBlur(); setMode("view"); }}
            placeholder={`Start writing your script for "${title || "this video"}"…`}
            style={{
              width: "100%", minHeight: 480,
              border: "none", outline: "none", resize: "vertical",
              fontFamily: "var(--font-sans, ui-sans-serif)",
              fontSize: 14, lineHeight: 1.7,
              color: "var(--abv-text)",
              background: "transparent",
              boxSizing: "border-box",
            }}
          />
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
    </section>
  );
}

function ToolbarBtn({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 12px", borderRadius: 999, fontSize: 11,
        fontWeight: 600, color: "var(--abv-text-muted)",
      }}
      className="hover:bg-[var(--abv-bg-warm)] hover:text-[var(--abv-text)]"
    >{label}</button>
  );
}

function TabStrip({
  active, onChange,
}: {
  active: string;
  onChange: (t: "planning" | "connecting" | "tools" | "publish") => void;
}) {
  const tabs: Array<{ id: "planning" | "connecting" | "tools" | "publish"; label: string }> = [
    { id: "planning", label: "Planning" },
    { id: "connecting", label: "Binging" },
    { id: "tools", label: "Tools" },
    { id: "publish", label: "Publish" },
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
        background: "var(--abv-bg-warm, #FAF7F2)",
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
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
  planId, canUseDrive, form, update, statusOptions, themes, showEditDue,
  onDelete, onBlur,
  onGenerateResearchPrompt, researchPromptCopied, researchPromptError,
  statusSelectRef, shootDateRef, editDueDateRef, publishDateRef, researchNotesRef,
}: {
  planId: string;
  canUseDrive: boolean;
  form: Form;
  update: <K extends keyof Form>(k: K, v: Form[K]) => void;
  statusOptions: string[];
  themes: Theme[];
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
              padding: "5px 12px", borderRadius: 999,
              border: `1px solid ${STATUS_DOT[form.status] ?? "#9CA3AF"}`,
              fontSize: 11, fontWeight: 700,
              color: STATUS_DOT[form.status] ?? "var(--abv-text)",
              background: "white",
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
            display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
            textTransform: "uppercase", color: "var(--abv-text-muted)", marginBottom: 4,
          }}>Video Theme</label>
          <select
            value={form.theme}
            onChange={(e) => update("theme", e.target.value)}
            onBlur={onBlur}
            style={{ width: "100%", fontSize: 12, padding: "6px 8px", border: "1px solid var(--abv-border)", borderRadius: 6 }}
          >
            <option value="">— Theme —</option>
            {themes.map((t) => (
              <option key={t.value} value={t.value}>{t.emoji ? `${t.emoji} ${t.label}` : t.label}</option>
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

      <Panel title="Research notes" headerRight={
        <button
          onClick={onGenerateResearchPrompt}
          style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
            textTransform: "uppercase", color: "var(--abv-azure)",
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

      <Panel title="Thoughts & talking points">
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
        <a href={folderUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--abv-azure)", fontWeight: 600 }}>
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
                <span style={{ color: "var(--abv-azure)", flexShrink: 0 }}>↗</span>
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
          border: "1px solid var(--abv-border)", borderRadius: 6, padding: "3px 6px",
        }}
      />
    </div>
  );
}

function QuickBtn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 10px",
        border: `1px solid ${danger ? "var(--abv-leads-tint, #FECACA)" : "var(--abv-border)"}`,
        borderRadius: 6,
        background: "white",
        fontSize: 11, fontWeight: 600,
        color: danger ? "var(--abv-leads, #DC2626)" : "var(--abv-text)",
      }}
      className="hover:bg-[var(--abv-bg-warm)]"
    >{children}</button>
  );
}

function ConnectingTab({
  plan, form, update, campaigns, bingeOptions, loadBingeOptions, onBlur,
}: {
  plan: ContentPlan;
  form: Form;
  update: <K extends keyof Form>(k: K, v: Form[K]) => void;
  campaigns: Campaign[];
  bingeOptions: BingeOption[];
  loadBingeOptions: () => void;
  onBlur: () => void;
}) {
  const selectedCampaign = campaigns.find((c) => c.id === form.linkedCampaignId) ?? null;
  const selectedBinge = (() => {
    const id = form.bingeVideoId;
    if (!id) return null;
    return bingeOptions.find((o) => o.id === id) ?? plan.bingeVideo ?? null;
  })();
  return (
    <>
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

      <Panel title="Lead magnet campaign">
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
    </>
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
    { icon: "⚙️", name: "Content Engine", desc: "Spin variations", href: `/member/content-tools/content-engine?planId=${planId}` },
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

function PublishTab({
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
  const [drafting, setDrafting] = useState(false);
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
    setUploading(true);
    // Client-side guard: even if the network/proxy stalls (so the response never
    // arrives), abort after 40s — longer than the server's worst-case bounded
    // path — so the button can never hang on "Uploading…" indefinitely.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 40_000);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${apiBase}/${planId}/thumbnails`, {
        method: "POST",
        body: fd,
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Upload failed");
      setVariants(parseClientVariants(data.variants));
      onPersist({ thumbnailVariants: data.variants });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setThumbError("Upload timed out — please try again.");
      } else {
        setThumbError(e instanceof Error ? e.message : "Upload failed");
      }
    } finally {
      clearTimeout(timeoutId);
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
            ✍ Generate with AI
          </Link>
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
          <QuickBtn onClick={() => void handleDraftComment()}>
            {drafting ? "Drafting…" : "✦ Draft with AI"}
          </QuickBtn>
        </div>
      </Panel>
    </>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ContentPlan } from "@/components/content-planner/ContentPlanEditModal";
import { getStatusOptions, hasEditDueDate } from "@/lib/content-plan-utils";

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

type Theme = { value: string; label: string };

const FOUNDATIONS_TIERS = ["foundations"];
const PROPERTY_OPTIONS = [
  "Auto",
  "Detached",
  "Row/Townhouse",
  "Apartment Condo",
  "Half-Duplex",
  "Acreage",
];
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

/** Inline-tag-aware script renderer for the preview block above the editor. */
function renderScriptWithTags(text: string): React.ReactNode {
  // Heading lines (#### ...) → h4; paragraphs with [TAG] inline → spans.
  const blocks = text.split(/\n{2,}/);
  return blocks.map((blk, i) => {
    const trimmed = blk.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("#### ")) {
      return (
        <h4 key={i} style={{
          fontFamily: "var(--font-display, inherit)",
          fontWeight: 800, fontSize: 18, letterSpacing: "-0.015em",
          margin: "18px 0 10px",
        }}>{trimmed.slice(5)}</h4>
      );
    }
    return (
      <p key={i} style={{ margin: "0 0 12px", lineHeight: 1.7 }}>
        {renderInlineTags(trimmed)}
      </p>
    );
  });
}

function renderInlineTags(s: string): React.ReactNode {
  const re = /\[(LEAD MAGNET[^\]]*|SIDEWAYS CREDIBILITY|MID-VIDEO HOOK|STAT)\]/g;
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(s)) !== null) {
    if (m.index > lastIdx) parts.push(s.slice(lastIdx, m.index));
    const tagText = m[1];
    const styles = inlineTagStyle(tagText);
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
      }}>{`[${tagText}]`}</span>
    );
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < s.length) parts.push(s.slice(lastIdx));
  return parts;
}

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
  }));
  const [activeTab, setActiveTab] = useState<"planning" | "connecting" | "tools" | "publish">("planning");
  const [lineage, setLineage] = useState<Lineage | null>(null);
  const [lineageOpen, setLineageOpen] = useState(true);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [now, setNow] = useState(Date.now());

  const statusOptions = useMemo(() => getStatusOptions(serviceTier), [serviceTier]);
  const isFoundations = FOUNDATIONS_TIERS.includes(serviceTier);
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
        if (Array.isArray(d?.themes)) setThemes(d.themes);
      })
      .catch(() => {});
  }, [planId]);

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
    };
    const res = await fetch(`${apiBase}/${planId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw new Error(`Save failed: ${res.status}`);
    const data = await res.json();
    if (data?.plan) setPlan(data.plan);
  }, [planId]);

  const { state: saveState, lastSavedAt, flush, retry } = useAutoSave({
    value: form, save, debounceMs: 2000,
  });

  // Helper to update form fields and trigger debounce automatically.
  const update = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // ── archive / quick actions ───────────────────────────────────────────────
  const handleArchive = async () => {
    if (!confirm("Archive this video? It will move to the archived list.")) return;
    await flush();
    update("status", "Archived");
  };
  const handleSnooze = () => {
    const bump = (s: string): string => {
      if (!s) return s;
      const d = new Date(s);
      if (!Number.isFinite(d.getTime())) return s;
      d.setDate(d.getDate() + 7);
      return toDateInput(d.toISOString());
    };
    setForm((f) => ({
      ...f,
      shootDate: bump(f.shootDate),
      editDueDate: bump(f.editDueDate),
      publishDate: bump(f.publishDate),
    }));
  };
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

  // ── v2 builder navigation ─────────────────────────────────────────────────
  const handleBuildV2 = async () => {
    await flush();
    router.push(`/member/content-planner/wizard/script?planId=${planId}`);
  };

  // ── completion / next-action mapping ──────────────────────────────────────
  const steps = stepStatus(plan);
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
          <button
            aria-label="More actions"
            className="w-8 h-8 rounded-full hover:bg-[var(--abv-bg-warm)] text-[var(--abv-text-muted)]"
          >⋯</button>
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
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "4px 10px", borderRadius: 999,
                background: "rgba(255,255,255,0.08)",
                fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}>
                <span style={{
                  display: "inline-block", width: 5, height: 5, borderRadius: "50%",
                  background: STATUS_DOT[form.status] ?? "#9CA3AF",
                }} />
                {form.status || "Idea"}
              </span>
              <h1
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => {
                  const v = e.currentTarget.textContent ?? "";
                  if (v !== form.title) {
                    // Commit + flush against the just-typed value so we don't
                    // miss the latest title on the blur-triggered save.
                    setForm((f) => {
                      const next = { ...f, title: v };
                      queueMicrotask(() => void flush());
                      return next;
                    });
                  } else {
                    void flush();
                  }
                }}
                style={{
                  fontFamily: "var(--font-display, inherit)",
                  fontWeight: 900,
                  fontSize: 38,
                  letterSpacing: "-0.025em",
                  lineHeight: 1.1,
                  margin: "16px 0 14px",
                  outline: "none",
                  minHeight: 44,
                }}
              >
                {/* Render with auto-azure decoration on initial paint. */}
                {renderAutoAzureTitle(form.title)}
              </h1>
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
            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
              <button
                style={{
                  background: "var(--abv-azure, #3B82F6)",
                  color: "white",
                  borderRadius: 999,
                  padding: "10px 18px",
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                {nextActionLabel}
              </button>
              <button style={{
                color: "rgba(255,255,255,0.5)", fontSize: 11,
              }}>Skip this step</button>
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
            return (
              <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                }}>
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
                </div>
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
          <section style={{
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
          />

          {/* RIGHT: sidebar */}
          <aside style={{ position: "sticky", top: 16, display: "grid", gap: 12 }}>
            <TabStrip
              active={activeTab}
              onChange={setActiveTab}
              counts={{
                planning: 3,
                connecting: isFoundations ? 2 : 3,
                tools: 2,
                publish: 4,
              }}
            />

            {activeTab === "planning" && (
              <PlanningTab
                form={form}
                update={update}
                statusOptions={statusOptions}
                themes={themes}
                showEditDue={showEditDue}
                plan={plan}
                onArchive={handleArchive}
                onSnooze={handleSnooze}
                onExport={handleExport}
                onDuplicate={handleDuplicate}
                onBlur={() => void flush()}
              />
            )}

            {activeTab === "connecting" && (
              <ConnectingTab
                isFoundations={isFoundations}
                planId={planId}
                plan={plan}
              />
            )}

            {activeTab === "tools" && (
              <ToolsTab planId={planId} lineage={lineage} />
            )}

            {activeTab === "publish" && (
              <PublishTab
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
  value, onChange, onBlur, onBuildV2, planId, title,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  onBuildV2: (() => void) | null;
  planId: string;
  title: string;
}) {
  const words = wordCount(value);
  const minutes = Math.max(1, Math.round(words / 175));
  const cameraSec = Math.round(words / 150 * 60);
  const cm = Math.floor(cameraSec / 60);
  const cs = String(cameraSec % 60).padStart(2, "0");

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
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
        <ToolbarBtn label="Regenerate" />
        <Link
          href={`/member/ai-tools/script-review?planId=${planId}`}
          style={{
            padding: "6px 12px", borderRadius: 999, fontSize: 11,
            fontWeight: 600, color: "var(--abv-azure)",
          }}
        >Self-Review</Link>
        <ToolbarBtn label="Auto-Soften" />
        <ToolbarBtn label="Copy" onClick={handleCopy} />
        <ToolbarBtn label="Export" />
      </div>

      {/* editor */}
      <div style={{
        background: "white", border: "1px solid var(--abv-border)",
        borderRadius: 14, padding: 24,
      }}>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={`Start writing your script for "${title || "this video"}"…`}
          style={{
            width: "100%", minHeight: 480,
            border: "none", outline: "none", resize: "vertical",
            fontFamily: "var(--font-body, ui-sans-serif)",
            fontSize: 14, lineHeight: 1.7,
            color: "var(--abv-text)",
            background: "transparent",
            maxWidth: "56ch",
          }}
        />
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
  active, onChange, counts,
}: {
  active: string;
  onChange: (t: "planning" | "connecting" | "tools" | "publish") => void;
  counts: Record<string, number>;
}) {
  const tabs: Array<{ id: "planning" | "connecting" | "tools" | "publish"; label: string }> = [
    { id: "planning", label: "Planning" },
    { id: "connecting", label: "Connecting" },
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
            <span style={{
              fontSize: 9, fontFamily: "var(--font-mono, ui-monospace)",
              opacity: 0.7,
            }}>{counts[t.id]}</span>
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
  form, update, statusOptions, themes, showEditDue, plan,
  onArchive, onSnooze, onExport, onDuplicate, onBlur,
}: {
  form: Form;
  update: <K extends keyof Form>(k: K, v: Form[K]) => void;
  statusOptions: string[];
  themes: Theme[];
  showEditDue: boolean;
  plan: ContentPlan;
  onArchive: () => void;
  onSnooze: () => void;
  onExport: () => void;
  onDuplicate: () => void;
  onBlur: () => void;
}) {
  return (
    <>
      <Panel title="Status & dates">
        <div style={{ padding: "12px 14px 6px" }}>
          <select
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
        <DateRow label="Film" value={form.shootDate} onChange={(v) => update("shootDate", v)} onBlur={onBlur} />
        {showEditDue && (
          <DateRow label="Edit due" value={form.editDueDate} onChange={(v) => update("editDueDate", v)} onBlur={onBlur} />
        )}
        <DateRow label="Publish" value={form.publishDate} onChange={(v) => update("publishDate", v)} onBlur={onBlur} />
      </Panel>

      <Panel title="Theme & anchor">
        <div style={{ padding: "8px 14px" }}>
          <select
            value={form.theme}
            onChange={(e) => update("theme", e.target.value)}
            onBlur={onBlur}
            style={{ width: "100%", fontSize: 12, padding: "6px 8px", border: "1px solid var(--abv-border)", borderRadius: 6 }}
          >
            <option value="">— Theme —</option>
            {themes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            {form.theme && !themes.find((t) => t.value === form.theme) && (
              <option value={form.theme}>{form.theme}</option>
            )}
          </select>
        </div>
        <Row k="Property" v={
          <select
            value={form.propertyTypeFocus}
            onChange={(e) => update("propertyTypeFocus", e.target.value)}
            onBlur={onBlur}
            style={{ fontSize: 12, border: "1px solid var(--abv-border)", borderRadius: 6, padding: "3px 6px" }}
          >
            {PROPERTY_OPTIONS.map((p) => <option key={p} value={p === "Auto" ? "" : p}>{p}</option>)}
          </select>
        } />
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
        {plan.bingeVideo && <Row k="Binge" v={plan.bingeVideo.title} />}
      </Panel>

      <Panel title="Quick actions">
        <div style={{ padding: 12, display: "flex", flexWrap: "wrap", gap: 5 }}>
          <QuickBtn onClick={onDuplicate}>⎘ Duplicate</QuickBtn>
          <QuickBtn onClick={onSnooze}>⏱ Snooze</QuickBtn>
          <QuickBtn onClick={onExport}>⤓ Export</QuickBtn>
          <QuickBtn onClick={onArchive} danger>⌫ Archive</QuickBtn>
        </div>
      </Panel>
    </>
  );
}

function DateRow({
  label, value, onChange, onBlur,
}: {
  label: string; value: string;
  onChange: (v: string) => void; onBlur: () => void;
}) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "8px 14px", borderBottom: "1px solid var(--abv-border)",
      fontSize: 12,
    }}>
      <span style={{ color: "var(--abv-text-muted)" }}>{label}</span>
      <input
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
  isFoundations, planId, plan,
}: {
  isFoundations: boolean; planId: string; plan: ContentPlan;
}) {
  return (
    <>
      <Panel
        title="Thumbnail & assets"
        headerRight={!isFoundations && plan.driveFolderLink ? (
          <a href={plan.driveFolderLink} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "var(--abv-azure)" }}>
            Drive ↗
          </a>
        ) : null}
      >
        <div style={{
          margin: 14, padding: 32, borderRadius: 10,
          border: "1.5px dashed var(--abv-border)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
          color: "var(--abv-text-muted)", fontSize: 12,
          background: "var(--abv-bg-warm)",
        }}>
          <span style={{ fontSize: 20 }}>↑</span>
          <span style={{ fontWeight: 600, color: "var(--abv-text)" }}>Upload thumbnail</span>
          <span style={{ fontSize: 10 }}>1280 × 720 · PNG / JPG</span>
        </div>
        {!isFoundations && plan.driveFolderLink && (
          <a
            href={plan.driveFolderLink} target="_blank" rel="noreferrer"
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 14px", borderTop: "1px solid var(--abv-border)",
              fontSize: 12,
            }}
          >
            <span style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>Open Drive folder</div>
              <div style={{ fontSize: 11, color: "var(--abv-text-muted)" }}>
                Raw footage · thumbnails · b-roll
              </div>
            </span>
            <span style={{ color: "var(--abv-azure)" }}>↗</span>
          </a>
        )}
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
        <div style={{ padding: 14, fontSize: 12, color: "var(--abv-text-muted)" }}>
          Connect a lead magnet from your AI tools to track CTA placements.
        </div>
      </Panel>
    </>
  );
}

function ToolsTab({ planId, lineage }: { planId: string; lineage: Lineage | null }) {
  const tools: Array<{ icon: string; name: string; desc: string; href: string; primary?: boolean }> = [
    { icon: "✅", name: "Script Review", desc: "Score this script before you film", href: `/member/ai-tools/script-review?planId=${planId}`, primary: true },
    { icon: "📝", name: "ARC Builder", desc: "Rebuild from outline", href: `/member/ai-tools/arc-script-builder?planId=${planId}` },
    { icon: "🔬", name: "Title & Thumb", desc: "A/B test the hook visually", href: `/member/ai-tools/title-thumbnail-analyzer?planId=${planId}` },
    { icon: "⚙️", name: "Content Engine", desc: "Spin variations", href: `/member/ai-tools/content-engine?planId=${planId}` },
    { icon: "🎯", name: "Avatar Architect", desc: "Recheck against your avatar", href: `/member/ai-tools/avatar-architect?planId=${planId}` },
    { icon: "🔁", name: "Repurpose", desc: "One video into shorts, threads, emails", href: `/member/ai-tools/repurpose-content?planId=${planId}` },
    { icon: "📄", name: "Description Generator", desc: "YouTube descriptions, ready to paste", href: `/member/ai-tools/description-generator?planId=${planId}` },
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
            {lineage.totalCited > 3 && (
              <div style={{ fontSize: 11, color: "var(--abv-azure)", padding: "4px 10px" }}>
                View all {lineage.totalCited} →
              </div>
            )}
          </div>
        </Panel>
      )}
    </>
  );
}

function PublishTab({
  planId, form, update, onBlur,
}: {
  planId: string;
  form: Form;
  update: <K extends keyof Form>(k: K, v: Form[K]) => void;
  onBlur: () => void;
}) {
  return (
    <>
      <Panel title="YouTube description" headerRight={
        <span style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 9, color: "var(--abv-text-muted)" }}>0 / 5000</span>
      }>
        <div style={{ padding: 14, fontSize: 12, color: "var(--abv-text-muted)", lineHeight: 1.5 }}>
          Generate a YouTube description from your script.
        </div>
        <div style={{
          padding: "8px 14px", borderTop: "1px solid var(--abv-border)",
          display: "flex", justifyContent: "flex-end",
        }}>
          <Link
            href={`/member/ai-tools/description-generator?planId=${planId}`}
            style={{ fontSize: 11, color: "var(--abv-azure)", fontWeight: 600 }}
          >
            ✍ Generate
          </Link>
        </div>
      </Panel>

      <Panel title="Thumbnail variants" headerRight={
        <span style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 9, color: "var(--abv-leads-warning, #B45309)" }}>A/B pending</span>
      }>
        <div style={{
          padding: 12, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8,
        }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{
              aspectRatio: "16/9",
              border: "1px dashed var(--abv-border)",
              borderRadius: 6,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--abv-text-muted)", fontSize: 14,
            }}>+</div>
          ))}
        </div>
      </Panel>

      <Panel title="Pinned first comment">
        <div style={{ padding: 12 }}>
          <textarea
            value={form.thumbnailWords}
            onChange={(e) => update("thumbnailWords", e.target.value)}
            onBlur={onBlur}
            placeholder="The first comment posts automatically when this video goes live."
            style={{
              width: "100%", minHeight: 70, padding: 10,
              border: "1px solid var(--abv-border)", borderRadius: 6,
              fontSize: 12, lineHeight: 1.5, resize: "vertical",
            }}
          />
        </div>
      </Panel>

      <Panel title="Tags & end screen" headerRight={
        <span style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 9, color: "var(--abv-text-muted)" }}>0 tags</span>
      }>
        <div style={{ padding: 12, fontSize: 12, color: "var(--abv-text-muted)" }}>
          Tags + end-screen picker coming soon.
        </div>
      </Panel>
    </>
  );
}

"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { ChevronUpIcon, ChevronDownIcon, ArrowTopRightOnSquareIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import {
  getStatusOptions,
  hasEditDueDate,
  hasDriveFolder,
  filterPlans,
  getPlanThumbnailUrl,
} from "@/lib/content-plan-utils";
import { getStatusPillStyle, getThemeVisual } from "@/lib/content-plan-style";

interface ContentPlan {
  id: string;
  title: string;
  status: string;
  theme: string | null;
  shootDate: string | null;
  shootLocation: string | null;
  publishDate: string | null;
  editDueDate: string | null;
  priority: string | null;
  notes: string | null;
  script: string | null;
  researchNotes: string | null;
  thumbnailWords: string | null;
  footageLink: string | null;
  driveFolderLink: string | null;
  thumbnailFileId: string | null;
  thumbnailFileName: string | null;
  thumbnailVariants?: unknown;
  thumbnailWinnerId?: string | null;
  updatedAt?: string | null;
  bingeVideoId: string | null;
  bingeVideo: { id: string; title: string; theme: string | null; status: string } | null;
}

interface Props {
  apiBase: string;
  isAdmin?: boolean;
  forcedServiceTier?: string;
  searchQuery?: string;
  statusFilter?: string[];
  scriptBuilderV2Enabled?: boolean;
  /** Bumped by the parent to force a refetch (e.g. after parent-initiated Add Video). */
  refreshKey?: number;
  /** Bumped by the parent ("Reset cols" link) to clear saved column widths. */
  resetColsKey?: number;
  /** Mirror plan-list changes back to the parent so header counts + status
   *  pill counts stay in sync with row edits/deletes that happen inside
   *  this table's modal. */
  onPlansChanged?: (plans: ContentPlan[]) => void;
}

function StatusBadge({ status }: { status: string }) {
  const s = getStatusPillStyle(status);
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full whitespace-nowrap font-bold tracking-[0.04em] uppercase"
      style={{ background: s.bg, color: s.fg, fontSize: "10.5px" }}
    >
      <span
        className="inline-block w-[5px] h-[5px] rounded-full shrink-0"
        style={{ background: s.dot }}
      />
      {status}
    </span>
  );
}

function ThemePill({ theme }: { theme: string | null }) {
  if (!theme) {
    return <span className="text-xs text-[var(--abv-text-dim)] italic">—</span>;
  }
  const v = getThemeVisual(theme);
  const Icon = v.Icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full font-semibold whitespace-nowrap"
      style={{ background: v.bg, color: v.fg, fontSize: "11.5px" }}
    >
      <Icon className="w-3 h-3 shrink-0" />
      <span className="truncate max-w-[140px]">{theme}</span>
    </span>
  );
}

function GoogleDriveIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 87.3 78" className={className} aria-hidden="true">
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
    </svg>
  );
}

function formatDate(d: string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// yyyy-MM-dd for <input type="date">, in UTC to match the read-only formatDate.
function toDateInputValue(d: string | null): string {
  if (!d) return "";
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return "";
  return t.toISOString().slice(0, 10);
}

// ── Inline cell editors ─────────────────────────────────────────────────────
// Each renders the value as an in-place control. The wrapping <span> hosts a
// custom chevron because we use `appearance-none` to keep the pill styling.
function InlineStatusSelect({ status, options, onChange }: {
  status: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const s = getStatusPillStyle(status);
  // Always keep the current value selectable, even if it pre-dates a tier change.
  const opts = options.includes(status) ? options : [status, ...options];
  return (
    <span className="relative inline-flex max-w-full">
      <select
        value={status}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Status"
        className="appearance-none rounded-full pl-2.5 pr-6 py-1 font-bold tracking-[0.04em] uppercase cursor-pointer truncate focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/40"
        style={{ background: s.bg, color: s.fg, fontSize: "10.5px" }}
      >
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDownIcon className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: s.fg }} />
    </span>
  );
}

function InlineThemeSelect({ theme, themes, onChange }: {
  theme: string | null;
  themes: Array<{ name: string; emoji?: string | null; colour?: string | null }>;
  onChange: (v: string | null) => void;
}) {
  const v = theme ? getThemeVisual(theme) : null;
  const known = themes.map((t) => t.name);
  return (
    <span className="relative inline-flex max-w-full">
      <select
        value={theme ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label="Theme"
        className="appearance-none rounded-full pl-2.5 pr-6 py-1 font-semibold cursor-pointer truncate focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/40"
        style={
          v
            ? { background: v.bg, color: v.fg, fontSize: "11.5px" }
            : { fontSize: "11.5px", color: "var(--abv-text-dim)", border: "1px solid var(--abv-border)" }
        }
      >
        <option value="">— Theme —</option>
        {themes.map((t) => (
          <option key={t.name} value={t.name}>{t.emoji ? `${t.emoji} ${t.name}` : t.name}</option>
        ))}
        {theme && !known.includes(theme) && <option value={theme}>{theme}</option>}
      </select>
      <ChevronDownIcon className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: v ? v.fg : "var(--abv-text-dim)" }} />
    </span>
  );
}

function InlineBingeSelect({ value, current, options, onChange }: {
  value: string | null;
  current: { title: string } | null;
  options: Array<{ id: string; title: string }>;
  onChange: (v: string | null) => void;
}) {
  const hasCurrent = !!value && options.some((o) => o.id === value);
  return (
    <span className="relative inline-flex w-full">
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label="Binge target"
        className="appearance-none w-full bg-transparent border border-transparent hover:border-[var(--abv-border)] rounded-md pl-1.5 pr-6 py-1 text-[12px] text-[var(--abv-text-muted)] cursor-pointer truncate focus:outline-none focus:border-[var(--abv-azure)]"
      >
        <option value="">— None —</option>
        {!hasCurrent && value && current && <option value={value}>{current.title}</option>}
        {options.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
      </select>
      <ChevronDownIcon className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--abv-text-dim)]" />
    </span>
  );
}

// Shows the date as a clean "MMM D" label (no native calendar glyph). Clicking
// opens the browser's date picker via showPicker(); the real <input type="date">
// is kept in the DOM (size-0, transparent) only to host the picker + onChange.
function InlineDateInput({ value, onChange }: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const openPicker = () => {
    const el = ref.current;
    if (!el) return;
    // showPicker is the modern, reliable path. Fall back to focus()+click() for
    // older engines that don't expose it (wrapped in try/catch — showPicker can
    // throw if not user-activated).
    if (typeof el.showPicker === "function") {
      try {
        el.showPicker();
        return;
      } catch {
        /* fall through to focus/click */
      }
    }
    el.focus();
    el.click();
  };
  return (
    <span className="relative inline-flex w-full">
      <button
        type="button"
        onClick={openPicker}
        aria-label="Change date"
        className="w-full text-left bg-transparent border border-transparent hover:border-[var(--abv-border)] rounded-md px-1.5 py-1 font-mono tabular-nums cursor-pointer truncate focus:outline-none focus:border-[var(--abv-azure)]"
        style={{ fontSize: "11.5px", color: value ? "var(--abv-text-muted)" : "var(--abv-text-dim)" }}
      >
        {value ? formatDate(value) : "—"}
      </button>
      <input
        ref={ref}
        type="date"
        value={toDateInputValue(value)}
        onChange={(e) => onChange(e.target.value || null)}
        aria-hidden="true"
        tabIndex={-1}
        className="absolute bottom-0 left-1.5 w-0 h-0 opacity-0 pointer-events-none"
      />
    </span>
  );
}

export default function ContentPlanTable({
  apiBase,
  isAdmin = false,
  forcedServiceTier,
  searchQuery = "",
  statusFilter = [],
  scriptBuilderV2Enabled = false,
  refreshKey = 0,
  resetColsKey = 0,
  onPlansChanged,
}: Props) {
  const [plans, setPlans] = useState<ContentPlan[]>([]);
  const [serviceTier, setServiceTier] = useState<string>(forcedServiceTier ?? "foundations");
  const [themes, setThemes] = useState<Array<{ name: string; emoji?: string | null; colour?: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const router = useRouter();
  const [sortKey, setSortKey] = useState<keyof ContentPlan | null>("publishDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showProgressTrack, setShowProgressTrack] = useState(false);

  const showEditDue = isAdmin || hasEditDueDate(serviceTier);
  const showDriveFolder = isAdmin || hasDriveFolder(serviceTier);

  // ---------- Resizable + persisted column widths ----------
  type ColKey = "title" | "status" | "theme" | "binge" | "shootDate" | "publishDate" | "editDate";
  const DEFAULT_WIDTHS: Record<ColKey, number> = {
    title: 380, status: 150, theme: 185, binge: 150,
    shootDate: 95, publishDate: 95, editDate: 95,
  };
  const COL_MIN: Record<ColKey, number> = {
    title: 180, status: 80, theme: 80, binge: 80,
    shootDate: 80, publishDate: 80, editDate: 80,
  };
  const COL_MAX = 600;

  const [userId, setUserId] = useState<string | null>(null);
  const [widths, setWidths] = useState<Record<ColKey, number>>(DEFAULT_WIDTHS);
  // Set to true for `title` once the user has dragged its handle. Until then
  // we render the title column as `minmax(180px, 1fr)` so it fills available
  // horizontal space; once the user resizes it, we honour the px value.
  const [titleResized, setTitleResized] = useState(false);

  const lsKey = userId ? `content-planner-cols:${userId}` : null;

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d) => setUserId(d?.user?.id ?? "anon"))
      .catch(() => setUserId("anon"));
  }, []);

  useEffect(() => {
    if (!lsKey) return;
    try {
      const raw = localStorage.getItem(lsKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Record<ColKey, number>> & { _titleResized?: boolean };
      const next = { ...DEFAULT_WIDTHS };
      (Object.keys(DEFAULT_WIDTHS) as ColKey[]).forEach((k) => {
        const v = parsed[k];
        if (typeof v === "number" && Number.isFinite(v)) {
          next[k] = Math.min(COL_MAX, Math.max(COL_MIN[k], v));
        }
      });
      setWidths(next);
      setTitleResized(parsed._titleResized === true);
    } catch {}
  }, [lsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Parent "Reset cols" link → clear LS + revert to defaults.
  useEffect(() => {
    if (resetColsKey === 0) return;
    if (lsKey) {
      try { localStorage.removeItem(lsKey); } catch {}
    }
    setWidths(DEFAULT_WIDTHS);
    setTitleResized(false);
  }, [resetColsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function persistWidths(next: Record<ColKey, number>, nextTitleResized: boolean) {
    if (!lsKey) return;
    try {
      localStorage.setItem(lsKey, JSON.stringify({ ...next, _titleResized: nextTitleResized }));
    } catch {}
  }

  function startResize(col: ColKey, e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widths[col];
    const min = COL_MIN[col];
    const target = e.currentTarget;
    try { target.setPointerCapture(e.pointerId); } catch {}
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const w = Math.min(COL_MAX, Math.max(min, startW + dx));
      setWidths((prev) => (prev[col] === w ? prev : { ...prev, [col]: w }));
      if (col === "title") setTitleResized(true);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try { target.releasePointerCapture(e.pointerId); } catch {}
      // Persist using the *latest* width snapshot.
      setWidths((prev) => {
        persistWidths(prev, col === "title" ? true : titleResized);
        return prev;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  useEffect(() => {
    fetchPlans();
    fetchThemes();
    fetch("/api/member/feature-flags")
      .then((r) => r.json())
      .then((d) => {
        if (d?.flags?.progress_track_v1) setShowProgressTrack(true);
      })
      .catch(() => {});
  }, [apiBase]);

  // Parent-initiated refresh (e.g. after a header-level Add Video) — refetch
  // so the new row shows up immediately without a full page reload.
  useEffect(() => {
    if (refreshKey === 0) return;
    fetchPlans();
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mirror local plan changes back to the parent so the header count badge
  // and status-pill counts in `ContentPlannerClient` stay in sync with row
  // edits/deletes that happen inside this table's modal.
  useEffect(() => {
    if (!onPlansChanged) return;
    onPlansChanged(plans);
  }, [plans]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchPlans() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiBase);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setPlans(data.plans ?? []);
      if (!forcedServiceTier && data.serviceTier) setServiceTier(data.serviceTier);
      if (data.themes?.length > 0) setThemes(data.themes);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchThemes() {
    try {
      const base = apiBase.replace(/\/content-plans.*/, "");
      const res = await fetch(`${base}/content-plans/themes`);
      const data = await res.json();
      if (res.ok && data.themes?.length > 0) setThemes(data.themes);
    } catch {}
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this video? It's removed from your planner. Your coaching team can restore it if you change your mind — the script, research, and AI-generated content stay saved.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`${apiBase}/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setPlans((prev) => prev.filter((p) => p.id !== id));
    } catch {
      alert("Failed to delete video. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  // Inline cell edit — optimistic local update, then PUT the single changed
  // field (partial-PATCH semantics). On failure we re-fetch to discard the
  // optimistic value and surface the server's reason.
  async function patchPlan(id: string, patch: Record<string, unknown>) {
    setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    try {
      const res = await fetch(`${apiBase}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to save");
      if (data?.plan) {
        setPlans((prev) => prev.map((p) => (p.id === id ? data.plan : p)));
      }
    } catch (e: any) {
      alert(e?.message ?? "Failed to save. Please try again.");
      fetchPlans();
    }
  }

  const statusOptions = useMemo(() => getStatusOptions(serviceTier), [serviceTier]);

  const PRIORITY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

  function handleSort(key: keyof ContentPlan) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const visiblePlans = useMemo(
    () => filterPlans(plans, searchQuery, statusFilter),
    [plans, searchQuery, statusFilter]
  );

  const sortedPlans = useMemo(() => {
    if (!sortKey) return visiblePlans;
    return [...visiblePlans].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      const mult = sortDir === "asc" ? 1 : -1;

      if (sortKey === "shootDate" || sortKey === "publishDate" || sortKey === "editDueDate") {
        if (!aVal && !bVal) return 0;
        if (!aVal) return 1;
        if (!bVal) return -1;
        return mult * (new Date(aVal as string).getTime() - new Date(bVal as string).getTime());
      }

      if (sortKey === "priority") {
        const aO = aVal ? (PRIORITY_ORDER[aVal as string] ?? 99) : 99;
        const bO = bVal ? (PRIORITY_ORDER[bVal as string] ?? 99) : 99;
        return mult * (aO - bO);
      }

      if (sortKey === "bingeVideoId") {
        const aTitle = a.bingeVideo?.title ?? "";
        const bTitle = b.bingeVideo?.title ?? "";
        if (!aTitle && !bTitle) return 0;
        if (!aTitle) return 1;
        if (!bTitle) return -1;
        return mult * aTitle.localeCompare(bTitle);
      }

      const aStr = (aVal as string | null) ?? "";
      const bStr = (bVal as string | null) ?? "";
      if (!aStr && !bStr) return 0;
      if (!aStr) return 1;
      if (!bStr) return -1;
      return mult * aStr.localeCompare(bStr);
    });
  }, [visiblePlans, sortKey, sortDir]);

  function SortIcon({ col }: { col: keyof ContentPlan }) {
    if (sortKey !== col) return null;
    return sortDir === "asc"
      ? <ChevronUpIcon className="w-3 h-3 inline-block ml-0.5 -mt-0.5" />
      : <ChevronDownIcon className="w-3 h-3 inline-block ml-0.5 -mt-0.5" />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-[var(--abv-azure)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return <div className="text-red-500 text-sm text-center py-8">{error}</div>;
  }

  // Grid: Title | Status | Theme | Binge | Shoot date | Publish date | Edit date
  // Title is `minmax(180px, 1fr)` until the user resizes it (then a clamped
  // px width). All other columns are fixed px (resizable). Drive folder (when
  // shown) and Delete are fixed 44px icon columns at the trailing edge — not
  // resizable.
  const titleCol = titleResized ? `${widths.title}px` : `minmax(180px, 1fr)`;
  const colTemplate = [
    titleCol,
    `${widths.status}px`,
    `${widths.theme}px`,
    `${widths.binge}px`,
    `${widths.shootDate}px`,
    showEditDue ? `${widths.editDate}px` : null,
    `${widths.publishDate}px`,
    showDriveFolder ? "44px" : null,
    "44px",
  ].filter(Boolean).join(" ");

  // Sum of fixed col widths drives min-width on the grid so the table
  // horizontally scrolls (rather than collapsing the Title col) when the
  // viewport gets narrow.
  // Always-present columns: title, status, theme, binge, shootDate, publishDate, delete.
  const colCount = 7 + (showEditDue ? 1 : 0) + (showDriveFolder ? 1 : 0);
  const minTableWidth =
    COL_MIN.title +
    widths.status + widths.theme + widths.binge +
    widths.shootDate + widths.publishDate +
    (showEditDue ? widths.editDate : 0) +
    (showDriveFolder ? 44 : 0) +
    44 + // delete action column
    // (colCount - 1) gaps of 14px + horizontal padding (22px * 2)
    (colCount - 1) * 14 + 44;

  function ResizeHandle({ col }: { col: ColKey }) {
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${col} column`}
        onPointerDown={(e) => startResize(col, e)}
        onClick={(e) => e.stopPropagation()}
        className="absolute top-0 right-0 h-full w-[6px] cursor-col-resize select-none hover:bg-[var(--abv-azure)]/40 active:bg-[var(--abv-azure)]"
        style={{ touchAction: "none" }}
      />
    );
  }

  return (
    <section
      style={{
        background: "var(--abv-card)",
        border: "1px solid var(--abv-border)",
        borderRadius: "14px",
        boxShadow: "var(--abv-shadow-sm, 0 1px 3px rgba(0,0,0,0.04))",
        overflowX: "auto",
        overflowY: "hidden",
      }}
    >
      <div style={{ minWidth: `${minTableWidth}px` }}>
      {/* Header row */}
      <div
        className="grid gap-[14px] px-[22px] py-3 font-mono uppercase tracking-[0.10em] text-[var(--abv-text-muted)]"
        style={{
          gridTemplateColumns: colTemplate,
          background: "var(--abv-bg-warm)",
          borderBottom: "1px solid var(--abv-border)",
          fontSize: "9.5px",
          fontWeight: 700,
        }}
      >
        <div className="relative pr-2">
          <button onClick={() => handleSort("title")} className="text-left hover:text-[var(--abv-text)] transition-colors">
            Title <SortIcon col="title" />
          </button>
          <ResizeHandle col="title" />
        </div>
        <div className="relative pr-2">
          <button onClick={() => handleSort("status")} className="text-left hover:text-[var(--abv-text)] transition-colors">
            Status <SortIcon col="status" />
          </button>
          <ResizeHandle col="status" />
        </div>
        <div className="relative pr-2">
          <button onClick={() => handleSort("theme")} className="text-left hover:text-[var(--abv-text)] transition-colors">
            Theme <SortIcon col="theme" />
          </button>
          <ResizeHandle col="theme" />
        </div>
        <div className="relative pr-2">
          <button onClick={() => handleSort("bingeVideoId")} className="text-left hover:text-[var(--abv-text)] transition-colors">
            Binge <SortIcon col="bingeVideoId" />
          </button>
          <ResizeHandle col="binge" />
        </div>
        <div className="relative pr-2">
          <button onClick={() => handleSort("shootDate")} className="text-left hover:text-[var(--abv-text)] transition-colors">
            Shoot <SortIcon col="shootDate" />
          </button>
          <ResizeHandle col="shootDate" />
        </div>
        {showEditDue && (
          <div className="relative pr-2">
            <button onClick={() => handleSort("editDueDate")} className="text-left hover:text-[var(--abv-text)] transition-colors">
              Edit <SortIcon col="editDueDate" />
            </button>
            <ResizeHandle col="editDate" />
          </div>
        )}
        <div className="relative pr-2">
          <button onClick={() => handleSort("publishDate")} className="text-left hover:text-[var(--abv-text)] transition-colors">
            Publish <SortIcon col="publishDate" />
          </button>
          <ResizeHandle col="publishDate" />
        </div>
        {showDriveFolder && (
          <span className="flex items-center justify-center" title="Google Drive folder">
            <GoogleDriveIcon className="w-4 h-4" />
          </span>
        )}
        <span />
      </div>

      {/* Empty state */}
      {sortedPlans.length === 0 ? (
        <div className="text-center py-16 text-[var(--abv-text-dim)] text-sm">
          {plans.length === 0
            ? "No videos planned yet. Hit “+ Add Video” above to start your pipeline."
            : "No videos match the current filters."}
        </div>
      ) : (
        sortedPlans.map((plan) => {
          const bingeTarget = plan.bingeVideo ?? (plan.bingeVideoId ? plans.find((p) => p.id === plan.bingeVideoId) ?? null : null);
          return (
            <div
              key={plan.id}
              className="grid gap-[14px] px-[22px] py-3.5 items-center hover:bg-[var(--abv-bg-warm)] transition-colors"
              style={{
                gridTemplateColumns: colTemplate,
                borderBottom: "1px solid var(--abv-border)",
              }}
            >
              {/* Title cell — thumbnail (if any) + title. Title opens the editor. */}
              <div className="flex items-start gap-2 min-w-0">
                {(() => {
                  const thumbUrl = getPlanThumbnailUrl(plan);
                  return thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbUrl}
                      alt=""
                      loading="lazy"
                      className="w-12 h-7 object-cover rounded shrink-0 mt-0.5 bg-gray-100 border border-gray-200"
                      title={plan.thumbnailFileName ?? "Thumbnail"}
                    />
                  ) : null;
                })()}
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => router.push(`/member/content-planner/${plan.id}`)}
                      className="font-semibold text-[14px] leading-[1.4] text-[var(--abv-text)] line-clamp-2 break-words text-left cursor-pointer hover:text-[var(--abv-azure)] transition-colors"
                      title="Open editor"
                    >
                      {plan.title}
                    </button>
                  </div>
                </div>
              </div>

              {/* Status — inline editable */}
              <div className="min-w-0">
                <InlineStatusSelect
                  status={plan.status}
                  options={statusOptions}
                  onChange={(v) => patchPlan(plan.id, { status: v })}
                />
              </div>

              {/* Theme — inline editable */}
              <div className="min-w-0">
                <InlineThemeSelect
                  theme={plan.theme}
                  themes={themes}
                  onChange={(v) => patchPlan(plan.id, { theme: v })}
                />
              </div>

              {/* Binge — inline editable */}
              <div className="min-w-0">
                <InlineBingeSelect
                  value={plan.bingeVideoId}
                  current={bingeTarget}
                  options={plans.filter((p) => p.id !== plan.id)}
                  onChange={(v) => patchPlan(plan.id, { bingeVideoId: v })}
                />
              </div>

              {/* Shoot date — inline editable */}
              <div className="min-w-0">
                <InlineDateInput
                  value={plan.shootDate}
                  onChange={(v) => patchPlan(plan.id, { shootDate: v })}
                />
              </div>

              {/* Edit date — inline editable */}
              {showEditDue && (
                <div className="min-w-0">
                  <InlineDateInput
                    value={plan.editDueDate}
                    onChange={(v) => patchPlan(plan.id, { editDueDate: v })}
                  />
                </div>
              )}

              {/* Publish date — inline editable */}
              <div className="min-w-0">
                <InlineDateInput
                  value={plan.publishDate}
                  onChange={(v) => patchPlan(plan.id, { publishDate: v })}
                />
              </div>

              {/* Drive folder — open in new tab */}
              {showDriveFolder && (
                <div className="flex items-center justify-center">
                  {plan.driveFolderLink ? (
                    <a
                      href={plan.driveFolderLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center text-[var(--abv-text-dim)] hover:text-[var(--abv-azure)] transition-colors"
                      title="Open Google Drive folder"
                    >
                      <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                    </a>
                  ) : (
                    <span className="text-[var(--abv-text-dim)] text-xs">—</span>
                  )}
                </div>
              )}

              {/* Delete — soft-delete the plan */}
              <div className="flex items-center justify-center">
                <button
                  onClick={() => handleDelete(plan.id)}
                  disabled={deletingId === plan.id}
                  className="inline-flex items-center justify-center text-[var(--abv-text-dim)] hover:text-red-600 transition-colors disabled:opacity-50"
                  title="Delete video"
                  aria-label="Delete video"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })
      )}

      </div>
    </section>
  );
}

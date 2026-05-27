"use client";

import { useState, useEffect, useMemo } from "react";
import { ChevronUpIcon, ChevronDownIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import DramaMagnet from "@/components/icons/DramaMagnet";
import ContentPlanEditModal from "./ContentPlanEditModal";
import {
  getStatusOptions,
  hasEditDueDate,
  hasDriveFolder,
  filterPlans,
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
  updatedAt?: string | null;
  dramaMode?: boolean;
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

function formatDate(d: string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function ContentPlanTable({
  apiBase,
  isAdmin = false,
  forcedServiceTier,
  searchQuery = "",
  statusFilter = [],
  scriptBuilderV2Enabled = false,
  refreshKey = 0,
  onPlansChanged,
}: Props) {
  const [plans, setPlans] = useState<ContentPlan[]>([]);
  const [serviceTier, setServiceTier] = useState<string>(forcedServiceTier ?? "foundations");
  const [themes, setThemes] = useState<Array<{ name: string; emoji?: string | null; colour?: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState<ContentPlan | null>(null);
  const [sortKey, setSortKey] = useState<keyof ContentPlan | null>("publishDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showProgressTrack, setShowProgressTrack] = useState(false);

  const showEditDue = isAdmin || hasEditDueDate(serviceTier);
  const showDriveFolder = isAdmin || hasDriveFolder(serviceTier);

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

  // Mockup grid: Title | Status | Theme | Binge | Shoot date | Location | Edit date
  // Members on tiers without an edit-due field drop the trailing column.
  // Drive folder lives only on production tiers (and admin) and gets a slim
  // trailing icon-only column when present.
  const colTemplate = `minmax(0, 1fr) 150px 185px 150px 95px 130px ${showEditDue ? "95px " : ""}${showDriveFolder ? "44px" : ""}`.trim();

  return (
    <section
      className="overflow-hidden"
      style={{
        background: "var(--abv-card)",
        border: "1px solid var(--abv-border)",
        borderRadius: "14px",
        boxShadow: "var(--abv-shadow-sm, 0 1px 3px rgba(0,0,0,0.04))",
      }}
    >
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
        <button onClick={() => handleSort("title")} className="text-left hover:text-[var(--abv-text)] transition-colors">
          Title <SortIcon col="title" />
        </button>
        <button onClick={() => handleSort("status")} className="text-left hover:text-[var(--abv-text)] transition-colors">
          Status <SortIcon col="status" />
        </button>
        <button onClick={() => handleSort("theme")} className="text-left hover:text-[var(--abv-text)] transition-colors">
          Theme <SortIcon col="theme" />
        </button>
        <button onClick={() => handleSort("bingeVideoId")} className="text-left hover:text-[var(--abv-text)] transition-colors">
          Binge <SortIcon col="bingeVideoId" />
        </button>
        <button onClick={() => handleSort("shootDate")} className="text-left hover:text-[var(--abv-text)] transition-colors">
          Shoot date <SortIcon col="shootDate" />
        </button>
        <span className="text-left">Location</span>
        {showEditDue && (
          <button onClick={() => handleSort("editDueDate")} className="text-left hover:text-[var(--abv-text)] transition-colors">
            Edit date <SortIcon col="editDueDate" />
          </button>
        )}
        {showDriveFolder && <span />}
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
              role="button"
              tabIndex={0}
              onClick={() => setEditingPlan(plan)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditingPlan(plan); } }}
              className="grid gap-[14px] px-[22px] py-3.5 items-center cursor-pointer hover:bg-[var(--abv-bg-warm)] transition-colors"
              style={{
                gridTemplateColumns: colTemplate,
                borderBottom: "1px solid var(--abv-border)",
              }}
            >
              {/* Title cell — thumbnail (if any) + title + drama icon */}
              <div className="flex items-start gap-2 min-w-0">
                {plan.thumbnailFileId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/member/content-plans/${plan.id}/thumbnail?v=${encodeURIComponent(plan.updatedAt ?? plan.thumbnailFileId ?? "")}`}
                    alt=""
                    loading="lazy"
                    className="w-12 h-7 object-cover rounded shrink-0 mt-0.5 bg-gray-100 border border-gray-200"
                    title={plan.thumbnailFileName ?? "Thumbnail"}
                  />
                ) : null}
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {plan.dramaMode && (
                      <DramaMagnet className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                    )}
                    <span className="font-semibold text-[14px] leading-[1.4] text-[var(--abv-text)] line-clamp-2 break-words">
                      {plan.title}
                    </span>
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="min-w-0">
                <StatusBadge status={plan.status} />
              </div>

              {/* Theme */}
              <div className="min-w-0">
                <ThemePill theme={plan.theme} />
              </div>

              {/* Binge */}
              <div className="flex items-center gap-1.5 min-w-0 text-[12px] text-[var(--abv-text-muted)] whitespace-nowrap overflow-hidden">
                {bingeTarget ? (
                  <span className="truncate" title={bingeTarget.title}>↪ {bingeTarget.title}</span>
                ) : (
                  <span className="text-[var(--abv-text-dim)]">—</span>
                )}
              </div>

              {/* Shoot date */}
              <div
                className="font-mono tracking-[0.04em] tabular-nums"
                style={{
                  fontSize: "11.5px",
                  color: plan.shootDate ? "var(--abv-text-muted)" : "var(--abv-text-dim)",
                }}
              >
                {plan.shootDate ? formatDate(plan.shootDate) : "—"}
              </div>

              {/* Location */}
              <div
                className="text-[12.5px] truncate min-w-0"
                style={{ color: plan.shootLocation ? "var(--abv-text-muted)" : "var(--abv-text-dim)" }}
              >
                {plan.shootLocation || "—"}
              </div>

              {/* Edit date */}
              {showEditDue && (
                <div
                  className="font-mono tracking-[0.04em] tabular-nums"
                  style={{
                    fontSize: "11.5px",
                    color: plan.editDueDate ? "var(--abv-text-muted)" : "var(--abv-text-dim)",
                  }}
                >
                  {plan.editDueDate ? formatDate(plan.editDueDate) : "—"}
                </div>
              )}

              {/* Drive folder — open in new tab; clicking should not also open the modal */}
              {showDriveFolder && (
                <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
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
            </div>
          );
        })
      )}

      {editingPlan && (
        <ContentPlanEditModal
          plan={editingPlan}
          serviceTier={serviceTier}
          apiBase={apiBase}
          isAdmin={isAdmin}
          themes={themes}
          showProgressTrack={showProgressTrack}
          scriptBuilderV2Enabled={scriptBuilderV2Enabled}
          onClose={() => setEditingPlan(null)}
          onSaved={(updated) => {
            // Wave 4 auto-save: keep the modal open on save; only refresh
            // the cached row so the table reflects the change immediately.
            setPlans((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
          }}
          onDeleted={(id) => {
            setPlans((prev) => prev.filter((p) => p.id !== id));
            setEditingPlan(null);
          }}
        />
      )}
    </section>
  );
}

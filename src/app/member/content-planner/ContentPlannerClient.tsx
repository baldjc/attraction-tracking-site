"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDaysIcon, ClipboardDocumentIcon, CheckIcon, XMarkIcon, MagnifyingGlassIcon, PlusIcon } from "@heroicons/react/24/outline";
import ContentPlanTable from "@/components/content-planner/ContentPlanTable";
import CalendarView from "@/components/content-planner/CalendarView";
import BoardView from "@/components/content-planner/BoardView";
import PipelineView, { type PipelineSortKey } from "@/components/content-planner/PipelineView";
import ContentPlanEditModal, { type ContentPlan } from "@/components/content-planner/ContentPlanEditModal";
import MobileCardFeed from "@/components/content-planner/MobileCardFeed";
import { hasEditDueDate, getStatusOptions, filterPlans } from "@/lib/content-plan-utils";
import { useIsMobile } from "@/hooks/useIsMobile";

type ViewId = "publish_cal" | "shoot_cal" | "edit_due" | "table" | "by_theme" | "pipeline";

interface Props {
  serviceTier: string;
  apiBase?: string;
  isAdminView?: boolean;
}

export default function ContentPlannerClient({
  serviceTier,
  apiBase = "/api/member/content-plans",
  isAdminView = false,
}: Props) {
  const [view, setView] = useState<ViewId>("table");
  const [showCalModal, setShowCalModal] = useState(false);
  const [calUrl, setCalUrl] = useState<string | null>(null);
  const [calLoading, setCalLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [autoOpenPlan, setAutoOpenPlan] = useState<ContentPlan | null>(null);
  const [showProgressTrack, setShowProgressTrack] = useState(false);
  const [showPipelineTab, setShowPipelineTab] = useState(false);
  // Wave 3 — gates the "Build Script (v2)" entry point on the edit modal.
  // The save endpoint also gates on this flag server-side, so a stale
  // client view can't actually save a v2 script.
  const [scriptBuilderV2Enabled, setScriptBuilderV2Enabled] = useState(false);

  // Sprint 7 — global search + status filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [pipelineSort, setPipelineSort] = useState<PipelineSortKey>("default");
  const [allPlans, setAllPlans] = useState<ContentPlan[] | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();

  useEffect(() => {
    fetch("/api/member/feature-flags")
      .then((r) => r.json())
      .then((d) => {
        if (d?.flags?.progress_track_v1) setShowProgressTrack(true);
        if (d?.flags?.planner_pipeline_view) setShowPipelineTab(true);
        if (d?.flags?.tool_script_builder_v2) setScriptBuilderV2Enabled(true);
      })
      .catch(() => {});
  }, []);

  // Auto-open the edit modal when a ?plan=<id> param is present (e.g. from "View in planner →" link)
  useEffect(() => {
    const planId = searchParams.get("plan");
    if (!planId) return;
    router.replace("/member/content-planner");
    fetch(`/api/member/content-plans/${planId}`)
      .then((r) => r.json())
      .then((d) => { if (d?.plan) setAutoOpenPlan(d.plan as ContentPlan); })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sprint 7 — fetch plan list once for filter-chip counts + Pipeline default heuristic.
  useEffect(() => {
    fetch(apiBase)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.plans) setAllPlans(d.plans as ContentPlan[]); })
      .catch(() => {});
  }, [apiBase]);

  // Full Table is the default landing view for all members.

  const showEditDueTab = hasEditDueDate(serviceTier);

  const ALL_TABS: { id: ViewId; label: string; restricted: boolean }[] = [
    { id: "table",       label: "Full Table",        restricted: false },
    { id: "pipeline",    label: "Pipeline",          restricted: !showPipelineTab },
    { id: "by_theme",    label: "By Theme",          restricted: false },
    { id: "publish_cal", label: "Publish Calendar",  restricted: false },
    { id: "shoot_cal",   label: "Shoot Calendar",    restricted: false },
    { id: "edit_due",    label: "Edit Calendar",     restricted: !showEditDueTab },
  ];
  const TABS = ALL_TABS.filter((t) => !t.restricted);

  const statusOptions = useMemo(() => getStatusOptions(serviceTier), [serviceTier]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!allPlans) return counts;
    for (const p of allPlans) counts[p.status] = (counts[p.status] ?? 0) + 1;
    return counts;
  }, [allPlans]);

  // Live filtered/total counts so the user can see filters are working even
  // before scrolling the table — also serves as a quick sanity check.
  const filteredCount = useMemo(() => {
    if (!allPlans) return 0;
    return filterPlans(allPlans, searchQuery, statusFilter).length;
  }, [allPlans, searchQuery, statusFilter]);
  const totalCount = allPlans?.length ?? 0;

  function toggleStatus(s: string) {
    setStatusFilter((curr) => curr.includes(s) ? curr.filter((x) => x !== s) : [...curr, s]);
  }
  function clearFilters() {
    setSearchQuery("");
    setStatusFilter([]);
  }

  async function openCalModal() {
    setShowCalModal(true);
    if (calUrl) return;
    setCalLoading(true);
    try {
      const res = await fetch("/api/member/content-planner/calendar-token");
      const data = await res.json();
      setCalUrl(data.url ?? null);
    } catch {
      // silent
    } finally {
      setCalLoading(false);
    }
  }

  const [addingPlan, setAddingPlan] = useState(false);
  async function handleQuickAdd() {
    if (addingPlan) return;
    setAddingPlan(true);
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Video", status: statusOptions[0] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add");
      setAllPlans((prev) => (prev ? [data.plan as ContentPlan, ...prev] : [data.plan as ContentPlan]));
      setAutoOpenPlan(data.plan as ContentPlan);
    } catch (e: any) {
      alert(`Could not add video: ${e.message}`);
    } finally {
      setAddingPlan(false);
    }
  }

  function copyUrl() {
    if (!calUrl) return;
    navigator.clipboard.writeText(calUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const filtersActive = searchQuery.trim().length > 0 || statusFilter.length > 0;

  if (isMobile) {
    return (
      <div>
        <MobileCardFeed
          plans={allPlans}
          statusOptions={statusOptions}
          onSelectPlan={(p) => setAutoOpenPlan(p)}
          onAddPlan={handleQuickAdd}
          addingPlan={addingPlan}
          isAdminView={isAdminView}
        />
        {autoOpenPlan && (
          <ContentPlanEditModal
            plan={autoOpenPlan}
            serviceTier={serviceTier}
            apiBase={apiBase}
            showProgressTrack={showProgressTrack}
            scriptBuilderV2Enabled={scriptBuilderV2Enabled}
            onClose={() => setAutoOpenPlan(null)}
            onSaved={(updated) => {
              // Wave 4 auto-save: only refresh the cached list; closing the
              // modal here would dismiss it after every keystroke.
              if (updated) {
                setAllPlans((prev) =>
                  prev ? prev.map((p) => (p.id === updated.id ? (updated as ContentPlan) : p)) : prev
                );
              }
            }}
            onDeleted={(deletedId) => {
              setAutoOpenPlan(null);
              if (deletedId) {
                setAllPlans((prev) => (prev ? prev.filter((p) => p.id !== deletedId) : prev));
              }
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Sprint 7 — global search + status filter bar */}
      <div className="mb-4 space-y-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--abv-text)]/40 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 Search plans…"
              className="w-full pl-9 pr-8 py-1.5 text-sm bg-white border border-gray-200 rounded-lg text-[var(--abv-text)] placeholder:text-[var(--abv-text)]/40 focus:outline-none focus:border-[var(--abv-azure)] focus:ring-2 focus:ring-[var(--abv-azure)]/20"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--abv-text)]/40 hover:text-[var(--abv-text)]"
                title="Clear search"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            )}
          </div>
          {filtersActive && (
            <>
              <span className="text-xs text-[var(--abv-text)]/60 whitespace-nowrap">
                Showing <span className="font-semibold text-[var(--abv-text)]">{filteredCount}</span> of {totalCount}
              </span>
              <button onClick={clearFilters} className="text-xs text-[var(--abv-azure)] hover:underline whitespace-nowrap">
                Clear filters
              </button>
            </>
          )}
          {(view === "pipeline" || view === "by_theme") && (
            <label className="ml-auto flex items-center gap-1.5 text-xs text-[var(--abv-text)]/60">
              Sort
              <select
                value={pipelineSort}
                onChange={(e) => setPipelineSort(e.target.value as PipelineSortKey)}
                className="text-xs bg-white border border-gray-200 rounded-md px-2 py-1 text-[var(--abv-text)] focus:outline-none focus:border-[var(--abv-azure)] focus:ring-2 focus:ring-[var(--abv-azure)]/20"
              >
                <option value="default">Default</option>
                <option value="publish-asc">Publish date ↑</option>
                <option value="publish-desc">Publish date ↓</option>
                <option value="shoot-asc">Shoot date ↑</option>
                <option value="shoot-desc">Shoot date ↓</option>
              </select>
            </label>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {statusOptions.map((s) => {
            const count = statusCounts[s] ?? 0;
            const selected = statusFilter.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleStatus(s)}
                aria-pressed={selected}
                title={selected ? `Click to remove ${s} filter` : `Filter by ${s}`}
                className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded border transition-all ${
                  selected
                    ? "bg-[var(--abv-dark)] border-[var(--abv-azure)] text-white font-semibold shadow-sm ring-2 ring-[var(--abv-azure)]/30"
                    : "bg-white border-gray-200 text-[var(--abv-text)]/70 font-medium hover:border-[var(--abv-azure)]/50 hover:bg-[var(--abv-dark)]/5"
                }`}
              >
                {selected && <CheckIcon className="w-3 h-3" />}
                <span>{s} ({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div className="flex items-center flex-wrap gap-1 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              className={`text-sm font-medium px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${
                view === tab.id
                  ? "bg-[var(--abv-dark)] text-white shadow-sm"
                  : "text-[var(--abv-text)]/60 hover:text-[var(--abv-text)] hover:bg-gray-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!isAdminView && (
            <button
              onClick={handleQuickAdd}
              disabled={addingPlan}
              className="flex items-center gap-1.5 text-sm font-semibold text-white bg-[var(--abv-dark)] px-3 py-1.5 rounded-lg hover:bg-black/85 disabled:opacity-50 transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              {addingPlan ? "Adding…" : "Add Video"}
            </button>
          )}
          {!isAdminView && (
            <button
              onClick={openCalModal}
              className="flex items-center gap-1.5 text-sm text-[var(--abv-text)]/70 border border-gray-200 bg-white px-3 py-1.5 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors"
            >
              <CalendarDaysIcon className="w-4 h-4" />
              Subscribe to Calendar
            </button>
          )}
        </div>
      </div>

      {view === "table" && (
        <ContentPlanTable
          apiBase={apiBase}
          forcedServiceTier={serviceTier}
          isAdmin={isAdminView}
          searchQuery={searchQuery}
          statusFilter={statusFilter}
          scriptBuilderV2Enabled={scriptBuilderV2Enabled}
        />
      )}

      {view === "publish_cal" && (
        <CalendarView
          apiBase={apiBase}
          calendarType="publish"
          serviceTier={serviceTier}
          isAdmin={isAdminView}
          searchQuery={searchQuery}
          statusFilter={statusFilter}
          scriptBuilderV2Enabled={scriptBuilderV2Enabled}
        />
      )}

      {view === "shoot_cal" && (
        <CalendarView
          apiBase={apiBase}
          calendarType="shoot"
          serviceTier={serviceTier}
          isAdmin={isAdminView}
          searchQuery={searchQuery}
          statusFilter={statusFilter}
          scriptBuilderV2Enabled={scriptBuilderV2Enabled}
        />
      )}

      {view === "edit_due" && showEditDueTab && (
        <CalendarView
          apiBase={apiBase}
          calendarType="edit_due"
          serviceTier={serviceTier}
          isAdmin={isAdminView}
          searchQuery={searchQuery}
          statusFilter={statusFilter}
          scriptBuilderV2Enabled={scriptBuilderV2Enabled}
        />
      )}

      {view === "by_theme" && (
        <BoardView
          apiBase={apiBase}
          serviceTier={serviceTier}
          isAdmin={isAdminView}
          searchQuery={searchQuery}
          statusFilter={statusFilter}
          sortBy={pipelineSort}
          scriptBuilderV2Enabled={scriptBuilderV2Enabled}
        />
      )}

      {view === "pipeline" && showPipelineTab && (
        <PipelineView
          apiBase={apiBase}
          serviceTier={serviceTier}
          isAdmin={isAdminView}
          searchQuery={searchQuery}
          statusFilter={statusFilter}
          sortBy={pipelineSort}
          scriptBuilderV2Enabled={scriptBuilderV2Enabled}
        />
      )}

      {autoOpenPlan && (
        <ContentPlanEditModal
          plan={autoOpenPlan}
          serviceTier={serviceTier}
          apiBase={apiBase}
          showProgressTrack={showProgressTrack}
          scriptBuilderV2Enabled={scriptBuilderV2Enabled}
          onClose={() => setAutoOpenPlan(null)}
          // Wave 4 auto-save: no-op on save (modal stays open until the
          // user explicitly closes it). Delete still closes since the
          // plan no longer exists.
          onSaved={() => {}}
          onDeleted={() => setAutoOpenPlan(null)}
        />
      )}

      {!isAdminView && showCalModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <CalendarDaysIcon className="w-5 h-5 text-[var(--abv-azure)]" />
                <h3 className="text-base font-semibold text-[var(--abv-text)]">Subscribe to Calendar</h3>
              </div>
              <button onClick={() => setShowCalModal(false)} className="text-[var(--abv-text)]/40 hover:text-[var(--abv-text)]">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {calLoading ? (
              <div className="h-10 bg-gray-100 rounded-lg animate-pulse mb-4" />
            ) : calUrl ? (
              <div className="flex gap-2 mb-5">
                <input
                  type="text"
                  readOnly
                  value={calUrl}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs text-[var(--abv-text)]/70 bg-gray-50 focus:outline-none"
                />
                <button
                  onClick={copyUrl}
                  className="flex items-center gap-1.5 px-3 py-2 bg-[var(--abv-dark)] hover:bg-[#5a8fb0] text-white text-sm rounded-lg transition-colors shrink-0"
                >
                  {copied ? <CheckIcon className="w-4 h-4" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            ) : (
              <p className="text-sm text-red-600 mb-4">Failed to generate your calendar link. Please try again.</p>
            )}

            <div className="space-y-3 text-sm text-[var(--abv-text)]/70">
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <p className="font-medium text-[var(--abv-text)]">How to subscribe:</p>
                <p><span className="font-medium">Google Calendar:</span> Settings → Add calendar → From URL → paste the link</p>
                <p><span className="font-medium">Apple Calendar:</span> File → New Calendar Subscription → paste the link</p>
              </div>
              <p className="text-xs text-[var(--abv-text)]/40">
                Your calendar updates automatically when you make changes. Google Calendar refreshes every 12–24 hours. Apple Calendar refreshes every 15–60 minutes.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

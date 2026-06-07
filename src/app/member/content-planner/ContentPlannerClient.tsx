"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDaysIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  AdjustmentsHorizontalIcon,
  ArrowsUpDownIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import ContentPlanTable from "@/components/content-planner/ContentPlanTable";
import MyWorkLibrary from "@/components/my-work/MyWorkLibrary";
import CalendarView from "@/components/content-planner/CalendarView";
import BoardView from "@/components/content-planner/BoardView";
import PipelineView, { type PipelineSortKey } from "@/components/content-planner/PipelineView";
import { type ContentPlan } from "@/components/content-planner/ContentPlanEditModal";
import MobileCardFeed from "@/components/content-planner/MobileCardFeed";
import { getStatusOptions, filterPlans } from "@/lib/content-plan-utils";
import { getStatusDotColor } from "@/lib/content-plan-style";
import { useIsMobile } from "@/hooks/useIsMobile";

type ViewId = "publish_cal" | "table" | "by_theme" | "pipeline" | "library";

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
  const [showProgressTrack, setShowProgressTrack] = useState(false);
  const [showPipelineTab, setShowPipelineTab] = useState(false);
  const [scriptBuilderV2Enabled, setScriptBuilderV2Enabled] = useState(false);
  const [aiWizardEnabled, setAiWizardEnabled] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [pipelineSort, setPipelineSort] = useState<PipelineSortKey>("default");
  const [showStatusBar, setShowStatusBar] = useState(true);
  const [allPlans, setAllPlans] = useState<ContentPlan[] | null>(null);
  // Bumped whenever the parent adds or updates a plan so the table refetches
  // and the new/changed row appears immediately without a page reload.
  const [tableRefreshKey, setTableRefreshKey] = useState(0);
  // Bumped by the "Reset cols" link so the Table view clears its saved
  // localStorage column widths and reverts to defaults.
  const [resetColsKey, setResetColsKey] = useState(0);

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
        if (d?.flags?.tool_content_engine_v2) setAiWizardEnabled(true);
      })
      .catch(() => {});
  }, []);

  // Auto-open: a ?plan=<id> param now navigates straight to the full-page editor.
  useEffect(() => {
    const planId = searchParams.get("plan");
    if (!planId) return;
    router.replace(`/member/content-planner/${planId}`);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch(apiBase)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.plans) setAllPlans(d.plans as ContentPlan[]); })
      .catch(() => {});
  }, [apiBase]);

  const ALL_TABS: { id: ViewId; label: string; restricted: boolean }[] = [
    { id: "table",       label: "Table",    restricted: false },
    { id: "publish_cal", label: "Calendar", restricted: false },
    { id: "pipeline",    label: "Pipeline", restricted: !showPipelineTab },
    { id: "by_theme",    label: "Themes",   restricted: false },
    { id: "library",     label: "Library",  restricted: false },
  ];
  const TABS = ALL_TABS.filter((t) => !t.restricted);

  const statusOptions = useMemo(() => getStatusOptions(serviceTier), [serviceTier]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!allPlans) return counts;
    for (const p of allPlans) counts[p.status] = (counts[p.status] ?? 0) + 1;
    return counts;
  }, [allPlans]);

  const filteredCount = useMemo(() => {
    if (!allPlans) return 0;
    return filterPlans(allPlans, searchQuery, statusFilter).length;
  }, [allPlans, searchQuery, statusFilter]);
  const totalCount = allPlans?.length ?? 0;

  function toggleStatus(s: string) {
    setStatusFilter((curr) => curr.includes(s) ? curr.filter((x) => x !== s) : [...curr, s]);
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
      setTableRefreshKey((k) => k + 1);
      router.push(`/member/content-planner/${(data.plan as ContentPlan).id}`);
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

  const sortVisible = view === "pipeline" || view === "by_theme";

  if (isMobile) {
    const mobileLibrary = view === "library";
    return (
      <div className="px-1 pb-16">
        {/* Mobile Pipeline ⇄ Library switch — keeps the Planner the single home
            for content on small screens (the desktop tab row is hidden here). */}
        <div className="flex gap-1 bg-[#111]/5 dark:bg-white/5 rounded-lg p-1 mb-4">
          <button
            onClick={() => setView("table")}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all ${
              !mobileLibrary
                ? "bg-white dark:bg-[#1a1a1a] text-[var(--abv-text)] dark:text-white shadow-sm"
                : "text-[var(--abv-text)]/50 dark:text-white/40"
            }`}
          >
            Pipeline
          </button>
          <button
            onClick={() => setView("library")}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all ${
              mobileLibrary
                ? "bg-white dark:bg-[#1a1a1a] text-[var(--abv-text)] dark:text-white shadow-sm"
                : "text-[var(--abv-text)]/50 dark:text-white/40"
            }`}
          >
            Library
          </button>
        </div>
        {mobileLibrary ? (
          <MyWorkLibrary />
        ) : (
          <MobileCardFeed
            plans={allPlans}
            statusOptions={statusOptions}
            onSelectPlan={(p) => router.push(`/member/content-planner/${p.id}`)}
            onAddPlan={handleQuickAdd}
            addingPlan={addingPlan}
            isAdminView={isAdminView}
          />
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] px-1 sm:px-2 pb-16">
      {/* PageHeader — eyebrow, h1 with azure "ship", subtitle, count badge + CTAs */}
      <header className="flex justify-between items-end gap-5 mb-7 flex-wrap">
        <div className="flex-1 min-w-[280px]">
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-[5px] rounded-full text-[11px] font-bold uppercase tracking-[0.12em]"
            style={{ background: "var(--abv-azure-tint)", color: "var(--abv-azure)" }}
          >
            <span className="inline-block w-[5px] h-[5px] rounded-full" style={{ background: "var(--abv-azure)" }} />
            Content pipeline
          </span>
          <h1
            className="font-display font-black tracking-[-0.03em] leading-[1.05] mt-3.5 mb-2 text-[var(--abv-text)]"
            style={{ fontSize: "44px", maxWidth: "600px" }}
          >
            Plan, track, <span style={{ color: "var(--abv-azure)" }}>publish</span>.
          </h1>
          <p className="text-[15px] text-[var(--abv-text-muted)] m-0 max-w-[540px] leading-[1.55]">
            Every video, from idea through to live on YouTube — in one place, in one workflow.
          </p>
        </div>
        <div className="flex gap-2 items-center shrink-0">
          {allPlans && (
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-[11px] font-semibold tracking-[0.04em] text-[var(--abv-text-muted)]"
              style={{ background: "var(--abv-bg-warm)", border: "1px solid var(--abv-border)" }}
            >
              <span className="text-[var(--abv-text)] font-bold">{totalCount}</span>
              videos planned
            </span>
          )}
          {!isAdminView && (
            <button
              onClick={handleQuickAdd}
              disabled={addingPlan}
              className="inline-flex items-center gap-1.5 px-4 py-[9px] rounded-full text-[12px] font-semibold uppercase tracking-[0.04em] bg-white text-[var(--abv-text)] hover:bg-[var(--abv-ink)] hover:text-white transition-colors disabled:opacity-50"
              style={{ border: "1.5px solid var(--abv-ink)" }}
            >
              <PlusIcon className="w-[13px] h-[13px]" />
              {addingPlan ? "Adding…" : "Add Blank Video"}
            </button>
          )}
          {!isAdminView && aiWizardEnabled && (
            <Link
              href="/member/content-planner/wizard?step=1"
              className="inline-flex items-center gap-1.5 px-[18px] py-[11px] rounded-full text-[13px] font-bold text-[var(--abv-ink)] transition-colors"
              style={{ background: "var(--abv-azure)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#5BCEFF")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--abv-azure)")}
            >
              <SparklesIcon className="w-[14px] h-[14px]" />
              Browse Content Ideas
            </Link>
          )}
        </div>
      </header>

      {/* Status filter bar — card surface, dot + count per pill, ink-fill active */}
      {showStatusBar && view !== "library" && (
        <div
          className="flex gap-1.5 p-1 mb-3.5 overflow-x-auto"
          style={{
            background: "var(--abv-card)",
            border: "1px solid var(--abv-border)",
            borderRadius: "12px",
            boxShadow: "var(--abv-shadow-sm, 0 1px 3px rgba(0,0,0,0.04))",
          }}
        >
          {statusOptions.map((s) => {
            const count = statusCounts[s] ?? 0;
            const selected = statusFilter.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleStatus(s)}
                aria-pressed={selected}
                className={`inline-flex items-center gap-[7px] px-3 py-2 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                  selected
                    ? "bg-[var(--abv-ink)] text-white"
                    : "bg-transparent text-[var(--abv-text-muted)] hover:bg-[var(--abv-bg-warm)] hover:text-[var(--abv-text)]"
                }`}
              >
                <span
                  className="inline-block w-[7px] h-[7px] rounded-full"
                  style={{ background: getStatusDotColor(s) }}
                />
                {s}
                <span
                  className={`font-mono text-[10.5px] px-[7px] py-[2px] rounded-full font-semibold ml-0.5 ${
                    selected ? "text-white/85" : "text-[var(--abv-text-dim)]"
                  }`}
                  style={{
                    background: selected ? "rgba(255,255,255,0.15)" : "var(--abv-bg-warm)",
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* View tabs + search + filter/sort icon buttons */}
      <div className="flex items-center gap-4 mb-[18px] flex-wrap">
        <div
          className="inline-flex gap-0 flex-1 items-end"
          style={{ borderBottom: "1px solid var(--abv-border-strong)" }}
        >
          {TABS.map((tab) => {
            const isOn = view === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setView(tab.id)}
                className={`text-[13.5px] font-semibold py-[9px] px-0.5 mr-[26px] bg-transparent transition-colors ${
                  isOn ? "text-[var(--abv-text)]" : "text-[var(--abv-text-muted)] hover:text-[var(--abv-text)]"
                }`}
                style={{
                  borderBottom: isOn ? "2px solid var(--abv-ink)" : "2px solid transparent",
                  marginBottom: "-1px",
                }}
              >
                {tab.label}
                {isOn && allPlans && tab.id !== "library" && (
                  <span className="font-mono text-[10.5px] text-[var(--abv-text-dim)] ml-1.5 font-medium">
                    {filteredCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {view !== "library" && (
        <>
        <div
          className="inline-flex items-center gap-2 bg-white px-[14px] py-[7px] rounded-full text-[12.5px] text-[var(--abv-text-dim)] w-[220px]"
          style={{ border: "1px solid var(--abv-border-strong)" }}
        >
          <MagnifyingGlassIcon className="w-[13px] h-[13px] shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search titles, themes…"
            className="border-0 outline-none flex-1 bg-transparent text-[var(--abv-text)] text-[12.5px] min-w-0 placeholder:text-[var(--abv-text-dim)]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="text-[var(--abv-text-dim)] hover:text-[var(--abv-text)]"
              title="Clear search"
            >
              <XMarkIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <button
          onClick={() => setShowStatusBar((v) => !v)}
          title={showStatusBar ? "Hide status filters" : "Show status filters"}
          className="w-9 h-9 inline-flex items-center justify-center bg-white rounded-full text-[var(--abv-text-muted)] hover:text-[var(--abv-text)] transition-colors"
          style={{ border: "1px solid var(--abv-border-strong)" }}
        >
          <AdjustmentsHorizontalIcon className="w-3.5 h-3.5" />
        </button>

        {sortVisible ? (
          <div className="relative">
            <ArrowsUpDownIcon className="w-3.5 h-3.5 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[var(--abv-text-muted)] pointer-events-none" />
            <select
              value={pipelineSort}
              onChange={(e) => setPipelineSort(e.target.value as PipelineSortKey)}
              title="Sort"
              className="w-9 h-9 appearance-none rounded-full bg-white text-transparent cursor-pointer"
              style={{ border: "1px solid var(--abv-border-strong)" }}
            >
              <option value="default">Default</option>
              <option value="publish-asc">Publish date ↑</option>
              <option value="publish-desc">Publish date ↓</option>
              <option value="shoot-asc">Shoot date ↑</option>
              <option value="shoot-desc">Shoot date ↓</option>
            </select>
          </div>
        ) : (
          <button
            title="Sort (available in Pipeline and By Theme views)"
            disabled
            className="w-9 h-9 inline-flex items-center justify-center bg-white rounded-full text-[var(--abv-text-dim)] opacity-50 cursor-not-allowed"
            style={{ border: "1px solid var(--abv-border-strong)" }}
          >
            <ArrowsUpDownIcon className="w-3.5 h-3.5" />
          </button>
        )}

        {view === "table" && (
          <button
            onClick={() => setResetColsKey((k) => k + 1)}
            title="Reset column widths to defaults"
            className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--abv-text-muted)] hover:text-[var(--abv-text)] px-2 py-1.5 transition-colors"
          >
            Reset cols
          </button>
        )}

        {!isAdminView && (
          <button
            onClick={openCalModal}
            title="Subscribe to Calendar"
            className="w-9 h-9 inline-flex items-center justify-center bg-white rounded-full text-[var(--abv-text-muted)] hover:text-[var(--abv-text)] transition-colors"
            style={{ border: "1px solid var(--abv-border-strong)" }}
          >
            <CalendarDaysIcon className="w-3.5 h-3.5" />
          </button>
        )}
        </>
        )}
      </div>

      {view === "table" && (
        <ContentPlanTable
          apiBase={apiBase}
          forcedServiceTier={serviceTier}
          isAdmin={isAdminView}
          searchQuery={searchQuery}
          statusFilter={statusFilter}
          scriptBuilderV2Enabled={scriptBuilderV2Enabled}
          refreshKey={tableRefreshKey}
          resetColsKey={resetColsKey}
          onPlansChanged={(p) => setAllPlans(p)}
        />
      )}

      {view === "publish_cal" && (
        <CalendarView
          apiBase={apiBase}
          serviceTier={serviceTier}
          isAdmin={isAdminView}
          searchQuery={searchQuery}
          statusFilter={statusFilter}
          scriptBuilderV2Enabled={scriptBuilderV2Enabled}
          refreshKey={tableRefreshKey}
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

      {/* Library — the member's saved-asset library, folded in so the Planner is
          the single home for all content (pipeline views show ContentPlan rows;
          this aliases scripts/drafts/ideas/reviews from /api/member/my-work). */}
      {view === "library" && <MyWorkLibrary />}

      {/* Workflow help block */}
      <section
        className="mt-9 px-8 py-7"
        style={{
          background: "var(--abv-card)",
          border: "1px solid var(--abv-border)",
          borderRadius: "14px",
          boxShadow: "var(--abv-shadow-sm, 0 1px 3px rgba(0,0,0,0.04))",
        }}
      >
        <div className="mb-[18px] max-w-[580px]">
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-[5px] rounded-full text-[11px] font-bold uppercase tracking-[0.12em]"
            style={{ background: "var(--abv-azure-tint)", color: "var(--abv-azure)" }}
          >
            <span className="inline-block w-[5px] h-[5px] rounded-full" style={{ background: "var(--abv-azure)" }} />
            How this works
          </span>
          <h3
            className="font-display font-extrabold tracking-[-0.025em] leading-[1.15] mt-2.5 mb-1.5 text-[var(--abv-text)]"
            style={{ fontSize: "26px" }}
          >
            From idea to <span style={{ color: "var(--abv-azure)" }}>live on YouTube</span>, in nine steps.
          </h3>
          <p className="text-sm text-[var(--abv-text-muted)] m-0 leading-[1.55]">
            Every video moves through the same pipeline. Click a row to edit it, filter by status, or generate a fresh batch of ideas with AI.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <HelpCard
            tone="azure"
            title="Generate with AI"
            body="New Content (AI) pulls validated ideas anchored to your market data and avatar. Pick one, draft starts."
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M12 3l1.8 4.5L18 9l-4.2 1.5L12 15l-1.8-4.5L6 9l4.2-1.5z" />
              </svg>
            }
          />
          <HelpCard
            tone="aiTools"
            title="Three dates, three colours"
            body="Crimson for shoot, azure for edit, emerald for publish. One video appears up to three times in a month — you can see the path it takes."
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <rect x="4" y="3" width="16" height="18" rx="2" />
                <path d="M8 8h8M8 12h8M8 16h5" />
              </svg>
            }
          />
          <HelpCard
            tone="academy"
            title="Ship, then review"
            body="Once a video goes Live, it auto-routes into Audit. Your Scores update on the next Monday, and your Learning Path adjusts."
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <circle cx="12" cy="12" r="9" />
                <path d="M8 12l3 3 5-6" />
              </svg>
            }
          />
        </div>
      </section>

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

function HelpCard({
  tone, title, body, icon,
}: {
  tone: "azure" | "academy" | "aiTools";
  title: string;
  body: string;
  icon: React.ReactNode;
}) {
  const TONE: Record<typeof tone, { bg: string; fg: string }> = {
    azure:   { bg: "var(--abv-azure-tint)",    fg: "var(--abv-azure)" },
    academy: { bg: "var(--abv-academy-tint)",  fg: "var(--abv-academy)" },
    aiTools: { bg: "var(--abv-ai-tools-tint)", fg: "var(--abv-ai-tools)" },
  };
  const t = TONE[tone];
  return (
    <div
      className="flex gap-3.5 items-start p-4"
      style={{ background: "var(--abv-bg-warm)", borderRadius: "10px" }}
    >
      <span
        className="w-10 h-10 shrink-0 inline-flex items-center justify-center"
        style={{ background: t.bg, color: t.fg, borderRadius: "10px" }}
      >
        {icon}
      </span>
      <div>
        <div className="font-display font-extrabold tracking-[-0.015em] leading-[1.25] text-[14px] text-[var(--abv-text)]">{title}</div>
        <p className="text-[12.5px] text-[var(--abv-text-muted)] mt-1 leading-[1.5]">{body}</p>
      </div>
    </div>
  );
}

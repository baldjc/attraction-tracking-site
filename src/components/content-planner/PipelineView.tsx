"use client";

import { useState, useEffect, useMemo } from "react";
import { FolderIcon } from "@heroicons/react/24/outline";
import { type ContentPlan } from "./ContentPlanEditModal";
import { useRouter } from "next/navigation";
import ProgressTrack from "./ProgressTrack";
import { resolveProgressSteps, type PlanArtifactsByType } from "@/lib/plan-state";
import { STATUS_STYLES, filterPlans, getStatusOptions, sortPlansByDate, type PlanSortKey } from "@/lib/content-plan-utils";
import { getScoreBadgeClasses } from "@/lib/score-badge";
import { PipelineCard, type PipelineStatusKey } from "@/components/cards";

/** Heuristic mapping from the free-text tier-specific status labels (which
 *  vary by service tier — see getStatusOptions) onto the mockup's three
 *  canonical pipeline status keys. Anything not matched falls through to
 *  the neutral pill so the card still renders. */
function statusTextToKey(status: string): PipelineStatusKey | null {
  const s = status.toLowerCase();
  if (s.includes("shoot") && !s.includes("ready")) return "shooting";
  if (s.includes("ready") || s.includes("planned") || s.includes("script")) {
    return "ready";
  }
  if (s.includes("edit") || s.includes("publish") || s.includes("done") || s.includes("live")) {
    return "edited";
  }
  return null;
}

// Backwards-compatible alias — callers (ContentPlannerClient) imported this
// name before sort logic was lifted to a shared util.
export type PipelineSortKey = PlanSortKey;

interface Props {
  apiBase: string;
  serviceTier: string;
  isAdmin?: boolean;
  searchQuery?: string;
  statusFilter?: string[];
  sortBy?: PipelineSortKey;
  /** v2 Script Builder flag — forwarded into the inline edit modal so the
   *  "Build Script (v2)" entry button shows on qualifying plans. */
  scriptBuilderV2Enabled?: boolean;
}

function formatShortDate(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Sprint 7 — kanban view for plans. Columns come from the member's tier
 * status options so every column represents a valid drop target for the PUT
 * handler. Drag-and-drop uses native HTML5 events (no new deps). Optimistic
 * UI reverts the card on API error.
 */

function truncate(str: string | null | undefined, n: number): string {
  if (!str) return "";
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

export default function PipelineView({
  apiBase,
  serviceTier,
  isAdmin = false,
  searchQuery = "",
  statusFilter = [],
  sortBy = "default",
  scriptBuilderV2Enabled = false,
}: Props) {
  const pipelineStatuses = useMemo(() => getStatusOptions(serviceTier), [serviceTier]);
  const [plans, setPlans] = useState<ContentPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const openPlan = (plan: ContentPlan) => router.push(`/member/content-planner/${plan.id}`);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [artifactsByPlan, setArtifactsByPlan] = useState<Record<string, PlanArtifactsByType>>({});
  const [toast, setToast] = useState<string | null>(null);

  async function fetchPlans() {
    try {
      setLoading(true);
      const r = await fetch(apiBase);
      const d = await r.json();
      setPlans(d?.plans ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchPlans(); }, [apiBase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (plans.length === 0) { setArtifactsByPlan({}); return; }
    const ids = plans.map((p) => p.id).join(",");
    fetch(`/api/member/content-plans/artifacts?planIds=${ids}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.artifactsByPlan) setArtifactsByPlan(d.artifactsByPlan); })
      .catch(() => {});
  }, [plans]);

  const visiblePlans = useMemo(
    () => filterPlans(plans, searchQuery, statusFilter),
    [plans, searchQuery, statusFilter]
  );

  const plansByStatus = useMemo(() => {
    const map: Record<string, ContentPlan[]> = {};
    for (const s of pipelineStatuses) map[s] = [];
    for (const p of visiblePlans) {
      if (!map[p.status]) map[p.status] = [];
      map[p.status].push(p);
    }
    // Apply the chosen sort within every column.
    for (const s of Object.keys(map)) map[s] = sortPlansByDate(map[s], sortBy);
    return map;
  }, [visiblePlans, pipelineStatuses, sortBy]);

  async function moveTo(planId: string, newStatus: string) {
    const prev = plans.find((p) => p.id === planId);
    if (!prev || prev.status === newStatus) return;

    // Optimistic update
    setPlans((list) => list.map((p) => (p.id === planId ? { ...p, status: newStatus } : p)));

    try {
      const res = await fetch(`${apiBase}/${planId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Status update failed");
      const data = await res.json();
      if (data?.plan) {
        setPlans((list) => list.map((p) => (p.id === planId ? { ...p, ...data.plan } : p)));
      }
    } catch (err) {
      // Revert
      setPlans((list) => list.map((p) => (p.id === planId ? prev : p)));
      setToast("Could not update status — please try again.");
      setTimeout(() => setToast(null), 3000);
      console.error("[PipelineView] status update failed:", err);
    }
  }

  function Card({ plan }: { plan: ContentPlan }) {
    const publishDate = formatShortDate(plan.publishDate);
    const shootDate = formatShortDate(plan.shootDate);
    const artifacts = artifactsByPlan[plan.id] ?? {};
    const steps = resolveProgressSteps(
      { id: plan.id, status: plan.status, script: plan.script },
      artifacts,
      () => openPlan(plan)
    );
    const review = artifacts?.script_review?.[0];
    const score = (review?.metadata as { score?: number } | undefined)?.score;

    // Compact meta line — shoot date wins when both present (kanban is
    // shoot-day-driven), otherwise publish. Keeps the mockup's single-
    // line foot without dropping either bit of data.
    const metaLine = shootDate
      ? `Film ${shootDate}`
      : publishDate
        ? `Publish ${publishDate}`
        : null;

    return (
      <PipelineCard
        title={truncate(plan.title, 60)}
        titleAttr={plan.title}
        status={plan.status}
        statusKey={statusTextToKey(plan.status)}
        theme={plan.theme ?? null}
        themeKey={null}
        metaLine={metaLine}
        dragging={dragId === plan.id}
        draggable
        onDragStart={(e) => {
          setDragId(plan.id);
          e.dataTransfer.setData("text/plain", plan.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => {
          setDragId(null);
          setDragOverCol(null);
        }}
        onClick={() => openPlan(plan)}
        topRightExtras={
          <>
            {typeof score === "number" && (
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${getScoreBadgeClasses(score)}`}
              >
                {score}
              </span>
            )}
            {plan.driveFolderLink && (
              <a
                href={plan.driveFolderLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[var(--abv-azure)] hover:text-[#5a8fb0] transition-colors"
                title="Open Google Drive folder"
              >
                <FolderIcon className="w-3.5 h-3.5" />
              </a>
            )}
          </>
        }
        body={<ProgressTrack steps={steps} compact />}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-4">
        {pipelineStatuses.map((s) => (
          <div key={s} className="w-64 shrink-0 h-80 bg-white rounded-xl border border-gray-200 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return <div className="bg-white rounded-xl border border-red-200 p-6 text-sm text-red-700">{error}</div>;
  }

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-4 items-start snap-x">
        {pipelineStatuses.map((status) => {
          const colPlans = plansByStatus[status] ?? [];
          const style = STATUS_STYLES[status] ?? { bg: "#f3f4f6", text: "#6b7280" };
          const isOver = dragOverCol === status;
          return (
            <div
              key={status}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOverCol !== status) setDragOverCol(status);
              }}
              onDragLeave={() => { if (dragOverCol === status) setDragOverCol(null); }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain") || dragId;
                setDragOverCol(null);
                if (id) void moveTo(id, status);
              }}
              className={`w-72 shrink-0 snap-start bg-white border rounded-xl overflow-hidden transition-colors ${
                isOver ? "border-[var(--abv-azure)] ring-2 ring-[var(--abv-azure)]/30" : "border-gray-200"
              }`}
            >
              <div className="h-1" style={{ backgroundColor: style.bg }} />
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100">
                <span
                  className="inline-block text-xs font-semibold px-2 py-0.5 rounded"
                  style={{ backgroundColor: style.bg, color: style.text }}
                >
                  {status}
                </span>
                <span className="text-xs font-medium bg-[#E3E2E0] text-[#3F3D38] px-1.5 py-0.5 rounded">
                  {colPlans.length}
                </span>
              </div>
              <div className="p-2 space-y-2 min-h-[200px] max-h-[70vh] overflow-y-auto">
                {colPlans.length === 0 ? (
                  <p className="text-[11px] text-[var(--abv-text)]/30 italic text-center py-4">Drop here</p>
                ) : (
                  colPlans.map((plan) => <Card key={plan.id} plan={plan} />)
                )}
              </div>
            </div>
          );
        })}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm z-50">
          {toast}
        </div>
      )}

    </>
  );
}

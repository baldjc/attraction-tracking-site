"use client";

import { useState, useEffect, useMemo } from "react";
import { VideoCameraIcon, CalendarDaysIcon, FolderIcon } from "@heroicons/react/24/outline";
import DramaMagnet from "@/components/icons/DramaMagnet";
import ContentPlanEditModal, { type ContentPlan } from "./ContentPlanEditModal";
import ProgressTrack from "./ProgressTrack";
import { resolveProgressSteps, type PlanArtifactsByType } from "@/lib/plan-state";
import { STATUS_STYLES, filterPlans, getStatusOptions, sortPlansByDate, type PlanSortKey } from "@/lib/content-plan-utils";
import { getScoreBadgeClasses } from "@/lib/score-badge";

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
  const [editingPlan, setEditingPlan] = useState<ContentPlan | null>(null);
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
      () => setEditingPlan(plan)
    );
    const review = artifacts?.script_review?.[0];
    const score = (review?.metadata as { score?: number } | undefined)?.score;

    return (
      <div
        draggable
        onDragStart={(e) => {
          setDragId(plan.id);
          e.dataTransfer.setData("text/plain", plan.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => { setDragId(null); setDragOverCol(null); }}
        onClick={() => setEditingPlan(plan)}
        className={`bg-white border border-gray-200 rounded-lg p-3 cursor-pointer transition-shadow hover:border-[#6ba3c7] hover:shadow-sm ${
          dragId === plan.id ? "opacity-40" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="text-xs font-medium text-[#2f3437] leading-snug flex-1" title={plan.title}>
            {truncate(plan.title, 60)}
          </p>
          {typeof score === "number" && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${getScoreBadgeClasses(score)}`}>
              {score}
            </span>
          )}
          {plan.driveFolderLink && (
            <a
              href={plan.driveFolderLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-[#6ba3c7] hover:text-[#5a8fb0] transition-colors shrink-0 mt-0.5"
              title="Open Google Drive folder"
            >
              <FolderIcon className="w-3.5 h-3.5" />
            </a>
          )}
          {plan.dramaMode && (
            <span
              className="text-orange-600 shrink-0 mt-0.5"
              title="Drama Mode — monthly wide-net video"
            >
              <DramaMagnet size={14} />
            </span>
          )}
        </div>
        <div className="mb-2">
          <ProgressTrack steps={steps} compact />
        </div>
        <div className="flex items-center justify-between gap-2 text-[10px]">
          {plan.theme ? (
            <span className="px-1.5 py-0.5 bg-[#E3E2E0] text-[#3F3D38] rounded truncate max-w-[55%]" title={plan.theme}>
              {plan.theme}
            </span>
          ) : <span />}
          <div className="flex items-center gap-2 text-[#2f3437]/50 shrink-0">
            {shootDate && (
              <span className="inline-flex items-center gap-0.5" title={`Shoot date: ${shootDate}`}>
                <VideoCameraIcon className="w-3 h-3" />
                {shootDate}
              </span>
            )}
            {publishDate && (
              <span className="inline-flex items-center gap-0.5" title={`Publish date: ${publishDate}`}>
                <CalendarDaysIcon className="w-3 h-3" />
                {publishDate}
              </span>
            )}
          </div>
        </div>
      </div>
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
                isOver ? "border-[#6ba3c7] ring-2 ring-[#6ba3c7]/30" : "border-gray-200"
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
                  <p className="text-[11px] text-[#2f3437]/30 italic text-center py-4">Drop here</p>
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

      {editingPlan && (
        <ContentPlanEditModal
          plan={editingPlan}
          serviceTier={serviceTier}
          apiBase={apiBase}
          isAdmin={isAdmin}
          scriptBuilderV2Enabled={scriptBuilderV2Enabled}
          onClose={() => setEditingPlan(null)}
          onSaved={(updated) => {
            setPlans((list) => list.map((p) => (p.id === updated.id ? updated : p)));
            setEditingPlan(null);
          }}
          onDeleted={(id) => {
            setPlans((list) => list.filter((p) => p.id !== id));
            setEditingPlan(null);
          }}
        />
      )}
    </>
  );
}

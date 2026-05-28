"use client";

import { useState, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ArrowTopRightOnSquareIcon, FolderIcon, PlusIcon, XMarkIcon, VideoCameraIcon, CalendarDaysIcon } from "@heroicons/react/24/outline";
import { STATUS_STYLES, getStatusOptions, PRIORITY_OPTIONS, hasEditDueDate, filterPlans, sortPlansByDate, type PlanSortKey } from "@/lib/content-plan-utils";
import { resolveProgressSteps, type PlanArtifactsByType } from "@/lib/plan-state";
import ProgressTrack from "./ProgressTrack";
import { type ContentPlan } from "./ContentPlanEditModal";
import { useRouter } from "next/navigation";

interface Props {
  apiBase: string;
  serviceTier: string;
  isAdmin?: boolean;
  searchQuery?: string;
  statusFilter?: string[];
  sortBy?: PlanSortKey;
  /** v2 Script Builder flag — forwarded into the inline edit modal so the
   *  "Build Script (v2)" entry button shows on qualifying plans. Defaulting
   *  to false silently hides the button, which is what masked the Wave 3
   *  surface until ContentPlannerClient was updated to thread it through. */
  scriptBuilderV2Enabled?: boolean;
}

function formatShortDate(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
}

const COLUMN_COLOURS = [
  "#f57cb5", "#b57cfc", "#f5a55b", "#5bf57c", "#5b9bf5",
  "#f57cb5", "#b57cfc", "#f5a55b", "#5bf57c", "#5b9bf5",
];

interface ThemeObj {
  name: string;
  emoji?: string | null;
  colour?: string | null;
}

function DraggableCard({
  plan,
  artifacts,
  onEdit,
}: {
  plan: ContentPlan;
  artifacts: PlanArtifactsByType;
  onEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: plan.id });
  const style = { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : 1 };
  const s = STATUS_STYLES[plan.status] ?? { bg: "#f3f4f6", text: "#6b7280" };

  const publishDate = formatShortDate(plan.publishDate);
  const shootDate = formatShortDate(plan.shootDate);
  const steps = resolveProgressSteps(
    { id: plan.id, status: plan.status, script: plan.script },
    artifacts,
    onEdit
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      onClick={onEdit}
      className={`bg-white border border-gray-200 rounded-lg p-3 cursor-pointer transition-shadow ${isDragging ? "outline-dashed outline-2 outline-purple-300 opacity-40" : "hover:border-[var(--abv-azure)] hover:shadow-sm"}`}
    >
      {plan.thumbnailFileId && (
        <div {...listeners} className="-mx-3 -mt-3 mb-2 cursor-grab active:cursor-grabbing">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/member/content-plans/${plan.id}/thumbnail?v=${encodeURIComponent(plan.updatedAt ?? plan.thumbnailFileId ?? "")}`}
            alt=""
            loading="lazy"
            className="w-full aspect-video object-cover rounded-t-lg bg-gray-100"
          />
        </div>
      )}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div {...listeners} className="flex-1 min-w-0 cursor-grab active:cursor-grabbing">
          <p className="text-xs font-medium text-[var(--abv-text)] leading-snug">{plan.title}</p>
        </div>
        {plan.driveFolderLink && (
          <a
            href={plan.driveFolderLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-[var(--abv-azure)] hover:text-[#5a8fb0] transition-colors shrink-0 mt-0.5"
            title="Open Google Drive folder"
          >
            <FolderIcon className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
      <div className="mb-2">
        <ProgressTrack steps={steps} compact />
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span
          className="inline-block text-xs font-medium px-2 py-0.5 rounded"
          style={{ backgroundColor: s.bg, color: s.text }}
        >
          {plan.status}
        </span>
        {shootDate && (
          <span className="inline-flex items-center gap-0.5 text-xs text-[var(--abv-text)]/50" title={`Shoot date: ${shootDate}`}>
            <VideoCameraIcon className="w-3 h-3" />
            {shootDate}
          </span>
        )}
        {publishDate && (
          <span className="inline-flex items-center gap-0.5 text-xs text-[var(--abv-text)]/50" title={`Publish date: ${publishDate}`}>
            <CalendarDaysIcon className="w-3 h-3" />
            {publishDate}
          </span>
        )}
      </div>
    </div>
  );
}

function DroppableColumn({ id, children, isOver }: { id: string; children: React.ReactNode; isOver: boolean }) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[200px] space-y-2 rounded-md p-1 transition-colors ${isOver ? "bg-purple-50 outline-dashed outline-2 outline-purple-200" : ""}`}
    >
      {children}
    </div>
  );
}

export default function BoardView({ apiBase, serviceTier, isAdmin, searchQuery = "", statusFilter = [], sortBy = "default", scriptBuilderV2Enabled = false }: Props) {
  const [plans,   setPlans]   = useState<ContentPlan[]>([]);
  const [themes,  setThemes]  = useState<ThemeObj[]>([]);
  const [artifactsByPlan, setArtifactsByPlan] = useState<Record<string, PlanArtifactsByType>>({});
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const openPlan = (plan: ContentPlan) => router.push(`/member/content-planner/${plan.id}`);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [overId,       setOverId]       = useState<string | null>(null);
  const [errorMsg,     setErrorMsg]     = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState<Record<string, string>>({});
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const allStatusOptions = getStatusOptions(serviceTier);
  const showEditDue = isAdmin || hasEditDueDate(serviceTier);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  useEffect(() => {
    Promise.all([
      fetch(apiBase).then((r) => r.json()),
      fetch(`${apiBase}/themes`).then((r) => r.json()).catch(() => ({ themes: [] })),
    ]).then(([planData, themeData]) => {
      setPlans(planData.plans ?? []);
      setThemes(themeData.themes ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [apiBase]);

  // Match PipelineView: load artifacts for the same set of plans so the
  // ProgressTrack dots can render on each card.
  useEffect(() => {
    if (plans.length === 0) { setArtifactsByPlan({}); return; }
    const ids = plans.map((p) => p.id).join(",");
    fetch(`/api/member/content-plans/artifacts?planIds=${ids}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.artifactsByPlan) setArtifactsByPlan(d.artifactsByPlan); })
      .catch(() => {});
  }, [plans]);

  function handleDragStart(e: DragStartEvent) {
    setActiveDragId(String(e.active.id));
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveDragId(null);
    setOverId(null);
    const { active, over } = e;
    if (!over) return;
    const planId   = String(active.id);
    const newTheme = String(over.id) === "__unassigned__" ? null : String(over.id);
    const plan     = plans.find((p) => p.id === planId);
    if (!plan) return;
    if (plan.theme === newTheme) return;

    const oldTheme = plan.theme;
    setPlans((prev) => prev.map((p) => p.id === planId ? { ...p, theme: newTheme } : p));
    setErrorMsg("");

    try {
      const res = await fetch(`${apiBase}/${planId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: newTheme }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setPlans((prev) => prev.map((p) => p.id === planId ? data.plan : p));
    } catch {
      setPlans((prev) => prev.map((p) => p.id === planId ? { ...p, theme: oldTheme } : p));
      setErrorMsg("Failed to move card. Please try again.");
    }
  }

  function handlePlanSaved(updated: ContentPlan) {
    // Wave 4 auto-save: keep the modal open — saves now fire continuously
    // on every edit, so closing here would slam the modal shut after the
    // first keystroke. Close is owned exclusively by `onClose`.
    setPlans((prev) => prev.map((p) => p.id === updated.id ? updated : p));
  }

  function handlePlanDeleted(id: string) {
    setPlans((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleAddSubmit() {
    if (!addForm.title?.trim()) { setAddError("Title is required"); return; }
    setAddLoading(true);
    setAddError(null);
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: addForm.title,
          status: addForm.status || allStatusOptions[0],
          theme: addForm.theme || null,
          shootDate: addForm.shootDate || null,
          publishDate: addForm.publishDate || null,
          editDueDate: addForm.editDueDate || null,
          priority: addForm.priority || null,
          notes: addForm.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add");
      setPlans((prev) => [data.plan, ...prev]);
      setShowAddModal(false);
      setAddForm({});
    } catch (e: any) {
      setAddError(e.message);
    } finally {
      setAddLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="w-64 shrink-0 h-80 bg-white rounded-xl border border-gray-200 animate-pulse" />
        ))}
      </div>
    );
  }

  const hasNoThemes = themes.length === 0;
  const visiblePlans = sortPlansByDate(filterPlans(plans, searchQuery, statusFilter), sortBy);
  const unassigned  = visiblePlans.filter((p) => !p.theme || !themes.some((t) => t.name === p.theme));
  const activePlan  = plans.find((p) => p.id === activeDragId);

  const columns: { id: string; label: string; colour: string }[] = themes.map((t, i) => ({
    id: t.name,
    label: t.emoji ? `${t.emoji} ${t.name}` : t.name,
    colour: t.colour ?? COLUMN_COLOURS[i % COLUMN_COLOURS.length],
  }));
  if (unassigned.length > 0) {
    columns.push({ id: "__unassigned__", label: "Unassigned", colour: "#d1d5db" });
  }

  if (hasNoThemes && plans.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-sm text-[var(--abv-text)]/40">
        Set up your avatar in the Avatar Architect to see your content themes here. For now, you can assign themes manually in the Table view.
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        {errorMsg ? <p className="text-xs text-red-500">{errorMsg}</p> : <div />}
        <button
          onClick={() => { setAddForm({ status: allStatusOptions[0] }); setAddError(null); setShowAddModal(true); }}
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 bg-[var(--abv-dark)] hover:bg-[#5a92b6] text-white rounded-lg transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          Add Video
        </button>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={(e) => setOverId(e.over ? String(e.over.id) : null)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => { setActiveDragId(null); setOverId(null); }}
      >
        {/* Desktop: horizontal scroll */}
        <div className="hidden md:flex gap-4 overflow-x-auto pb-4 items-start">
          {columns.map((col) => {
            const colPlans = col.id === "__unassigned__"
              ? unassigned
              : visiblePlans.filter((p) => p.theme === col.id);
            return (
              <div key={col.id} className="w-64 shrink-0 bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="h-1" style={{ backgroundColor: col.colour }} />
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100">
                  <span className="text-xs font-semibold text-[var(--abv-text)] truncate">{col.label}</span>
                  <span className="text-xs font-medium bg-[#E3E2E0] text-[#3F3D38] px-1.5 py-0.5 rounded shrink-0 ml-1">
                    {colPlans.length}
                  </span>
                </div>
                <div className="p-2">
                  <DroppableColumn id={col.id} isOver={overId === col.id}>
                    {colPlans.map((plan) => (
                      <DraggableCard
                        key={plan.id}
                        plan={plan}
                        artifacts={artifactsByPlan[plan.id] ?? {}}
                        onEdit={() => openPlan(plan)}
                      />
                    ))}
                  </DroppableColumn>
                </div>
              </div>
            );
          })}
        </div>

        {/* Mobile: stacked columns */}
        <div className="md:hidden space-y-4">
          {columns.map((col) => {
            const colPlans = col.id === "__unassigned__"
              ? unassigned
              : visiblePlans.filter((p) => p.theme === col.id);
            return (
              <div key={col.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="h-1" style={{ backgroundColor: col.colour }} />
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100">
                  <span className="text-xs font-semibold text-[var(--abv-text)]">{col.label}</span>
                  <span className="text-xs font-medium bg-[#E3E2E0] text-[#3F3D38] px-1.5 py-0.5 rounded">
                    {colPlans.length}
                  </span>
                </div>
                <div className="p-2 space-y-2">
                  {colPlans.length === 0 ? (
                    <p className="text-xs text-[var(--abv-text)]/30 text-center py-4">No videos</p>
                  ) : colPlans.map((plan) => {
                    const s = STATUS_STYLES[plan.status] ?? { bg: "#f3f4f6", text: "#6b7280" };
                    const publishDate = formatShortDate(plan.publishDate);
                    const shootDate = formatShortDate(plan.shootDate);
                    return (
                      <div
                        key={plan.id}
                        onClick={() => openPlan(plan)}
                        className="bg-white border border-gray-200 rounded-lg p-3 cursor-pointer hover:border-[var(--abv-azure)] hover:shadow-sm transition-colors"
                      >
                        {plan.thumbnailFileId && (
                          <div className="-mx-3 -mt-3 mb-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`/api/member/content-plans/${plan.id}/thumbnail?v=${encodeURIComponent(plan.updatedAt ?? plan.thumbnailFileId ?? "")}`}
                              alt=""
                              loading="lazy"
                              className="w-full aspect-video object-cover rounded-t-lg bg-gray-100"
                            />
                          </div>
                        )}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="text-xs font-medium text-[var(--abv-text)] leading-snug flex-1 min-w-0">{plan.title}</p>
                          {plan.driveFolderLink && (
                            <a
                              href={plan.driveFolderLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-[var(--abv-azure)] hover:text-[#5a8fb0] shrink-0 mt-0.5"
                              title="Open Google Drive folder"
                            >
                              <FolderIcon className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="inline-block text-xs font-medium px-2 py-0.5 rounded" style={{ backgroundColor: s.bg, color: s.text }}>
                            {plan.status}
                          </span>
                          {shootDate && (
                            <span className="inline-flex items-center gap-0.5 text-xs text-[var(--abv-text)]/50" title={`Shoot date: ${shootDate}`}>
                              <VideoCameraIcon className="w-3 h-3" />
                              {shootDate}
                            </span>
                          )}
                          {publishDate && (
                            <span className="inline-flex items-center gap-0.5 text-xs text-[var(--abv-text)]/50" title={`Publish date: ${publishDate}`}>
                              <CalendarDaysIcon className="w-3 h-3" />
                              {publishDate}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <DragOverlay>
          {activePlan && (
            <div
              className="w-60 bg-white border border-purple-300 rounded-lg p-3 shadow-lg opacity-90 cursor-grabbing"
            >
              <p className="text-xs font-medium text-[var(--abv-text)] leading-snug">{activePlan.title}</p>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-base font-semibold text-[var(--abv-text)]">Add Video</h2>
              <button onClick={() => setShowAddModal(false)} className="text-[var(--abv-text)]/40 hover:text-[var(--abv-text)]">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--abv-text)]/60 mb-1">Title <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={addForm.title ?? ""}
                  onChange={(e) => setAddForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Video title..."
                  className="w-full border border-gray-200 text-[var(--abv-text)] text-sm rounded-lg px-3 py-2 focus:border-[var(--abv-azure)] focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--abv-text)]/60 mb-1">Status</label>
                  <select
                    value={addForm.status ?? allStatusOptions[0]}
                    onChange={(e) => setAddForm((f) => ({ ...f, status: e.target.value }))}
                    className="w-full border border-gray-200 text-[var(--abv-text)] text-sm rounded-lg px-3 py-2 focus:border-[var(--abv-azure)] focus:outline-none"
                  >
                    {allStatusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--abv-text)]/60 mb-1">Priority</label>
                  <select
                    value={addForm.priority ?? ""}
                    onChange={(e) => setAddForm((f) => ({ ...f, priority: e.target.value }))}
                    className="w-full border border-gray-200 text-[var(--abv-text)] text-sm rounded-lg px-3 py-2 focus:border-[var(--abv-azure)] focus:outline-none"
                  >
                    <option value="">None</option>
                    {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--abv-text)]/60 mb-1">Theme</label>
                <select
                  value={addForm.theme ?? ""}
                  onChange={(e) => setAddForm((f) => ({ ...f, theme: e.target.value }))}
                  className="w-full border border-gray-200 text-[var(--abv-text)] text-sm rounded-lg px-3 py-2 focus:border-[var(--abv-azure)] focus:outline-none"
                >
                  <option value="">Select theme...</option>
                  {themes.map((t) => <option key={t.name} value={t.name}>{t.emoji ? `${t.emoji} ${t.name}` : t.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--abv-text)]/60 mb-1">Shoot Date</label>
                  <input type="date" value={addForm.shootDate ?? ""} onChange={(e) => setAddForm((f) => ({ ...f, shootDate: e.target.value }))} className="w-full border border-gray-200 text-[var(--abv-text)] text-sm rounded-lg px-3 py-2 focus:border-[var(--abv-azure)] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--abv-text)]/60 mb-1">Publish Date</label>
                  <input type="date" value={addForm.publishDate ?? ""} onChange={(e) => setAddForm((f) => ({ ...f, publishDate: e.target.value }))} className="w-full border border-gray-200 text-[var(--abv-text)] text-sm rounded-lg px-3 py-2 focus:border-[var(--abv-azure)] focus:outline-none" />
                </div>
              </div>
              {showEditDue && (
                <div>
                  <label className="block text-xs font-medium text-[var(--abv-text)]/60 mb-1">Edit Due Date</label>
                  <input type="date" value={addForm.editDueDate ?? ""} onChange={(e) => setAddForm((f) => ({ ...f, editDueDate: e.target.value }))} className="w-full border border-gray-200 text-[var(--abv-text)] text-sm rounded-lg px-3 py-2 focus:border-[var(--abv-azure)] focus:outline-none" />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-[var(--abv-text)]/60 mb-1">Talking Points / Notes</label>
                <textarea value={addForm.notes ?? ""} onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))} placeholder="One talking point per line…" rows={3} className="w-full border border-gray-200 text-[var(--abv-text)] text-sm rounded-lg px-3 py-2 focus:border-[var(--abv-azure)] focus:outline-none resize-none" />
              </div>
              {addError && <p className="text-red-500 text-xs">{addError}</p>}
            </div>
            <div className="flex gap-3 p-5 pt-0">
              <button onClick={() => setShowAddModal(false)} className="flex-1 text-sm text-[var(--abv-text)]/60 border border-gray-200 hover:bg-gray-50 px-4 py-2.5 rounded-lg transition-colors">
                Cancel
              </button>
              <button onClick={handleAddSubmit} disabled={addLoading} className="flex-1 text-sm font-medium bg-[var(--abv-dark)] hover:bg-[#5a92b6] text-white px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50">
                {addLoading ? "Adding…" : "Add Video"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

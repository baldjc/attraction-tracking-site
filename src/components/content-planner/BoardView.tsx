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
import { ArrowTopRightOnSquareIcon, FolderIcon } from "@heroicons/react/24/outline";
import { STATUS_STYLES } from "@/lib/content-plan-utils";
import ContentPlanEditModal, { type ContentPlan } from "./ContentPlanEditModal";

interface Props {
  apiBase: string;
  serviceTier: string;
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
  onEdit,
}: {
  plan: ContentPlan;
  onEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: plan.id });
  const style = { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : 1 };
  const s = STATUS_STYLES[plan.status] ?? { bg: "#f3f4f6", text: "#6b7280" };

  const publishDate = plan.publishDate
    ? new Date(plan.publishDate).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" })
    : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={`bg-white border border-gray-200 rounded-lg p-3 cursor-grab active:cursor-grabbing transition-shadow ${isDragging ? "outline-dashed outline-2 outline-purple-300" : "hover:border-purple-300 hover:shadow-sm"}`}
    >
      <div {...listeners} className="mb-2">
        <p className="text-xs font-medium text-[#2f3437] leading-snug">{plan.title}</p>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="inline-block text-xs font-medium px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: s.bg, color: s.text }}
          >
            {plan.status}
          </span>
          {publishDate && <span className="text-xs text-[#2f3437]/40">{publishDate}</span>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {plan.driveFolderLink && (
            <a
              href={plan.driveFolderLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-[#6ba3c7] hover:text-[#5a8fb0] transition-colors"
              title="Open folder"
            >
              <FolderIcon className="w-3.5 h-3.5" />
            </a>
          )}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onEdit}
            className="text-xs text-[#2f3437]/30 hover:text-[#6ba3c7] transition-colors leading-none"
            title="Edit"
          >
            ···
          </button>
        </div>
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

export default function BoardView({ apiBase, serviceTier }: Props) {
  const [plans,   setPlans]   = useState<ContentPlan[]>([]);
  const [themes,  setThemes]  = useState<ThemeObj[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPlan,  setEditingPlan]  = useState<ContentPlan | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [overId,       setOverId]       = useState<string | null>(null);
  const [errorMsg,     setErrorMsg]     = useState("");

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
    setPlans((prev) => prev.map((p) => p.id === updated.id ? updated : p));
    setEditingPlan(null);
  }

  function handlePlanDeleted(id: string) {
    setPlans((prev) => prev.filter((p) => p.id !== id));
    setEditingPlan(null);
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
  const unassigned  = plans.filter((p) => !p.theme || !themes.some((t) => t.name === p.theme));
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
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-sm text-[#2f3437]/40">
        Set up your avatar in the Avatar Architect to see your content themes here. For now, you can assign themes manually in the Table view.
      </div>
    );
  }

  return (
    <>
      {errorMsg && <p className="text-xs text-red-500 mb-3">{errorMsg}</p>}

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
              : plans.filter((p) => p.theme === col.id);
            return (
              <div key={col.id} className="w-64 shrink-0 bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="h-1" style={{ backgroundColor: col.colour }} />
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100">
                  <span className="text-xs font-semibold text-[#2f3437] truncate">{col.label}</span>
                  <span className="text-xs font-medium bg-gray-100 text-[#2f3437]/60 px-1.5 py-0.5 rounded-full shrink-0 ml-1">
                    {colPlans.length}
                  </span>
                </div>
                <div className="p-2">
                  <DroppableColumn id={col.id} isOver={overId === col.id}>
                    {colPlans.map((plan) => (
                      <DraggableCard
                        key={plan.id}
                        plan={plan}
                        onEdit={() => setEditingPlan(plan)}
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
              : plans.filter((p) => p.theme === col.id);
            return (
              <div key={col.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="h-1" style={{ backgroundColor: col.colour }} />
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100">
                  <span className="text-xs font-semibold text-[#2f3437]">{col.label}</span>
                  <span className="text-xs font-medium bg-gray-100 text-[#2f3437]/60 px-1.5 py-0.5 rounded-full">
                    {colPlans.length}
                  </span>
                </div>
                <div className="p-2 space-y-2">
                  {colPlans.length === 0 ? (
                    <p className="text-xs text-[#2f3437]/30 text-center py-4">No videos</p>
                  ) : colPlans.map((plan) => {
                    const s = STATUS_STYLES[plan.status] ?? { bg: "#f3f4f6", text: "#6b7280" };
                    const publishDate = plan.publishDate
                      ? new Date(plan.publishDate).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" })
                      : null;
                    return (
                      <div
                        key={plan.id}
                        onClick={() => setEditingPlan(plan)}
                        className="bg-white border border-gray-200 rounded-lg p-3 cursor-pointer hover:border-purple-300 transition-colors"
                      >
                        <p className="text-xs font-medium text-[#2f3437] leading-snug mb-2">{plan.title}</p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="inline-block text-xs font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: s.bg, color: s.text }}>
                            {plan.status}
                          </span>
                          {publishDate && <span className="text-xs text-[#2f3437]/40">{publishDate}</span>}
                          {plan.driveFolderLink && (
                            <a
                              href={plan.driveFolderLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-[#6ba3c7] hover:text-[#5a8fb0]"
                            >
                              <FolderIcon className="w-3.5 h-3.5" />
                            </a>
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
              <p className="text-xs font-medium text-[#2f3437] leading-snug">{activePlan.title}</p>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {editingPlan && (
        <ContentPlanEditModal
          plan={editingPlan}
          serviceTier={serviceTier}
          apiBase={apiBase}
          onClose={() => setEditingPlan(null)}
          onSaved={handlePlanSaved}
          onDeleted={handlePlanDeleted}
        />
      )}
    </>
  );
}

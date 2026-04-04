"use client";

import { useState, useEffect, useCallback } from "react";
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
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { STATUS_STYLES, getStatusOptions, PRIORITY_OPTIONS, hasEditDueDate } from "@/lib/content-plan-utils";
import ContentPlanEditModal, { type ContentPlan } from "./ContentPlanEditModal";

interface ThemeOption {
  name: string;
  emoji?: string | null;
  colour?: string | null;
}

interface Props {
  apiBase: string;
  calendarType: "publish" | "shoot" | "edit_due";
  serviceTier: string;
  isAdmin?: boolean;
  themes?: ThemeOption[];
}

const DATE_FIELD: Record<string, keyof ContentPlan> = {
  publish:   "publishDate",
  shoot:     "shootDate",
  edit_due:  "editDueDate",
};

const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function dayKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function planDateKey(dateStr: string | null) {
  if (!dateStr) return null;
  return new Date(dateStr).toISOString().slice(0, 10);
}

function getMonthGrid(year: number, month: number): (number | null)[][] {
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // Mon = 0
  const days: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(d);
  while (days.length % 7 !== 0) days.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

function StatusPill({ plan, onClick, dragging }: { plan: ContentPlan; onClick?: () => void; dragging?: boolean }) {
  const s = STATUS_STYLES[plan.status] ?? { bg: "#f3f4f6", text: "#6b7280" };
  return (
    <div
      onClick={onClick}
      className={`text-xs font-medium px-1.5 py-0.5 rounded cursor-pointer truncate select-none transition-opacity ${dragging ? "opacity-40 outline-dashed outline-2 outline-purple-400" : "hover:brightness-95"}`}
      style={{ backgroundColor: s.bg, color: s.text }}
      title={plan.title}
    >
      {plan.title}
    </div>
  );
}

function DraggablePill({ plan, onClick }: { plan: ContentPlan; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: plan.id });
  const style = { transform: CSS.Translate.toString(transform) };
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <StatusPill plan={plan} onClick={isDragging ? undefined : onClick} dragging={isDragging} />
    </div>
  );
}

function DroppableDay({ id, children, isOver }: { id: string; children: React.ReactNode; isOver: boolean }) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[80px] rounded-md transition-colors ${isOver ? "bg-purple-50 border border-dashed border-purple-300" : ""}`}
    >
      {children}
    </div>
  );
}

export default function CalendarView({ apiBase, calendarType, serviceTier, isAdmin, themes = [] }: Props) {
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [plans, setPlans] = useState<ContentPlan[]>([]);
  const [localThemes, setLocalThemes] = useState<ThemeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<ContentPlan | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState<Record<string, string>>({});
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const resolvedThemes = themes.length > 0 ? themes : localThemes;
  const allStatusOptions = getStatusOptions(serviceTier);
  const showEditDue = isAdmin || hasEditDueDate(serviceTier);
  const dateField = DATE_FIELD[calendarType];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  useEffect(() => {
    fetch(apiBase)
      .then((r) => r.json())
      .then((d) => setPlans(d.plans ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
    fetch(`${apiBase}/themes`)
      .then((r) => r.json())
      .then((d) => { if (d.themes?.length > 0) setLocalThemes(d.themes); })
      .catch(() => {});
  }, [apiBase]);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }
  function goToday() { setYear(today.getFullYear()); setMonth(today.getMonth()); }

  const plansByDay = plans.reduce<Record<string, ContentPlan[]>>((acc, plan) => {
    const dateVal = plan[dateField] as string | null;
    const key = planDateKey(dateVal);
    if (key) { acc[key] = acc[key] ? [...acc[key], plan] : [plan]; }
    return acc;
  }, {});

  const weeks = getMonthGrid(year, month);

  function handleDragStart(e: DragStartEvent) {
    setActiveDragId(String(e.active.id));
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveDragId(null);
    setOverId(null);
    const { active, over } = e;
    if (!over || !over.id) return;
    const planId  = String(active.id);
    const newDate = String(over.id); // "2026-04-15" format

    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    const oldDate = planDateKey(plan[dateField] as string | null);
    if (oldDate === newDate) return;

    setPlans((prev) =>
      prev.map((p) =>
        p.id === planId ? { ...p, [dateField]: new Date(`${newDate}T12:00:00Z`).toISOString() } : p
      )
    );
    setErrorMsg("");

    try {
      const res = await fetch(`${apiBase}/${planId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [dateField]: newDate }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setPlans((prev) => prev.map((p) => p.id === planId ? data.plan : p));
    } catch {
      setPlans((prev) =>
        prev.map((p) => p.id === planId ? { ...p, [dateField]: oldDate } : p)
      );
      setErrorMsg("Failed to move video. Please try again.");
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
    return <div className="h-96 bg-white rounded-xl border border-gray-200 animate-pulse" />;
  }

  const activePlan = plans.find((p) => p.id === activeDragId);

  const todayKey = dayKey(today.getFullYear(), today.getMonth(), today.getDate());
  const currentMonthKey = (d: number) => dayKey(year, month, d);

  const label = calendarType === "publish" ? "Publish Calendar" : calendarType === "shoot" ? "Shoot Calendar" : "Edit Due Calendar";

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="p-1.5 rounded-md hover:bg-gray-100 transition-colors text-[#2f3437]/60 hover:text-[#2f3437]">
              <ChevronLeftIcon className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-[#2f3437] min-w-[140px] text-center">
              {MONTHS[month]} {year}
            </span>
            <button onClick={nextMonth} className="p-1.5 rounded-md hover:bg-gray-100 transition-colors text-[#2f3437]/60 hover:text-[#2f3437]">
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            {errorMsg && <span className="text-xs text-red-500">{errorMsg}</span>}
            <button
              onClick={() => { setAddForm({ status: allStatusOptions[0] }); setAddError(null); setShowAddModal(true); }}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-[#6ba3c7] hover:bg-[#5a92b6] text-white rounded-lg transition-colors"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              Add Video
            </button>
            <button onClick={goToday} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-[#2f3437]/70 transition-colors">
              Today
            </button>
          </div>
        </div>

        {/* Desktop calendar grid (hidden on mobile) */}
        <div className="hidden sm:block">
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={(e) => setOverId(e.over ? String(e.over.id) : null)} onDragEnd={handleDragEnd} onDragCancel={() => { setActiveDragId(null); setOverId(null); }}>
            <div className="grid grid-cols-7 border-b border-gray-100">
              {WEEK_DAYS.map((d) => (
                <div key={d} className="text-center text-xs font-medium text-[#2f3437]/50 py-2">{d}</div>
              ))}
            </div>
            <div className="divide-y divide-gray-100">
              {weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 divide-x divide-gray-100">
                  {week.map((day, di) => {
                    if (!day) {
                      return <div key={di} className="min-h-[88px] bg-gray-50/50" />;
                    }
                    const key = currentMonthKey(day);
                    const dayPlans = plansByDay[key] ?? [];
                    const isToday = key === todayKey;
                    const isOver = overId === key;
                    return (
                      <DroppableDay key={di} id={key} isOver={isOver}>
                        <div className="p-1">
                          <span className={`inline-flex items-center justify-center w-6 h-6 text-xs mb-1 rounded-full ${isToday ? "bg-[#6ba3c7] text-white font-semibold" : "text-[#2f3437]/60"}`}>
                            {day}
                          </span>
                          <div className="space-y-0.5">
                            {dayPlans.map((plan) => (
                              <DraggablePill
                                key={plan.id}
                                plan={plan}
                                onClick={() => setEditingPlan(plan)}
                              />
                            ))}
                          </div>
                        </div>
                      </DroppableDay>
                    );
                  })}
                </div>
              ))}
            </div>
            <DragOverlay>
              {activePlan && (
                <div className="text-xs font-medium px-1.5 py-0.5 rounded shadow-lg cursor-grabbing opacity-90"
                  style={{
                    backgroundColor: STATUS_STYLES[activePlan.status]?.bg ?? "#f3f4f6",
                    color: STATUS_STYLES[activePlan.status]?.text ?? "#6b7280",
                  }}>
                  {activePlan.title}
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>

        {/* Mobile list view */}
        <div className="sm:hidden divide-y divide-gray-100">
          {(() => {
            const daysWithPlans = Object.entries(plansByDay)
              .filter(([key]) => key.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`))
              .sort(([a], [b]) => a.localeCompare(b));
            if (daysWithPlans.length === 0) {
              return (
                <div className="p-8 text-center text-[#2f3437]/40 text-sm">
                  No {label.toLowerCase()} dates this month.
                </div>
              );
            }
            return daysWithPlans.map(([key, dayPlans]) => {
              const [, , d] = key.split("-");
              const dateLabel = new Date(`${key}T12:00:00Z`).toLocaleDateString("en-CA", {
                weekday: "short", month: "short", day: "numeric",
              });
              return (
                <div key={key} className="px-4 py-3">
                  <p className="text-xs font-semibold text-[#2f3437]/50 mb-2">{dateLabel}</p>
                  <div className="space-y-1">
                    {dayPlans.map((plan) => (
                      <div key={plan.id} onClick={() => setEditingPlan(plan)}>
                        <StatusPill plan={plan} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </div>

      {editingPlan && (
        <ContentPlanEditModal
          plan={editingPlan}
          serviceTier={serviceTier}
          apiBase={apiBase}
          isAdmin={isAdmin}
          themes={resolvedThemes}
          onClose={() => setEditingPlan(null)}
          onSaved={handlePlanSaved}
          onDeleted={handlePlanDeleted}
        />
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-base font-semibold text-[#2f3437]">Add Video</h2>
              <button onClick={() => setShowAddModal(false)} className="text-[#2f3437]/40 hover:text-[#2f3437]">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Title <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={addForm.title ?? ""}
                  onChange={(e) => setAddForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Video title..."
                  className="w-full border border-gray-200 text-[#2f3437] text-sm rounded-lg px-3 py-2 focus:border-[#6ba3c7] focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Status</label>
                  <select
                    value={addForm.status ?? allStatusOptions[0]}
                    onChange={(e) => setAddForm((f) => ({ ...f, status: e.target.value }))}
                    className="w-full border border-gray-200 text-[#2f3437] text-sm rounded-lg px-3 py-2 focus:border-[#6ba3c7] focus:outline-none"
                  >
                    {allStatusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Priority</label>
                  <select
                    value={addForm.priority ?? ""}
                    onChange={(e) => setAddForm((f) => ({ ...f, priority: e.target.value }))}
                    className="w-full border border-gray-200 text-[#2f3437] text-sm rounded-lg px-3 py-2 focus:border-[#6ba3c7] focus:outline-none"
                  >
                    <option value="">None</option>
                    {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Theme</label>
                <select
                  value={addForm.theme ?? ""}
                  onChange={(e) => setAddForm((f) => ({ ...f, theme: e.target.value }))}
                  className="w-full border border-gray-200 text-[#2f3437] text-sm rounded-lg px-3 py-2 focus:border-[#6ba3c7] focus:outline-none"
                >
                  <option value="">Select theme...</option>
                  {resolvedThemes.map((t) => <option key={t.name} value={t.name}>{t.emoji ? `${t.emoji} ${t.name}` : t.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Shoot Date</label>
                  <input type="date" value={addForm.shootDate ?? ""} onChange={(e) => setAddForm((f) => ({ ...f, shootDate: e.target.value }))} className="w-full border border-gray-200 text-[#2f3437] text-sm rounded-lg px-3 py-2 focus:border-[#6ba3c7] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Publish Date</label>
                  <input type="date" value={addForm.publishDate ?? ""} onChange={(e) => setAddForm((f) => ({ ...f, publishDate: e.target.value }))} className="w-full border border-gray-200 text-[#2f3437] text-sm rounded-lg px-3 py-2 focus:border-[#6ba3c7] focus:outline-none" />
                </div>
              </div>
              {showEditDue && (
                <div>
                  <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Edit Due Date</label>
                  <input type="date" value={addForm.editDueDate ?? ""} onChange={(e) => setAddForm((f) => ({ ...f, editDueDate: e.target.value }))} className="w-full border border-gray-200 text-[#2f3437] text-sm rounded-lg px-3 py-2 focus:border-[#6ba3c7] focus:outline-none" />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Talking Points / Notes</label>
                <textarea value={addForm.notes ?? ""} onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))} placeholder="One talking point per line…" rows={3} className="w-full border border-gray-200 text-[#2f3437] text-sm rounded-lg px-3 py-2 focus:border-[#6ba3c7] focus:outline-none resize-none" />
              </div>
              {addError && <p className="text-red-500 text-xs">{addError}</p>}
            </div>
            <div className="flex gap-3 p-5 pt-0">
              <button onClick={() => setShowAddModal(false)} className="flex-1 text-sm text-[#2f3437]/60 border border-gray-200 hover:bg-gray-50 px-4 py-2.5 rounded-lg transition-colors">
                Cancel
              </button>
              <button onClick={handleAddSubmit} disabled={addLoading} className="flex-1 text-sm font-medium bg-[#6ba3c7] hover:bg-[#5a92b6] text-white px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50">
                {addLoading ? "Adding…" : "Add Video"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

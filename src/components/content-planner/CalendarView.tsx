"use client";

import { useState, useEffect, useMemo } from "react";
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
  type DragOverEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";
import { filterPlans } from "@/lib/content-plan-utils";
import { type ContentPlan } from "./ContentPlanEditModal";

interface ThemeOption {
  name: string;
  emoji?: string | null;
  colour?: string | null;
}

interface Props {
  apiBase: string;
  /** Legacy prop — ignored. The reskinned calendar always shows all three
   *  date types (shoot/edit/publish) overlaid on one grid. Kept in the
   *  signature so the parent doesn't need to change its prop list. */
  calendarType?: "publish" | "shoot" | "edit_due";
  serviceTier: string;
  isAdmin?: boolean;
  themes?: ThemeOption[];
  searchQuery?: string;
  statusFilter?: string[];
  scriptBuilderV2Enabled?: boolean;
  /** Bumped by the parent (ContentPlannerClient) whenever quick-add or the
   *  parent-owned edit modal mutates a plan, so the calendar refetches and
   *  the new/updated/deleted pill appears without a page reload. */
  refreshKey?: number;
}

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type EventType = "shoot" | "edit" | "publish";

interface CalendarEvent {
  plan: ContentPlan;
  type: EventType;
}

/** Each event type maps to its underlying ContentPlan date column so the
 *  drop handler knows which field to PUT when a pill is dragged. */
const DATE_FIELD: Record<EventType, "shootDate" | "editDueDate" | "publishDate"> = {
  shoot:   "shootDate",
  edit:    "editDueDate",
  publish: "publishDate",
};

const TYPE_STYLES: Record<EventType, { bg: string; bgHover: string; border: string; dot: string }> = {
  shoot: {
    bg: "var(--abv-leads-tint)",
    bgHover: "rgba(230,57,70,0.16)",
    border: "var(--abv-leads)",
    dot: "var(--abv-leads)",
  },
  edit: {
    bg: "var(--abv-azure-tint)",
    bgHover: "var(--abv-azure-tint-strong)",
    border: "var(--abv-azure)",
    dot: "var(--abv-azure)",
  },
  publish: {
    bg: "var(--abv-academy-tint)",
    bgHover: "rgba(16,185,129,0.16)",
    border: "var(--abv-academy)",
    dot: "var(--abv-academy)",
  },
};

// Theme name → icon path + feature colour. Keys match common ContentPlan.theme
// strings; we also fall back on substring matching below so themes named e.g.
// "Monthly Market Update – April" still pick up the market icon.
const THEME_MAP: Array<{ match: RegExp; icon: string; colour: string }> = [
  { match: /neighbour/i,         icon: "sprout",   colour: "var(--abv-leads)"     },
  { match: /market/i,            icon: "bars",     colour: "var(--abv-azure)"     },
  { match: /listing|teardown/i,  icon: "house",    colour: "var(--abv-academy)"   },
  { match: /contrarian/i,        icon: "arrows",   colour: "var(--abv-hire)"      },
  { match: /how[-\s]?to|buyer/i, icon: "path",     colour: "var(--abv-scores)"    },
  { match: /story/i,             icon: "lines",    colour: "var(--abv-ai-tools)"  },
];

function ThemeIcon({ name }: { name: string | null }) {
  if (!name) return null;
  const match = THEME_MAP.find((m) => m.match.test(name));
  const colour = match?.colour ?? "var(--abv-text-dim)";
  const which  = match?.icon   ?? "lines";
  const path = (() => {
    switch (which) {
      case "sprout":  return <path d="M12 3c-2 4 1 5 1 8a4 4 0 11-8 0c0-2 1-3 2-4 0 2 2 2 2 0 0-3 1-4 3-4z" />;
      case "bars":    return <path d="M3 21h18M5 21V10m4 11V13m4 8V7m4 14v-5m4 5V4" />;
      case "house":   return <path d="M3 11l9-8 9 8v9a2 2 0 01-2 2h-4v-7H10v7H6a2 2 0 01-2-2z" />;
      case "arrows":  return <path d="M3 12h18M3 6l5 6-5 6M21 6l-5 6 5 6" />;
      case "path":    return <path d="M12 22V12m0 0L4 7m8 5l8-5M4 7v10l8 5" />;
      case "lines":
      default:        return <path d="M4 6h16M4 12h16M4 18h10" />;
    }
  })();
  return (
    <span
      className="shrink-0 inline-flex items-center justify-center"
      style={{ width: 11, height: 11, color: colour, opacity: 0.85 }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {path}
      </svg>
    </span>
  );
}

/** Returns 42-cell array (6 weeks × 7 days) starting from the Sunday before
 *  (or equal to) the first of the visible month. Each cell carries a Date and
 *  whether it belongs to the visible month. */
function getSixWeekGrid(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const startDow = firstDay.getDay(); // Sun = 0
  const start = new Date(year, month, 1 - startDow);
  const cells: Array<{ date: Date; inMonth: boolean }> = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({ date: d, inMonth: d.getMonth() === month });
  }
  return cells;
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function planDateKey(value: string | null | undefined) {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
}

export default function CalendarView({
  apiBase,
  serviceTier,
  isAdmin,
  themes = [],
  searchQuery = "",
  statusFilter = [],
  scriptBuilderV2Enabled = false,
  refreshKey = 0,
}: Props) {
  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const router = useRouter();
  const [plans, setPlans] = useState<ContentPlan[]>([]);
  const [localThemes, setLocalThemes] = useState<ThemeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  // Themes are still resolved (themes prop falling back to local fetch) for
  // any future inline rendering, but the modal that previously consumed them
  // has been replaced with a route push to /member/content-planner/[id].
  void themes; void localThemes;

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
  }, [apiBase, refreshKey]);

  const visiblePlans = useMemo(
    () => filterPlans(plans, searchQuery, statusFilter),
    [plans, searchQuery, statusFilter]
  );

  // Index events (shoot/edit/publish) by ymd date key. One plan can land in
  // up to three days. Sort each cell's events in pipeline order so a single
  // video reads shoot → edit → publish top-to-bottom.
  const eventsByDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    const push = (key: string, ev: CalendarEvent) => {
      (map[key] ??= []).push(ev);
    };
    for (const plan of visiblePlans) {
      const shootKey   = planDateKey(plan.shootDate);
      const editKey    = planDateKey(plan.editDueDate as string | null);
      const publishKey = planDateKey(plan.publishDate);
      if (shootKey)   push(shootKey,   { plan, type: "shoot" });
      if (editKey)    push(editKey,    { plan, type: "edit" });
      if (publishKey) push(publishKey, { plan, type: "publish" });
    }
    const order: Record<EventType, number> = { shoot: 0, edit: 1, publish: 2 };
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => order[a.type] - order[b.type]);
    }
    return map;
  }, [visiblePlans]);

  const cells = useMemo(() => getSixWeekGrid(year, month), [year, month]);
  const todayKey = ymd(today);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }
  function goToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  }

  /** Decode a draggable id of the form `${planId}::${type}`. */
  function decodeDragId(id: string | null): { planId: string; type: EventType } | null {
    if (!id) return null;
    const sep = id.lastIndexOf("::");
    if (sep < 0) return null;
    const type = id.slice(sep + 2) as EventType;
    if (type !== "shoot" && type !== "edit" && type !== "publish") return null;
    return { planId: id.slice(0, sep), type };
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveDragId(String(e.active.id));
  }

  function handleDragOver(e: DragOverEvent) {
    setOverId(e.over ? String(e.over.id) : null);
  }

  async function handleDragEnd(e: DragEndEvent) {
    const dragId = String(e.active.id);
    const targetDate = e.over ? String(e.over.id) : null;
    setActiveDragId(null);
    setOverId(null);
    if (!targetDate) return;

    const decoded = decodeDragId(dragId);
    if (!decoded) return;
    const { planId, type } = decoded;
    const field = DATE_FIELD[type];

    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    const oldDateValue = plan[field] as string | null;
    const oldKey = planDateKey(oldDateValue);
    if (oldKey === targetDate) return; // dropped on the same day → no-op

    // Optimistic update — store as a noon-UTC ISO so it round-trips through
    // existing date-parsing without timezone surprises.
    const newIso = new Date(`${targetDate}T12:00:00Z`).toISOString();
    setPlans((prev) =>
      prev.map((p) => (p.id === planId ? { ...p, [field]: newIso } : p))
    );
    setErrorMsg("");

    try {
      const res = await fetch(`${apiBase}/${planId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: targetDate }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      if (data?.plan) {
        setPlans((prev) => prev.map((p) => (p.id === planId ? data.plan : p)));
      }
    } catch {
      // Rollback
      setPlans((prev) =>
        prev.map((p) => (p.id === planId ? { ...p, [field]: oldDateValue } : p))
      );
      setErrorMsg("Could not move that date — try again.");
      setTimeout(() => setErrorMsg(""), 3000);
    }
  }

  const activeDrag = decodeDragId(activeDragId);
  const activeEvent: CalendarEvent | null = activeDrag
    ? (() => {
        const p = plans.find((pl) => pl.id === activeDrag.planId);
        return p ? { plan: p, type: activeDrag.type } : null;
      })()
    : null;

  if (loading) {
    return <div className="h-[680px] bg-white rounded-[14px] border border-[var(--abv-border)] animate-pulse" />;
  }

  return (
    <>
      {/* Month bar — prev/title/next on the left, legend pill in the middle,
          Today button on the right. */}
      <div className="flex items-center gap-3.5 mb-3.5 flex-wrap">
        <div className="inline-flex items-center gap-2">
          <button
            onClick={prevMonth}
            aria-label="Previous month"
            className="w-8 h-8 inline-flex items-center justify-center rounded-full bg-white text-[var(--abv-text-muted)] hover:text-[var(--abv-text)] transition-colors"
            style={{ border: "1px solid var(--abv-border-strong)" }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--abv-ink)")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--abv-border-strong)")}
          >
            ‹
          </button>
          <h2
            className="font-display font-extrabold m-0 text-[var(--abv-text)]"
            style={{ fontSize: 24, letterSpacing: "-0.025em" }}
          >
            {MONTHS[month]} {year}
          </h2>
          <button
            onClick={nextMonth}
            aria-label="Next month"
            className="w-8 h-8 inline-flex items-center justify-center rounded-full bg-white text-[var(--abv-text-muted)] hover:text-[var(--abv-text)] transition-colors"
            style={{ border: "1px solid var(--abv-border-strong)" }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--abv-ink)")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--abv-border-strong)")}
          >
            ›
          </button>
        </div>

        <span
          className="inline-flex gap-[18px] px-3.5 py-1.5 rounded-full"
          style={{ background: "var(--abv-bg-warm)", border: "1px solid var(--abv-border)" }}
        >
          {(["shoot", "edit", "publish"] as EventType[]).map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-[7px] font-mono font-semibold uppercase text-[var(--abv-text-muted)]"
              style={{ fontSize: 10.5, letterSpacing: "0.08em" }}
            >
              <span
                className="inline-block rounded-full"
                style={{ width: 8, height: 8, background: TYPE_STYLES[t].dot }}
              />
              {t}
            </span>
          ))}
        </span>

        <span className="flex-1" />

        {errorMsg && (
          <span className="text-xs font-semibold text-[var(--abv-leads)]">{errorMsg}</span>
        )}

        <button
          onClick={goToday}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white text-xs font-semibold text-[var(--abv-text-muted)] hover:text-[var(--abv-text)] transition-colors"
          style={{ border: "1px solid var(--abv-border-strong)" }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--abv-ink)")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--abv-border-strong)")}
        >
          Today
        </button>
      </div>

      {/* Calendar card */}
      <section
        className="overflow-hidden"
        style={{
          background: "var(--abv-card)",
          border: "1px solid var(--abv-border)",
          borderRadius: 14,
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        {/* Week head */}
        <div
          className="grid grid-cols-7"
          style={{ background: "var(--abv-bg-warm)", borderBottom: "1px solid var(--abv-border)" }}
        >
          {WEEK_DAYS.map((d) => (
            <div
              key={d}
              className="font-mono font-bold uppercase text-[var(--abv-text-muted)]"
              style={{ padding: "10px 12px", fontSize: 9.5, letterSpacing: "0.10em" }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day grid — 1px gap rendered via border colour for the gridlines.
            Wrapped in DndContext so pills can be dragged across days. */}
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={() => { setActiveDragId(null); setOverId(null); }}
        >
          <div
            className="grid grid-cols-7"
            style={{
              gridAutoRows: "minmax(128px, auto)",
              gap: "1px",
              background: "var(--abv-border)",
            }}
          >
            {cells.map(({ date, inMonth }, idx) => {
              const dow      = date.getDay();
              const weekend  = dow === 0 || dow === 6;
              const key      = ymd(date);
              const isToday  = key === todayKey;
              const dayEvts  = eventsByDay[key] ?? [];

              return (
                <DroppableDay
                  key={idx}
                  dateKey={key}
                  inMonth={inMonth}
                  weekend={weekend}
                  isOver={overId === key}
                  dragActive={activeDragId !== null}
                >
                  <div
                    className="font-mono font-semibold flex items-center"
                    style={{
                      fontSize: 11,
                      padding: "2px 0 2px 2px",
                      color: !inMonth ? "var(--abv-text-dim)" : "var(--abv-text-muted)",
                      opacity: !inMonth ? 0.6 : 1,
                    }}
                  >
                    {isToday ? (
                      <span
                        className="inline-flex items-center justify-center font-bold"
                        style={{
                          background: "var(--abv-ink)",
                          color: "white",
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          fontSize: 11,
                        }}
                      >
                        {date.getDate()}
                      </span>
                    ) : (
                      date.getDate()
                    )}
                  </div>

                  {dayEvts.length > 0 && (
                    <div className="flex flex-col min-w-0" style={{ gap: 3 }}>
                      {dayEvts.map((ev, i) => (
                        <EventPill
                          key={`${ev.plan.id}-${ev.type}-${i}`}
                          event={ev}
                          dragging={activeDragId === `${ev.plan.id}::${ev.type}`}
                          onClick={() => router.push(`/member/content-planner/${ev.plan.id}`)}
                        />
                      ))}
                    </div>
                  )}
                </DroppableDay>
              );
            })}
          </div>

          <DragOverlay dropAnimation={null}>
            {activeEvent ? <EventPillPreview event={activeEvent} /> : null}
          </DragOverlay>
        </DndContext>
      </section>

    </>
  );
}

function EventPill({
  event,
  onClick,
  dragging = false,
}: {
  event: CalendarEvent;
  onClick: () => void;
  dragging?: boolean;
}) {
  const style = TYPE_STYLES[event.type];
  const [hover, setHover] = useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${event.plan.id}::${event.type}`,
  });
  const ghost = dragging || isDragging;
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={`${event.type} · ${event.plan.title} — drag to reschedule`}
      className="flex items-center gap-1.5 text-left min-w-0"
      style={{
        padding: "4px 7px 4px 6px",
        borderRadius: 5,
        background: hover ? style.bgHover : style.bg,
        borderLeft: `2.5px solid ${style.border}`,
        transition: "background 120ms",
        lineHeight: 1.25,
        cursor: ghost ? "grabbing" : "grab",
        opacity: ghost ? 0.35 : 1,
        transform: CSS.Translate.toString(transform),
        touchAction: "none",
      }}
      {...listeners}
      {...attributes}
    >
      <span
        className="inline-block rounded-full shrink-0"
        style={{ width: 6, height: 6, background: style.dot }}
      />
      <span
        className="truncate min-w-0 flex-1 font-semibold text-[var(--abv-text)]"
        style={{ fontSize: 11 }}
      >
        {event.plan.title}
      </span>
      <ThemeIcon name={event.plan.theme ?? null} />
    </button>
  );
}

/** Floating preview rendered inside DragOverlay. Mirrors EventPill visuals but
 *  is not interactive and has no drag wiring of its own. */
function EventPillPreview({ event }: { event: CalendarEvent }) {
  const style = TYPE_STYLES[event.type];
  return (
    <div
      className="flex items-center gap-1.5 text-left min-w-0"
      style={{
        padding: "4px 7px 4px 6px",
        borderRadius: 5,
        background: style.bgHover,
        borderLeft: `2.5px solid ${style.border}`,
        lineHeight: 1.25,
        cursor: "grabbing",
        maxWidth: 240,
        boxShadow: "0 6px 16px rgba(0,0,0,0.18)",
      }}
    >
      <span
        className="inline-block rounded-full shrink-0"
        style={{ width: 6, height: 6, background: style.dot }}
      />
      <span
        className="truncate min-w-0 flex-1 font-semibold text-[var(--abv-text)]"
        style={{ fontSize: 11 }}
      >
        {event.plan.title}
      </span>
      <ThemeIcon name={event.plan.theme ?? null} />
    </div>
  );
}

/** A single calendar day cell — registered as a dnd-kit drop target keyed by
 *  its yyyy-mm-dd date string. Surfaces a soft azure tint while a pill is
 *  hovering above it so the user can see where the drop will land. */
function DroppableDay({
  dateKey,
  inMonth,
  weekend,
  isOver,
  dragActive,
  children,
}: {
  dateKey: string;
  inMonth: boolean;
  weekend: boolean;
  isOver: boolean;
  dragActive: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: dateKey });

  const baseBg = !inMonth
    ? "var(--abv-bg)"
    : weekend
    ? "#fcfbf8"
    : "var(--abv-card)";

  return (
    <div
      ref={setNodeRef}
      className="flex flex-col gap-1.5 min-w-0"
      style={{
        background: isOver ? "rgba(74, 144, 226, 0.10)" : baseBg,
        padding: "8px 8px 10px",
        outline: isOver ? "2px solid var(--abv-azure)" : "none",
        outlineOffset: "-2px",
        transition: dragActive ? "background 120ms, outline-color 120ms" : "none",
      }}
    >
      {children}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  PlusIcon,
  CalendarIcon,
  ChevronRightIcon,
  XMarkIcon,
  CheckIcon,
  ExclamationCircleIcon,
  PlayCircleIcon,
} from "@heroicons/react/24/outline";
import { STATUS_STYLES, filterPlans } from "@/lib/content-plan-utils";
import { plannerThemeLabel } from "@/lib/content-engine-validation";
import type { ContentPlan } from "./ContentPlanEditModal";

interface Props {
  plans: ContentPlan[] | null;
  statusOptions: string[];
  onSelectPlan: (plan: ContentPlan) => void;
  onAddPlan: () => void;
  addingPlan: boolean;
  isAdminView?: boolean;
}

function dateValue(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? t : null;
}

function formatShortDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = new Date(d);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" }).format(date);
}

export default function MobileCardFeed({
  plans,
  statusOptions,
  onSelectPlan,
  onAddPlan,
  addingPlan,
  isAdminView = false,
}: Props) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);

  // Default sort: publishDate desc, nulls last — matches Full Table default
  // so the mobile feed lands on the same first card as the desktop table.
  const sortedFiltered = useMemo(() => {
    if (!plans) return [];
    const filtered = filterPlans(plans, searchQuery, statusFilter);
    return [...filtered].sort((a, b) => {
      const av = dateValue(a.publishDate);
      const bv = dateValue(b.publishDate);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return bv - av;
    });
  }, [plans, searchQuery, statusFilter]);

  function toggleStatus(s: string) {
    setStatusFilter((curr) => (curr.includes(s) ? curr.filter((x) => x !== s) : [...curr, s]));
  }

  const filtersActive = searchQuery.trim().length > 0 || statusFilter.length > 0;

  return (
    <div className="relative -mx-4 -mt-4 sm:mx-0 sm:mt-0">
      {/* Sticky search/filter/add toolbar */}
      <div className="sticky top-0 z-10 bg-[var(--abv-bg)]/95 backdrop-blur-md border-b border-gray-100 px-4 py-3 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-[var(--abv-text)]">
          {filtersActive ? (
            <>
              <span className="text-[var(--abv-azure)]">{sortedFiltered.length}</span>
              <span className="text-[var(--abv-text)]/50"> of {plans?.length ?? 0}</span>
            </>
          ) : (
            <>{plans?.length ?? 0} videos</>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="w-10 h-10 flex items-center justify-center rounded-full text-[var(--abv-text)]/70 hover:bg-white transition-colors"
            aria-label="Search videos"
          >
            <MagnifyingGlassIcon className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className={`relative w-10 h-10 flex items-center justify-center rounded-full transition-colors ${
              statusFilter.length > 0
                ? "text-[var(--abv-azure)] bg-[var(--abv-dark)]/10"
                : "text-[var(--abv-text)]/70 hover:bg-white"
            }`}
            aria-label="Filter videos"
          >
            <FunnelIcon className="w-5 h-5" />
            {statusFilter.length > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-[var(--abv-dark)] rounded-full" />
            )}
          </button>
          {!isAdminView && (
            <button
              type="button"
              onClick={onAddPlan}
              disabled={addingPlan}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-[var(--abv-dark)] text-white hover:bg-[#5a92b6] disabled:opacity-50 transition-colors ml-1 shadow-sm"
              aria-label="Add video"
            >
              <PlusIcon className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Card list */}
      <div className="px-4 pt-4 pb-24 space-y-3">
        {plans === null ? (
          <div className="text-center text-sm text-[var(--abv-text)]/50 py-12">Loading…</div>
        ) : sortedFiltered.length === 0 ? (
          <div className="text-center text-sm text-[var(--abv-text)]/50 py-12">
            {filtersActive ? "No videos match your filters." : "No videos yet — tap + to add one."}
          </div>
        ) : (
          sortedFiltered.map((p) => {
            const style = STATUS_STYLES[p.status] ?? { bg: "#E3E2E0", text: "#3F3D38" };
            let nextDateStr = "";
            let nextDateLabel = "";
            if (p.publishDate) { nextDateStr = formatShortDate(p.publishDate); nextDateLabel = "Publish"; }
            else if (p.shootDate) { nextDateStr = formatShortDate(p.shootDate); nextDateLabel = "Shoot"; }
            else if (p.editDueDate) { nextDateStr = formatShortDate(p.editDueDate); nextDateLabel = "Edit"; }
            const isHigh = p.priority === "High";

            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectPlan(p)}
                className="w-full text-left bg-white rounded-2xl p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-gray-100 active:scale-[0.98] transition-transform"
              >
                <div className="flex items-start justify-between mb-2 gap-2">
                  <span
                    className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium"
                    style={{ backgroundColor: style.bg, color: style.text }}
                  >
                    {p.status}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isHigh && (
                      <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider text-red-600 bg-red-50 px-2 py-0.5 rounded">
                        <ExclamationCircleIcon className="w-3 h-3 mr-0.5" />
                        High
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-3 mb-2.5">
                  {p.thumbnailFileId ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/member/content-plans/${p.id}/thumbnail?v=${encodeURIComponent(p.updatedAt ?? p.thumbnailFileId ?? "")}`}
                      alt=""
                      loading="lazy"
                      className="w-20 h-12 object-cover rounded-lg shrink-0 bg-gray-100 border border-gray-200"
                    />
                  ) : null}
                  <h2 className="text-base font-semibold text-[var(--abv-text)] leading-snug pr-2 flex-1 min-w-0">
                    {p.title || <span className="italic text-[var(--abv-text)]/40">Untitled</span>}
                  </h2>
                </div>

                <div className="flex items-center justify-between text-xs text-[var(--abv-text)]/60 gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    {plannerThemeLabel(p.rotationSlot) && (
                      <span className="inline-flex items-center gap-1 truncate">
                        <PlayCircleIcon className="w-4 h-4 text-[var(--abv-text)]/40 shrink-0" />
                        <span className="truncate">{plannerThemeLabel(p.rotationSlot)}</span>
                      </span>
                    )}
                    {nextDateStr && (
                      <span className="inline-flex items-center gap-1 shrink-0">
                        <CalendarIcon className="w-4 h-4 text-[var(--abv-text)]/40" />
                        <span className="font-medium text-[var(--abv-text)]/80">{nextDateStr}</span>
                        <span className="text-[10px] text-[var(--abv-text)]/40 uppercase">{nextDateLabel}</span>
                      </span>
                    )}
                  </div>
                  <ChevronRightIcon className="w-4 h-4 text-[var(--abv-text)]/30 shrink-0" />
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Search overlay */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <div className="px-4 pt-4 pb-3 border-b border-gray-100 flex items-center gap-3" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 1rem)" }}>
            <div className="flex-1 relative">
              <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--abv-text)]/40" />
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search videos, themes…"
                className="w-full bg-gray-100 rounded-xl py-2.5 pl-10 pr-4 text-sm text-[var(--abv-text)] focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/50"
              />
            </div>
            <button
              type="button"
              onClick={() => setSearchOpen(false)}
              className="text-sm font-medium text-[var(--abv-text)]/70 px-2"
            >
              Done
            </button>
          </div>
          <div className="flex-1 overflow-y-auto bg-[var(--abv-bg)] px-4 py-4 space-y-3">
            {sortedFiltered.length === 0 ? (
              <div className="text-center text-sm text-[var(--abv-text)]/50 py-12">
                {searchQuery ? `No videos found for "${searchQuery}"` : "Start typing to search."}
              </div>
            ) : (
              sortedFiltered.map((p) => {
                const style = STATUS_STYLES[p.status] ?? { bg: "#E3E2E0", text: "#3F3D38" };
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setSearchOpen(false); onSelectPlan(p); }}
                    className="w-full text-left bg-white rounded-xl p-3 border border-gray-100 active:scale-[0.98] transition-transform"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium"
                        style={{ backgroundColor: style.bg, color: style.text }}
                      >
                        {p.status}
                      </span>
                      {plannerThemeLabel(p.rotationSlot) && <span className="text-[11px] text-[var(--abv-text)]/50 truncate">{plannerThemeLabel(p.rotationSlot)}</span>}
                    </div>
                    <p className="text-sm font-medium text-[var(--abv-text)] truncate">{p.title || "Untitled"}</p>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Filter bottom sheet */}
      {filterOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => setFilterOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-50 p-6 pb-10 shadow-2xl max-h-[80vh] overflow-y-auto" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 2.5rem)" }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-base text-[var(--abv-text)]">Filter by status</h3>
              <button
                type="button"
                onClick={() => setFilterOpen(false)}
                className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full text-[var(--abv-text)]/70"
                aria-label="Close filters"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mb-6">
              {statusOptions.map((s) => {
                const style = STATUS_STYLES[s] ?? { bg: "#E3E2E0", text: "#3F3D38" };
                const selected = statusFilter.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleStatus(s)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all inline-flex items-center gap-1.5 ${
                      selected ? "ring-2 ring-[var(--abv-azure)] ring-offset-1" : ""
                    }`}
                    style={{ backgroundColor: style.bg, color: style.text }}
                  >
                    {selected && <CheckIcon className="w-3.5 h-3.5" />}
                    {s}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStatusFilter([])}
                disabled={statusFilter.length === 0}
                className="flex-1 py-2.5 text-sm font-medium text-[var(--abv-text)]/70 bg-gray-100 rounded-xl disabled:opacity-40"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setFilterOpen(false)}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-[var(--abv-dark)] rounded-xl hover:bg-[#5a92b6]"
              >
                Show {sortedFiltered.length} {sortedFiltered.length === 1 ? "video" : "videos"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

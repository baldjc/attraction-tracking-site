"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { PlusIcon, TrashIcon, ArrowTopRightOnSquareIcon, PencilSquareIcon, ChevronUpIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { CheckIcon, XMarkIcon } from "@heroicons/react/24/solid";
import DramaMagnet from "@/components/icons/DramaMagnet";
import ContentPlanEditModal from "./ContentPlanEditModal";
import ProgressTrack from "./ProgressTrack";
import { resolveProgressSteps, type PlanArtifactsByType } from "@/lib/plan-state";
import {
  STATUS_STYLES,
  PRIORITY_OPTIONS,
  getStatusOptions,
  hasEditDueDate,
  hasDriveFolder,
  filterPlans,
} from "@/lib/content-plan-utils";
import { getScoreBadgeClasses } from "@/lib/score-badge";

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
  dramaMode?: boolean;
}

interface Props {
  apiBase: string;
  isAdmin?: boolean;
  forcedServiceTier?: string;
  searchQuery?: string;
  statusFilter?: string[];
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? { bg: "#E3E2E0", text: "#3F3D38" };
  // Notion-style square chip: 4px radius, tight padding, sharper text colour.
  return (
    <span
      className="inline-block text-xs font-medium px-2 py-0.5 rounded whitespace-nowrap"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {status}
    </span>
  );
}

function formatDate(d: string | null) {
  if (!d) return "";
  // Date-only fields (shootDate, editDueDate, publishDate) are stored as
  // midnight UTC. Display them in UTC so they never shift back a day in
  // negative-offset timezones (e.g. Mountain time turns May 5 into May 4).
  return new Date(d).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function toInputDate(d: string | null) {
  if (!d) return "";
  return new Date(d).toISOString().split("T")[0];
}

type EditingCell = { id: string; field: string } | null;

export default function ContentPlanTable({ apiBase, isAdmin = false, forcedServiceTier, searchQuery = "", statusFilter = [] }: Props) {
  const [plans, setPlans] = useState<ContentPlan[]>([]);
  const [serviceTier, setServiceTier] = useState<string>(forcedServiceTier ?? "foundations");
  const [themes, setThemes] = useState<Array<{ name: string; emoji?: string | null; colour?: string | null }>>([
    { name: "Theme 1" }, { name: "Theme 2" }, { name: "Theme 3" }, { name: "Theme 4" },
  ]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [cellValue, setCellValue] = useState<string>("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState<Record<string, string>>({});
  const [addError, setAddError] = useState<string | null>(null);
  const [addLoading, setAddLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [expandedNotes, setExpandedNotes] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState<ContentPlan | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null>(null);
  const [sortKey, setSortKey] = useState<keyof ContentPlan | null>("publishDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showProgressTrack, setShowProgressTrack] = useState(false);
  const [showReviewColumn, setShowReviewColumn] = useState(false);
  const [planArtifacts, setPlanArtifacts] = useState<Record<string, PlanArtifactsByType>>({});

  const allStatusOptions = getStatusOptions(serviceTier);
  const showEditDue = isAdmin || hasEditDueDate(serviceTier);
  const showDriveFolder = isAdmin || hasDriveFolder(serviceTier);

  useEffect(() => {
    fetchPlans();
    fetchThemes();
    fetch("/api/member/feature-flags")
      .then((r) => r.json())
      .then((d) => {
        if (d?.flags?.progress_track_v1) setShowProgressTrack(true);
        if (d?.flags?.tool_planner_linkage) setShowReviewColumn(true);
      })
      .catch(() => {});
  }, [apiBase]);

  useEffect(() => {
    if ((!showProgressTrack && !showReviewColumn) || plans.length === 0) return;
    const ids = plans.map((p) => p.id).join(",");
    fetch(`/api/member/content-plans/artifacts?planIds=${ids}`)
      .then((r) => r.json())
      .then((d) => { if (d?.artifactsByPlan) setPlanArtifacts(d.artifactsByPlan); })
      .catch(() => {});
  }, [plans, showProgressTrack, showReviewColumn]);

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingCell]);

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

  async function updatePlan(id: string, updates: Record<string, unknown>) {
    const res = await fetch(`${apiBase}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (res.ok) {
      setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, ...data.plan } : p)));
    }
  }

  async function deletePlan(id: string) {
    const res = await fetch(`${apiBase}/${id}`, { method: "DELETE" });
    if (res.ok) {
      setPlans((prev) => prev.filter((p) => p.id !== id));
      setConfirmDelete(null);
    }
  }

  function startEdit(id: string, field: string, currentValue: string | null) {
    setEditingCell({ id, field });
    setCellValue(currentValue ?? "");
  }

  async function commitEdit() {
    if (!editingCell) return;
    const { id, field } = editingCell;
    setEditingCell(null);
    await updatePlan(id, { [field]: cellValue || null });
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
          shootLocation: addForm.shootLocation || null,
          publishDate: addForm.publishDate || null,
          editDueDate: addForm.editDueDate || null,
          priority: addForm.priority || null,
          thumbnailWords: addForm.thumbnailWords || null,
          notes: addForm.notes || null,
          script: addForm.script || null,
          footageLink: addForm.footageLink || null,
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

      const aStr = (aVal as string | null) ?? "";
      const bStr = (bVal as string | null) ?? "";
      if (!aStr && !bStr) return 0;
      if (!aStr) return 1;
      if (!bStr) return -1;
      return mult * aStr.localeCompare(bStr);
    });
  }, [plans, sortKey, sortDir]);

  function SortIcon({ col }: { col: keyof ContentPlan }) {
    if (sortKey !== col) return <ChevronUpIcon className="w-3 h-3 opacity-20 inline-block ml-0.5 -mt-0.5" />;
    return sortDir === "asc"
      ? <ChevronUpIcon className="w-3 h-3 text-[#6ba3c7] inline-block ml-0.5 -mt-0.5" />
      : <ChevronDownIcon className="w-3 h-3 text-[#6ba3c7] inline-block ml-0.5 -mt-0.5" />;
  }

  const inputCls = "w-full bg-white text-[#2f3437] text-sm rounded border border-gray-300 px-2 py-1 focus:border-[#6ba3c7] focus:outline-none";
  const selectCls = "bg-white text-[#2f3437] text-sm rounded border border-gray-300 px-2 py-1 focus:border-[#6ba3c7] focus:outline-none";

  function renderCell(plan: ContentPlan, field: keyof ContentPlan) {
    const isEditing = editingCell?.id === plan.id && editingCell?.field === field;

    if (field === "status") {
      if (isEditing) {
        return (
          <select
            ref={inputRef as any}
            value={cellValue}
            onChange={(e) => { setEditingCell(null); updatePlan(plan.id, { status: e.target.value }); }}
            onBlur={() => setEditingCell(null)}
            className={selectCls}
          >
            {allStatusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        );
      }
      return (
        <div className="cursor-pointer" onClick={() => startEdit(plan.id, "status", plan.status)}>
          <StatusBadge status={plan.status} />
        </div>
      );
    }

    if (field === "theme") {
      if (isEditing) {
        return (
          <select
            ref={inputRef as any}
            value={cellValue}
            onChange={(e) => { setEditingCell(null); updatePlan(plan.id, { theme: e.target.value || null }); }}
            onBlur={() => setEditingCell(null)}
            className={selectCls}
          >
            <option value="">— None —</option>
            {themes.map((t) => <option key={t.name} value={t.name}>{t.emoji ? `${t.emoji} ${t.name}` : t.name}</option>)}
          </select>
        );
      }
      const themeMeta = plan.theme ? themes.find((t) => t.name === plan.theme) : null;
      return (
        <div className="cursor-pointer" onClick={() => startEdit(plan.id, "theme", plan.theme)}>
          {plan.theme ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-[#2f3437] hover:text-[#6ba3c7] transition-colors max-w-full">
              {themeMeta?.emoji ? (
                <span className="text-sm leading-none shrink-0">{themeMeta.emoji}</span>
              ) : themeMeta?.colour ? (
                <span
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: themeMeta.colour }}
                />
              ) : null}
              <span className="truncate" title={plan.theme}>{plan.theme}</span>
            </span>
          ) : (
            <span className="text-xs text-[#2f3437]/30 italic">Click to set</span>
          )}
        </div>
      );
    }

    if (field === "priority") {
      if (isEditing) {
        return (
          <select
            ref={inputRef as any}
            value={cellValue}
            onChange={(e) => { setEditingCell(null); updatePlan(plan.id, { priority: e.target.value || null }); }}
            onBlur={() => setEditingCell(null)}
            className={selectCls}
          >
            <option value="">— None —</option>
            {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        );
      }
      const colour = plan.priority === "High" ? "text-red-600 font-medium" : plan.priority === "Medium" ? "text-amber-600 font-medium" : "text-green-600 font-medium";
      return (
        <div className={`cursor-pointer text-xs hover:opacity-80 ${colour}`} onClick={() => startEdit(plan.id, "priority", plan.priority)}>
          {plan.priority || <span className="text-[#2f3437]/30 italic font-normal">—</span>}
        </div>
      );
    }

    if (field === "shootLocation") {
      if (isEditing) {
        return (
          <select
            ref={inputRef as any}
            value={cellValue}
            onChange={(e) => { setEditingCell(null); updatePlan(plan.id, { shootLocation: e.target.value || null }); }}
            onBlur={() => setEditingCell(null)}
            className={selectCls}
          >
            <option value="">— None —</option>
            <option value="In Studio">In Studio</option>
            <option value="Out of Studio">Out of Studio</option>
          </select>
        );
      }
      return (
        <div className="cursor-pointer text-xs whitespace-nowrap" onClick={() => startEdit(plan.id, "shootLocation", plan.shootLocation)}>
          {plan.shootLocation ? (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded font-medium ${
                plan.shootLocation === "In Studio"
                  ? "bg-[#E8DEEE] text-[#492F64]"
                  : "bg-[#D3E5EF] text-[#183347]"
              }`}
            >
              {plan.shootLocation}
            </span>
          ) : (
            <span className="text-[#2f3437]/30 italic">—</span>
          )}
        </div>
      );
    }

    if (field === "shootDate" || field === "publishDate" || field === "editDueDate") {
      if (isEditing) {
        return (
          <input
            ref={inputRef as any}
            type="date"
            value={cellValue}
            onChange={(e) => setCellValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingCell(null); }}
            className={`${inputCls} w-36`}
          />
        );
      }
      return (
        <div className="cursor-pointer text-xs text-[#2f3437]/70 hover:text-[#2f3437] whitespace-nowrap" onClick={() => startEdit(plan.id, field, toInputDate(plan[field] as string | null))}>
          {plan[field] ? formatDate(plan[field] as string) : <span className="text-[#2f3437]/30 italic">—</span>}
        </div>
      );
    }

    if (field === "notes") {
      const isExpanded = expandedNotes === plan.id;
      if (isEditing) {
        return (
          <textarea
            ref={inputRef as any}
            value={cellValue}
            onChange={(e) => setCellValue(e.target.value)}
            onBlur={commitEdit}
            rows={3}
            className={`${inputCls} min-w-[160px] resize-none`}
          />
        );
      }
      return (
        <div className="max-w-[180px]">
          <div
            className={`cursor-pointer text-xs text-[#2f3437]/70 hover:text-[#2f3437] ${!isExpanded ? "line-clamp-2" : ""}`}
            onClick={() => startEdit(plan.id, "notes", plan.notes)}
          >
            {plan.notes || <span className="text-[#2f3437]/30 italic">—</span>}
          </div>
          {plan.notes && plan.notes.length > 60 && (
            <button className="text-[10px] text-[#6ba3c7] mt-0.5" onClick={() => setExpandedNotes(isExpanded ? null : plan.id)}>
              {isExpanded ? "less" : "more"}
            </button>
          )}
        </div>
      );
    }

    if (field === "driveFolderLink") {
      if (!plan.driveFolderLink) return <span className="text-[#2f3437]/30 text-xs italic">—</span>;
      return (
        <a href={plan.driveFolderLink} target="_blank" rel="noopener noreferrer" className="text-[#6ba3c7] hover:text-[#4a82a6] transition-colors">
          <ArrowTopRightOnSquareIcon className="w-4 h-4" />
        </a>
      );
    }

    const val = plan[field] as string | null;
    if (isEditing) {
      return (
        <input
          ref={inputRef as any}
          type="text"
          value={cellValue}
          onChange={(e) => setCellValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingCell(null); }}
          className={`${inputCls} min-w-[100px]`}
        />
      );
    }
    return (
      <div className="cursor-pointer text-xs text-[#2f3437]/70 hover:text-[#2f3437] truncate max-w-[150px]" onClick={() => startEdit(plan.id, field as string, val)}>
        {val || <span className="text-[#2f3437]/30 italic">—</span>}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-[#6ba3c7] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return <div className="text-red-500 text-sm text-center py-8">{error}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-[#2f3437]/50">{plans.length} video{plans.length !== 1 ? "s" : ""} planned</p>
        <button
          onClick={() => { setAddForm({ status: allStatusOptions[0] }); setShowAddModal(true); }}
          className="flex items-center gap-1.5 text-sm font-medium bg-[#6ba3c7] hover:bg-[#5a92b6] text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          <PlusIcon className="w-4 h-4" /> Add Video
        </button>
      </div>

      {plans.length === 0 ? (
        <div className="text-center py-16 text-[#2f3437]/40 text-sm bg-white rounded-lg border border-gray-200">
          No videos planned yet. Start building your content calendar by clicking "Add Video" above.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-[#2f3437]/50 text-xs uppercase tracking-wide">
                <th className="px-3 py-2.5 w-8" />
                <th className="text-left px-3 py-2.5 font-medium whitespace-nowrap min-w-[220px]">
                  <button onClick={() => handleSort("title")} className="flex items-center gap-0.5 hover:text-[#2f3437] transition-colors">
                    Title <SortIcon col="title" />
                  </button>
                </th>
                <th className="text-left px-3 py-2.5 font-medium whitespace-nowrap w-[140px]">
                  <button onClick={() => handleSort("status")} className="flex items-center gap-0.5 hover:text-[#2f3437] transition-colors">
                    Status <SortIcon col="status" />
                  </button>
                </th>
                <th className="text-left px-3 py-2.5 font-medium whitespace-nowrap w-[160px]">
                  <button onClick={() => handleSort("theme")} className="flex items-center gap-0.5 hover:text-[#2f3437] transition-colors">
                    Theme <SortIcon col="theme" />
                  </button>
                </th>
                <th className="text-left px-3 py-2.5 font-medium whitespace-nowrap w-[100px]">
                  <button onClick={() => handleSort("shootDate")} className="flex items-center gap-0.5 hover:text-[#2f3437] transition-colors">
                    Shoot <SortIcon col="shootDate" />
                  </button>
                </th>
                <th className="text-left px-3 py-2.5 font-medium whitespace-nowrap w-[110px]">
                  <button onClick={() => handleSort("shootLocation")} className="flex items-center gap-0.5 hover:text-[#2f3437] transition-colors">
                    Location <SortIcon col="shootLocation" />
                  </button>
                </th>
                {showEditDue && (
                  <th className="text-left px-3 py-2.5 font-medium whitespace-nowrap w-[100px]">
                    <button onClick={() => handleSort("editDueDate")} className="flex items-center gap-0.5 hover:text-[#2f3437] transition-colors">
                      Edit Due <SortIcon col="editDueDate" />
                    </button>
                  </th>
                )}
                <th className="text-left px-3 py-2.5 font-medium whitespace-nowrap w-[100px]">
                  <button onClick={() => handleSort("publishDate")} className="flex items-center gap-0.5 hover:text-[#2f3437] transition-colors">
                    Publish <SortIcon col="publishDate" />
                  </button>
                </th>
                {showDriveFolder && <th className="text-center px-3 py-2.5 font-medium whitespace-nowrap w-[60px]">Drive</th>}
                <th className="px-3 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedPlans.map((plan) => (
                <tr key={plan.id} className="hover:bg-[#6ba3c7]/5 transition-colors">
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => setEditingPlan(plan)}
                      className="text-[#2f3437]/20 hover:text-[#6ba3c7] transition-colors p-0.5"
                      title="Edit video"
                    >
                      <PencilSquareIcon className="w-4 h-4" />
                    </button>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <div className="cursor-pointer text-sm text-[#2f3437] font-medium hover:text-[#6ba3c7] transition-colors max-w-[280px] flex items-start gap-1.5 leading-snug" onClick={() => setEditingPlan(plan)}>
                      {plan.dramaMode && (
                        <DramaMagnet className="w-3.5 h-3.5 text-orange-600 shrink-0 mt-0.5" />
                      )}
                      <span className="line-clamp-2 break-words">{plan.title}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-top">{renderCell(plan, "status")}</td>
                  <td className="px-3 py-2.5 align-top">{renderCell(plan, "theme")}</td>
                  <td className="px-3 py-2.5 align-top">{renderCell(plan, "shootDate")}</td>
                  <td className="px-3 py-2.5 align-top">{renderCell(plan, "shootLocation")}</td>
                  {showEditDue && <td className="px-3 py-2.5 align-top">{renderCell(plan, "editDueDate")}</td>}
                  <td className="px-3 py-2.5 align-top">{renderCell(plan, "publishDate")}</td>
                  {showDriveFolder && <td className="px-3 py-2.5 text-center align-top">{renderCell(plan, "driveFolderLink")}</td>}
                  <td className="px-3 py-2.5 align-top">
                    {confirmDelete === plan.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => deletePlan(plan.id)} className="text-red-500 hover:text-red-700 p-0.5"><CheckIcon className="w-4 h-4" /></button>
                        <button onClick={() => setConfirmDelete(null)} className="text-[#2f3437]/40 hover:text-[#2f3437] p-0.5"><XMarkIcon className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDelete(plan.id)} className="text-[#2f3437]/20 hover:text-red-500 transition-colors p-0.5">
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
                  {themes.map((t) => <option key={t.name} value={t.name}>{t.emoji ? `${t.emoji} ${t.name}` : t.name}</option>)}
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
              <div>
                <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Shoot Location</label>
                <select
                  value={addForm.shootLocation ?? ""}
                  onChange={(e) => setAddForm((f) => ({ ...f, shootLocation: e.target.value }))}
                  className="w-full border border-gray-200 text-[#2f3437] text-sm rounded-lg px-3 py-2 focus:border-[#6ba3c7] focus:outline-none"
                >
                  <option value="">Select location...</option>
                  <option value="In Studio">In Studio</option>
                  <option value="Out of Studio">Out of Studio</option>
                </select>
              </div>
              {showEditDue && (
                <div>
                  <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Edit Due Date</label>
                  <input type="date" value={addForm.editDueDate ?? ""} onChange={(e) => setAddForm((f) => ({ ...f, editDueDate: e.target.value }))} className="w-full border border-gray-200 text-[#2f3437] text-sm rounded-lg px-3 py-2 focus:border-[#6ba3c7] focus:outline-none" />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Thumbnail Words and Ideas</label>
                <input type="text" value={addForm.thumbnailWords ?? ""} onChange={(e) => setAddForm((f) => ({ ...f, thumbnailWords: e.target.value }))} placeholder="Words for your thumbnail, or quick ideas…" className="w-full border border-gray-200 text-[#2f3437] text-sm rounded-lg px-3 py-2 focus:border-[#6ba3c7] focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Footage Link</label>
                <input type="url" value={addForm.footageLink ?? ""} onChange={(e) => setAddForm((f) => ({ ...f, footageLink: e.target.value }))} placeholder="https://..." className="w-full border border-gray-200 text-[#2f3437] text-sm rounded-lg px-3 py-2 focus:border-[#6ba3c7] focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Talking Points</label>
                <textarea value={addForm.notes ?? ""} onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))} placeholder="One talking point per line…" rows={3} className="w-full border border-gray-200 text-[#2f3437] text-sm rounded-lg px-3 py-2 focus:border-[#6ba3c7] focus:outline-none resize-none" />
                <label className="block text-xs font-medium text-[#2f3437]/60 mb-1 mt-3">Script</label>
                <textarea value={addForm.script ?? ""} onChange={(e) => setAddForm((f) => ({ ...f, script: e.target.value }))} placeholder="Paste your script here…" rows={5} className="w-full border border-gray-200 text-[#2f3437] text-sm rounded-lg px-3 py-2 focus:border-[#6ba3c7] focus:outline-none resize-y" />
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

      {editingPlan && (
        <ContentPlanEditModal
          plan={editingPlan}
          serviceTier={serviceTier}
          apiBase={apiBase}
          isAdmin={isAdmin}
          themes={themes}
          showProgressTrack={showProgressTrack}
          onClose={() => setEditingPlan(null)}
          onSaved={(updated) => {
            setPlans((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
            setEditingPlan(null);
          }}
          onDeleted={(id) => {
            setPlans((prev) => prev.filter((p) => p.id !== id));
            setEditingPlan(null);
          }}
        />
      )}
    </div>
  );
}

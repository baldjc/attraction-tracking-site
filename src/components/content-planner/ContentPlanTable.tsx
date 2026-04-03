"use client";

import { useState, useEffect, useRef } from "react";
import { PlusIcon, TrashIcon, PencilIcon, ArrowTopRightOnSquareIcon, CalendarDaysIcon } from "@heroicons/react/24/outline";
import { CheckIcon, XMarkIcon } from "@heroicons/react/24/solid";
import {
  STATUS_STYLES,
  PRIORITY_OPTIONS,
  getStatusOptions,
  hasEditDueDate,
  hasDriveFolder,
  FOUNDATIONS_STATUSES,
  GROWTH_DWY_STATUSES,
} from "@/lib/content-plan-utils";

interface ContentPlan {
  id: string;
  title: string;
  status: string;
  theme: string | null;
  shootDate: string | null;
  publishDate: string | null;
  editDueDate: string | null;
  priority: string | null;
  notes: string | null;
  thumbnailWords: string | null;
  footageLink: string | null;
  driveFolderLink: string | null;
}

interface Props {
  apiBase: string;
  isAdmin?: boolean;
  forcedServiceTier?: string;
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? { bg: "#2a2a3e", text: "#888" };
  return (
    <span
      className="inline-block text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {status}
    </span>
  );
}

function formatDate(d: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

function toInputDate(d: string | null) {
  if (!d) return "";
  return new Date(d).toISOString().split("T")[0];
}

type EditingCell = { id: string; field: string } | null;

export default function ContentPlanTable({ apiBase, isAdmin = false, forcedServiceTier }: Props) {
  const [plans, setPlans] = useState<ContentPlan[]>([]);
  const [serviceTier, setServiceTier] = useState<string>(forcedServiceTier ?? "foundations");
  const [themes, setThemes] = useState<string[]>(["Theme 1", "Theme 2", "Theme 3", "Theme 4"]);
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
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null>(null);

  const statusOptions = isAdmin ? [...FOUNDATIONS_STATUSES, ...GROWTH_DWY_STATUSES] : getStatusOptions(serviceTier);
  const showEditDue = isAdmin || hasEditDueDate(serviceTier);
  const showDriveFolder = isAdmin || hasDriveFolder(serviceTier);

  useEffect(() => {
    fetchPlans();
    fetchThemes();
  }, [apiBase]);

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
      if (data.themes) setThemes(data.themes);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchThemes() {
    if (isAdmin) return;
    try {
      const res = await fetch(`${apiBase.replace(/\/content-plans.*/, "")}/content-plans/themes`);
      const data = await res.json();
      if (res.ok && data.themes) setThemes(data.themes);
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
    const plan = plans.find((p) => p.id === id);
    if (!plan) return;

    const old = (plan as any)[field];
    let value: string | null = cellValue.trim() || null;

    if (field.endsWith("Date")) {
      value = cellValue || null;
    }

    if (value === (old instanceof Date ? old.toISOString().split("T")[0] : old)) {
      setEditingCell(null);
      return;
    }

    setEditingCell(null);
    await updatePlan(id, { [field]: value });
  }

  async function handleAddSubmit() {
    if (!addForm.title?.trim()) {
      setAddError("Title is required");
      return;
    }
    setAddLoading(true);
    setAddError(null);
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: addForm.title,
          status: addForm.status || statusOptions[0],
          theme: addForm.theme || null,
          shootDate: addForm.shootDate || null,
          publishDate: addForm.publishDate || null,
          editDueDate: addForm.editDueDate || null,
          priority: addForm.priority || null,
          thumbnailWords: addForm.thumbnailWords || null,
          notes: addForm.notes || null,
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

  function renderCell(plan: ContentPlan, field: keyof ContentPlan) {
    const isEditing = editingCell?.id === plan.id && editingCell?.field === field;

    if (field === "status") {
      if (isEditing) {
        return (
          <select
            ref={inputRef as any}
            value={cellValue}
            onChange={(e) => { setCellValue(e.target.value); setEditingCell(null); updatePlan(plan.id, { status: e.target.value }); }}
            onBlur={() => setEditingCell(null)}
            className="bg-[#1e2a38] text-white text-xs rounded px-1 py-0.5 border border-[#6ba3c7]/30 min-w-[120px]"
          >
            {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
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
            onChange={(e) => { setCellValue(e.target.value); setEditingCell(null); updatePlan(plan.id, { theme: e.target.value || null }); }}
            onBlur={() => setEditingCell(null)}
            className="bg-[#1e2a38] text-white text-xs rounded px-1 py-0.5 border border-[#6ba3c7]/30 min-w-[100px]"
          >
            <option value="">—</option>
            {themes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        );
      }
      return (
        <div className="cursor-pointer text-xs text-white/70 hover:text-white" onClick={() => startEdit(plan.id, "theme", plan.theme)}>
          {plan.theme || <span className="text-white/30">—</span>}
        </div>
      );
    }

    if (field === "priority") {
      if (isEditing) {
        return (
          <select
            ref={inputRef as any}
            value={cellValue}
            onChange={(e) => { setCellValue(e.target.value); setEditingCell(null); updatePlan(plan.id, { priority: e.target.value || null }); }}
            onBlur={() => setEditingCell(null)}
            className="bg-[#1e2a38] text-white text-xs rounded px-1 py-0.5 border border-[#6ba3c7]/30"
          >
            <option value="">—</option>
            {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        );
      }
      const colour = plan.priority === "High" ? "text-red-400" : plan.priority === "Medium" ? "text-yellow-400" : "text-green-400";
      return (
        <div className={`cursor-pointer text-xs hover:opacity-80 ${colour}`} onClick={() => startEdit(plan.id, "priority", plan.priority)}>
          {plan.priority || <span className="text-white/30">—</span>}
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
            className="bg-[#1e2a38] text-white text-xs rounded px-1 py-0.5 border border-[#6ba3c7]/30 w-32"
          />
        );
      }
      return (
        <div className="cursor-pointer text-xs text-white/70 hover:text-white whitespace-nowrap" onClick={() => startEdit(plan.id, field, toInputDate(plan[field] as string | null))}>
          {plan[field] ? formatDate(plan[field] as string) : <span className="text-white/30">—</span>}
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
            className="bg-[#1e2a38] text-white text-xs rounded px-1 py-0.5 border border-[#6ba3c7]/30 w-full min-w-[160px] resize-none"
          />
        );
      }
      return (
        <div className="max-w-[180px]">
          <div
            className={`cursor-pointer text-xs text-white/70 hover:text-white ${!isExpanded ? "line-clamp-2" : ""}`}
            onClick={() => startEdit(plan.id, "notes", plan.notes)}
          >
            {plan.notes || <span className="text-white/30">—</span>}
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
      if (!plan.driveFolderLink) return <span className="text-white/30 text-xs">—</span>;
      return (
        <a href={plan.driveFolderLink} target="_blank" rel="noopener noreferrer" className="text-[#6ba3c7] hover:text-white transition-colors">
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
          className="bg-[#1e2a38] text-white text-xs rounded px-1 py-0.5 border border-[#6ba3c7]/30 w-full min-w-[100px]"
        />
      );
    }
    return (
      <div className="cursor-pointer text-xs text-white/70 hover:text-white truncate max-w-[150px]" onClick={() => startEdit(plan.id, field as string, val)}>
        {val || <span className="text-white/30">—</span>}
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
    return (
      <div className="text-red-400 text-sm text-center py-8">{error}</div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-white/50">{plans.length} video{plans.length !== 1 ? "s" : ""} planned</p>
        <button
          onClick={() => { setAddForm({ status: statusOptions[0] }); setShowAddModal(true); }}
          className="flex items-center gap-1.5 text-xs font-medium bg-[#6ba3c7] hover:bg-[#5a92b6] text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          <PlusIcon className="w-3.5 h-3.5" /> Add Video
        </button>
      </div>

      {plans.length === 0 ? (
        <div className="text-center py-16 text-white/40 text-sm">
          No videos planned yet. Start building your content calendar by clicking "Add Video" above.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-white/50 text-xs uppercase tracking-wide">
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Title</th>
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Status</th>
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Theme</th>
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Shoot Date</th>
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Publish Date</th>
                {showEditDue && <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Edit Due</th>}
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Priority</th>
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Thumbnail Words</th>
                {showDriveFolder && <th className="text-center px-3 py-2 font-medium whitespace-nowrap">Drive</th>}
                <th className="text-left px-3 py-2 font-medium">Notes</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {plans.map((plan, i) => (
                <tr key={plan.id} className={`border-b border-white/5 hover:bg-white/[0.03] transition-colors ${i % 2 === 0 ? "" : "bg-white/[0.02]"}`}>
                  <td className="px-3 py-2 font-medium">
                    {editingCell?.id === plan.id && editingCell?.field === "title" ? (
                      <input
                        ref={inputRef as any}
                        type="text"
                        value={cellValue}
                        onChange={(e) => setCellValue(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingCell(null); }}
                        className="bg-[#1e2a38] text-white text-xs rounded px-1 py-0.5 border border-[#6ba3c7]/30 w-full min-w-[140px]"
                      />
                    ) : (
                      <div className="cursor-pointer text-xs text-white hover:text-[#6ba3c7] font-medium max-w-[200px] truncate" onClick={() => startEdit(plan.id, "title", plan.title)}>
                        {plan.title}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">{renderCell(plan, "status")}</td>
                  <td className="px-3 py-2">{renderCell(plan, "theme")}</td>
                  <td className="px-3 py-2">{renderCell(plan, "shootDate")}</td>
                  <td className="px-3 py-2">{renderCell(plan, "publishDate")}</td>
                  {showEditDue && <td className="px-3 py-2">{renderCell(plan, "editDueDate")}</td>}
                  <td className="px-3 py-2">{renderCell(plan, "priority")}</td>
                  <td className="px-3 py-2">{renderCell(plan, "thumbnailWords")}</td>
                  {showDriveFolder && <td className="px-3 py-2 text-center">{renderCell(plan, "driveFolderLink")}</td>}
                  <td className="px-3 py-2">{renderCell(plan, "notes")}</td>
                  <td className="px-3 py-2">
                    {confirmDelete === plan.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => deletePlan(plan.id)} className="text-red-400 hover:text-red-300 p-0.5"><CheckIcon className="w-4 h-4" /></button>
                        <button onClick={() => setConfirmDelete(null)} className="text-white/40 hover:text-white p-0.5"><XMarkIcon className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDelete(plan.id)} className="text-white/30 hover:text-red-400 transition-colors p-0.5">
                        <TrashIcon className="w-3.5 h-3.5" />
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
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a2332] rounded-xl border border-white/10 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <h2 className="text-base font-semibold text-white">Add Video</h2>
              <button onClick={() => setShowAddModal(false)} className="text-white/40 hover:text-white">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs text-white/60 mb-1">Title <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={addForm.title ?? ""}
                  onChange={(e) => setAddForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Video title..."
                  className="w-full bg-[#0f1a27] text-white text-sm rounded-lg px-3 py-2 border border-white/10 focus:border-[#6ba3c7]/50 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/60 mb-1">Status</label>
                  <select
                    value={addForm.status ?? statusOptions[0]}
                    onChange={(e) => setAddForm((f) => ({ ...f, status: e.target.value }))}
                    className="w-full bg-[#0f1a27] text-white text-sm rounded-lg px-3 py-2 border border-white/10 focus:border-[#6ba3c7]/50 focus:outline-none"
                  >
                    {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1">Priority</label>
                  <select
                    value={addForm.priority ?? ""}
                    onChange={(e) => setAddForm((f) => ({ ...f, priority: e.target.value }))}
                    className="w-full bg-[#0f1a27] text-white text-sm rounded-lg px-3 py-2 border border-white/10 focus:border-[#6ba3c7]/50 focus:outline-none"
                  >
                    <option value="">None</option>
                    {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">Theme</label>
                <select
                  value={addForm.theme ?? ""}
                  onChange={(e) => setAddForm((f) => ({ ...f, theme: e.target.value }))}
                  className="w-full bg-[#0f1a27] text-white text-sm rounded-lg px-3 py-2 border border-white/10 focus:border-[#6ba3c7]/50 focus:outline-none"
                >
                  <option value="">Select theme...</option>
                  {themes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/60 mb-1">Shoot Date</label>
                  <input
                    type="date"
                    value={addForm.shootDate ?? ""}
                    onChange={(e) => setAddForm((f) => ({ ...f, shootDate: e.target.value }))}
                    className="w-full bg-[#0f1a27] text-white text-sm rounded-lg px-3 py-2 border border-white/10 focus:border-[#6ba3c7]/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1">Publish Date</label>
                  <input
                    type="date"
                    value={addForm.publishDate ?? ""}
                    onChange={(e) => setAddForm((f) => ({ ...f, publishDate: e.target.value }))}
                    className="w-full bg-[#0f1a27] text-white text-sm rounded-lg px-3 py-2 border border-white/10 focus:border-[#6ba3c7]/50 focus:outline-none"
                  />
                </div>
              </div>
              {showEditDue && (
                <div>
                  <label className="block text-xs text-white/60 mb-1">Edit Due Date</label>
                  <input
                    type="date"
                    value={addForm.editDueDate ?? ""}
                    onChange={(e) => setAddForm((f) => ({ ...f, editDueDate: e.target.value }))}
                    className="w-full bg-[#0f1a27] text-white text-sm rounded-lg px-3 py-2 border border-white/10 focus:border-[#6ba3c7]/50 focus:outline-none"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs text-white/60 mb-1">Thumbnail Words</label>
                <input
                  type="text"
                  value={addForm.thumbnailWords ?? ""}
                  onChange={(e) => setAddForm((f) => ({ ...f, thumbnailWords: e.target.value }))}
                  placeholder="Words for your thumbnail..."
                  className="w-full bg-[#0f1a27] text-white text-sm rounded-lg px-3 py-2 border border-white/10 focus:border-[#6ba3c7]/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">Footage Link</label>
                <input
                  type="url"
                  value={addForm.footageLink ?? ""}
                  onChange={(e) => setAddForm((f) => ({ ...f, footageLink: e.target.value }))}
                  placeholder="https://..."
                  className="w-full bg-[#0f1a27] text-white text-sm rounded-lg px-3 py-2 border border-white/10 focus:border-[#6ba3c7]/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">Notes</label>
                <textarea
                  value={addForm.notes ?? ""}
                  onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Any notes..."
                  rows={3}
                  className="w-full bg-[#0f1a27] text-white text-sm rounded-lg px-3 py-2 border border-white/10 focus:border-[#6ba3c7]/50 focus:outline-none resize-none"
                />
              </div>
              {addError && <p className="text-red-400 text-xs">{addError}</p>}
            </div>
            <div className="flex gap-3 p-5 pt-0">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 text-sm text-white/60 border border-white/10 hover:bg-white/5 px-4 py-2.5 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddSubmit}
                disabled={addLoading}
                className="flex-1 text-sm font-medium bg-[#6ba3c7] hover:bg-[#5a92b6] text-white px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {addLoading ? "Adding…" : "Add Video"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

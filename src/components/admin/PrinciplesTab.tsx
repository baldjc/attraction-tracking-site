"use client";

import { useState, useEffect, useRef } from "react";
import MarkdownTextarea from "@/components/MarkdownTextarea";
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  Bars3Icon,
  CheckIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useToast } from "@/components/ToastProvider";
import { Button } from "@/components/ui/Button";

interface Principle {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  colorLight: string;
  sortOrder: number;
  isActive: boolean;
}

const COLOR_PRESETS = [
  { label: "Azure",   value: "bg-[var(--abv-azure-tint)] text-[#1E8FCC] dark:text-[var(--abv-azure)]" },
  { label: "Azure Strong", value: "bg-[var(--abv-azure-tint-strong)] text-[#1E8FCC] dark:text-[var(--abv-azure)]" },
  { label: "Ink",     value: "bg-[var(--abv-bg-warm)] text-[var(--abv-ink)] dark:bg-white/10 dark:text-white" },
  { label: "Purple",  value: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  { label: "Orange",  value: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  { label: "Crimson", value: "bg-[var(--abv-crimson)]/10 text-[var(--abv-crimson)] dark:bg-[var(--abv-crimson)]/20" },
  { label: "Rose",    value: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" },
  { label: "Pink",    value: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300" },
  { label: "Teal",    value: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300" },
  { label: "Amber",   value: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  { label: "Yellow",  value: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300" },
  { label: "Cyan",    value: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300" },
  { label: "Green",   value: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  { label: "Lime",    value: "bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300" },
  { label: "Violet",  value: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" },
  { label: "Fuchsia", value: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300" },
  { label: "Stone",   value: "bg-stone-100 text-stone-700 dark:bg-stone-900/40 dark:text-stone-300" },
  { label: "Gray",    value: "bg-gray-100 text-gray-700 dark:bg-gray-900/40 dark:text-gray-300" },
];

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

interface FormState {
  name: string;
  slug: string;
  description: string;
  colorLight: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  slug: "",
  description: "",
  colorLight: COLOR_PRESETS[0].value,
  isActive: true,
};

export default function PrinciplesTab() {
  const toast = useToast();

  const [principles, setPrinciples] = useState<Principle[]>([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState<"add" | "edit" | null>(null);
  const [editTarget, setEditTarget] = useState<Principle | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState<Principle | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const dragList = useRef<Principle[]>([]);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/principles");
      const data = await res.json();
      setPrinciples(data.principles ?? []);
    } finally {
      setLoading(false);
    }
  }

  function openAdd() {
    setForm(EMPTY_FORM);
    setEditTarget(null);
    setShowModal("add");
  }

  function openEdit(p: Principle) {
    setForm({
      name: p.name,
      slug: p.slug,
      description: p.description ?? "",
      colorLight: p.colorLight,
      isActive: p.isActive,
    });
    setEditTarget(p);
    setShowModal("edit");
  }

  function handleNameChange(name: string) {
    setForm((f) => ({
      ...f,
      name,
      slug: showModal === "add" ? slugify(name) : f.slug,
    }));
  }

  async function handleSave() {
    if (!form.name.trim() || !form.slug.trim()) return;
    setSaving(true);
    try {
      const url = showModal === "edit" && editTarget
        ? `/api/admin/principles/${editTarget.id}`
        : "/api/admin/principles";
      const method = showModal === "edit" ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save");
        return;
      }
      toast.success(showModal === "edit" ? "Principle updated." : "Principle created.");
      setShowModal(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(p: Principle) {
    const res = await fetch(`/api/admin/principles/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !p.isActive }),
    });
    if (res.ok) {
      setPrinciples((prev) =>
        prev.map((x) => x.id === p.id ? { ...x, isActive: !p.isActive } : x)
      );
    }
  }

  async function handleDelete(p: Principle) {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/admin/principles/${p.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "in_use") {
          setDeleteError(data.message);
        } else {
          setDeleteError(data.error ?? "Delete failed");
        }
        return;
      }
      toast.success(`"${p.name}" deleted.`);
      setDeleteConfirm(null);
      await load();
    } finally {
      setDeleting(false);
    }
  }

  async function deactivateAndClose(p: Principle) {
    const res = await fetch(`/api/admin/principles/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    });
    if (res.ok) {
      toast.success(`"${p.name}" deactivated.`);
      setDeleteConfirm(null);
      setDeleteError(null);
      await load();
    }
  }

  function onDragStart(id: string) {
    setDragging(id);
    dragList.current = [...principles];
  }

  function onDragEnter(id: string) {
    if (!dragging || dragging === id) return;
    setDragOver(id);
    const list = [...dragList.current];
    const fromIdx = list.findIndex((p) => p.id === dragging);
    const toIdx = list.findIndex((p) => p.id === id);
    if (fromIdx < 0 || toIdx < 0) return;
    const [item] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, item);
    setPrinciples(list);
  }

  async function onDragEnd() {
    setDragging(null);
    setDragOver(null);
    setReordering(true);
    try {
      const order = principles.map((p, i) => ({ id: p.id, sortOrder: i }));
      await fetch("/api/admin/principles/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      });
      setPrinciples((prev) => prev.map((p, i) => ({ ...p, sortOrder: i })));
    } finally {
      setReordering(false);
    }
  }

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-[var(--abv-text)]/50">
          Manage the principles used to tag lessons, knowledge base entries, and live calls.
        </p>
        <Button onClick={openAdd} variant="primary" size="sm" className="shrink-0">
          <PlusIcon className="w-4 h-4" />
          Add Principle
        </Button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-[var(--abv-text)]/40 text-sm">Loading…</div>
        ) : principles.length === 0 ? (
          <div className="py-16 text-center text-[var(--abv-text)]/40 text-sm">
            No principles yet. Click "Add Principle" to get started.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="w-8 px-3 py-3" />
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--abv-text)]/50 uppercase tracking-wide">Principle</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--abv-text)]/50 uppercase tracking-wide hidden md:table-cell">Slug</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--abv-text)]/50 uppercase tracking-wide hidden lg:table-cell">Description</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--abv-text)]/50 uppercase tracking-wide">Active</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--abv-text)]/50 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {principles.map((p) => (
                <tr
                  key={p.id}
                  draggable
                  onDragStart={() => onDragStart(p.id)}
                  onDragEnter={() => onDragEnter(p.id)}
                  onDragEnd={onDragEnd}
                  onDragOver={(e) => e.preventDefault()}
                  className={`transition-colors ${dragging === p.id ? "opacity-40" : ""} ${dragOver === p.id ? "bg-[var(--abv-dark)]/5" : "hover:bg-gray-50"}`}
                >
                  <td className="px-3 py-3 text-center text-[var(--abv-text)]/25 cursor-grab active:cursor-grabbing">
                    <Bars3Icon className="w-4 h-4" />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${p.colorLight}`}>
                      {p.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--abv-text)]/50 font-mono text-xs hidden md:table-cell">{p.slug}</td>
                  <td className="px-4 py-3 text-[var(--abv-text)]/50 text-xs hidden lg:table-cell max-w-xs truncate">
                    {p.description ?? <span className="italic text-[var(--abv-text)]/25">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleActive(p)}
                      className={`w-8 h-8 rounded-full flex items-center justify-center mx-auto transition-colors ${
                        p.isActive
                          ? "bg-green-100 text-green-600 hover:bg-green-200"
                          : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                      }`}
                      title={p.isActive ? "Deactivate" : "Activate"}
                    >
                      {p.isActive ? <CheckIcon className="w-4 h-4" /> : <XMarkIcon className="w-4 h-4" />}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(p)}
                        className="p-1.5 text-[var(--abv-text)]/40 hover:text-[var(--abv-azure)] hover:bg-[var(--abv-dark)]/10 rounded-md transition-colors"
                        title="Edit"
                      >
                        <PencilIcon className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => { setDeleteConfirm(p); setDeleteError(null); }}
                        className="p-1.5 text-[var(--abv-text)]/40 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                        title="Delete"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {reordering && (
        <p className="text-xs text-[var(--abv-text)]/40 text-center mt-2">Saving order…</p>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-[var(--abv-text)]">
                {showModal === "add" ? "Add Principle" : "Edit Principle"}
              </h2>
              <button onClick={() => setShowModal(null)} className="text-[var(--abv-text)]/40 hover:text-[var(--abv-text)] p-1">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--abv-text)]/60 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  autoFocus
                  type="text"
                  value={form.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Avatar Clarity"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-[var(--abv-azure)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--abv-text)]/60 mb-1">
                  Slug <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  placeholder="e.g. avatar_clarity"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-mono outline-none focus:ring-1 focus:ring-[var(--abv-azure)]"
                />
                <p className="text-[10px] text-[var(--abv-text)]/40 mt-0.5">
                  Auto-generated from name. Used for course lesson tagging.
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--abv-text)]/60 mb-1">Description</label>
                <MarkdownTextarea
                  value={form.description}
                  onChange={(next) => setForm((f) => ({ ...f, description: next }))}
                  placeholder="Optional short description…"
                  rows={3}
                  ariaLabel="Description"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--abv-text)]/60 mb-2">Color</label>
                <div className="grid grid-cols-6 gap-2">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c.value}
                      title={c.label}
                      onClick={() => setForm((f) => ({ ...f, colorLight: c.value }))}
                      className={`h-8 rounded-lg border-2 transition-all ${c.value.split(" ").slice(0, 2).join(" ")} ${
                        form.colorLight === c.value
                          ? "border-[var(--abv-text)] scale-110 shadow-md"
                          : "border-transparent"
                      }`}
                    />
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-[var(--abv-text)]/50">Preview:</span>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${form.colorLight}`}>
                    {form.name || "Principle Name"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="principleIsActive"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  className="rounded"
                />
                <label htmlFor="principleIsActive" className="text-sm text-[var(--abv-text)]">Active</label>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button onClick={() => setShowModal(null)} variant="outline" size="sm" fullWidth>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !form.name.trim() || !form.slug.trim()}
                variant="primary"
                size="sm"
                fullWidth
              >
                {saving ? "Saving…" : showModal === "add" ? "Create" : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-[var(--abv-text)]">Delete Principle</h2>
              <button
                onClick={() => { setDeleteConfirm(null); setDeleteError(null); }}
                className="text-[var(--abv-text)]/40 hover:text-[var(--abv-text)] p-1"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {deleteError ? (
              <div className="space-y-3">
                <div className="bg-[var(--abv-crimson)]/5 border border-[var(--abv-crimson)]/20 rounded-lg p-3">
                  <p className="text-sm text-[var(--abv-crimson)]">{deleteError}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => { setDeleteConfirm(null); setDeleteError(null); }}
                    variant="outline"
                    size="sm"
                    fullWidth
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => deactivateAndClose(deleteConfirm)}
                    variant="accent"
                    size="sm"
                    fullWidth
                  >
                    Deactivate Instead
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm text-[var(--abv-text)]/70">
                  Are you sure you want to delete <strong>"{deleteConfirm.name}"</strong>? This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={() => { setDeleteConfirm(null); setDeleteError(null); }}
                    variant="outline"
                    size="sm"
                    fullWidth
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => handleDelete(deleteConfirm)}
                    disabled={deleting}
                    variant="danger"
                    size="sm"
                    fullWidth
                  >
                    {deleting ? "Deleting…" : "Delete"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

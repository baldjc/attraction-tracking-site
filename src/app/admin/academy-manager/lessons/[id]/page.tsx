"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeftIcon,
  TrashIcon,
  PlusIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  PencilSquareIcon,
  XMarkIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { PRINCIPLE_NAMES, PRINCIPLE_SLUGS, PRINCIPLE_COLORS } from "@/lib/academy-constants";

const AI_TOOLS = [
  { value: "", label: "None" },
  { value: "/member/ai-tools/avatar-architect", label: "Avatar Architect" },
  { value: "/member/ai-tools/title-creator", label: "Title Creator" },
  { value: "/member/ai-tools/title-analyzer", label: "Title & Thumbnail Analyzer" },
  { value: "/member/ai-tools/arc-script-builder", label: "ARC Script Builder" },
];

const AI_TOOL_LABELS: Record<string, string> = {
  "/member/ai-tools/avatar-architect": "Build Your Avatar",
  "/member/ai-tools/title-creator": "Create Titles",
  "/member/ai-tools/title-analyzer": "Analyze Title & Thumbnail",
  "/member/ai-tools/arc-script-builder": "Build ARC Script",
};

const FIELD_TYPES = [
  { value: "short_text", label: "Short Text" },
  { value: "long_text", label: "Long Text" },
  { value: "table", label: "Table" },
  { value: "checklist", label: "Checklist" },
];

function generateSlug(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

interface WorkbookField {
  id: string;
  fieldType: string;
  label: string;
  placeholderText: string | null;
  sortOrder: number;
  config: any;
}

interface NewField {
  fieldType: string;
  label: string;
  placeholderText: string;
  config: any;
}

function LongTextConfig({ config, onChange }: { config: any; onChange: (c: any) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Rows (default 4)</label>
      <input
        type="number"
        min={2}
        max={20}
        value={config?.rows ?? 4}
        onChange={(e) => onChange({ ...config, rows: parseInt(e.target.value) || 4 })}
        className="w-20 px-2 py-1 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-[#6ba3c7] outline-none"
      />
    </div>
  );
}

function TableConfig({ config, onChange }: { config: any; onChange: (c: any) => void }) {
  const columns: { key: string; label: string; type: string }[] = config?.columns ?? [];
  const rowCount: number = config?.rowCount ?? 3;

  function addColumn() {
    const key = `col_${Date.now()}`;
    onChange({ ...config, columns: [...columns, { key, label: "", type: "text" }] });
  }

  function updateColumn(i: number, field: string, value: string) {
    const next = columns.map((c, idx) => idx === i ? { ...c, [field]: value } : c);
    onChange({ ...config, columns: next });
  }

  function removeColumn(i: number) {
    onChange({ ...config, columns: columns.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Row Count</label>
        <input
          type="number"
          min={1}
          max={30}
          value={rowCount}
          onChange={(e) => onChange({ ...config, rowCount: parseInt(e.target.value) || 3 })}
          className="w-20 px-2 py-1 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-[#6ba3c7] outline-none"
        />
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-[#2f3437]/60">Columns</label>
          <button onClick={addColumn} className="flex items-center gap-1 text-xs text-[#6ba3c7] hover:text-[#5490b5]">
            <PlusIcon className="w-3 h-3" /> Add
          </button>
        </div>
        <div className="space-y-2">
          {columns.map((col, i) => (
            <div key={col.key} className="flex items-center gap-2">
              <input
                type="text"
                value={col.label}
                onChange={(e) => updateColumn(i, "label", e.target.value)}
                placeholder="Label"
                className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-[#6ba3c7] outline-none"
              />
              <select
                value={col.type}
                onChange={(e) => updateColumn(i, "type", e.target.value)}
                className="px-2 py-1 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-[#6ba3c7] outline-none"
              >
                <option value="text">Text</option>
                <option value="checkbox">Checkbox</option>
              </select>
              <button onClick={() => removeColumn(i)} className="text-[#e63946]/60 hover:text-[#e63946]">
                <XMarkIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChecklistConfig({ config, onChange }: { config: any; onChange: (c: any) => void }) {
  const items: string[] = config?.items ?? [];

  function addItem() {
    onChange({ ...config, items: [...items, ""] });
  }

  function updateItem(i: number, value: string) {
    const next = items.map((item, idx) => idx === i ? value : item);
    onChange({ ...config, items: next });
  }

  function removeItem(i: number) {
    onChange({ ...config, items: items.filter((_, idx) => idx !== i) });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-[#2f3437]/60">Items</label>
        <button onClick={addItem} className="flex items-center gap-1 text-xs text-[#6ba3c7] hover:text-[#5490b5]">
          <PlusIcon className="w-3 h-3" /> Add Item
        </button>
      </div>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-[#2f3437]/30 w-4 shrink-0">{i + 1}.</span>
            <input
              type="text"
              value={item}
              onChange={(e) => updateItem(i, e.target.value)}
              placeholder="Item text…"
              className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-[#6ba3c7] outline-none"
            />
            <button onClick={() => removeItem(i)} className="text-[#e63946]/60 hover:text-[#e63946]">
              <XMarkIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-xs text-[#2f3437]/30 italic">No items yet. Click "Add Item".</p>
        )}
      </div>
    </div>
  );
}

function defaultConfig(fieldType: string) {
  if (fieldType === "long_text") return { rows: 4 };
  if (fieldType === "table") return { columns: [], rowCount: 3 };
  if (fieldType === "checklist") return { items: [] };
  return {};
}

export default function EditLessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [form, setForm] = useState({
    sectionId: "",
    title: "",
    slug: "",
    youtubeUrl: "",
    description: "",
    keyTakeaways: "",
    actionItems: "",
    principleTags: [] as string[],
    aiToolLink: "",
    aiToolLabel: "",
    published: false,
  });
  const [slugEdited, setSlugEdited] = useState(false);
  const [sectionTitle, setSectionTitle] = useState("");

  const [fields, setFields] = useState<WorkbookField[]>([]);
  const [addingField, setAddingField] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [newField, setNewField] = useState<NewField>({ fieldType: "short_text", label: "", placeholderText: "", config: {} });
  const [savingField, setSavingField] = useState(false);
  const [confirmDeleteFieldId, setConfirmDeleteFieldId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/academy/lessons/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.lesson) {
          const l = data.lesson;
          setForm({
            sectionId: l.sectionId ?? l.section?.id ?? "",
            title: l.title ?? "",
            slug: l.slug ?? "",
            youtubeUrl: l.youtubeUrl ?? "",
            description: l.description ?? "",
            keyTakeaways: l.keyTakeaways ?? "",
            actionItems: l.actionItems ?? "",
            principleTags: Array.isArray(l.principleTags) ? l.principleTags : [],
            aiToolLink: l.aiToolLink ?? "",
            aiToolLabel: l.aiToolLabel ?? "",
            published: l.published ?? false,
          });
          setSectionTitle(l.section?.title ?? "");
          setSlugEdited(true);
          setFields(data.lesson.workbookFields ?? []);
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  function handleTitleChange(title: string) {
    setForm((f) => ({ ...f, title, slug: slugEdited ? f.slug : generateSlug(title) }));
  }

  function togglePrincipleTag(slug: string) {
    setForm((f) => ({
      ...f,
      principleTags: f.principleTags.includes(slug)
        ? f.principleTags.filter((t) => t !== slug)
        : [...f.principleTags, slug],
    }));
  }

  function handleAiToolLinkChange(value: string) {
    setForm((f) => ({
      ...f,
      aiToolLink: value,
      aiToolLabel: value ? (AI_TOOL_LABELS[value] ?? f.aiToolLabel) : "",
    }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/academy/lessons/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
    else setError("Failed to save. Please try again.");
  }

  async function handleDelete(force = false) {
    setDeleting(true);
    setDeleteError(null);
    const url = force ? `/api/admin/academy/lessons/${id}?force=true` : `/api/admin/academy/lessons/${id}`;
    const res = await fetch(url, { method: "DELETE" });
    const data = await res.json();
    setDeleting(false);
    if (res.ok) { router.push("/admin/academy-manager"); return; }
    if (res.status === 409 && data.warning) {
      setDeleteError(data.message + " Click force delete to proceed.");
      setConfirmDelete(true);
    } else {
      setDeleteError(data.error ?? "Failed to delete.");
    }
  }

  function startAddField() {
    setNewField({ fieldType: "short_text", label: "", placeholderText: "", config: {} });
    setAddingField(true);
    setEditingFieldId(null);
  }

  function startEditField(field: WorkbookField) {
    setNewField({ fieldType: field.fieldType, label: field.label, placeholderText: field.placeholderText ?? "", config: field.config ?? {} });
    setEditingFieldId(field.id);
    setAddingField(false);
  }

  async function saveField() {
    if (!newField.label.trim()) return;
    setSavingField(true);

    if (editingFieldId) {
      const res = await fetch(`/api/admin/academy/workbook-fields/${editingFieldId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fieldType: newField.fieldType,
          label: newField.label,
          placeholderText: newField.placeholderText || null,
          config: newField.config,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setFields((prev) => prev.map((f) => f.id === editingFieldId ? data.field : f));
        setEditingFieldId(null);
      }
    } else {
      const res = await fetch(`/api/admin/academy/lessons/${id}/workbook-fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fieldType: newField.fieldType,
          label: newField.label,
          placeholderText: newField.placeholderText || null,
          sortOrder: fields.length + 1,
          config: newField.config,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setFields((prev) => [...prev, data.field]);
        setAddingField(false);
      }
    }
    setSavingField(false);
  }

  async function deleteField(fieldId: string, force = false) {
    const url = force ? `/api/admin/academy/workbook-fields/${fieldId}?force=true` : `/api/admin/academy/workbook-fields/${fieldId}`;
    const res = await fetch(url, { method: "DELETE" });
    const data = await res.json();
    if (res.ok) {
      setFields((prev) => prev.filter((f) => f.id !== fieldId));
      setConfirmDeleteFieldId(null);
    } else if (res.status === 409 && data.warning) {
      if (window.confirm(data.message + " Delete anyway?")) {
        deleteField(fieldId, true);
      }
    }
  }

  async function moveField(idx: number, dir: "up" | "down") {
    const next = [...fields];
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    const updated = next.map((f, i) => ({ ...f, sortOrder: i + 1 }));
    setFields(updated);
    await fetch("/api/admin/academy/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lessons: [], sections: [], fields: updated.map((f) => ({ id: f.id, sortOrder: f.sortOrder })) }),
    });
    await Promise.all(updated.map((f) =>
      fetch(`/api/admin/academy/workbook-fields/${f.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: f.sortOrder }),
      })
    ));
  }

  if (loading) {
    return (
      <div className="max-w-3xl animate-pulse">
        <div className="h-6 bg-gray-100 rounded w-1/3 mb-6" />
        <div className="space-y-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-lg" />)}
        </div>
      </div>
    );
  }

  const inlineFormContent = (
    <div className="bg-[#f7f6f3] rounded-lg border border-gray-200 p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div>
          <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Field Type</label>
          <select
            value={newField.fieldType}
            onChange={(e) => setNewField((f) => ({ ...f, fieldType: e.target.value, config: defaultConfig(e.target.value) }))}
            className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#6ba3c7] outline-none bg-white"
          >
            {FIELD_TYPES.map((ft) => (
              <option key={ft.value} value={ft.value}>{ft.label}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Label</label>
          <input
            type="text"
            value={newField.label}
            onChange={(e) => setNewField((f) => ({ ...f, label: e.target.value }))}
            placeholder="Field label…"
            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#6ba3c7] outline-none bg-white"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Placeholder Text (optional)</label>
        <input
          type="text"
          value={newField.placeholderText}
          onChange={(e) => setNewField((f) => ({ ...f, placeholderText: e.target.value }))}
          placeholder="Hint text shown to members…"
          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#6ba3c7] outline-none bg-white"
        />
      </div>

      {newField.fieldType === "long_text" && (
        <LongTextConfig config={newField.config} onChange={(c) => setNewField((f) => ({ ...f, config: c }))} />
      )}
      {newField.fieldType === "table" && (
        <TableConfig config={newField.config} onChange={(c) => setNewField((f) => ({ ...f, config: c }))} />
      )}
      {newField.fieldType === "checklist" && (
        <ChecklistConfig config={newField.config} onChange={(c) => setNewField((f) => ({ ...f, config: c }))} />
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={saveField}
          disabled={savingField || !newField.label.trim()}
          className="px-4 py-1.5 bg-[#6ba3c7] hover:bg-[#5490b5] text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
        >
          {savingField ? "Saving…" : editingFieldId ? "Update Field" : "Add Field"}
        </button>
        <button
          onClick={() => { setAddingField(false); setEditingFieldId(null); }}
          className="px-4 py-1.5 text-sm text-[#2f3437]/60 hover:text-[#2f3437] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/academy-manager" className="flex items-center gap-1.5 text-sm text-[#2f3437]/50 hover:text-[#2f3437] transition-colors">
          <ArrowLeftIcon className="w-4 h-4" />
          Academy Manager
        </Link>
        <span className="text-[#2f3437]/30">/</span>
        {sectionTitle && (
          <>
            <span className="text-sm text-[#2f3437]/50 truncate max-w-[150px]">{sectionTitle}</span>
            <span className="text-[#2f3437]/30">/</span>
          </>
        )}
        <span className="text-sm text-[#2f3437] font-medium truncate">Edit Lesson</span>
      </div>

      <h1 className="text-xl font-bold text-[#2f3437] mb-6">{form.title || "Edit Lesson"}</h1>

      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
      {deleteError && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{deleteError}</div>}

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-5 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[#2f3437] mb-1.5">Title</label>
            <input type="text" value={form.title} onChange={(e) => handleTitleChange(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#6ba3c7] focus:border-transparent outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#2f3437] mb-1.5">Slug</label>
            <input type="text" value={form.slug}
              onChange={(e) => { setForm((f) => ({ ...f, slug: e.target.value })); setSlugEdited(true); }}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#6ba3c7] focus:border-transparent outline-none font-mono" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[#2f3437] mb-1.5">YouTube URL</label>
          <input type="url" value={form.youtubeUrl} onChange={(e) => setForm((f) => ({ ...f, youtubeUrl: e.target.value }))}
            placeholder="https://youtu.be/…"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#6ba3c7] focus:border-transparent outline-none" />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#2f3437] mb-1.5">Description</label>
          <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3} placeholder="Brief overview of this lesson…"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#6ba3c7] focus:border-transparent outline-none resize-none" />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#2f3437] mb-1.5">Key Takeaways <span className="font-normal text-[#2f3437]/40">(markdown)</span></label>
          <textarea value={form.keyTakeaways} onChange={(e) => setForm((f) => ({ ...f, keyTakeaways: e.target.value }))}
            rows={4} placeholder="- Takeaway one&#10;- Takeaway two"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#6ba3c7] focus:border-transparent outline-none font-mono resize-none" />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#2f3437] mb-1.5">Action Items <span className="font-normal text-[#2f3437]/40">(markdown)</span></label>
          <textarea value={form.actionItems} onChange={(e) => setForm((f) => ({ ...f, actionItems: e.target.value }))}
            rows={4} placeholder="- Action one&#10;- Action two"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#6ba3c7] focus:border-transparent outline-none font-mono resize-none" />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#2f3437] mb-2">Principle Tags</label>
          <div className="flex flex-wrap gap-2">
            {PRINCIPLE_SLUGS.map((slug) => {
              const selected = form.principleTags.includes(slug);
              return (
                <button
                  key={slug}
                  type="button"
                  onClick={() => togglePrincipleTag(slug)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all border ${
                    selected
                      ? `${PRINCIPLE_COLORS[slug]} border-transparent`
                      : "bg-white border-gray-200 text-[#2f3437]/50 hover:border-gray-300"
                  }`}
                >
                  {selected && "✓ "}{PRINCIPLE_NAMES[slug]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[#2f3437] mb-1.5">AI Tool Link</label>
            <select
              value={form.aiToolLink}
              onChange={(e) => handleAiToolLinkChange(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#6ba3c7] focus:border-transparent outline-none bg-white"
            >
              {AI_TOOLS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#2f3437] mb-1.5">AI Tool Label</label>
            <input type="text" value={form.aiToolLabel}
              onChange={(e) => setForm((f) => ({ ...f, aiToolLabel: e.target.value }))}
              placeholder="e.g. Build Your Avatar"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#6ba3c7] focus:border-transparent outline-none" />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1 border-t border-gray-100">
          <button
            onClick={() => setForm((f) => ({ ...f, published: !f.published }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.published ? "bg-[#6ba3c7]" : "bg-gray-200"}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.published ? "translate-x-6" : "translate-x-1"}`} />
          </button>
          <span className="text-sm font-medium text-[#2f3437]">
            {form.published ? "Published" : "Draft"}
          </span>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2.5 bg-[#6ba3c7] hover:bg-[#5490b5] text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors">
            {saving ? "Saving…" : saved ? "✓ Saved" : "Save Changes"}
          </button>
          <Link href="/admin/academy-manager"
            className="px-5 py-2.5 border border-gray-200 text-[#2f3437] text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
            Cancel
          </Link>
          <div className="flex-1" />
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-[#e63946] hover:bg-red-50 rounded-lg transition-colors">
              <TrashIcon className="w-4 h-4" />
              Delete
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#e63946] font-medium">Delete this lesson?</span>
              <button onClick={() => handleDelete(false)} disabled={deleting}
                className="px-3 py-1.5 bg-[#e63946] text-white text-xs font-semibold rounded-lg disabled:opacity-50 hover:bg-red-700 transition-colors">
                {deleting ? "…" : "Delete"}
              </button>
              <button onClick={() => handleDelete(true)} disabled={deleting}
                className="px-3 py-1.5 bg-red-800 text-white text-xs font-semibold rounded-lg disabled:opacity-50 hover:bg-red-900 transition-colors">
                Force Delete
              </button>
              <button onClick={() => { setConfirmDelete(false); setDeleteError(null); }}
                className="px-3 py-1.5 text-xs text-[#2f3437]/60 hover:text-[#2f3437] transition-colors">
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-[#2f3437]">Workbook Fields</h2>
          <span className="text-xs text-[#2f3437]/40">{fields.length} field{fields.length !== 1 ? "s" : ""}</span>
        </div>

        <div className="space-y-2 mb-3">
          {fields.map((field, idx) => (
            <div key={field.id}>
              {editingFieldId === field.id ? (
                inlineFormContent
              ) : (
                <div className="flex items-center gap-3 bg-white rounded-lg border border-gray-200 px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                    field.fieldType === "short_text" ? "bg-blue-100 text-blue-700" :
                    field.fieldType === "long_text" ? "bg-purple-100 text-purple-700" :
                    field.fieldType === "table" ? "bg-orange-100 text-orange-700" :
                    "bg-green-100 text-green-700"
                  }`}>
                    {FIELD_TYPES.find((t) => t.value === field.fieldType)?.label ?? field.fieldType}
                  </span>
                  <span className="flex-1 text-sm text-[#2f3437] truncate">{field.label}</span>

                  <div className="flex items-center gap-0.5 shrink-0">
                    <button onClick={() => moveField(idx, "up")} disabled={idx === 0}
                      className="p-1 text-[#2f3437]/30 hover:text-[#2f3437] disabled:opacity-20 disabled:cursor-not-allowed">
                      <ArrowUpIcon className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => moveField(idx, "down")} disabled={idx === fields.length - 1}
                      className="p-1 text-[#2f3437]/30 hover:text-[#2f3437] disabled:opacity-20 disabled:cursor-not-allowed">
                      <ArrowDownIcon className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => startEditField(field)}
                      className="p-1.5 text-[#2f3437]/50 hover:text-[#6ba3c7] hover:bg-[#6ba3c7]/10 rounded-lg transition-colors">
                      <PencilSquareIcon className="w-3.5 h-3.5" />
                    </button>
                    {confirmDeleteFieldId === field.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => deleteField(field.id)}
                          className="text-xs text-white bg-[#e63946] px-2 py-1 rounded font-semibold hover:bg-red-700">
                          Delete
                        </button>
                        <button onClick={() => setConfirmDeleteFieldId(null)}
                          className="text-xs text-[#2f3437]/60 px-1 py-1 hover:text-[#2f3437]">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDeleteFieldId(field.id)}
                        className="p-1.5 text-[#2f3437]/40 hover:text-[#e63946] hover:bg-red-50 rounded-lg transition-colors">
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {fields.length === 0 && !addingField && (
            <div className="py-6 border-2 border-dashed border-gray-100 rounded-lg text-center text-sm text-[#2f3437]/30 italic">
              No workbook fields yet. Add your first field below.
            </div>
          )}
        </div>

        {addingField ? (
          inlineFormContent
        ) : (
          <button
            onClick={startAddField}
            className="flex items-center gap-2 text-sm font-medium text-[#6ba3c7] hover:text-[#5490b5] transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Add Field
          </button>
        )}
      </div>
    </div>
  );
}

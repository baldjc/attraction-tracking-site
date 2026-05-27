"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon, TrashIcon } from "@heroicons/react/24/outline";

function generateSlug(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function EditSectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    slug: "",
    description: "",
    sortOrder: 1,
    published: false,
  });
  const [slugEdited, setSlugEdited] = useState(false);

  useEffect(() => {
    fetch("/api/admin/academy/sections")
      .then((r) => r.json())
      .then((data) => {
        const section = (data.sections ?? []).find((s: any) => s.id === id);
        if (section) {
          setForm({
            title: section.title ?? "",
            slug: section.slug ?? "",
            description: section.description ?? "",
            sortOrder: section.sortOrder ?? 1,
            published: section.published ?? false,
          });
          setSlugEdited(true);
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  function handleTitleChange(title: string) {
    setForm((f) => ({
      ...f,
      title,
      slug: slugEdited ? f.slug : generateSlug(title),
    }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/academy/sections/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      setError("Failed to save. Please try again.");
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    const res = await fetch(`/api/admin/academy/sections/${id}`, { method: "DELETE" });
    const data = await res.json();
    setDeleting(false);
    if (res.ok) {
      router.push("/admin/academy-manager");
    } else {
      setDeleteError(data.error ?? "Failed to delete.");
      setConfirmDelete(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl animate-pulse">
        <div className="h-6 bg-gray-100 rounded w-1/3 mb-6" />
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/academy-manager" className="flex items-center gap-1.5 text-sm text-[var(--abv-text)]/50 hover:text-[var(--abv-text)] transition-colors">
          <ArrowLeftIcon className="w-4 h-4" />
          Academy Manager
        </Link>
        <span className="text-[var(--abv-text)]/30">/</span>
        <span className="text-sm text-[var(--abv-text)] font-medium">Edit Section</span>
      </div>

      <h1 className="text-xl font-bold text-[var(--abv-text)] mb-6">Edit Section</h1>

      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
      {deleteError && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{deleteError}</div>}

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-[var(--abv-text)] mb-1.5">Title</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-[var(--abv-azure)] focus:border-transparent outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--abv-text)] mb-1.5">Slug</label>
          <input
            type="text"
            value={form.slug}
            onChange={(e) => { setForm((f) => ({ ...f, slug: e.target.value })); setSlugEdited(true); }}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-[var(--abv-azure)] focus:border-transparent outline-none font-mono"
          />
          <p className="text-xs text-[var(--abv-text)]/40 mt-1">Used in URLs — letters, numbers, hyphens only.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--abv-text)] mb-1.5">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-[var(--abv-azure)] focus:border-transparent outline-none resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--abv-text)] mb-1.5">Sort Order</label>
          <input
            type="number"
            value={form.sortOrder}
            onChange={(e) => setForm((f) => ({ ...f, sortOrder: parseInt(e.target.value) || 1 }))}
            className="w-24 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-[var(--abv-azure)] focus:border-transparent outline-none"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setForm((f) => ({ ...f, published: !f.published }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.published ? "bg-[var(--abv-dark)]" : "bg-gray-200"}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.published ? "translate-x-6" : "translate-x-1"}`} />
          </button>
          <span className="text-sm font-medium text-[var(--abv-text)]">
            {form.published ? "Published (visible to members)" : "Draft (hidden from members)"}
          </span>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 $1var(--abv-dark)$2 hover:bg-black/85 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : saved ? "✓ Saved" : "Save Changes"}
          </button>
          <Link href="/admin/academy-manager" className="px-5 py-2.5 border border-gray-200 text-[var(--abv-text)] text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
            Cancel
          </Link>
          <div className="flex-1" />
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-[var(--abv-crimson)] hover:bg-red-50 rounded-lg transition-colors"
            >
              <TrashIcon className="w-4 h-4" />
              Delete Section
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--abv-crimson)] font-medium">Are you sure?</span>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-3 py-1.5 bg-[var(--abv-crimson)] text-white text-xs font-semibold rounded-lg disabled:opacity-50 hover:bg-red-700 transition-colors"
              >
                {deleting ? "Deleting…" : "Yes, Delete"}
              </button>
              <button onClick={() => { setConfirmDelete(false); setDeleteError(null); }} className="px-3 py-1.5 text-xs text-[var(--abv-text)]/60 hover:text-[var(--abv-text)] transition-colors">
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

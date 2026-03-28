"use client";

import { useState, useEffect, useCallback } from "react";
import {
  UserGroupIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CheckCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

// ── Types ─────────────────────────────────────────────────────

interface Package {
  id: string;
  name: string;
  price: string;
  priceNote: string | null;
  badge: string | null;
  subtitle: string | null;
  features: string[];
  highlightFeatures: string[] | null;
  stripeUrl: string | null;
  sortOrder: number;
  published: boolean;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string;
  accentColour: string;
  sortOrder: number;
  published: boolean;
  packages: Package[];
}

const ACCENT_OPTIONS = ["blue", "slate", "purple", "gray", "amber", "green", "red"];
const ICON_OPTIONS = [
  "FilmIcon",
  "RocketLaunchIcon",
  "SparklesIcon",
  "PuzzlePieceIcon",
  "UserGroupIcon",
  "AcademicCapIcon",
  "WrenchScrewdriverIcon",
  "CurrencyDollarIcon",
  "StarIcon",
  "BoltIcon",
];

// ── Helpers ───────────────────────────────────────────────────

function featuresToText(arr: string[]) {
  return arr.join("\n");
}

function textToFeatures(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

// ── Category Modal ────────────────────────────────────────────

interface CategoryFormState {
  name: string;
  slug: string;
  description: string;
  icon: string;
  accentColour: string;
  published: boolean;
}

function CategoryModal({
  category,
  onClose,
  onSave,
}: {
  category: Category | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [form, setForm] = useState<CategoryFormState>({
    name: category?.name ?? "",
    slug: category?.slug ?? "",
    description: category?.description ?? "",
    icon: category?.icon ?? "PuzzlePieceIcon",
    accentColour: category?.accentColour ?? "blue",
    published: category?.published ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof CategoryFormState>(key: K, val: CategoryFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSave() {
    if (!form.name.trim()) { setError("Name is required."); return; }
    setSaving(true);
    setError("");
    const method = category ? "PUT" : "POST";
    const url = category
      ? `/api/admin/hire/categories/${category.id}`
      : `/api/admin/hire/categories`;
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        slug: form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        description: form.description || null,
        icon: form.icon,
        accentColour: form.accentColour,
        published: form.published,
      }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Failed to save.");
    } else {
      onSave();
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-[#1a2433] rounded-2xl shadow-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-[#2f3437] dark:text-white">
            {category ? "Edit Category" : "New Category"}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#f0f0f0] dark:hover:bg-white/10 transition-colors">
            <XMarkIcon className="w-5 h-5 text-[#2f3437]/50 dark:text-white/40" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#2f3437]/60 dark:text-white/40 mb-1">Name *</label>
            <input
              className="w-full border border-[#eaeaea] dark:border-white/10 rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#111c2a] text-[#2f3437] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/50"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Attraction Editing"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#2f3437]/60 dark:text-white/40 mb-1">Slug</label>
            <input
              className="w-full border border-[#eaeaea] dark:border-white/10 rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#111c2a] text-[#2f3437] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/50"
              value={form.slug}
              onChange={(e) => set("slug", e.target.value)}
              placeholder="auto-generated from name"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#2f3437]/60 dark:text-white/40 mb-1">Description</label>
            <textarea
              rows={2}
              className="w-full border border-[#eaeaea] dark:border-white/10 rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#111c2a] text-[#2f3437] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/50 resize-none"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#2f3437]/60 dark:text-white/40 mb-1">Icon</label>
              <select
                className="w-full border border-[#eaeaea] dark:border-white/10 rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#111c2a] text-[#2f3437] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/50"
                value={form.icon}
                onChange={(e) => set("icon", e.target.value)}
              >
                {ICON_OPTIONS.map((i) => (
                  <option key={i} value={i}>{i.replace("Icon", "")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#2f3437]/60 dark:text-white/40 mb-1">Accent Colour</label>
              <select
                className="w-full border border-[#eaeaea] dark:border-white/10 rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#111c2a] text-[#2f3437] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/50"
                value={form.accentColour}
                onChange={(e) => set("accentColour", e.target.value)}
              >
                {ACCENT_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="cat-published"
              type="checkbox"
              checked={form.published}
              onChange={(e) => set("published", e.target.checked)}
              className="w-4 h-4 rounded accent-[#6ba3c7]"
            />
            <label htmlFor="cat-published" className="text-sm text-[#2f3437]/70 dark:text-white/60 select-none">Published</label>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 border border-[#eaeaea] dark:border-white/10 rounded-lg py-2 text-sm font-semibold text-[#2f3437]/60 dark:text-white/40 hover:bg-[#f7f7f7] dark:hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-[#6ba3c7] hover:bg-[#5490b5] text-white rounded-lg py-2 text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Category"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Package Modal ─────────────────────────────────────────────

interface PackageFormState {
  name: string;
  price: string;
  priceNote: string;
  badge: string;
  subtitle: string;
  features: string;
  highlightFeatures: string;
  stripeUrl: string;
  published: boolean;
}

function PackageModal({
  pkg,
  categoryId,
  onClose,
  onSave,
}: {
  pkg: Package | null;
  categoryId: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const [form, setForm] = useState<PackageFormState>({
    name: pkg?.name ?? "",
    price: pkg?.price ?? "",
    priceNote: pkg?.priceNote ?? "",
    badge: pkg?.badge ?? "",
    subtitle: pkg?.subtitle ?? "",
    features: pkg ? featuresToText(pkg.features) : "",
    highlightFeatures: pkg?.highlightFeatures ? featuresToText(pkg.highlightFeatures) : "",
    stripeUrl: pkg?.stripeUrl ?? "",
    published: pkg?.published ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof PackageFormState>(key: K, val: PackageFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSave() {
    if (!form.name.trim()) { setError("Name is required."); return; }
    if (!form.price.trim()) { setError("Price is required."); return; }
    setSaving(true);
    setError("");
    const method = pkg ? "PUT" : "POST";
    const url = pkg
      ? `/api/admin/hire/packages/${pkg.id}`
      : `/api/admin/hire/packages`;
    const body: Record<string, unknown> = {
      categoryId,
      name: form.name,
      price: form.price,
      priceNote: form.priceNote || null,
      badge: form.badge || null,
      subtitle: form.subtitle || null,
      features: textToFeatures(form.features),
      highlightFeatures: textToFeatures(form.highlightFeatures),
      stripeUrl: form.stripeUrl || null,
      published: form.published,
    };
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Failed to save.");
    } else {
      onSave();
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
      <div className="bg-white dark:bg-[#1a2433] rounded-2xl shadow-2xl w-full max-w-lg p-6 my-8">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-[#2f3437] dark:text-white">
            {pkg ? "Edit Package" : "New Package"}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#f0f0f0] dark:hover:bg-white/10 transition-colors">
            <XMarkIcon className="w-5 h-5 text-[#2f3437]/50 dark:text-white/40" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#2f3437]/60 dark:text-white/40 mb-1">Package Name *</label>
            <input
              className="w-full border border-[#eaeaea] dark:border-white/10 rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#111c2a] text-[#2f3437] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/50"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. 2 Video Package"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#2f3437]/60 dark:text-white/40 mb-1">Price *</label>
              <input
                className="w-full border border-[#eaeaea] dark:border-white/10 rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#111c2a] text-[#2f3437] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/50"
                value={form.price}
                onChange={(e) => set("price", e.target.value)}
                placeholder="e.g. $500/mo"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#2f3437]/60 dark:text-white/40 mb-1">Price Note</label>
              <input
                className="w-full border border-[#eaeaea] dark:border-white/10 rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#111c2a] text-[#2f3437] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/50"
                value={form.priceNote}
                onChange={(e) => set("priceNote", e.target.value)}
                placeholder="e.g. USD"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#2f3437]/60 dark:text-white/40 mb-1">Badge</label>
              <input
                className="w-full border border-[#eaeaea] dark:border-white/10 rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#111c2a] text-[#2f3437] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/50"
                value={form.badge}
                onChange={(e) => set("badge", e.target.value)}
                placeholder="e.g. Most Popular"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#2f3437]/60 dark:text-white/40 mb-1">Subtitle</label>
              <input
                className="w-full border border-[#eaeaea] dark:border-white/10 rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#111c2a] text-[#2f3437] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/50"
                value={form.subtitle}
                onChange={(e) => set("subtitle", e.target.value)}
                placeholder="e.g. 2 videos/mo"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#2f3437]/60 dark:text-white/40 mb-1">
              Features <span className="font-normal">(one per line)</span>
            </label>
            <textarea
              rows={5}
              className="w-full border border-[#eaeaea] dark:border-white/10 rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#111c2a] text-[#2f3437] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/50 resize-none font-mono"
              value={form.features}
              onChange={(e) => set("features", e.target.value)}
              placeholder={"Professional editing by ABV team\nMusic and asset licensing\n..."}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#2f3437]/60 dark:text-white/40 mb-1">
              Highlight Features <span className="font-normal">(one per line, optional)</span>
            </label>
            <textarea
              rows={3}
              className="w-full border border-[#eaeaea] dark:border-white/10 rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#111c2a] text-[#2f3437] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/50 resize-none font-mono"
              value={form.highlightFeatures}
              onChange={(e) => set("highlightFeatures", e.target.value)}
              placeholder={"2 long-form video edits per month\n1 full funnel built at launch"}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#2f3437]/60 dark:text-white/40 mb-1">Stripe URL <span className="font-normal">(leave blank for "Message Us" CTA)</span></label>
            <input
              className="w-full border border-[#eaeaea] dark:border-white/10 rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#111c2a] text-[#2f3437] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/50"
              value={form.stripeUrl}
              onChange={(e) => set("stripeUrl", e.target.value)}
              placeholder="https://buy.stripe.com/..."
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="pkg-published"
              type="checkbox"
              checked={form.published}
              onChange={(e) => set("published", e.target.checked)}
              className="w-4 h-4 rounded accent-[#6ba3c7]"
            />
            <label htmlFor="pkg-published" className="text-sm text-[#2f3437]/70 dark:text-white/60 select-none">Published</label>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 border border-[#eaeaea] dark:border-white/10 rounded-lg py-2 text-sm font-semibold text-[#2f3437]/60 dark:text-white/40 hover:bg-[#f7f7f7] dark:hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-[#6ba3c7] hover:bg-[#5490b5] text-white rounded-lg py-2 text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Package"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Package Row ───────────────────────────────────────────────

function PackageRow({
  pkg,
  onEdit,
  onDelete,
  onTogglePublish,
}: {
  pkg: Package;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePublish: () => void;
}) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${pkg.published ? "border-[#eaeaea] dark:border-white/8 bg-white dark:bg-[#111c2a]/50" : "border-dashed border-[#eaeaea] dark:border-white/8 bg-[#f9f9f9] dark:bg-[#111c2a]/20 opacity-60"}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-[#2f3437] dark:text-white">{pkg.name}</span>
          {pkg.badge && (
            <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 px-2 py-0.5 rounded-full">{pkg.badge}</span>
          )}
          {!pkg.published && (
            <span className="text-[10px] font-semibold text-[#2f3437]/30 dark:text-white/30 uppercase tracking-wide">Hidden</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-sm font-bold text-[#6ba3c7]">{pkg.price}</span>
          {pkg.subtitle && <span className="text-xs text-[#2f3437]/40 dark:text-white/30">{pkg.subtitle}</span>}
        </div>
        <p className="text-xs text-[#2f3437]/40 dark:text-white/30 mt-0.5">
          {pkg.features.length} feature{pkg.features.length !== 1 ? "s" : ""}
          {pkg.highlightFeatures && pkg.highlightFeatures.length > 0 ? ` · ${pkg.highlightFeatures.length} highlight${pkg.highlightFeatures.length !== 1 ? "s" : ""}` : ""}
          {pkg.stripeUrl ? " · Stripe link" : " · Message Us CTA"}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onTogglePublish}
          title={pkg.published ? "Unpublish" : "Publish"}
          className={`p-1.5 rounded hover:bg-[#f0f0f0] dark:hover:bg-white/10 transition-colors ${pkg.published ? "text-green-500" : "text-[#2f3437]/30 dark:text-white/30"}`}
        >
          <CheckCircleIcon className="w-4 h-4" />
        </button>
        <button
          onClick={onEdit}
          className="p-1.5 rounded hover:bg-[#f0f0f0] dark:hover:bg-white/10 transition-colors text-[#2f3437]/50 dark:text-white/40"
        >
          <PencilIcon className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-400"
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Category Card ─────────────────────────────────────────────

function CategoryCard({
  category,
  onRefresh,
}: {
  category: Category;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [editCategory, setEditCategory] = useState(false);
  const [addPackage, setAddPackage] = useState(false);
  const [editPackage, setEditPackage] = useState<Package | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  async function handleToggleCategoryPublish() {
    await fetch(`/api/admin/hire/categories/${category.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published: !category.published }),
    });
    onRefresh();
  }

  async function handleDeleteCategory() {
    const res = await fetch(`/api/admin/hire/categories/${category.id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json();
      alert(d.error ?? "Failed to delete.");
    } else {
      onRefresh();
    }
  }

  async function handleTogglePackagePublish(pkg: Package) {
    await fetch(`/api/admin/hire/packages/${pkg.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published: !pkg.published }),
    });
    onRefresh();
  }

  async function handleDeletePackage(id: string) {
    await fetch(`/api/admin/hire/packages/${id}`, { method: "DELETE" });
    onRefresh();
  }

  return (
    <>
      {editCategory && (
        <CategoryModal
          category={category}
          onClose={() => setEditCategory(false)}
          onSave={() => { setEditCategory(false); onRefresh(); }}
        />
      )}
      {addPackage && (
        <PackageModal
          pkg={null}
          categoryId={category.id}
          onClose={() => setAddPackage(false)}
          onSave={() => { setAddPackage(false); onRefresh(); }}
        />
      )}
      {editPackage && (
        <PackageModal
          pkg={editPackage}
          categoryId={category.id}
          onClose={() => setEditPackage(null)}
          onSave={() => { setEditPackage(null); onRefresh(); }}
        />
      )}

      <div className={`bg-white dark:bg-[#1a2433] rounded-xl border ${category.published ? "border-[#eaeaea] dark:border-white/10" : "border-dashed border-[#eaeaea] dark:border-white/10 opacity-70"} overflow-hidden`}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4">
          <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-3 flex-1 text-left min-w-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-[#2f3437] dark:text-white text-base">{category.name}</h3>
                {!category.published && (
                  <span className="text-[10px] font-semibold text-[#2f3437]/30 dark:text-white/30 uppercase tracking-wide">Hidden</span>
                )}
                <span className="text-xs bg-[#f0f0f0] dark:bg-white/8 text-[#2f3437]/50 dark:text-white/40 px-2 py-0.5 rounded-full capitalize">{category.accentColour}</span>
              </div>
              {category.description && (
                <p className="text-xs text-[#2f3437]/40 dark:text-white/30 mt-0.5 truncate">{category.description}</p>
              )}
            </div>
            {expanded ? (
              <ChevronUpIcon className="w-4 h-4 text-[#2f3437]/30 dark:text-white/30 shrink-0" />
            ) : (
              <ChevronDownIcon className="w-4 h-4 text-[#2f3437]/30 dark:text-white/30 shrink-0" />
            )}
          </button>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleToggleCategoryPublish}
              title={category.published ? "Unpublish category" : "Publish category"}
              className={`p-1.5 rounded hover:bg-[#f0f0f0] dark:hover:bg-white/10 transition-colors ${category.published ? "text-green-500" : "text-[#2f3437]/30 dark:text-white/30"}`}
            >
              <CheckCircleIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setEditCategory(true)}
              className="p-1.5 rounded hover:bg-[#f0f0f0] dark:hover:bg-white/10 transition-colors text-[#2f3437]/50 dark:text-white/40"
            >
              <PencilIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setDeleteConfirm("category")}
              className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-400"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Packages */}
        {expanded && (
          <div className="px-5 pb-5 space-y-2">
            {category.packages.length === 0 && (
              <p className="text-sm text-[#2f3437]/30 dark:text-white/20 italic">No packages yet.</p>
            )}
            {category.packages.map((pkg) => (
              <PackageRow
                key={pkg.id}
                pkg={pkg}
                onEdit={() => setEditPackage(pkg)}
                onDelete={() => setDeleteConfirm(pkg.id)}
                onTogglePublish={() => handleTogglePackagePublish(pkg)}
              />
            ))}
            <button
              onClick={() => setAddPackage(true)}
              className="flex items-center gap-2 text-sm text-[#6ba3c7] hover:text-[#5490b5] font-medium mt-1 transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              Add Package
            </button>
          </div>
        )}
      </div>

      {/* Delete confirm overlay */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-[#1a2433] rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-base font-bold text-[#2f3437] dark:text-white mb-2">Confirm Delete</h3>
            <p className="text-sm text-[#2f3437]/60 dark:text-white/40 mb-5">
              {deleteConfirm === "category"
                ? `Delete "${category.name}"? All packages inside must be removed first.`
                : "Delete this package permanently?"}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 border border-[#eaeaea] dark:border-white/10 rounded-lg py-2 text-sm font-semibold text-[#2f3437]/60 dark:text-white/40 hover:bg-[#f7f7f7] dark:hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (deleteConfirm === "category") {
                    await handleDeleteCategory();
                  } else {
                    await handleDeletePackage(deleteConfirm);
                  }
                  setDeleteConfirm(null);
                }}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-lg py-2 text-sm font-semibold transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export default function AdminHirePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewCategory, setShowNewCategory] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/hire/categories");
    if (res.ok) {
      const d = await res.json();
      setCategories(d.categories ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-3xl pb-16">
      {/* Page header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#6ba3c7]/10 rounded-lg">
            <UserGroupIcon className="w-6 h-6 text-[#6ba3c7]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#2f3437] dark:text-white">Hire a Human</h1>
            <p className="text-sm text-[#2f3437]/40 dark:text-white/30 mt-0.5">Manage service categories and packages shown to members.</p>
          </div>
        </div>
        <button
          onClick={() => setShowNewCategory(true)}
          className="flex items-center gap-2 bg-[#6ba3c7] hover:bg-[#5490b5] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          New Category
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-[#eaeaea] dark:bg-white/10 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-[#eaeaea] dark:border-white/10 rounded-xl">
          <UserGroupIcon className="w-8 h-8 text-[#2f3437]/20 dark:text-white/20 mx-auto mb-3" />
          <p className="text-sm font-medium text-[#2f3437]/40 dark:text-white/30">No categories yet</p>
          <button
            onClick={() => setShowNewCategory(true)}
            className="mt-4 text-sm text-[#6ba3c7] hover:text-[#5490b5] font-medium transition-colors"
          >
            Add the first category
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {categories.map((cat) => (
            <CategoryCard key={cat.id} category={cat} onRefresh={load} />
          ))}
        </div>
      )}

      {showNewCategory && (
        <CategoryModal
          category={null}
          onClose={() => setShowNewCategory(false)}
          onSave={() => { setShowNewCategory(false); load(); }}
        />
      )}
    </div>
  );
}

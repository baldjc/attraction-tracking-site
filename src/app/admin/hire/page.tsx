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
  ClockIcon,
} from "@heroicons/react/24/outline";
import TierCard, { type TierCategory } from "@/components/hire/TierCard";

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
  waitlist: boolean;
  sortOrder: number;
  published: boolean;
  videoCount: number | null;
  isAddonVariant: boolean;
  priceAmount: number | null;
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
  emoji: string | null;
  tagline: string | null;
  highlighted: boolean;
  includesRef: string | null;
  cardExtras: string[] | null;
  addonLabel: string | null;
  addonPriceNote: string | null;
  footerNote: string | null;
  jaredIncludedNote: string | null;
  packages: Package[];
}

interface WaitlistEntry {
  id: string;
  createdAt: string;
  user: { id: string; fullName: string | null; email: string };
  package: { id: string; name: string; price: string; category: { name: string } };
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

function featuresToText(arr: string[]) { return arr.join("\n"); }
function textToFeatures(text: string): string[] {
  return text.split("\n").map((l) => l.trim()).filter(Boolean);
}

function ChipListEditor({
  items,
  onChange,
  placeholder,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  function addItem() {
    const trimmed = input.trim();
    if (trimmed && !items.includes(trimmed)) {
      onChange([...items, trimmed]);
      setInput("");
    }
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function moveItem(from: number, direction: -1 | 1) {
    const to = from + direction;
    if (to < 0 || to >= items.length) return;
    const arr = [...items];
    [arr[from], arr[to]] = [arr[to], arr[from]];
    onChange(arr);
  }

  return (
    <div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {items.map((item, i) => (
            <div
              key={i}
              className="inline-flex items-center gap-1 bg-gray-100 dark:bg-white/10 rounded-md px-2.5 py-1 text-xs group"
            >
              {i > 0 && (
                <button
                  type="button"
                  onClick={() => moveItem(i, -1)}
                  className="opacity-0 group-hover:opacity-50 hover:!opacity-100 text-[10px] text-[var(--abv-text)] dark:text-white"
                >
                  ↑
                </button>
              )}
              <span className="text-[var(--abv-text)] dark:text-[#e2e8f0]">{item}</span>
              {i < items.length - 1 && (
                <button
                  type="button"
                  onClick={() => moveItem(i, 1)}
                  className="opacity-0 group-hover:opacity-50 hover:!opacity-100 text-[10px] text-[var(--abv-text)] dark:text-white"
                >
                  ↓
                </button>
              )}
              <button
                type="button"
                onClick={() => removeItem(i)}
                className="ml-1 text-red-400 hover:text-red-600 text-sm leading-none"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addItem();
            }
          }}
          placeholder={placeholder || "Type a feature and press Enter..."}
          className="flex-1 border border-[var(--abv-border-strong)] dark:border-white/10 bg-white dark:bg-[#111c2a] rounded-lg px-3 py-2 text-sm text-[var(--abv-text)] dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/50"
        />
        <button
          type="button"
          onClick={addItem}
          disabled={!input.trim()}
          className="px-3 py-2 text-xs bg-[var(--abv-dark)] text-white rounded-lg hover:bg-black/85 disabled:opacity-50 transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ── Tab pill ──────────────────────────────────────────────────

type Tab = "packages" | "waitlist" | "preview";

function TabPills({ active, onChange, waitlistCount }: { active: Tab; onChange: (t: Tab) => void; waitlistCount: number }) {
  return (
    <div className="flex gap-1 bg-[#111]/5 dark:bg-white/5 rounded-lg p-1 w-fit">
      {(["packages", "waitlist", "preview"] as Tab[]).map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${
            active === t
              ? "bg-white dark:bg-[#1a1a1a] shadow-sm text-[var(--abv-text)] dark:text-white"
              : "text-[var(--abv-text)]/50 dark:text-white/40 hover:text-[var(--abv-text)] dark:hover:text-white"
          }`}
        >
          {t === "packages" ? "Packages" : t === "waitlist" ? "Enquiries" : "Preview"}
          {t === "waitlist" && waitlistCount > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
              {waitlistCount}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Category Modal ────────────────────────────────────────────

interface CategoryFormState {
  name: string;
  slug: string;
  description: string;
  icon: string;
  accentColour: string;
  published: boolean;
  emoji: string;
  tagline: string;
  highlighted: boolean;
  includesRef: string;
  cardExtras: string;
  addonLabel: string;
  addonPriceNote: string;
  footerNote: string;
  jaredIncludedNote: string;
}

function inputCls() {
  return "w-full border border-[var(--abv-border-strong)] dark:border-white/10 rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#111c2a] text-[var(--abv-text)] dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/50";
}

function CategoryModal({ category, onClose, onSave }: { category: Category | null; onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState<CategoryFormState>({
    name: category?.name ?? "",
    slug: category?.slug ?? "",
    description: category?.description ?? "",
    icon: category?.icon ?? "PuzzlePieceIcon",
    accentColour: category?.accentColour ?? "blue",
    published: category?.published ?? true,
    emoji: category?.emoji ?? "",
    tagline: category?.tagline ?? "",
    highlighted: category?.highlighted ?? false,
    includesRef: category?.includesRef ?? "",
    cardExtras: category?.cardExtras ? featuresToText(category.cardExtras) : "",
    addonLabel: category?.addonLabel ?? "",
    addonPriceNote: category?.addonPriceNote ?? "",
    footerNote: category?.footerNote ?? "",
    jaredIncludedNote: category?.jaredIncludedNote ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof CategoryFormState>(key: K, val: CategoryFormState[K]) {
    setForm((p) => ({ ...p, [key]: val }));
  }

  async function handleSave() {
    if (!form.name.trim()) { setError("Name is required."); return; }
    setSaving(true); setError("");
    const res = await fetch(
      category ? `/api/admin/hire/categories/${category.id}` : `/api/admin/hire/categories`,
      {
        method: category ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          slug: form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          description: form.description || null,
          icon: form.icon,
          accentColour: form.accentColour,
          published: form.published,
          emoji: form.emoji || null,
          tagline: form.tagline || null,
          highlighted: form.highlighted,
          includesRef: form.includesRef || null,
          cardExtras: form.cardExtras ? textToFeatures(form.cardExtras) : null,
          addonLabel: form.addonLabel || null,
          addonPriceNote: form.addonPriceNote || null,
          footerNote: form.footerNote || null,
          jaredIncludedNote: form.jaredIncludedNote || null,
        }),
      }
    );
    if (!res.ok) { const d = await res.json(); setError(d.error ?? "Failed to save."); }
    else { onSave(); }
    setSaving(false);
  }

  const ic = inputCls();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
      <div className="bg-white dark:bg-[#1a2433] rounded-2xl shadow-2xl w-full max-w-lg p-6 my-8">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-[var(--abv-text)] dark:text-white">{category ? "Edit Category" : "New Category"}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#f0f0f0] dark:hover:bg-white/10">
            <XMarkIcon className="w-5 h-5 text-[var(--abv-text)]/50 dark:text-white/40" />
          </button>
        </div>
        <div className="space-y-4">
          {/* Basic fields */}
          <div>
            <label className="block text-xs font-semibold text-[var(--abv-text)]/60 dark:text-white/40 mb-1">Name *</label>
            <input className={ic} value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--abv-text)]/60 dark:text-white/40 mb-1">Slug</label>
            <input className={ic} value={form.slug} onChange={(e) => set("slug", e.target.value)} placeholder="auto-generated from name" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--abv-text)]/60 dark:text-white/40 mb-1">Description</label>
            <textarea rows={2} className={`${ic} resize-none`} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--abv-text)]/60 dark:text-white/40 mb-1">Icon</label>
              <select className={ic} value={form.icon} onChange={(e) => set("icon", e.target.value)}>
                {ICON_OPTIONS.map((i) => <option key={i} value={i}>{i.replace("Icon", "")}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--abv-text)]/60 dark:text-white/40 mb-1">Accent Colour</label>
              <select className={ic} value={form.accentColour} onChange={(e) => set("accentColour", e.target.value)}>
                {ACCENT_OPTIONS.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input id="cat-pub" type="checkbox" checked={form.published} onChange={(e) => set("published", e.target.checked)} className="w-4 h-4 rounded accent-[var(--abv-azure)]" />
            <label htmlFor="cat-pub" className="text-sm text-[var(--abv-text)]/70 dark:text-white/60 select-none">Published</label>
          </div>

          {/* Divider */}
          <div className="border-t border-[var(--abv-border-strong)] dark:border-white/10 pt-4">
            <p className="text-xs font-bold text-[var(--abv-text)]/40 dark:text-white/30 uppercase tracking-widest mb-4">Card Display</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--abv-text)]/60 dark:text-white/40 mb-1">Emoji</label>
              <input className={ic} value={form.emoji} onChange={(e) => set("emoji", e.target.value)} placeholder="🎬" />
            </div>
            <div className="flex items-end pb-0.5">
              <div className="flex items-center gap-2">
                <input id="cat-highlighted" type="checkbox" checked={form.highlighted} onChange={(e) => set("highlighted", e.target.checked)} className="w-4 h-4 rounded accent-[var(--abv-hire)]" />
                <label htmlFor="cat-highlighted" className="text-sm text-[var(--abv-text)]/70 dark:text-white/60 select-none leading-tight">Highlighted (purple border + Most Popular pill)</label>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--abv-text)]/60 dark:text-white/40 mb-1">Tagline</label>
            <input className={ic} value={form.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="We edit. You publish." />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--abv-text)]/60 dark:text-white/40 mb-1">Includes Ref</label>
            <input className={ic} value={form.includesRef} onChange={(e) => set("includesRef", e.target.value)} placeholder="Includes everything in X, plus:" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--abv-text)]/60 dark:text-white/40 mb-1">Card Extras <span className="font-normal">(one bullet per line)</span></label>
            <textarea rows={3} className={`${ic} resize-none font-mono`} value={form.cardExtras} onChange={(e) => set("cardExtras", e.target.value)} placeholder="One bullet point per line" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--abv-text)]/60 dark:text-white/40 mb-1">Addon Label</label>
            <input className={ic} value={form.addonLabel} onChange={(e) => set("addonLabel", e.target.value)} placeholder="Add Jared's personal feedback" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--abv-text)]/60 dark:text-white/40 mb-1">Addon Price Note</label>
            <input className={ic} value={form.addonPriceNote} onChange={(e) => set("addonPriceNote", e.target.value)} placeholder="1-on-1 coaching call + video-by-video review" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--abv-text)]/60 dark:text-white/40 mb-1">Footer Note</label>
            <input className={ic} value={form.footerNote} onChange={(e) => set("footerNote", e.target.value)} placeholder="Added to your Foundations membership" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--abv-text)]/60 dark:text-white/40 mb-1">Jared Included Note</label>
            <input className={ic} value={form.jaredIncludedNote} onChange={(e) => set("jaredIncludedNote", e.target.value)} placeholder="Jared's feedback included" />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 border border-[var(--abv-border-strong)] dark:border-white/10 rounded-lg py-2 text-sm font-semibold text-[var(--abv-text)]/60 dark:text-white/40 hover:bg-[#f7f7f7] dark:hover:bg-white/5">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 bg-[var(--abv-dark)] hover:bg-black/85 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50">{saving ? "Saving…" : "Save Category"}</button>
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
  features: string[];
  highlightFeatures: string[];
  stripeUrl: string;
  waitlist: boolean;
  published: boolean;
  videoCount: string;
  isAddonVariant: boolean;
  priceAmount: string;
}

function PackageModal({ pkg, categoryId, onClose, onSave }: { pkg: Package | null; categoryId: string; onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState<PackageFormState>({
    name: pkg?.name ?? "",
    price: pkg?.price ?? "",
    priceNote: pkg?.priceNote ?? "",
    badge: pkg?.badge ?? "",
    subtitle: pkg?.subtitle ?? "",
    features: pkg ? pkg.features : [],
    highlightFeatures: pkg?.highlightFeatures ?? [],
    stripeUrl: pkg?.stripeUrl ?? "",
    waitlist: pkg?.waitlist ?? false,
    published: pkg?.published ?? true,
    videoCount: pkg?.videoCount != null ? String(pkg.videoCount) : "none",
    isAddonVariant: pkg?.isAddonVariant ?? false,
    priceAmount: pkg?.priceAmount != null ? String(pkg.priceAmount / 100) : "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof PackageFormState>(key: K, val: PackageFormState[K]) {
    setForm((p) => ({ ...p, [key]: val }));
  }

  async function handleSave() {
    if (!form.name.trim()) { setError("Name is required."); return; }
    if (!form.price.trim()) { setError("Price is required."); return; }
    setSaving(true); setError("");
    const res = await fetch(
      pkg ? `/api/admin/hire/packages/${pkg.id}` : `/api/admin/hire/packages`,
      {
        method: pkg ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId,
          name: form.name,
          price: form.price,
          priceNote: form.priceNote || null,
          badge: form.badge || null,
          subtitle: form.subtitle || null,
          features: form.features,
          highlightFeatures: form.highlightFeatures,
          stripeUrl: form.stripeUrl || null,
          waitlist: form.waitlist,
          published: form.published,
          videoCount: form.videoCount === "none" ? null : Number(form.videoCount),
          isAddonVariant: form.isAddonVariant,
          priceAmount: form.priceAmount ? Math.round(Number(form.priceAmount) * 100) : null,
        }),
      }
    );
    if (!res.ok) { const d = await res.json(); setError(d.error ?? "Failed to save."); }
    else { onSave(); }
    setSaving(false);
  }

  const ic = inputCls();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
      <div className="bg-white dark:bg-[#1a2433] rounded-2xl shadow-2xl w-full max-w-lg p-6 my-8">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-[var(--abv-text)] dark:text-white">{pkg ? "Edit Package" : "New Package"}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#f0f0f0] dark:hover:bg-white/10">
            <XMarkIcon className="w-5 h-5 text-[var(--abv-text)]/50 dark:text-white/40" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--abv-text)]/60 dark:text-white/40 mb-1">Package Name *</label>
            <input className={ic} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Production 2" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--abv-text)]/60 dark:text-white/40 mb-1">Price *</label>
              <input className={ic} value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="e.g. $500/mo" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--abv-text)]/60 dark:text-white/40 mb-1">Price Note</label>
              <input className={ic} value={form.priceNote} onChange={(e) => set("priceNote", e.target.value)} placeholder="e.g. USD" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--abv-text)]/60 dark:text-white/40 mb-1">Badge</label>
              <input className={ic} value={form.badge} onChange={(e) => set("badge", e.target.value)} placeholder="e.g. Most Popular" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--abv-text)]/60 dark:text-white/40 mb-1">Subtitle</label>
              <input className={ic} value={form.subtitle} onChange={(e) => set("subtitle", e.target.value)} placeholder="e.g. 2 videos/mo" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--abv-text)]/60 dark:text-white/40 mb-1">Features</label>
            <ChipListEditor
              items={form.features}
              onChange={(features) => set("features", features)}
              placeholder="Add a feature and press Enter..."
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--abv-text)]/60 dark:text-white/40 mb-1">Highlight Features <span className="font-normal">(optional)</span></label>
            <ChipListEditor
              items={form.highlightFeatures}
              onChange={(highlightFeatures) => set("highlightFeatures", highlightFeatures)}
              placeholder="Add a highlight feature and press Enter..."
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--abv-text)]/60 dark:text-white/40 mb-1">Stripe URL <span className="font-normal">(leave blank for "Message Us" or Waitlist CTA)</span></label>
            <input className={ic} value={form.stripeUrl} onChange={(e) => set("stripeUrl", e.target.value)} placeholder="https://buy.stripe.com/..." />
          </div>

          {/* New fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--abv-text)]/60 dark:text-white/40 mb-1">Video Count (for toggle)</label>
              <select className={ic} value={form.videoCount} onChange={(e) => set("videoCount", e.target.value)}>
                <option value="none">None</option>
                <option value="2">2</option>
                <option value="4">4</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--abv-text)]/60 dark:text-white/40 mb-1">Price in dollars (for addon calc)</label>
              <input className={ic} type="number" value={form.priceAmount} onChange={(e) => set("priceAmount", e.target.value)} placeholder="500" />
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <input id="pkg-addon" type="checkbox" checked={form.isAddonVariant} onChange={(e) => set("isAddonVariant", e.target.checked)} className="w-4 h-4 rounded accent-[var(--abv-hire)]" />
              <label htmlFor="pkg-addon" className="text-sm text-[var(--abv-text)]/70 dark:text-white/60 select-none">This is a +Jared variant</label>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <input id="pkg-waitlist" type="checkbox" checked={form.waitlist} onChange={(e) => set("waitlist", e.target.checked)} className="w-4 h-4 rounded accent-[var(--abv-azure)]" />
              <label htmlFor="pkg-waitlist" className="text-sm text-[var(--abv-text)]/70 dark:text-white/60 select-none">Interest Only</label>
            </div>
            <div className="flex items-center gap-2">
              <input id="pkg-pub" type="checkbox" checked={form.published} onChange={(e) => set("published", e.target.checked)} className="w-4 h-4 rounded accent-[var(--abv-azure)]" />
              <label htmlFor="pkg-pub" className="text-sm text-[var(--abv-text)]/70 dark:text-white/60 select-none">Published</label>
            </div>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 border border-[var(--abv-border-strong)] dark:border-white/10 rounded-lg py-2 text-sm font-semibold text-[var(--abv-text)]/60 dark:text-white/40 hover:bg-[#f7f7f7] dark:hover:bg-white/5">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 bg-[var(--abv-dark)] hover:bg-black/85 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50">{saving ? "Saving…" : "Save Package"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Package Row ───────────────────────────────────────────────

function PackageRow({ pkg, onEdit, onDelete, onTogglePublish }: { pkg: Package; onEdit: () => void; onDelete: () => void; onTogglePublish: () => void }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${pkg.published ? "border-[var(--abv-border-strong)] dark:border-white/8 bg-white dark:bg-[#111c2a]/50" : "border-dashed border-[var(--abv-border-strong)] dark:border-white/8 bg-[#f9f9f9] dark:bg-[#111c2a]/20 opacity-60"}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-[var(--abv-text)] dark:text-white">{pkg.name}</span>
          {pkg.badge && <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 px-2 py-0.5 rounded-full">{pkg.badge}</span>}
          {pkg.isAddonVariant && <span className="text-[10px] font-bold uppercase tracking-wide bg-[var(--abv-hire)]/10 text-[var(--abv-hire)] px-2 py-0.5 rounded-full">+Jared</span>}
          {pkg.waitlist && (
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-[var(--abv-dark)]/10 text-[var(--abv-azure)] px-2 py-0.5 rounded-full">
              <ClockIcon className="w-3 h-3" />
              Interest Only
            </span>
          )}
          {!pkg.published && <span className="text-[10px] font-semibold text-[var(--abv-text)]/30 dark:text-white/30 uppercase tracking-wide">Hidden</span>}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-sm font-bold text-[var(--abv-azure)]">{pkg.price}</span>
          {pkg.videoCount != null && <span className="text-xs text-[var(--abv-text)]/40 dark:text-white/30">{pkg.videoCount} videos/mo</span>}
          {pkg.subtitle && <span className="text-xs text-[var(--abv-text)]/40 dark:text-white/30">{pkg.subtitle}</span>}
        </div>
        <p className="text-xs text-[var(--abv-text)]/40 dark:text-white/30 mt-0.5">
          {pkg.features.length} feature{pkg.features.length !== 1 ? "s" : ""}
          {pkg.highlightFeatures && pkg.highlightFeatures.length > 0 ? ` · ${pkg.highlightFeatures.length} highlight${pkg.highlightFeatures.length !== 1 ? "s" : ""}` : ""}
          {pkg.stripeUrl ? " · Stripe link" : pkg.waitlist ? " · Interest Only" : " · Message Us"}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onTogglePublish} title={pkg.published ? "Unpublish" : "Publish"} className={`p-1.5 rounded hover:bg-[#f0f0f0] dark:hover:bg-white/10 ${pkg.published ? "text-green-500" : "text-[var(--abv-text)]/30 dark:text-white/30"}`}>
          <CheckCircleIcon className="w-4 h-4" />
        </button>
        <button onClick={onEdit} className="p-1.5 rounded hover:bg-[#f0f0f0] dark:hover:bg-white/10 text-[var(--abv-text)]/50 dark:text-white/40">
          <PencilIcon className="w-4 h-4" />
        </button>
        <button onClick={onDelete} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400">
          <TrashIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Category Card ─────────────────────────────────────────────

function CategoryCard({ category, onRefresh }: { category: Category; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(true);
  const [editCategory, setEditCategory] = useState(false);
  const [addPackage, setAddPackage] = useState(false);
  const [editPackage, setEditPackage] = useState<Package | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  async function handleToggleCategoryPublish() {
    await fetch(`/api/admin/hire/categories/${category.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ published: !category.published }) });
    onRefresh();
  }

  async function handleDeleteCategory() {
    const res = await fetch(`/api/admin/hire/categories/${category.id}`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json(); alert(d.error ?? "Failed to delete."); }
    else { onRefresh(); }
  }

  async function handleTogglePackagePublish(pkg: Package) {
    await fetch(`/api/admin/hire/packages/${pkg.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ published: !pkg.published }) });
    onRefresh();
  }

  async function handleDeletePackage(id: string) {
    await fetch(`/api/admin/hire/packages/${id}`, { method: "DELETE" });
    onRefresh();
  }

  return (
    <>
      {editCategory && <CategoryModal category={category} onClose={() => setEditCategory(false)} onSave={() => { setEditCategory(false); onRefresh(); }} />}
      {addPackage && <PackageModal pkg={null} categoryId={category.id} onClose={() => setAddPackage(false)} onSave={() => { setAddPackage(false); onRefresh(); }} />}
      {editPackage && <PackageModal pkg={editPackage} categoryId={category.id} onClose={() => setEditPackage(null)} onSave={() => { setEditPackage(null); onRefresh(); }} />}

      <div className={`bg-white dark:bg-[#1a2433] rounded-xl border ${category.published ? "border-[var(--abv-border-strong)] dark:border-white/10" : "border-dashed border-[var(--abv-border-strong)] dark:border-white/10 opacity-70"} overflow-hidden`}>
        <div className="flex items-center gap-3 px-5 py-4">
          <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-3 flex-1 text-left min-w-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {category.emoji && <span>{category.emoji}</span>}
                <h3 className="font-bold text-[var(--abv-text)] dark:text-white text-base">{category.name}</h3>
                {!category.published && <span className="text-[10px] font-semibold text-[var(--abv-text)]/30 dark:text-white/30 uppercase tracking-wide">Hidden</span>}
                {category.highlighted && <span className="text-[10px] font-bold uppercase tracking-wide bg-[var(--abv-hire)]/10 text-[var(--abv-hire)] px-2 py-0.5 rounded-full">Highlighted</span>}
                <span className="text-xs bg-[#f0f0f0] dark:bg-white/8 text-[var(--abv-text)]/50 dark:text-white/40 px-2 py-0.5 rounded-full capitalize">{category.accentColour}</span>
              </div>
              {category.description && <p className="text-xs text-[var(--abv-text)]/40 dark:text-white/30 mt-0.5 truncate">{category.description}</p>}
            </div>
            {expanded ? <ChevronUpIcon className="w-4 h-4 text-[var(--abv-text)]/30 shrink-0" /> : <ChevronDownIcon className="w-4 h-4 text-[var(--abv-text)]/30 shrink-0" />}
          </button>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={handleToggleCategoryPublish} title={category.published ? "Unpublish" : "Publish"} className={`p-1.5 rounded hover:bg-[#f0f0f0] dark:hover:bg-white/10 ${category.published ? "text-green-500" : "text-[var(--abv-text)]/30 dark:text-white/30"}`}>
              <CheckCircleIcon className="w-4 h-4" />
            </button>
            <button onClick={() => setEditCategory(true)} className="p-1.5 rounded hover:bg-[#f0f0f0] dark:hover:bg-white/10 text-[var(--abv-text)]/50 dark:text-white/40">
              <PencilIcon className="w-4 h-4" />
            </button>
            <button onClick={() => setDeleteConfirm("category")} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400">
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {expanded && (
          <div className="px-5 pb-5 space-y-2">
            {category.packages.length === 0 && <p className="text-sm text-[var(--abv-text)]/30 dark:text-white/20 italic">No packages yet.</p>}
            {category.packages.map((pkg) => (
              <PackageRow key={pkg.id} pkg={pkg} onEdit={() => setEditPackage(pkg)} onDelete={() => setDeleteConfirm(pkg.id)} onTogglePublish={() => handleTogglePackagePublish(pkg)} />
            ))}
            <button onClick={() => setAddPackage(true)} className="flex items-center gap-2 text-sm text-[var(--abv-azure)] hover:text-[var(--abv-azure)] font-medium mt-1">
              <PlusIcon className="w-4 h-4" />Add Package
            </button>
          </div>
        )}
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-[#1a2433] rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-base font-bold text-[var(--abv-text)] dark:text-white mb-2">Confirm Delete</h3>
            <p className="text-sm text-[var(--abv-text)]/60 dark:text-white/40 mb-5">
              {deleteConfirm === "category" ? `Delete "${category.name}"? All packages must be removed first.` : "Delete this package permanently?"}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 border border-[var(--abv-border-strong)] dark:border-white/10 rounded-lg py-2 text-sm font-semibold text-[var(--abv-text)]/60 dark:text-white/40">Cancel</button>
              <button onClick={async () => { if (deleteConfirm === "category") await handleDeleteCategory(); else await handleDeletePackage(deleteConfirm); setDeleteConfirm(null); }} className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-lg py-2 text-sm font-semibold">Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Waitlist Tab ──────────────────────────────────────────────

function WaitlistTab() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/hire/waitlist");
    if (res.ok) { const d = await res.json(); setEntries(d.entries ?? []); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDismiss(id: string) {
    await fetch(`/api/admin/hire/waitlist/${id}`, { method: "DELETE" });
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-[var(--abv-border-strong)] dark:bg-white/10 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-16 border border-dashed border-[var(--abv-border-strong)] dark:border-white/10 rounded-xl">
        <ClockIcon className="w-8 h-8 text-[var(--abv-text)]/20 dark:text-white/20 mx-auto mb-3" />
        <p className="text-sm font-medium text-[var(--abv-text)]/40 dark:text-white/30">No enquiries yet</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-[var(--abv-text)]/50 dark:text-white/40 mb-5">{entries.length} enquir{entries.length !== 1 ? "ies" : "y"}</p>
      <div className="space-y-2">
        {entries.map((entry) => (
          <div key={entry.id} className="flex items-center gap-4 px-4 py-3 bg-white dark:bg-[#1a2433] rounded-xl border border-[var(--abv-border-strong)] dark:border-white/10">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-[var(--abv-text)] dark:text-white">{entry.user.fullName ?? "Unknown"}</span>
                <span className="text-xs text-[var(--abv-text)]/40 dark:text-white/30">{entry.user.email}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-xs font-medium text-[var(--abv-azure)]">{entry.package.name}</span>
                <span className="text-xs text-[var(--abv-text)]/40 dark:text-white/30">·</span>
                <span className="text-xs text-[var(--abv-text)]/40 dark:text-white/30">{entry.package.category.name}</span>
                <span className="text-xs text-[var(--abv-text)]/40 dark:text-white/30">·</span>
                <span className="text-xs text-[var(--abv-text)]/40 dark:text-white/30">{entry.package.price}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs text-[var(--abv-text)]/30 dark:text-white/20">
                {new Date(entry.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
              <button onClick={() => handleDismiss(entry.id)} className="text-xs font-semibold text-[var(--abv-text)]/40 dark:text-white/30 hover:text-red-500 border border-[var(--abv-border-strong)] dark:border-white/10 px-3 py-1 rounded-lg hover:border-red-200 dark:hover:border-red-800/30 transition-colors">
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Preview Tab ───────────────────────────────────────────────

function PreviewTab({ categories }: { categories: Category[] }) {
  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);

  if (sorted.length === 0) {
    return (
      <div className="text-center py-16 border border-dashed border-[var(--abv-border-strong)] dark:border-white/10 rounded-xl">
        <p className="text-sm font-medium text-[var(--abv-text)]/40 dark:text-white/30">No categories to preview</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs text-[var(--abv-text)]/40 dark:text-white/30 mb-5">
        Preview shows all categories (including hidden). Unpublished categories have a "Hidden" overlay.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
        {sorted.map((cat) => (
          <div key={cat.id} className="relative">
            <TierCard category={cat as TierCategory} previewMode={true} />
            {!cat.published && (
              <div className="absolute inset-0 rounded-xl bg-white/60 dark:bg-[#1a2433]/60 flex items-start justify-end p-3 pointer-events-none">
                <span className="text-[10px] font-bold uppercase tracking-widest bg-[var(--abv-text)]/20 dark:bg-white/20 text-[var(--abv-text)] dark:text-white px-2 py-0.5 rounded-full">
                  Hidden
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export default function AdminHirePage() {
  const [tab, setTab] = useState<Tab>("packages");
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [waitlistCount, setWaitlistCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const [catRes, countRes] = await Promise.all([
      fetch("/api/admin/hire/categories"),
      fetch("/api/admin/hire/waitlist/count"),
    ]);
    if (catRes.ok) { const d = await catRes.json(); setCategories(d.categories ?? []); }
    if (countRes.ok) { const d = await countRes.json(); setWaitlistCount(d.count ?? 0); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-5xl pb-16">
      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[var(--abv-dark)]/10 rounded-lg">
            <UserGroupIcon className="w-6 h-6 text-[var(--abv-azure)]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--abv-text)] dark:text-white">Hire a Human Manager</h1>
            <p className="text-sm text-[var(--abv-text)]/40 dark:text-white/30 mt-0.5">Manage service categories and packages</p>
          </div>
        </div>
        {tab === "packages" && (
          <button onClick={() => setShowNewCategory(true)} className="flex items-center gap-2 bg-[var(--abv-dark)] hover:bg-black/85 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            <PlusIcon className="w-4 h-4" />New Category
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <TabPills active={tab} onChange={setTab} waitlistCount={waitlistCount} />
      </div>

      {/* Packages tab */}
      {tab === "packages" && (
        loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-[var(--abv-border-strong)] dark:bg-white/10 rounded-xl animate-pulse" />)}
          </div>
        ) : categories.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-[var(--abv-border-strong)] dark:border-white/10 rounded-xl">
            <UserGroupIcon className="w-8 h-8 text-[var(--abv-text)]/20 dark:text-white/20 mx-auto mb-3" />
            <p className="text-sm font-medium text-[var(--abv-text)]/40 dark:text-white/30">No categories yet</p>
            <button onClick={() => setShowNewCategory(true)} className="mt-4 text-sm text-[var(--abv-azure)] hover:text-[var(--abv-azure)] font-medium">Add the first category</button>
          </div>
        ) : (
          <div className="space-y-4">
            {categories.map((cat) => (
              <CategoryCard key={cat.id} category={cat} onRefresh={load} />
            ))}
          </div>
        )
      )}

      {/* Waitlist tab */}
      {tab === "waitlist" && <WaitlistTab />}

      {/* Preview tab */}
      {tab === "preview" && (
        loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-96 bg-[var(--abv-border-strong)] dark:bg-white/10 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <PreviewTab categories={categories} />
        )
      )}

      {showNewCategory && (
        <CategoryModal category={null} onClose={() => setShowNewCategory(false)} onSave={() => { setShowNewCategory(false); load(); }} />
      )}
    </div>
  );
}

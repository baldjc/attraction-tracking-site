"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const AUDIENCE_OPTIONS = [
  { value: "FIRST_TIME_BUYER",          label: "First-Time Buyer" },
  { value: "MOVE_UP_BUYER",             label: "Move-Up Buyer" },
  { value: "MOVE_DOWN_RIGHT_SIZER",     label: "Move-Down / Right-Sizer" },
  { value: "SELLER",                    label: "Seller" },
  { value: "INVESTOR",                  label: "Investor" },
  { value: "RELOCATOR",                 label: "Relocator" },
  { value: "LUXURY",                    label: "Luxury" },
  { value: "NEW_CONSTRUCTION",          label: "New Construction" },
  { value: "RENTER_CONSIDERING_BUYING", label: "Renter Considering Buying" },
];

export default function NewClientForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    city: "",
    province: "",
    niche: "",
    audiencePrimary: "FIRST_TIME_BUYER",
    audienceSecondary: [] as string[],
    ownChannelUrl: "",
    notes: "",
  });

  function set(key: keyof typeof form, value: string | string[]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleSecondary(val: string) {
    setForm((prev) => ({
      ...prev,
      audienceSecondary: prev.audienceSecondary.includes(val)
        ? prev.audienceSecondary.filter((v) => v !== val)
        : [...prev.audienceSecondary, val],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/intelligence/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to create client");
      }
      const data = await res.json();
      router.push(`/admin/intelligence/clients/${data.id}`);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="bg-white border border-[var(--abv-text)]/10 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-[var(--abv-text)] text-sm uppercase tracking-wide">Client Details</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[var(--abv-text)]/60 mb-1">Full Name *</label>
            <input
              required
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Sarah Jones"
              className="w-full px-3 py-2 border border-[var(--abv-text)]/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--abv-text)]/60 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="sarah@example.com"
              className="w-full px-3 py-2 border border-[var(--abv-text)]/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/30"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[var(--abv-text)]/60 mb-1">City *</label>
            <input
              required
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
              placeholder="Calgary"
              className="w-full px-3 py-2 border border-[var(--abv-text)]/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--abv-text)]/60 mb-1">Province</label>
            <input
              value={form.province}
              onChange={(e) => set("province", e.target.value)}
              placeholder="AB"
              className="w-full px-3 py-2 border border-[var(--abv-text)]/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/30"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--abv-text)]/60 mb-1">Niche *</label>
          <input
            required
            value={form.niche}
            onChange={(e) => set("niche", e.target.value)}
            placeholder="Luxury condos, move-up families, investors…"
            className="w-full px-3 py-2 border border-[var(--abv-text)]/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/30"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--abv-text)]/60 mb-1">YouTube Channel URL</label>
          <input
            value={form.ownChannelUrl}
            onChange={(e) => set("ownChannelUrl", e.target.value)}
            placeholder="https://youtube.com/@handle"
            className="w-full px-3 py-2 border border-[var(--abv-text)]/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/30"
          />
        </div>
      </div>

      <div className="bg-white border border-[var(--abv-text)]/10 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-[var(--abv-text)] text-sm uppercase tracking-wide">Audience</h2>

        <div>
          <label className="block text-xs font-medium text-[var(--abv-text)]/60 mb-1">Primary Audience *</label>
          <select
            value={form.audiencePrimary}
            onChange={(e) => set("audiencePrimary", e.target.value)}
            className="w-full px-3 py-2 border border-[var(--abv-text)]/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/30 bg-white"
          >
            {AUDIENCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--abv-text)]/60 mb-2">Secondary Audiences</label>
          <div className="flex flex-wrap gap-2">
            {AUDIENCE_OPTIONS.filter((o) => o.value !== form.audiencePrimary).map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => toggleSecondary(o.value)}
                className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                  form.audienceSecondary.includes(o.value)
                    ? "bg-[var(--abv-dark)] text-white border-[var(--abv-azure)]"
                    : "bg-white text-[var(--abv-text)]/60 border-[var(--abv-text)]/20 hover:border-[var(--abv-azure)]"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white border border-[var(--abv-text)]/10 rounded-xl p-6">
        <label className="block text-xs font-medium text-[var(--abv-text)]/60 mb-1">Notes</label>
        <textarea
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          rows={3}
          placeholder="Any context about this client's market, goals, or strategy…"
          className="w-full px-3 py-2 border border-[var(--abv-text)]/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/30 resize-none"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => router.push("/admin/intelligence/clients")}
          className="px-4 py-2 text-sm text-[var(--abv-text)]/60 hover:text-[var(--abv-text)] transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 bg-[var(--abv-dark)] text-white text-sm font-semibold rounded-lg hover:bg-black/85 transition-colors disabled:opacity-60"
        >
          {loading ? "Creating…" : "Create Client"}
        </button>
      </div>
    </form>
  );
}

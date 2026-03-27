"use client";

import { useState } from "react";

interface Props {
  initialNiche?: string | null;
  initialCity?: string | null;
  onSaved: (niche: string, city: string | null) => void;
  isModal?: boolean;
}

const NICHES = [
  { value: "real_estate", label: "Real Estate" },
  { value: "financial_planning", label: "Financial Planning" },
  { value: "other", label: "Other" },
];

export default function NicheSetup({ initialNiche, initialCity, onSaved, isModal }: Props) {
  const [niche, setNiche] = useState(initialNiche ?? "");
  const [city, setCity] = useState(initialCity ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!niche) { setError("Please select your niche."); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/member/niche", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche, city: niche === "real_estate" ? city || null : null }),
      });
      if (!res.ok) throw new Error("Failed to save");
      onSaved(niche, niche === "real_estate" ? city || null : null);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={isModal ? "" : "bg-white dark:bg-[#1a1a1a] rounded-lg border border-[#2f3437]/10 dark:border-white/10 p-8 max-w-md mx-auto"}>
      {!isModal && (
        <div className="mb-6">
          <h2 className="text-lg font-bold text-[#2f3437] dark:text-white">Set your niche</h2>
          <p className="text-sm text-[#2f3437]/60 dark:text-white/60 mt-1">
            This helps us optimize your video titles for search in your market.
          </p>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[#2f3437] dark:text-white mb-1.5">Niche</label>
          <select
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            className="w-full border border-[#2f3437]/20 dark:border-white/20 rounded-lg px-3 py-2 text-sm text-[#2f3437] dark:text-white bg-white dark:bg-[#111111] focus:outline-none focus:ring-2 focus:ring-[#0d9488]/40"
          >
            <option value="">Select your niche...</option>
            {NICHES.map((n) => (
              <option key={n.value} value={n.value}>{n.label}</option>
            ))}
          </select>
        </div>

        {niche === "real_estate" && (
          <div>
            <label className="block text-sm font-medium text-[#2f3437] dark:text-white mb-1.5">City / Market</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Calgary, Houston, Toronto"
              className="w-full border border-[#2f3437]/20 dark:border-white/20 rounded-lg px-3 py-2 text-sm text-[#2f3437] dark:text-white placeholder-[#2f3437]/30 dark:placeholder-white/30 bg-white dark:bg-[#111111] focus:outline-none focus:ring-2 focus:ring-[#0d9488]/40"
            />
          </div>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-[#0d9488] hover:bg-[#2bb0ec] text-white font-semibold text-sm py-2.5 rounded-lg transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save and continue"}
        </button>
      </div>
    </div>
  );
}

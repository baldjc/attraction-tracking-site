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
    <div className={isModal ? "" : "bg-white rounded-2xl border border-[#1e2a38]/10 p-8 max-w-md mx-auto shadow-sm"}>
      {!isModal && (
        <div className="mb-6">
          <h2 className="text-lg font-bold text-[#1e2a38]">Set your niche</h2>
          <p className="text-sm text-[#1e2a38]/60 mt-1">
            This helps us optimize your video titles for search in your market.
          </p>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[#1e2a38] mb-1.5">Niche</label>
          <select
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            className="w-full border border-[#1e2a38]/20 rounded-lg px-3 py-2 text-sm text-[#1e2a38] bg-white focus:outline-none focus:ring-2 focus:ring-[#3dc3ff]/40"
          >
            <option value="">Select your niche...</option>
            {NICHES.map((n) => (
              <option key={n.value} value={n.value}>{n.label}</option>
            ))}
          </select>
        </div>

        {niche === "real_estate" && (
          <div>
            <label className="block text-sm font-medium text-[#1e2a38] mb-1.5">City / Market</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Calgary, Houston, Toronto"
              className="w-full border border-[#1e2a38]/20 rounded-lg px-3 py-2 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:ring-2 focus:ring-[#3dc3ff]/40"
            />
          </div>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-[#3dc3ff] hover:bg-[#2bb0ec] text-white font-semibold text-sm py-2.5 rounded-lg transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save and continue"}
        </button>
      </div>
    </div>
  );
}

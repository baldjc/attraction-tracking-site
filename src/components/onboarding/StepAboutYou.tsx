"use client";

import { useState } from "react";

const NICHE_OPTIONS = [
  { value: "residential_resale", label: "Residential Resale" },
  { value: "luxury", label: "Luxury" },
  { value: "first_time_buyers", label: "First-Time Buyers" },
  { value: "investment_properties", label: "Investment Properties" },
  { value: "condos", label: "Condos" },
  { value: "commercial", label: "Commercial" },
  { value: "land_rural", label: "Land / Rural" },
  { value: "relocation", label: "Relocation" },
  { value: "new_construction", label: "New Construction" },
];

interface Props {
  initialCity: string;
  initialNiche: string[];
  initialCredentials: string;
  onNext: (data: { city: string; niche: string[]; creatorCredentials: string }) => void;
}

export default function StepAboutYou({ initialCity, initialNiche, initialCredentials, onNext }: Props) {
  const [city, setCity] = useState(initialCity ?? "");
  const [selectedNiches, setSelectedNiches] = useState<string[]>(initialNiche ?? []);
  const [otherActive, setOtherActive] = useState(false);
  const [otherText, setOtherText] = useState("");
  const [credentials, setCredentials] = useState(initialCredentials ?? "");

  function selectNiche(value: string) {
    setOtherActive(false);
    setSelectedNiches((prev) => (prev[0] === value ? [] : [value]));
  }

  function handleContinue() {
    const niche = otherActive && otherText.trim()
      ? [otherText.trim()]
      : selectedNiches;
    onNext({ city, niche, creatorCredentials: credentials });
  }

  const chipBase = "rounded-full px-3 py-1.5 text-sm border cursor-pointer transition-colors select-none";
  const chipSelected = "bg-[var(--abv-dark)] text-white border-[var(--abv-azure)]";
  const chipUnselected = "bg-white dark:bg-[#1a1a1a] text-[var(--abv-text)]/70 dark:text-white/60 border-[var(--abv-text)]/15 dark:border-white/15 hover:border-[var(--abv-azure)]/50";

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-[var(--abv-text)] dark:text-white mb-1.5">City / Market</label>
        <input
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="e.g., Calgary, AB"
          className="w-full border border-[var(--abv-text)]/20 dark:border-white/20 rounded-lg px-3 py-2 text-sm text-[var(--abv-text)] dark:text-white placeholder-[var(--abv-text)]/30 dark:placeholder-white/30 bg-white dark:bg-[#0f1419] focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/40"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-[var(--abv-text)] dark:text-white mb-2">Niche of your perfect client avatar</label>
        <div className="flex flex-wrap gap-2">
          {NICHE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => selectNiche(opt.value)}
              className={`${chipBase} ${selectedNiches[0] === opt.value ? chipSelected : chipUnselected}`}
            >
              {opt.label}
            </button>
          ))}
          <button
            onClick={() => { setSelectedNiches([]); setOtherActive((v) => !v); }}
            className={`${chipBase} ${otherActive ? chipSelected : chipUnselected}`}
          >
            Other
          </button>
        </div>
        {otherActive && (
          <input
            type="text"
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            placeholder="Describe your niche..."
            className="mt-2 w-full border border-[var(--abv-text)]/20 dark:border-white/20 rounded-lg px-3 py-2 text-sm text-[var(--abv-text)] dark:text-white placeholder-[var(--abv-text)]/30 dark:placeholder-white/30 bg-white dark:bg-[#0f1419] focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/40"
          />
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-[var(--abv-text)] dark:text-white mb-1">Your Credentials</label>
        <p className="text-xs text-[var(--abv-text)]/50 dark:text-white/40 mb-1.5">
          Years of experience, designations, brokerage, specialities — this powers your AI-generated scripts.
        </p>
        <textarea
          value={credentials}
          onChange={(e) => setCredentials(e.target.value)}
          rows={3}
          placeholder="e.g., Licensed for 8 years, helped 150+ families in the Greater Toronto Area. Certified Luxury Home Specialist, Royal LePage."
          className="w-full border border-[var(--abv-text)]/20 dark:border-white/20 rounded-lg px-3 py-2 text-sm text-[var(--abv-text)] dark:text-white placeholder-[var(--abv-text)]/30 dark:placeholder-white/30 bg-white dark:bg-[#0f1419] focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/40 resize-y"
        />
      </div>

      <button
        onClick={handleContinue}
        className="w-full bg-[var(--abv-dark)] hover:bg-[#2bb0ec] text-white font-semibold text-sm py-2.5 rounded-lg transition-colors"
      >
        Continue →
      </button>
    </div>
  );
}

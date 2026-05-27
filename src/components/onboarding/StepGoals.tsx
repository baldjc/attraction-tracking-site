"use client";

import { useState } from "react";

const INCOME_OPTIONS = [
  { label: "$25K / year", value: "$25,000" },
  { label: "$50K / year", value: "$50,000" },
  { label: "$100K / year", value: "$100,000" },
  { label: "$250K / year", value: "$250,000" },
  { label: "$500K+ / year", value: "$500,000+" },
];

const RHYTHM_OPTIONS = [
  { label: "1 video / month", value: 1 },
  { label: "2 videos / month", value: 2 },
  { label: "1 video / week", value: 4 },
  { label: "2 videos / week", value: 8 },
];

const CHALLENGE_CHIPS = [
  "Getting started",
  "Being on camera",
  "Consistency",
  "Not getting views",
  "Getting leads from views",
  "Time",
];

interface Props {
  initialIncomeGoal: string;
  initialPostingRhythm: number | null;
  initialChallenge: string;
  onNext: (data: { incomeGoal: string; postingRhythm: number | null; biggestChallenge: string }) => void;
}

export default function StepGoals({ initialIncomeGoal, initialPostingRhythm, initialChallenge, onNext }: Props) {
  const [incomeGoal, setIncomeGoal] = useState(initialIncomeGoal ?? "");
  const [customIncome, setCustomIncome] = useState(false);
  const [customIncomeText, setCustomIncomeText] = useState("");

  const [postingRhythm, setPostingRhythm] = useState<number | null>(initialPostingRhythm ?? null);
  const [customRhythm, setCustomRhythm] = useState(false);
  const [customRhythmVal, setCustomRhythmVal] = useState("");

  const [challenge, setChallenge] = useState(initialChallenge ?? "");

  function selectIncome(value: string) {
    setCustomIncome(false);
    setCustomIncomeText("");
    setIncomeGoal(value);
  }

  function selectRhythm(value: number) {
    setCustomRhythm(false);
    setCustomRhythmVal("");
    setPostingRhythm(value);
  }

  function handleContinue() {
    const finalIncome = customIncome ? customIncomeText : incomeGoal;
    const finalRhythm = customRhythm ? (customRhythmVal ? parseInt(customRhythmVal, 10) : null) : postingRhythm;
    onNext({ incomeGoal: finalIncome, postingRhythm: finalRhythm, biggestChallenge: challenge });
  }

  const pillBase = "rounded-lg px-4 py-2 text-sm border cursor-pointer transition-colors";
  const pillSelected = "bg-[var(--abv-dark)] text-white border-[var(--abv-azure)]";
  const pillUnselected = "bg-white dark:bg-[#1a1a1a] text-[var(--abv-text)]/70 dark:text-white/60 border-[var(--abv-text)]/15 dark:border-white/15 hover:border-[var(--abv-azure)]/50";

  const chipBase = "rounded-full px-2.5 py-1 text-xs border cursor-pointer transition-colors";
  const chipSelected = "bg-[var(--abv-dark)]/10 text-[var(--abv-azure)] border-[var(--abv-azure)]/30";
  const chipUnselected = "text-[var(--abv-text)]/50 dark:text-white/40 border-[var(--abv-text)]/10 dark:border-white/10 hover:border-[var(--abv-azure)]/30";

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-[var(--abv-text)] dark:text-white mb-2">Income goal from YouTube</label>
        <div className="flex flex-wrap gap-2">
          {INCOME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => selectIncome(opt.value)}
              className={`${pillBase} ${!customIncome && incomeGoal === opt.value ? pillSelected : pillUnselected}`}
            >
              {opt.label}
            </button>
          ))}
          <button
            onClick={() => { setCustomIncome(true); setIncomeGoal(""); }}
            className={`${pillBase} ${customIncome ? pillSelected : pillUnselected}`}
          >
            Custom
          </button>
        </div>
        {customIncome && (
          <input
            type="text"
            value={customIncomeText}
            onChange={(e) => setCustomIncomeText(e.target.value)}
            placeholder="e.g. $75,000 / year"
            className="mt-2 w-full border border-[var(--abv-text)]/20 dark:border-white/20 rounded-lg px-3 py-2 text-sm text-[var(--abv-text)] dark:text-white placeholder-[var(--abv-text)]/30 dark:placeholder-white/30 bg-white dark:bg-[#0f1419] focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/40"
          />
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-[var(--abv-text)] dark:text-white mb-2">Posting rhythm</label>
        <div className="flex flex-wrap gap-2">
          {RHYTHM_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => selectRhythm(opt.value)}
              className={`${pillBase} ${!customRhythm && postingRhythm === opt.value ? pillSelected : pillUnselected}`}
            >
              {opt.label}
            </button>
          ))}
          <button
            onClick={() => { setCustomRhythm(true); setPostingRhythm(null); }}
            className={`${pillBase} ${customRhythm ? pillSelected : pillUnselected}`}
          >
            Custom
          </button>
        </div>
        {customRhythm && (
          <input
            type="number"
            min={1}
            value={customRhythmVal}
            onChange={(e) => setCustomRhythmVal(e.target.value)}
            placeholder="Videos per month"
            className="mt-2 w-full border border-[var(--abv-text)]/20 dark:border-white/20 rounded-lg px-3 py-2 text-sm text-[var(--abv-text)] dark:text-white placeholder-[var(--abv-text)]/30 dark:placeholder-white/30 bg-white dark:bg-[#0f1419] focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/40"
          />
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-[var(--abv-text)] dark:text-white mb-0.5">Biggest challenge right now</label>
        <p className="text-xs text-[var(--abv-text)]/50 dark:text-white/40 mb-2">Optional — helps your coach understand where you&apos;re at.</p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {CHALLENGE_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => setChallenge(chip)}
              className={`${chipBase} ${challenge === chip ? chipSelected : chipUnselected}`}
            >
              {chip}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={challenge}
          onChange={(e) => setChallenge(e.target.value)}
          placeholder="Or describe it in your own words..."
          className="w-full border border-[var(--abv-text)]/20 dark:border-white/20 rounded-lg px-3 py-2 text-sm text-[var(--abv-text)] dark:text-white placeholder-[var(--abv-text)]/30 dark:placeholder-white/30 bg-white dark:bg-[#0f1419] focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/40"
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

"use client";

/**
 * Wave 2 wizard — Step 2C: Theme picker.
 * Wave 4 — after the theme is picked, surface an optional "Narrow to
 * property type?" panel before the member continues to Step 3.
 *
 * The URL param name stays `rotationSlot` (wire/API contract) — display
 * labels call it "theme" per the Wave 2.5 UX polish. When the user picks a
 * theme we set local state; the PropertyTypePicker then renders below and
 * a Continue button writes both into the Step 3 URL.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ROTATION_SLOTS,
  rotationSlotToTheme,
  type RotationSlotKey,
} from "@/lib/content-engine-validation";
import { PropertyTypePicker } from "./PropertyTypePicker";
import type { PropertyTypeFocus } from "@/lib/property-type-focus";

interface SlotMeta {
  key: RotationSlotKey;
  label: string;
  blurb: string;
  emoji: string;
}

const SLOTS: SlotMeta[] = [
  {
    key: "market_update",
    label: "Market Update",
    blurb: "Headline numbers from your latest month — what changed, what moved, and why it matters to a buyer or seller right now.",
    emoji: "📊",
  },
  {
    key: "neighbourhood_fact",
    label: "Neighbourhood Fact",
    blurb: "Specific neighbourhood-level patterns — a list, a comparison, or a single area with a striking number.",
    emoji: "🏘️",
  },
  {
    key: "contrarian_take",
    label: "Contrarian Take",
    blurb: "The pattern most people are missing or misreading. Reframes the prevailing narrative with data.",
    emoji: "🔄",
  },
  {
    key: "do_not",
    label: "Do Not",
    blurb: "A specific warning — neighbourhoods, property types, or pricing positions that look wrong on the data right now.",
    emoji: "🚫",
  },
  {
    key: "should_you",
    label: "Should You",
    blurb: "A direct question buyers and sellers are asking, answered with the data (e.g. \"Should You Wait Until Spring?\").",
    emoji: "❓",
  },
];

interface Props {
  initialFocus?: PropertyTypeFocus;
  preselectedSlot?: RotationSlotKey;
}

export function Step2CRotationSlot({ initialFocus = "Any", preselectedSlot }: Props) {
  const router = useRouter();
  const known = new Set<string>(ROTATION_SLOTS);
  const [slot, setSlot] = useState<RotationSlotKey | null>(
    preselectedSlot && known.has(preselectedSlot) ? preselectedSlot : null,
  );
  const [focus, setFocus] = useState<PropertyTypeFocus>(initialFocus);

  function pickTheme(s: RotationSlotKey) {
    setSlot(s);
  }

  function continueToIdeas() {
    if (!slot) return;
    const params = new URLSearchParams({ step: "3", rotationSlot: slot });
    if (focus !== "Any") params.set("propertyTypeFocus", focus);
    router.push(`/member/content-planner/wizard?${params.toString()}`);
  }

  if (slot) {
    const meta = SLOTS.find((s) => s.key === slot);
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Theme picked
          </p>
          <div className="mt-1 flex items-center gap-3">
            <span className="text-2xl">{meta?.emoji}</span>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {meta?.label ?? rotationSlotToTheme(slot)}
            </h3>
            <button
              type="button"
              onClick={() => setSlot(null)}
              className="ml-auto text-xs text-gray-500 underline hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Pick a different theme
            </button>
          </div>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {meta?.blurb}
          </p>
        </div>

        <PropertyTypePicker
          value={focus}
          onChange={setFocus}
          label="Narrow to a property type?"
          helper="Optional. Lock to one type if you want every idea (and the eventual script) anchored on Detached / Semi-Detached / Row/Townhouse / Apartment. Leave on Any to let the data decide."
        />

        <div className="flex justify-end">
          <button
            type="button"
            onClick={continueToIdeas}
            className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Generate ideas →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
        Pick the type of video. We&apos;ll generate 5 ideas in that theme, anchored on your validated facts.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SLOTS.filter((s) => known.has(s.key)).map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => pickTheme(s.key)}
            className="group flex flex-col rounded-lg border border-gray-200 bg-white p-6 text-left shadow-sm transition hover:border-blue-400 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-500"
          >
            <div className="text-3xl">{s.emoji}</div>
            <h3 className="mt-3 text-base font-semibold text-gray-900 dark:text-gray-100">
              {s.label}
            </h3>
            <p className="mt-2 flex-1 text-sm text-gray-600 dark:text-gray-400">
              {s.blurb}
            </p>
            <span className="mt-4 inline-flex items-center text-sm font-medium text-blue-600 group-hover:text-blue-700 dark:text-blue-400 dark:group-hover:text-blue-300">
              Pick this theme →
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

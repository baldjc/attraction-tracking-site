/**
 * Wave 2 wizard — Step 2C: Rotation Slot picker.
 *
 * 5 cards (one per slot) with a short description; clicking takes the user
 * to Step 3 with the slot pinned via ?rotationSlot=<slot>.
 */
import Link from "next/link";
import { ROTATION_SLOTS, type RotationSlotKey } from "@/lib/content-engine-validation";

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

export function Step2CRotationSlot() {
  // Tiny defence-in-depth: ensure each rotation slot card matches a real
  // ROTATION_SLOTS value. (Hard-coded above for ordering / copy control.)
  const known = new Set<string>(ROTATION_SLOTS);

  return (
    <div>
      <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
        Pick the type of video. We&apos;ll generate 5 ideas in that slot, anchored on your validated facts.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SLOTS.filter((s) => known.has(s.key)).map((s) => (
          <Link
            key={s.key}
            href={`/member/content-planner/wizard?step=3&rotationSlot=${s.key}`}
            className="group flex flex-col rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition hover:border-blue-400 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-500"
          >
            <div className="text-3xl">{s.emoji}</div>
            <h3 className="mt-3 text-base font-semibold text-gray-900 dark:text-gray-100">
              {s.label}
            </h3>
            <p className="mt-2 flex-1 text-sm text-gray-600 dark:text-gray-400">
              {s.blurb}
            </p>
            <span className="mt-4 inline-flex items-center text-sm font-medium text-blue-600 group-hover:text-blue-700 dark:text-blue-400 dark:group-hover:text-blue-300">
              Pick this slot →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

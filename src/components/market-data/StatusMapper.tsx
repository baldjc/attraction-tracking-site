"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { MappableBucket } from "@/lib/market-status-buckets";

export interface UnknownStatusValue {
  value: string;
  count: number;
  proposed: MappableBucket | null;
}

interface Props {
  /** Distinct raw status values that don't resolve under the saved mapping. */
  values: UnknownStatusValue[];
  saving?: boolean;
  onSave: (confirmations: Record<string, MappableBucket>) => void;
  onCancel: () => void;
  title?: string;
  intro?: string;
  saveLabel?: string;
}

/** "" = leave unmapped (rows stay uncounted). */
type Selection = MappableBucket | "";

const BUCKET_OPTIONS: { value: MappableBucket; label: string }[] = [
  { value: "sold", label: "Sold" },
  { value: "active", label: "Active / For sale" },
  { value: "pending", label: "Pending / Under contract" },
  { value: "offMarket", label: "Off-market (expired / cancelled / withdrawn)" },
];

export default function StatusMapper({
  values,
  saving = false,
  onSave,
  onCancel,
  title = "Confirm your status values",
  intro = "Your file has status values we haven't seen before. Tell us what each one means so your sold / active / pending counts are correct. We'll remember these for next time.",
  saveLabel = "Save & continue",
}: Props) {
  const [selection, setSelection] = useState<Record<string, Selection>>(() => {
    const init: Record<string, Selection> = {};
    for (const v of values) init[v.value] = v.proposed ?? "";
    return init;
  });

  const ignoredCount = values.filter((v) => !selection[v.value]).length;

  function setValue(label: string, bucket: Selection) {
    setSelection((s) => ({ ...s, [label]: bucket }));
  }

  function handleSave() {
    const confirmations: Record<string, MappableBucket> = {};
    for (const v of values) {
      const b = selection[v.value];
      if (b) confirmations[v.value] = b;
    }
    onSave(confirmations);
  }

  return (
    <div className="rounded-md border-2 border-blue-400 bg-white p-4 dark:border-blue-500 dark:bg-gray-900">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="text-lg">
          🏷️
        </span>
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h3>
      </div>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{intro}</p>

      <div className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">
        {values.map((v) => (
          <div
            key={v.value}
            className="grid grid-cols-12 items-center gap-2 py-2 text-sm"
          >
            <span className="col-span-5 truncate text-gray-800 dark:text-gray-200">
              <span className="font-medium">{v.value}</span>
              <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                · {v.count.toLocaleString()} row{v.count === 1 ? "" : "s"}
              </span>
            </span>
            <span className="col-span-1 text-center text-gray-400">→</span>
            <select
              value={selection[v.value] ?? ""}
              disabled={saving}
              onChange={(e) => setValue(v.value, e.target.value as Selection)}
              className="col-span-6 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 disabled:opacity-60"
            >
              <option value="">Leave unmapped (don&apos;t count these)</option>
              {BUCKET_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                  {v.proposed === o.value ? "  (suggested)" : ""}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {ignoredCount > 0 && (
        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
          {ignoredCount} value{ignoredCount === 1 ? "" : "s"} left unmapped — rows
          with {ignoredCount === 1 ? "that value" : "those values"} won&apos;t be
          counted toward any metric. Map {ignoredCount === 1 ? "it" : "them"} above
          if {ignoredCount === 1 ? "it represents" : "they represent"} real sold,
          active, pending, or off-market listings.
        </p>
      )}

      <div className="mt-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="text-sm text-gray-500 hover:underline disabled:opacity-60"
        >
          Cancel
        </button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : saveLabel}
        </Button>
      </div>
    </div>
  );
}

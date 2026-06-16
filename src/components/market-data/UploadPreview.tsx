"use client";

import { Button } from "@/components/ui/Button";

export interface PreviewCounts {
  sold: number;
  active: number;
  pending: number;
  offMarket: number;
  unknown: number;
}

export interface SampleRowField {
  field: string;
  label: string;
  column: string | null;
  value: string | null;
  mapped: boolean;
}

interface Props {
  filename: string;
  rowCount: number;
  counts: PreviewCounts;
  sampleRow: SampleRowField[];
  /** Number of distinct status values that don't resolve (after mapping). */
  unmappedStatusCount?: number;
  saving?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
}

const COUNT_TILES: { key: keyof PreviewCounts; label: string; tone: string }[] = [
  { key: "sold", label: "Sold", tone: "text-green-700 dark:text-green-300" },
  { key: "active", label: "Active", tone: "text-blue-700 dark:text-blue-300" },
  {
    key: "pending",
    label: "Pending",
    tone: "text-amber-700 dark:text-amber-300",
  },
  {
    key: "offMarket",
    label: "Off-market",
    tone: "text-rose-700 dark:text-rose-300",
  },
];

export default function UploadPreview({
  filename,
  rowCount,
  counts,
  sampleRow,
  unmappedStatusCount = 0,
  saving = false,
  onConfirm,
  onCancel,
  confirmLabel = "Looks right — upload",
}: Props) {
  const classifiedTotal =
    counts.sold + counts.active + counts.pending + counts.offMarket;
  const noSold = counts.sold === 0;

  return (
    <div className="rounded-md border-2 border-blue-400 bg-white p-4 dark:border-blue-500 dark:bg-gray-900">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="text-lg">
          🔎
        </span>
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          Quick check before we validate
        </h3>
      </div>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Here&apos;s how we read{" "}
        <span className="font-medium">{filename}</span> ({rowCount.toLocaleString()}{" "}
        rows) using your column and status mapping. Confirm it looks right before
        we run a full validation.
      </p>

      {/* Classified counts */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {COUNT_TILES.map((t) => (
          <div
            key={t.key}
            className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-950"
          >
            <div className={`text-lg font-semibold ${t.tone}`}>
              {counts[t.key].toLocaleString()}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {t.label}
            </div>
          </div>
        ))}
      </div>

      {counts.unknown > 0 && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          {counts.unknown.toLocaleString()} row
          {counts.unknown === 1 ? "" : "s"}
          {unmappedStatusCount > 0
            ? ` with ${unmappedStatusCount} unmapped status value${
                unmappedStatusCount === 1 ? "" : "s"
              }`
            : ""}{" "}
          won&apos;t be counted. That&apos;s fine if they&apos;re statuses you
          don&apos;t track — otherwise go back and map them.
        </p>
      )}

      {classifiedTotal === 0 && (
        <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
          ⚠ No rows classified into any bucket — your status column mapping is
          probably off. Go back and check it before uploading.
        </p>
      )}
      {classifiedTotal > 0 && noSold && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          ⚠ No <span className="font-medium">sold</span> rows detected. Most
          metrics need closed sales — double-check your status mapping if this
          file should contain sales.
        </p>
      )}

      {/* Sample row read through the mapping */}
      <div className="mt-4">
        <div className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
          Sample row, as we read it
        </div>
        <div className="mt-1 divide-y divide-gray-100 dark:divide-gray-800">
          {sampleRow.map((f) => (
            <div
              key={f.field}
              className="grid grid-cols-12 items-center gap-2 py-1.5 text-sm"
            >
              <span className="col-span-4 text-gray-600 dark:text-gray-400">
                {f.label}
              </span>
              <span className="col-span-8">
                {f.mapped ? (
                  <span className="text-gray-900 dark:text-gray-100">
                    {f.value && f.value.trim() ? (
                      f.value
                    ) : (
                      <span className="text-gray-400 italic">(empty)</span>
                    )}
                    {f.column && (
                      <span className="ml-2 text-xs text-gray-400">
                        ← {f.column}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400 text-xs">
                    not mapped
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="text-sm text-gray-500 hover:underline disabled:opacity-60"
        >
          Back
        </button>
        <Button onClick={onConfirm} disabled={saving || classifiedTotal === 0}>
          {saving ? "Uploading…" : confirmLabel}
        </Button>
      </div>
    </div>
  );
}

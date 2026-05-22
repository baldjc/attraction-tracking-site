"use client";

import { useEffect, useState } from "react";

interface Row {
  id: string;
  label: string;
  monthYear: string;
  csvFileName: string;
  rowCount: number;
  status: string;
  uploadedAt: string;
}

interface Props {
  initial: Row[];
}

function fmt(ts: string) {
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch {
    return ts;
  }
}

function statusBadge(status: string) {
  const base =
    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";
  switch (status) {
    case "pending":
      return (
        <span
          className={`${base} bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300`}
        >
          Pending
        </span>
      );
    case "validating":
      return (
        <span
          className={`${base} bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300`}
        >
          Validating
        </span>
      );
    case "validated":
      return (
        <span
          className={`${base} bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300`}
        >
          Validated
        </span>
      );
    case "failed":
      return (
        <span
          className={`${base} bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300`}
        >
          Failed
        </span>
      );
    default:
      return (
        <span
          className={`${base} bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300`}
        >
          {status}
        </span>
      );
  }
}

export default function UploadHistoryTable({ initial }: Props) {
  const [rows] = useState<Row[]>(initial);
  const [shimmerIds, setShimmerIds] = useState<Set<string>>(new Set());

  // Soft shimmer on rows uploaded within the last 3 seconds — gives the bulk
  // upload "I see it landed" feedback.
  useEffect(() => {
    const now = Date.now();
    const recent = new Set(
      rows
        .filter((r) => now - new Date(r.uploadedAt).getTime() < 3_000)
        .map((r) => r.id),
    );
    if (recent.size === 0) return;
    setShimmerIds(recent);
    const t = setTimeout(() => setShimmerIds(new Set()), 1_200);
    return () => clearTimeout(t);
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
        No uploads yet. Drop your monthly CSV (or last 12 months for backfill)
        above to get started.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
        <thead className="bg-gray-50 dark:bg-gray-800/50">
          <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <th className="px-3 py-2 font-medium">Label</th>
            <th className="px-3 py-2 font-medium">Filename</th>
            <th className="px-3 py-2 font-medium">Month</th>
            <th className="px-3 py-2 font-medium">Uploaded</th>
            <th className="px-3 py-2 font-medium text-right">Rows</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
          {rows.map((r) => (
            <tr
              key={r.id}
              className={
                shimmerIds.has(r.id)
                  ? "animate-pulse bg-blue-50/50 dark:bg-blue-900/10"
                  : ""
              }
            >
              <td className="px-3 py-2 text-gray-900 dark:text-gray-100">
                {r.label}
              </td>
              <td className="px-3 py-2 text-gray-600 dark:text-gray-400 truncate max-w-xs">
                {r.csvFileName}
              </td>
              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                {r.monthYear}
              </td>
              <td
                className="px-3 py-2 text-gray-700 dark:text-gray-300"
                suppressHydrationWarning
              >
                {fmt(r.uploadedAt)}
              </td>
              <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300 tabular-nums">
                {r.rowCount.toLocaleString()}
              </td>
              <td className="px-3 py-2">{statusBadge(r.status)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AiThinkingDots } from "@/components/ai/AiThinkingDots";

interface Row {
  id: string;
  label: string;
  monthYear: string;
  csvFileName: string;
  rowCount: number;
  status: string;
  uploadedAt: string;
  validatedAt?: string | null;
  validationCostUsd?: number | null;
  validationError?: string | null;
  factCount?: number;
  storyLeadCount?: number;
}

interface Props {
  initial: Row[];
}

const TERMINAL = new Set(["validated", "failed"]);
const POLL_INTERVAL_MS = 3_000;

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
  const [rows, setRows] = useState<Row[]>(initial);
  const [shimmerIds, setShimmerIds] = useState<Set<string>>(new Set());
  const [errorModal, setErrorModal] = useState<{ id: string; message: string } | null>(
    null,
  );

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
    // We intentionally don't include rows in deps after the initial mount —
    // shimmer is a one-shot "row appeared" effect for the just-uploaded batch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track in-flight pollers so we can stop them when every row is terminal.
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollOnce = useCallback(async (idsToCheck: string[]) => {
    if (idsToCheck.length === 0) return;
    const results = await Promise.all(
      idsToCheck.map(async (id) => {
        try {
          const res = await fetch(`/api/member/market-data/upload/${id}`, {
            cache: "no-store",
          });
          if (!res.ok) return null;
          return (await res.json()) as Row;
        } catch {
          return null;
        }
      }),
    );
    setRows((prev) =>
      prev.map((r) => {
        const updated = results.find((x) => x && x.id === r.id);
        if (!updated) return r;
        return { ...r, ...updated };
      }),
    );
  }, []);

  useEffect(() => {
    const nonTerminal = rows.filter((r) => !TERMINAL.has(r.status)).map((r) => r.id);
    if (nonTerminal.length === 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    // Kick off an immediate poll so the user sees "validating" within a second
    // of upload, not 3 seconds later.
    pollOnce(nonTerminal);
    if (intervalRef.current) return; // already polling — let the effect re-run
    intervalRef.current = setInterval(() => {
      // Recompute the in-flight list from the latest state each tick.
      setRows((current) => {
        const stillPending = current
          .filter((r) => !TERMINAL.has(r.status))
          .map((r) => r.id);
        if (stillPending.length === 0) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        } else {
          // Fire-and-forget — setRows will get the real update from pollOnce.
          void pollOnce(stillPending);
        }
        return current;
      });
    }, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // We only want to re-establish the interval when the set of pending IDs
    // changes — depending on `rows` directly would tear down the interval on
    // every poll-driven state update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    rows.map((r) => `${r.id}:${TERMINAL.has(r.status) ? "T" : "P"}`).join("|"),
    pollOnce,
  ]);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
        No uploads yet. Drop your monthly CSV (or last 12 months for backfill)
        above to get started.
      </div>
    );
  }

  return (
    <>
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
              <th className="px-3 py-2 font-medium">Result</th>
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
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-2">
                    {statusBadge(r.status)}
                    {r.status === "validating" || r.status === "pending" ? (
                      <AiThinkingDots className="!text-xs" />
                    ) : null}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
                  {r.status === "validated" ? (
                    <span>
                      {(r.factCount ?? 0).toLocaleString()} facts ·{" "}
                      {(r.storyLeadCount ?? 0).toLocaleString()} leads
                      {typeof r.validationCostUsd === "number"
                        ? ` · $${r.validationCostUsd.toFixed(2)}`
                        : ""}
                    </span>
                  ) : r.status === "failed" ? (
                    <button
                      type="button"
                      onClick={() =>
                        setErrorModal({
                          id: r.id,
                          message: r.validationError || "Validation failed.",
                        })
                      }
                      className="text-red-600 underline-offset-2 hover:underline dark:text-red-400"
                    >
                      View error
                    </button>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {errorModal ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setErrorModal(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-6 shadow-xl dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Validation error
              </h3>
              <button
                type="button"
                onClick={() => setErrorModal(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <pre className="whitespace-pre-wrap break-words rounded bg-gray-50 p-3 text-xs text-gray-800 dark:bg-gray-950 dark:text-gray-200">
              {errorModal.message}
            </pre>
          </div>
        </div>
      ) : null}
    </>
  );
}

"use client";

// Wave 1 Phase 2A — member upload history with friendly errors + retry.
//
// Polls the per-upload status endpoint every 3s while any row is non-
// terminal. On failure, classifies the raw validator error to a human
// message via classifyUploadError() and exposes a Retry button gated on
// canRetry + retryCount < 3.
//
// Optimistic update on retry: we flip the row to 'pending' locally so
// the polling effect immediately re-arms and the member sees movement
// within ~1s instead of waiting for the next 3s tick.

import { useCallback, useEffect, useRef, useState } from "react";
import { AiThinkingDots } from "@/components/ai/AiThinkingDots";
import {
  classifyUploadError,
  type FriendlyError,
} from "@/lib/upload-error-messages";

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
  retryCount?: number;
  factCount?: number;
  storyLeadCount?: number;
}

interface Props {
  initial: Row[];
}

const TERMINAL = new Set(["validated", "failed"]);
const POLL_INTERVAL_MS = 3_000;
const MAX_RETRIES = 3;
const SUPPORT_EMAIL = "support@attractionbyvideo.com";

function fmt(ts: string) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function statusBadge(status: string) {
  const base =
    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";
  switch (status) {
    case "pending":
      return <span className={`${base} bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300`}>Pending</span>;
    case "validating":
      return <span className={`${base} bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300`}>Validating</span>;
    case "validated":
      return <span className={`${base} bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300`}>Validated</span>;
    case "failed":
      return <span className={`${base} bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300`}>Failed</span>;
    default:
      return <span className={`${base} bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300`}>{status}</span>;
  }
}

interface ErrorModalState {
  row: Row;
  friendly: FriendlyError;
}

export default function UploadHistoryTable({ initial }: Props) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [shimmerIds, setShimmerIds] = useState<Set<string>>(new Set());
  const [errorModal, setErrorModal] = useState<ErrorModalState | null>(null);
  const [retrying, setRetrying] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ kind: "error" | "info"; msg: string } | null>(null);

  // One-shot "row appeared" shimmer for just-uploaded rows.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh on new uploads. UploadPanel dispatches `market-data:uploaded`
  // after a successful POST. We refetch /uploads, prepend any rows we didn't
  // already have, and flash them blue. router.refresh() on the page (also
  // fired by UploadPanel) reloads RSC for the progress banner, but won't
  // re-mount this client component since its `initial` prop is captured
  // once — so this listener is the source of truth for "new row appeared".
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const onUploaded = async () => {
      try {
        const res = await fetch("/api/member/market-data/uploads", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const j = (await res.json()) as { uploads: Row[] };
        if (cancelled || !Array.isArray(j.uploads)) return;
        setRows((prev) => {
          const prevIds = new Set(prev.map((r) => r.id));
          const newIds = j.uploads
            .filter((u) => !prevIds.has(u.id))
            .map((u) => u.id);
          if (newIds.length > 0) {
            setShimmerIds(new Set(newIds));
            setTimeout(() => {
              if (!cancelled) setShimmerIds(new Set());
            }, 1_500);
          }
          // Replace wholesale — the server is the source of truth for status,
          // factCount, etc. Preserve nothing local; the polling effect will
          // re-arm for any non-terminal rows.
          return j.uploads;
        });
      } catch {
        // Network blip — next router.refresh will catch us up.
      }
    };
    window.addEventListener("market-data:uploaded", onUploaded);
    return () => {
      cancelled = true;
      window.removeEventListener("market-data:uploaded", onUploaded);
    };
  }, []);

  // Auto-dismiss toasts.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5_000);
    return () => clearTimeout(t);
  }, [toast]);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollOnce = useCallback(async (idsToCheck: string[]) => {
    if (idsToCheck.length === 0) return;
    const results = await Promise.all(
      idsToCheck.map(async (id) => {
        try {
          const res = await fetch(`/api/member/market-data/upload/${id}`, { cache: "no-store" });
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
    pollOnce(nonTerminal);
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => {
      setRows((current) => {
        const stillPending = current.filter((r) => !TERMINAL.has(r.status)).map((r) => r.id);
        if (stillPending.length === 0) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        } else {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    rows.map((r) => `${r.id}:${TERMINAL.has(r.status) ? "T" : "P"}`).join("|"),
    pollOnce,
  ]);

  const onRetry = useCallback(
    async (row: Row) => {
      if (retrying.has(row.id)) return;
      setRetrying((prev) => new Set(prev).add(row.id));
      // Optimistic — flip to pending so the polling effect re-arms.
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? { ...r, status: "pending", validationError: null, validationCostUsd: null }
            : r,
        ),
      );
      try {
        const res = await fetch(`/api/member/market-data/upload/${row.id}/retry`, {
          method: "POST",
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as {
            message?: string;
            error?: string;
          };
          // Roll the optimistic update back so the badge returns to 'failed'.
          setRows((prev) =>
            prev.map((r) =>
              r.id === row.id ? { ...r, status: "failed", validationError: row.validationError } : r,
            ),
          );
          setToast({
            kind: "error",
            msg: j.message ?? j.error ?? "Couldn't queue the retry. Try again in a minute.",
          });
        } else {
          setErrorModal(null);
          setToast({ kind: "info", msg: "Retry queued — watch the status column." });
        }
      } catch (e) {
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id ? { ...r, status: "failed", validationError: row.validationError } : r,
          ),
        );
        setToast({ kind: "error", msg: (e as Error).message || "Network error." });
      } finally {
        setRetrying((prev) => {
          const next = new Set(prev);
          next.delete(row.id);
          return next;
        });
      }
    },
    [retrying],
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
        No uploads yet. Drop your monthly CSV (or last 12 months for backfill) above to get started.
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
            {rows.map((r) => {
              const retryCount = r.retryCount ?? 0;
              const isRetrying = retrying.has(r.id);
              return (
                <tr
                  key={r.id}
                  className={shimmerIds.has(r.id) ? "animate-pulse bg-blue-50/50 dark:bg-blue-900/10" : ""}
                >
                  <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{r.label}</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-400 truncate max-w-xs">
                    {r.csvFileName}
                  </td>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{r.monthYear}</td>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300" suppressHydrationWarning>
                    {fmt(r.uploadedAt)}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300 tabular-nums">
                    {r.rowCount.toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex flex-wrap items-center gap-2">
                      {statusBadge(r.status)}
                      {(r.status === "validating" || r.status === "pending") && (
                        <AiThinkingDots className="!text-xs" />
                      )}
                      {retryCount > 0 && r.status !== "validated" && (
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">
                          Retried {retryCount}/{MAX_RETRIES}
                        </span>
                      )}
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
                      <FailedCell
                        row={r}
                        retryCount={retryCount}
                        isRetrying={isRetrying}
                        onView={() =>
                          setErrorModal({
                            row: r,
                            friendly: classifyUploadError(r.validationError ?? "", {
                              rowCount: r.rowCount,
                              retryCount,
                            }),
                          })
                        }
                        onRetry={() => onRetry(r)}
                      />
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {errorModal && (
        <ErrorModal
          state={errorModal}
          isRetrying={retrying.has(errorModal.row.id)}
          onClose={() => setErrorModal(null)}
          onRetry={() => onRetry(errorModal.row)}
        />
      )}

      {toast && (
        <div
          role="status"
          className={`fixed bottom-4 right-4 z-50 max-w-sm rounded-md border px-4 py-3 text-sm shadow-lg ${
            toast.kind === "error"
              ? "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200"
              : "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </>
  );
}

function FailedCell({
  row,
  retryCount,
  isRetrying,
  onView,
  onRetry,
}: {
  row: Row;
  retryCount: number;
  isRetrying: boolean;
  onView: () => void;
  onRetry: () => void;
}) {
  const friendly = classifyUploadError(row.validationError ?? "", {
    rowCount: row.rowCount,
    retryCount,
  });
  const canRetry = friendly.canRetry && retryCount < MAX_RETRIES;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onView}
        className="text-red-600 underline-offset-2 hover:underline dark:text-red-400"
      >
        {friendly.title}
      </button>
      {canRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={isRetrying}
          className="rounded bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          {isRetrying ? "Queuing…" : "Retry"}
        </button>
      )}
      {!friendly.canRetry && friendly.nextAction === "contact_support" && (
        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=Upload%20${encodeURIComponent(row.id)}`}
          className="rounded border border-gray-300 px-2 py-0.5 text-[11px] font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Contact support
        </a>
      )}
    </div>
  );
}

function ErrorModal({
  state,
  isRetrying,
  onClose,
  onRetry,
}: {
  state: ErrorModalState;
  isRetrying: boolean;
  onClose: () => void;
  onRetry: () => void;
}) {
  const { row, friendly } = state;
  const retryCount = row.retryCount ?? 0;
  const canRetry = friendly.canRetry && retryCount < MAX_RETRIES;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-6 shadow-xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {friendly.title}
            </h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {row.label} · {row.monthYear} · {row.rowCount.toLocaleString()} rows
              {retryCount > 0 ? ` · retried ${retryCount}/${MAX_RETRIES}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <p className="text-sm text-gray-700 dark:text-gray-300">{friendly.body}</p>

        {row.validationError && (
          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
              Show technical detail
            </summary>
            <pre className="mt-2 whitespace-pre-wrap break-words rounded bg-gray-50 p-3 text-xs text-gray-800 dark:bg-gray-950 dark:text-gray-200">
              {row.validationError}
            </pre>
          </details>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          {friendly.nextAction === "contact_support" && (
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=Upload%20${encodeURIComponent(row.id)}`}
              className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Contact support
            </a>
          )}
          {canRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={isRetrying}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {isRetrying ? "Queuing…" : "Retry"}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

// Wave 1 Phase 2A — admin failed-uploads list. Server-side filtering by
// classified category, with counts in the dropdown so the operator can
// spot a brewing system-wide problem at a glance.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { ERROR_CATEGORY_LABELS, type UploadErrorCategory } from "@/lib/upload-error-messages";
import { useToast } from "@/components/ToastProvider";

interface FailedRow {
  id: string;
  userId: string;
  memberEmail: string | null;
  memberName: string | null;
  label: string;
  monthYear: string;
  csvFileName: string;
  rowCount: number;
  uploadedAt: string;
  retryCount: number;
  rawError: string;
  category: UploadErrorCategory;
  categoryLabel: string;
  friendlyTitle: string;
}

interface ApiResponse {
  rows: FailedRow[];
  totalMatching: number;
  totalAll: number;
  categoryCounts: Partial<Record<UploadErrorCategory, number>>;
}

const CATEGORY_ORDER: UploadErrorCategory[] = [
  "file_too_large",
  "context_overflow",
  "cost_cap",
  "save_timeout",
  "stream_interrupted",
  "provider_overloaded",
  "parse_error",
  "unknown",
];

export default function FailedUploadsPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<UploadErrorCategory | "">("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = category ? `?category=${category}` : "";
      const res = await fetch(`/api/admin/market-data/failed-uploads${qs}`, { cache: "no-store" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Request failed (${res.status})`);
      }
      setData((await res.json()) as ApiResponse);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const revalidate = async (row: FailedRow) => {
    const who = row.memberName?.trim() || row.memberEmail || "this member";
    const ok = window.confirm(
      `Re-validate this upload using the current validator code? Existing facts will be cleared and rebuilt. AI cost (~$1-2) attributes to ${who}.`,
    );
    if (!ok) return;
    setBusyId(row.id);
    try {
      const res = await fetch(
        `/api/admin/market-data/upload/${row.id}/revalidate`,
        { method: "POST" },
      );
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        factsBefore?: number;
      };
      if (!res.ok) {
        throw new Error(j.message ?? j.error ?? `Failed (${res.status})`);
      }
      toast.success(
        `Re-validation queued (had ${j.factsBefore ?? 0} facts). It will drop off this list once it succeeds — refresh in a minute.`,
      );
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const categoryOptions = useMemo(() => {
    const counts = data?.categoryCounts ?? {};
    return CATEGORY_ORDER.map((c) => ({
      value: c,
      label: `${ERROR_CATEGORY_LABELS[c]} (${counts[c] ?? 0})`,
      count: counts[c] ?? 0,
    }));
  }, [data]);

  return (
    <div className="max-w-6xl mx-auto space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          Failed market-data uploads
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Every failed validation across every member. Filter by category to spot patterns.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className="text-gray-700 dark:text-gray-300">Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as UploadErrorCategory | "")}
            className="mt-1 block w-64 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="">All categories ({data?.totalAll ?? 0})</option>
            {categoryOptions.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.count === 0}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
        <div className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
          {loading
            ? "…"
            : data
              ? `${data.rows.length} of ${data.totalMatching} matching · ${data.totalAll} total`
              : ""}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-gray-800/50">
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <th className="px-3 py-2 font-medium">Member</th>
              <th className="px-3 py-2 font-medium">Month</th>
              <th className="px-3 py-2 font-medium text-right">Rows</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Error</th>
              <th className="px-3 py-2 font-medium text-right">Retries</th>
              <th className="px-3 py-2 font-medium">Uploaded</th>
              <th className="px-3 py-2 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {data?.rows.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  No failed uploads match this filter.
                </td>
              </tr>
            )}
            {data?.rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2">
                  <div className="text-gray-900 dark:text-gray-100">{r.memberName ?? "—"}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{r.memberEmail ?? "—"}</div>
                </td>
                <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{r.monthYear}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">
                  {r.rowCount.toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                    {r.categoryLabel}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
                  <div className="font-medium text-gray-900 dark:text-gray-100">{r.friendlyTitle}</div>
                  <button
                    type="button"
                    onClick={() => toggle(r.id)}
                    className="mt-1 text-[11px] text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {expanded.has(r.id) ? "Hide raw error" : "Show raw error"}
                  </button>
                  {expanded.has(r.id) && (
                    <pre className="mt-1 max-w-md whitespace-pre-wrap break-words rounded bg-gray-50 p-2 text-[11px] text-gray-700 dark:bg-gray-950 dark:text-gray-300">
                      {r.rawError || "(empty)"}
                    </pre>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">
                  {r.retryCount}
                </td>
                <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400" suppressHydrationWarning>
                  {new Date(r.uploadedAt).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => void revalidate(r)}
                    disabled={busyId === r.id}
                    className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    <ArrowPathIcon
                      className={`w-3.5 h-3.5 ${busyId === r.id ? "animate-spin" : ""}`}
                    />
                    {busyId === r.id ? "Queuing…" : "Re-validate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

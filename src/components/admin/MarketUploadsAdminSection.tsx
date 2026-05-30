"use client";

// Admin "Market data uploads" section for /admin/members/[id]. Lists all of a
// member's MarketDataUpload rows (any status) with their fact count, and lets
// an admin re-validate any one of them using the current validator code —
// without forcing the member to re-upload.

import { useCallback, useEffect, useState } from "react";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { useToast } from "@/components/ToastProvider";

interface UploadRow {
  id: string;
  label: string;
  monthYear: string;
  csvFileName: string;
  rowCount: number;
  status: "pending" | "validating" | "validated" | "failed";
  uploadedAt: string;
  validatedAt: string | null;
  validationError: string | null;
  validationCostUsd: number | null;
  retryCount: number;
  factsCount: number;
}

const STATUS_STYLES: Record<UploadRow["status"], string> = {
  validated: "bg-green-100 text-green-700",
  validating: "bg-blue-100 text-blue-700",
  failed: "bg-[#ffe5ea] text-[var(--abv-crimson)]",
  pending: "bg-gray-100 text-gray-600",
};

export default function MarketUploadsAdminSection({
  memberId,
  memberName,
}: {
  memberId: string;
  memberName?: string | null;
}) {
  const [rows, setRows] = useState<UploadRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/market-data/member-uploads?userId=${encodeURIComponent(memberId)}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Request failed (${res.status})`);
      }
      const j = (await res.json()) as { rows: UploadRow[] };
      setRows(j.rows);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    void load();
  }, [load]);

  const revalidate = async (row: UploadRow) => {
    const who = memberName?.trim() || "this member";
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
        `Re-validation queued (had ${j.factsBefore ?? 0} facts). Refresh in a minute to see the rebuilt count.`,
      );
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--abv-text)]">
            Market data uploads
          </h2>
          <p className="text-xs text-[var(--abv-text)]/50 mt-0.5">
            Re-run validation on an existing upload using the current validator
            code — no re-upload needed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="text-xs text-[var(--abv-azure)] hover:underline disabled:opacity-50"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="bg-[#ffe5ea] border border-[var(--abv-crimson)]/20 text-[var(--abv-crimson)] rounded-lg p-3 text-sm mb-3">
          {error}
        </div>
      )}

      {!loading && rows && rows.length === 0 && (
        <p className="text-sm text-[var(--abv-text)]/40">
          No market-data uploads for this member yet.
        </p>
      )}

      {rows && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[var(--abv-text)]/40 border-b border-gray-100">
                <th className="px-3 py-2 font-medium">Upload</th>
                <th className="px-3 py-2 font-medium">Month</th>
                <th className="px-3 py-2 font-medium text-right">Rows</th>
                <th className="px-3 py-2 font-medium text-right">Facts</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Validated</th>
                <th className="px-3 py-2 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">
                    <div className="text-[var(--abv-text)]">{r.label}</div>
                    <div className="text-xs text-[var(--abv-text)]/40">
                      {r.csvFileName}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[var(--abv-text)]/70">
                    {r.monthYear}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--abv-text)]/70">
                    {r.rowCount.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--abv-text)]/70">
                    {r.factsCount.toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status]}`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td
                    className="px-3 py-2 text-xs text-[var(--abv-text)]/50"
                    suppressHydrationWarning
                  >
                    {r.validatedAt
                      ? new Date(r.validatedAt).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => void revalidate(r)}
                      disabled={busyId === r.id || r.status === "validating"}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-[var(--abv-text)] hover:bg-gray-50 disabled:opacity-50"
                    >
                      <ArrowPathIcon
                        className={`w-3.5 h-3.5 ${busyId === r.id ? "animate-spin" : ""}`}
                      />
                      {r.status === "validating"
                        ? "Validating…"
                        : busyId === r.id
                          ? "Queuing…"
                          : "Re-validate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

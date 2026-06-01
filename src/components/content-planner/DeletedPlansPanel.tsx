"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUturnLeftIcon } from "@heroicons/react/24/outline";

interface DeletedPlan {
  id: string;
  title: string | null;
  status: string;
  deletedAt: string | null;
}

/**
 * Admin-only surface for soft-deleted content plans. Fetches `${apiBase}?deleted=1`
 * and lets staff restore a plan (PUT `${apiBase}/<id>` with `{ restore: true }`),
 * which clears `deletedAt` and returns it to the member's planner. Renders nothing
 * when there are no deleted plans.
 */
export default function DeletedPlansPanel({
  apiBase,
  onRestored,
}: {
  apiBase: string;
  onRestored?: () => void;
}) {
  const [plans, setPlans] = useState<DeletedPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`${apiBase}?deleted=1`)
      .then(async (r) => {
        if (!r.ok) throw new Error("load failed");
        return r.json();
      })
      .then((d) => setPlans(Array.isArray(d?.plans) ? (d.plans as DeletedPlan[]) : []))
      .catch(() => setError("Couldn't load deleted plans."))
      .finally(() => setLoading(false));
  }, [apiBase]);

  useEffect(() => {
    load();
  }, [load]);

  const restore = async (id: string) => {
    setRestoringId(id);
    try {
      const res = await fetch(`${apiBase}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restore: true }),
      });
      if (!res.ok) throw new Error("restore failed");
      setPlans((prev) => prev.filter((p) => p.id !== id));
      onRestored?.();
    } catch {
      setError("Couldn't restore that plan. Please try again.");
    } finally {
      setRestoringId(null);
    }
  };

  if (loading) return null;
  if (!error && plans.length === 0) return null;

  return (
    <div className="mt-5 rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-[var(--abv-text)] mb-1">
        Deleted plans{plans.length > 0 ? ` (${plans.length})` : ""}
      </h3>
      <p className="text-xs text-[var(--abv-text)]/50 mb-3">
        Soft-deleted videos. Restoring returns a plan to the member&apos;s planner with its script,
        research, and AI content intact.
      </p>
      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
      <div className="divide-y divide-gray-100">
        {plans.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm text-[var(--abv-text)]">{p.title || "Untitled"}</p>
              <p className="text-[11px] text-[var(--abv-text)]/40">
                {p.status}
                {p.deletedAt
                  ? ` · deleted ${new Date(p.deletedAt).toLocaleDateString()}`
                  : ""}
              </p>
            </div>
            <button
              onClick={() => void restore(p.id)}
              disabled={restoringId === p.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 px-3 py-1 text-xs font-semibold text-[var(--abv-text)] hover:bg-gray-50 disabled:opacity-50"
            >
              <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
              {restoringId === p.id ? "Restoring…" : "Restore"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

/**
 * In-place fact picker for Script Builder v2. Lets a member search their
 * headline-safe MarketFact rows and link/unlink them on a ContentPlan without
 * leaving the Build-Script flow. Reached from the zero-fact block and the
 * auto-linked review panel.
 *
 * On save it PATCHes /api/member/content-plans/[id]/facts and calls
 * `onSaved(count)` so the caller can re-evaluate the gate (or refresh).
 */
import { useEffect, useMemo, useState } from "react";

interface PickerFact {
  id: string;
  neighbourhood: string;
  propertyType: string | null;
  metricLabel: string;
  metricValueString: string;
  monthYear: string;
}

export function FactPickerModal({
  planId,
  initialLinkedIds,
  onClose,
  onSaved,
}: {
  planId: string;
  initialLinkedIds: string[];
  onClose: () => void;
  onSaved: (count: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [facts, setFacts] = useState<PickerFact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialLinkedIds),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/member/market-data/facts?limit=300${
            query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ""
          }`,
        );
        if (!res.ok) throw new Error(`Failed to load facts (${res.status})`);
        const data = (await res.json()) as { facts: PickerFact[] };
        if (!cancelled) setFacts(data.facts ?? []);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load facts");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  const initialSet = useMemo(
    () => new Set(initialLinkedIds),
    [initialLinkedIds],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const add = [...selected].filter((id) => !initialSet.has(id));
    const remove = [...initialSet].filter((id) => !selected.has(id));
    try {
      const res = await fetch(`/api/member/content-plans/${planId}/facts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ add, remove }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      const data = (await res.json()) as { count: number };
      onSaved(data.count);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Link facts to this plan"
    >
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl dark:bg-gray-800">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Link facts to this plan
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
            aria-label="Close"
          >
            <span aria-hidden className="text-xl leading-none">
              &times;
            </span>
          </button>
        </div>

        <div className="border-b border-gray-200 px-5 py-3 dark:border-gray-700">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by neighbourhood or metric…"
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5] dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {selected.size} selected · Script Builder works best with 3 or more.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Loading your facts…
            </p>
          ) : error ? (
            <p className="py-8 text-center text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : facts.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No headline-safe facts found. Upload market data to generate facts
              you can link.
            </p>
          ) : (
            <ul className="space-y-1">
              {facts.map((f) => {
                const checked = selected.has(f.id);
                return (
                  <li key={f.id}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(f.id)}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-[#185FA5] focus:ring-[#185FA5]"
                      />
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {f.neighbourhood}
                          {f.propertyType ? ` · ${f.propertyType}` : ""}
                        </span>
                        <span className="block text-gray-600 dark:text-gray-300">
                          {f.metricLabel}
                          {f.metricValueString ? `: ${f.metricValueString}` : ""}
                          {f.monthYear ? ` (${f.monthYear})` : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-5 py-4 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#134d87] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save links"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ToastProvider, useToast } from "@/components/ToastProvider";

interface ManageRow {
  name: string;
  normName: string;
  inVocab: boolean;
  hasProfile: boolean;
  factCount: number;
  metricCount: number;
  isRollup: boolean;
}

interface ExcludedRow {
  name: string;
  normName: string;
  excludedAt: string;
}

interface ManageData {
  marketName: string | null;
  mlsSource: string | null;
  counts: {
    total: number;
    vocab: number;
    profiles: number;
    marketDataNeighbourhoods: number;
    excluded: number;
  };
  neighbourhoods: ManageRow[];
  excluded: ExcludedRow[];
}

type ResetScope = "kb" | "market" | "both";

export default function ManageNeighbourhoods() {
  return (
    <ToastProvider>
      <ManageInner />
    </ToastProvider>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "vocab" | "profile" | "market" | "muted";
}) {
  const tones: Record<string, string> = {
    vocab:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
    profile:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    market:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    muted:
      "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  };
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function ManageInner() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ManageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busyName, setBusyName] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Reset controls
  const [resetScope, setResetScope] = useState<ResetScope>("both");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/member/knowledge-base/manage");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to load.");
      setData(json as ManageData);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && !data && !loading) void load();
  }, [open, data, loading, load]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.neighbourhoods;
    return data.neighbourhoods.filter((r) =>
      r.name.toLowerCase().includes(q),
    );
  }, [data, search]);

  async function onDelete(name: string) {
    setBusyName(name);
    setConfirmDelete(null);
    try {
      const res = await fetch("/api/member/knowledge-base/neighbourhood", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, action: "delete" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Delete failed.");
      const r = json.removed ?? {};
      toast.success(
        `Removed “${name}” (vocab ${r.vocab ?? 0}, profiles ${r.profiles ?? 0}, facts ${r.facts ?? 0}, metrics ${r.metrics ?? 0}). It won't return on re-upload.`,
      );
      await load();
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyName(null);
    }
  }

  async function onUnexclude(name: string) {
    setBusyName(name);
    try {
      const res = await fetch("/api/member/knowledge-base/neighbourhood", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, action: "unexclude" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Restore failed.");
      toast.success(
        `Restored “${name}” — future uploads can include it again.`,
      );
      await load();
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyName(null);
    }
  }

  async function onReset() {
    if (resetConfirm.trim() !== "RESET") {
      toast.error("Type RESET to confirm.");
      return;
    }
    setResetBusy(true);
    try {
      const res = await fetch("/api/member/knowledge-base/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope: resetScope, confirm: "RESET" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Reset failed.");
      const r = json.removed ?? {};
      const parts: string[] = [];
      if (resetScope !== "market") {
        parts.push(
          `KB: ${r.vocab ?? 0} vocab, ${r.profiles ?? 0} profiles`,
        );
      }
      if (resetScope !== "kb") {
        parts.push(
          `Market: ${r.facts ?? 0} facts, ${r.metrics ?? 0} metrics, ${r.marketUploads ?? 0} uploads`,
        );
      }
      toast.success(`Reset complete — ${parts.join(" · ")}.`);
      setResetConfirm("");
      await load();
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Manage &amp; clean up neighbourhoods
          </h2>
          <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
            View everything in your account, delete junk names, or reset.
          </p>
        </div>
        <span className="text-gray-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-gray-200 px-5 py-5 dark:border-gray-700">
          {loading && (
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
          )}
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          {data && (
            <>
              {/* Counts */}
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {[
                  { label: "Total names", value: data.counts.total },
                  { label: "KB list", value: data.counts.vocab },
                  { label: "Profiles", value: data.counts.profiles },
                  {
                    label: "In market data",
                    value: data.counts.marketDataNeighbourhoods,
                  },
                  { label: "Excluded", value: data.counts.excluded },
                ].map((c) => (
                  <div
                    key={c.label}
                    className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700"
                  >
                    <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {c.value}
                    </div>
                    <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {c.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Search */}
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search neighbourhoods…"
                className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />

              {/* List */}
              <div className="max-h-96 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
                {filtered.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                    No neighbourhoods match.
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                    {filtered.map((r) => (
                      <li
                        key={r.normName}
                        className="flex items-center justify-between gap-3 px-4 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                            {r.name}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {r.inVocab && <Badge tone="vocab">KB list</Badge>}
                            {r.hasProfile && (
                              <Badge tone="profile">Profile</Badge>
                            )}
                            {(r.factCount > 0 || r.metricCount > 0) && (
                              <Badge tone="market">
                                Market data · {r.factCount + r.metricCount}
                              </Badge>
                            )}
                            {r.isRollup && (
                              <Badge tone="muted">Aggregate total</Badge>
                            )}
                          </div>
                        </div>
                        {r.isRollup ? (
                          <span className="shrink-0 text-[11px] text-gray-400">
                            protected
                          </span>
                        ) : confirmDelete === r.normName ? (
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onDelete(r.name)}
                              disabled={busyName === r.name}
                              className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              {busyName === r.name ? "Removing…" : "Confirm"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(null)}
                              className="rounded-md border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(r.normName)}
                            className="shrink-0 rounded-md border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:border-red-300 hover:text-red-600 dark:border-gray-600 dark:text-gray-200 dark:hover:text-red-400"
                          >
                            Delete
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Excluded list */}
              {data.excluded.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Excluded ({data.excluded.length})
                  </h3>
                  <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                    These stay filtered out of cuts and won&apos;t return when you
                    re-upload. Restore one to allow it again.
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {data.excluded.map((e) => (
                      <li
                        key={e.normName}
                        className="flex items-center gap-2 rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-700 dark:border-gray-600 dark:text-gray-200"
                      >
                        <span>{e.name}</span>
                        <button
                          type="button"
                          onClick={() => onUnexclude(e.name)}
                          disabled={busyName === e.name}
                          className="font-medium text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
                        >
                          {busyName === e.name ? "…" : "Restore"}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Reset */}
              <div className="mt-6 rounded-lg border border-red-200 bg-red-50/50 p-4 dark:border-red-900/50 dark:bg-red-950/20">
                <h3 className="text-sm font-semibold text-red-800 dark:text-red-300">
                  Reset (start over)
                </h3>
                <p className="mt-0.5 text-xs text-red-700/80 dark:text-red-300/70">
                  Clears the data you choose below. This does <strong>not</strong>{" "}
                  touch your saved scripts or your voice/avatar settings, and only
                  affects your own account.
                </p>

                <div className="mt-3 space-y-1.5">
                  {(
                    [
                      {
                        v: "kb",
                        label:
                          "Knowledge Base only (neighbourhood list + profiles)",
                      },
                      {
                        v: "market",
                        label:
                          "Market data only (uploads, facts & metrics)",
                      },
                      { v: "both", label: "Both" },
                    ] as { v: ResetScope; label: string }[]
                  ).map((opt) => (
                    <label
                      key={opt.v}
                      className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200"
                    >
                      <input
                        type="radio"
                        name="reset-scope"
                        checked={resetScope === opt.v}
                        onChange={() => setResetScope(opt.v)}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="text"
                    value={resetConfirm}
                    onChange={(e) => setResetConfirm(e.target.value)}
                    placeholder="Type RESET to confirm"
                    className="w-full rounded-lg border border-red-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-red-500 focus:outline-none dark:border-red-800 dark:bg-gray-800 dark:text-gray-100 sm:max-w-xs"
                  />
                  <button
                    type="button"
                    onClick={onReset}
                    disabled={resetBusy || resetConfirm.trim() !== "RESET"}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {resetBusy ? "Resetting…" : "Reset"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

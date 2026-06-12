"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";

interface GroupSummary {
  canonical: string;
  variantCount: number;
  variants: string[];
}
interface CanonicalGroup {
  display: string;
  normKey: string;
  variants: string[];
}
interface FuzzyProposal {
  into: string;
  from: string;
  confidence: number;
  reason: string;
}
interface MergeReport {
  rawCount: number;
  canonicalCount: number;
  collapsed: number;
  fuzzyAppliedCount: number;
  reviewQueueCount: number;
  topMerges: GroupSummary[];
  reviewQueue: FuzzyProposal[];
  groups: CanonicalGroup[];
  floorClearing: { before: number; after: number };
}
interface LatestRun {
  id: string;
  status: string;
  report: MergeReport;
  createdAt: string;
  appliedAt: string | null;
}

type Toast = ReturnType<typeof useToast>;

// Per-raw-name decision data (homes / sold / city) for the cleanup lists, so the
// member can judge whether two names are the same place. Read-only context from
// the latest validated upload; absent/degrades silently on any failure.
interface AreaStat {
  name: string;
  homes: number;
  sold: number;
  city: string | null;
  sampleAddress: string | null;
}
interface AreaStatsData {
  stats: Record<string, AreaStat>;
  hasCity: boolean;
  hasAddress: boolean;
}

/** One example street address for a single raw name, or null when unavailable. */
function variantSampleAddress(
  data: AreaStatsData | null,
  variant: string,
): string | null {
  if (!data?.hasAddress) return null;
  return data.stats[variant.trim().toLowerCase()]?.sampleAddress ?? null;
}

/** Sum a set of raw variant names into one decision line, or null if unknown. */
function aggregateVariantStats(
  data: AreaStatsData | null,
  variants: string[],
): { sold: number; homes: number; city: string | null } | null {
  if (!data) return null;
  let sold = 0;
  let homes = 0;
  let matched = false;
  const cityCounts = new Map<string, number>();
  for (const v of variants) {
    const s = data.stats[v.trim().toLowerCase()];
    if (!s) continue;
    matched = true;
    sold += s.sold;
    homes += s.homes;
    if (data.hasCity && s.city)
      cityCounts.set(s.city, (cityCounts.get(s.city) ?? 0) + s.homes);
  }
  if (!matched) return null;
  let city: string | null = null;
  let best = 0;
  for (const [c, n] of cityCounts) {
    if (n > best) {
      best = n;
      city = c;
    }
  }
  return { sold, homes, city };
}

/** Compact "N sales · M homes · City" descriptor for a set of variant names. */
function describeVariants(
  data: AreaStatsData | null,
  variants: string[],
): string | null {
  const agg = aggregateVariantStats(data, variants);
  if (!agg) return null;
  const parts: string[] = [`${agg.sold} ${agg.sold === 1 ? "sale" : "sales"}`];
  if (agg.homes !== agg.sold) parts.push(`${agg.homes} homes`);
  if (agg.city) parts.push(agg.city);
  return parts.join(" · ");
}

type State =
  | { phase: "idle" }
  | { phase: "computing" }
  | { phase: "review"; runId: string; report: MergeReport }
  | { phase: "applying"; runId: string; report: MergeReport }
  | { phase: "error"; message: string };

export default function KbMergeControl() {
  const router = useRouter();
  const toast = useToast();
  const [latest, setLatest] = useState<LatestRun | null>(null);
  const [state, setState] = useState<State>({ phase: "idle" });
  const [areaStats, setAreaStats] = useState<AreaStatsData | null>(null);

  const loadAreaStats = useCallback(async () => {
    try {
      const res = await fetch("/api/member/knowledge-base/area-stats");
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.available) {
        setAreaStats({
          stats: data.stats ?? {},
          hasCity: data.hasCity === true,
          hasAddress: data.hasAddress === true,
        });
      }
    } catch {
      /* non-fatal — lists still render without counts */
    }
  }, []);

  useEffect(() => {
    void loadAreaStats();
  }, [loadAreaStats]);

  const loadLatest = useCallback(async () => {
    try {
      const res = await fetch("/api/member/knowledge-base/merge");
      const data = await res.json().catch(() => ({}));
      if (res.ok) setLatest(data.latest ?? null);
    } catch {
      /* non-fatal — control still offers a fresh run */
    }
  }, []);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  // A pending dry-run the member can still review/apply (auto-on-upload or a
  // prior manual run that was never applied or discarded).
  const pending =
    latest && latest.status === "DRY_RUN" && latest.report.collapsed >= 0
      ? latest
      : null;

  async function computeFreshRun() {
    setState({ phase: "computing" });
    try {
      const res = await fetch("/api/member/knowledge-base/merge", {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not compute a cleanup.");
      setState({ phase: "review", runId: data.mergeRunId, report: data.report });
    } catch (e) {
      setState({ phase: "error", message: (e as Error).message });
    }
  }

  function openPending() {
    if (!pending) return;
    setState({
      phase: "review",
      runId: pending.id,
      report: pending.report,
    });
  }

  async function applyRun(
    runId: string,
    report: MergeReport,
    selectedReviewKeys: string[] = [],
  ) {
    setState({ phase: "applying", runId, report });

    let res: Response;
    try {
      res = await fetch("/api/member/knowledge-base/merge/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mergeRunId: runId, selectedReviewKeys }),
      });
    } catch {
      // The browser stopped waiting. A large cleanup re-aggregates every upload
      // and can run for several minutes; the server keeps applying (the run is
      // idempotent + resumable). Reflect "still working", don't show a failure.
      toast.info(
        "This is a large cleanup and is still finishing in the background. Refresh in a few minutes to see the result.",
      );
      setState({ phase: "idle" });
      void loadLatest();
      router.refresh();
      return;
    }

    const data = (await res.json().catch(() => null)) as {
      error?: string;
      queued?: boolean;
    } | null;

    if (res.ok) {
      // Durable-queue path: the apply was handed to the background worker and is
      // running off-request. It's not done yet, so show "in progress", not the
      // success toast (the run flips to APPLIED when the worker finishes; a later
      // refresh surfaces it).
      if (data?.queued) {
        toast.info(
          "Cleanup started — it's applying in the background. Refresh in a few minutes to see the result.",
        );
        setState({ phase: "idle" });
        void loadLatest();
        router.refresh();
        return;
      }

      const totalCollapsed = report.collapsed + selectedReviewKeys.length;
      toast.success(
        `Knowledge Base cleaned up — ${totalCollapsed} name${totalCollapsed === 1 ? "" : "s"} collapsed.`,
      );
      setLatest(null);
      setState({ phase: "idle" });
      router.refresh();
      return;
    }

    const msg = data?.error ?? "";

    // Already applied — a slower earlier apply finished server-side. From the
    // member's point of view this is success, not an error.
    if (/APPLIED, cannot apply/i.test(msg)) {
      toast.success("Your areas are already cleaned up.");
      setState({ phase: "idle" });
      void loadLatest();
      router.refresh();
      return;
    }

    // Still applying (an earlier click is mid-flight, or a large merge is
    // running). Encourage a refresh instead of showing a failure.
    if (/already being applied/i.test(msg)) {
      toast.info(
        "This cleanup is still applying — refresh in a few minutes to see the result.",
      );
      setState({ phase: "idle" });
      void loadLatest();
      router.refresh();
      return;
    }

    // Bodyless response (gateway/proxy timeout): no JSON came back, but the
    // server is still applying. Treat as in-progress, not a hard failure.
    if (!data) {
      toast.info(
        "This is a large cleanup and is still finishing in the background. Refresh in a few minutes to see the result.",
      );
      setState({ phase: "idle" });
      void loadLatest();
      router.refresh();
      return;
    }

    // A real, actionable error (e.g. partial re-aggregation left for retry).
    toast.error(msg || "Apply failed.");
    setState({ phase: "review", runId, report });
  }

  async function discardRun(runId: string) {
    try {
      await fetch("/api/member/knowledge-base/merge/discard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mergeRunId: runId }),
      });
    } catch {
      /* discard is audit-only — ignore */
    }
    setLatest(null);
    setState({ phase: "idle" });
  }

  const reviewing =
    state.phase === "review" || state.phase === "applying" ? state : null;

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
        Clean up &amp; merge areas
      </h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        MLS exports often shatter one neighbourhood across dozens of subdivision
        names (e.g. <em>Woodbridge Ph 5B</em>, <em>Woodbridge 1</em>). Cleaning
        up collapses those into single areas so more of them carry enough sales
        to use in scripts. Nothing changes until you review and confirm.
      </p>
      <p className="mt-2 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
        Tip: deselecting a name in <strong>“Find neighbourhoods in my data”</strong>{" "}
        removes that <em>name</em> from your vocabulary. <strong>Clean up &amp;
        merge</strong> here is different — it <em>combines</em> shattered names
        into one area and rolls up their sales counts.
      </p>

      {pending && state.phase === "idle" && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-200">
          A cleanup is ready to review:{" "}
          <strong>{pending.report.collapsed}</strong> name
          {pending.report.collapsed === 1 ? "" : "s"} would collapse (
          {pending.report.rawCount} → {pending.report.canonicalCount} areas).
          {pending.report.reviewQueueCount > 0 && (
            <>
              {" "}
              {pending.report.reviewQueueCount} near-duplicate
              {pending.report.reviewQueueCount === 1 ? "" : "s"} need a look.
            </>
          )}
        </div>
      )}

      {state.phase === "error" && (
        <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {state.message}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {pending && state.phase === "idle" ? (
          <button
            type="button"
            onClick={openPending}
            className="rounded-full bg-[var(--abv-ink)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform duration-150 active:scale-[0.98] hover:bg-[#2a2a2a]"
          >
            Review &amp; edit merges
          </button>
        ) : (
          <button
            type="button"
            onClick={computeFreshRun}
            disabled={state.phase === "computing"}
            className="rounded-full bg-[var(--abv-ink)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform duration-150 active:scale-[0.98] hover:bg-[#2a2a2a] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state.phase === "computing"
              ? "Scanning your areas…"
              : pending
                ? "Recompute cleanup"
                : "Clean up / merge areas"}
          </button>
        )}
        {latest?.status === "APPLIED" && state.phase === "idle" && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Last cleaned{" "}
            {latest.appliedAt
              ? new Date(latest.appliedAt).toLocaleDateString()
              : ""}
          </span>
        )}
        {latest?.status === "APPLYING" && state.phase === "idle" && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Applying cleanup… refresh in a moment.
          </span>
        )}
      </div>

      {reviewing && (
        <MergeReviewModal
          runId={reviewing.runId}
          initialReport={reviewing.report}
          applying={reviewing.phase === "applying"}
          toast={toast}
          areaStats={areaStats}
          onApply={(report, keys) => applyRun(reviewing.runId, report, keys)}
          onDiscard={() => discardRun(reviewing.runId)}
          onClose={() => setState({ phase: "idle" })}
        />
      )}
    </section>
  );
}

function MergeReviewModal({
  runId,
  initialReport,
  applying,
  toast,
  areaStats,
  onApply,
  onDiscard,
  onClose,
}: {
  runId: string;
  initialReport: MergeReport;
  applying: boolean;
  toast: Toast;
  areaStats: AreaStatsData | null;
  onApply: (report: MergeReport, selectedReviewKeys: string[]) => void;
  onDiscard: () => void;
  onClose: () => void;
}) {
  const [report, setReport] = useState<MergeReport>(initialReport);
  const [busy, setBusy] = useState(false);
  // True once the member has made any manual edit (rename / merge / move). A
  // rename-only or split-out edit can leave report.collapsed === 0 yet still
  // needs applying to persist, so Apply must show whenever the plan is dirty.
  const [dirty, setDirty] = useState(false);
  const locked = applying || busy;

  const floorDelta = report.floorClearing.after - report.floorClearing.before;
  const nothingToDo =
    report.collapsed === 0 && report.reviewQueueCount === 0;

  // Member-opted-in review-queue merges. Each key is `${from}->${into}`, matching
  // what the apply route expects.
  const reviewKeys = useMemo(
    () => report.reviewQueue.map((p) => `${p.from}->${p.into}`),
    [report.reviewQueue],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allSelected =
    reviewKeys.length > 0 && reviewKeys.every((k) => selected.has(k));
  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(reviewKeys));

  const callEdit = useCallback(
    async (payload: Record<string, unknown>): Promise<boolean> => {
      setBusy(true);
      try {
        const res = await fetch("/api/member/knowledge-base/merge/edit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mergeRunId: runId, ...payload }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(data.error || "Couldn’t save that change.");
          return false;
        }
        setReport(data.report as MergeReport);
        setDirty(true);
        return true;
      } catch {
        toast.error("Couldn’t save that change. Try again.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [runId, toast],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[88vh] w-full max-w-2xl overflow-auto rounded-lg border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Review &amp; edit cleanup
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={locked}
            className="text-sm text-gray-500 hover:underline disabled:opacity-50 dark:text-gray-400"
          >
            Close
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Names before" value={report.rawCount} />
          <Stat label="Areas after" value={report.canonicalCount} />
          <Stat label="Collapsed" value={report.collapsed} />
          <Stat label="Auto-merged (safe)" value={report.fuzzyAppliedCount} />
          <Stat label="Needs review" value={report.reviewQueueCount} />
          <Stat
            label="Clear the floor"
            value={
              floorDelta > 0
                ? `+${floorDelta}`
                : String(report.floorClearing.after)
            }
            hint={`${report.floorClearing.before} → ${report.floorClearing.after}`}
          />
        </div>

        {nothingToDo && (
          <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-800/40 dark:text-gray-300">
            Nothing was auto-detected to collapse — but you can still combine
            areas by hand below (e.g. fold <em>Trinity Falls 50&apos;</em>,{" "}
            <em>Del Webb Trinity Falls</em> into one <em>Trinity Falls</em>).
          </p>
        )}

        {report.topMerges.length > 0 && (
          <div className="mt-5">
            <h4 className="text-sm font-medium text-gray-800 dark:text-gray-200">
              Biggest merges
            </h4>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              These are auto-detected. Edit the master name if you&apos;d prefer
              a cleaner one.
            </p>
            <ul className="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200 text-sm dark:divide-gray-800 dark:border-gray-800">
              {report.topMerges.slice(0, 12).map((m) => (
                <li key={m.canonical} className="px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <EditableMaster
                      display={m.canonical}
                      variants={m.variants}
                      existingDisplays={report.groups
                        .map((g) => g.display)
                        .filter(
                          (d) =>
                            d.toLowerCase() !== m.canonical.toLowerCase(),
                        )}
                      disabled={locked}
                      onRename={(newDisplay) =>
                        callEdit({
                          action: "rename",
                          groupDisplay: m.canonical,
                          newDisplay,
                        })
                      }
                      onMergeInto={(target) =>
                        callEdit({
                          action: "merge",
                          displays: [m.canonical],
                          master: target,
                        })
                      }
                    />
                    <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                      {m.variantCount} names →1
                    </span>
                  </div>
                  {describeVariants(areaStats, m.variants) && (
                    <p className="mt-0.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                      {describeVariants(areaStats, m.variants)} combined
                    </p>
                  )}
                  <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                    {m.variants.slice(0, 8).join(", ")}
                    {m.variants.length > 8 ? "…" : ""}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        <ManageAreasPanel
          report={report}
          runId={runId}
          disabled={locked}
          toast={toast}
          areaStats={areaStats}
          callEdit={callEdit}
        />

        {report.reviewQueue.length > 0 && (
          <div className="mt-5">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-medium text-gray-800 dark:text-gray-200">
                Lower-confidence near-duplicates
              </h4>
              <button
                type="button"
                onClick={toggleAll}
                disabled={locked}
                className="text-xs font-medium text-[var(--abv-azure)] hover:underline disabled:opacity-50"
              >
                {allSelected ? "Clear all" : "Select all"}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              These fell below the safe auto-merge threshold, so they&apos;re
              left separate by default. Tick any you&apos;d still like to merge —
              they&apos;ll be folded in when you apply
              {selected.size > 0 ? ` (${selected.size} selected)` : ""}.
            </p>
            <ul className="mt-2 max-h-64 space-y-1 overflow-auto pr-1 text-xs">
              {report.reviewQueue.map((p) => {
                const key = `${p.from}->${p.into}`;
                return (
                  <li
                    key={key}
                    className="rounded border border-gray-200 dark:border-gray-800"
                  >
                    <label className="flex cursor-pointer items-start gap-2 px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={selected.has(key)}
                        onChange={() => toggle(key)}
                        disabled={locked}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--abv-ink)] disabled:opacity-50"
                      />
                      <span className="flex-1">
                        <span className="font-medium text-gray-800 dark:text-gray-200">
                          {p.from}
                        </span>{" "}
                        → {p.into}{" "}
                        <span className="text-gray-400">
                          ({Math.round(p.confidence * 100)}%)
                        </span>
                        {p.reason && (
                          <span className="block text-gray-500 dark:text-gray-400">
                            {p.reason}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onDiscard}
            disabled={locked}
            className="text-sm text-gray-600 hover:underline disabled:opacity-50 dark:text-gray-400"
          >
            Discard
          </button>
          {(report.collapsed > 0 || selected.size > 0 || dirty) && (
            <button
              type="button"
              onClick={() => onApply(report, [...selected])}
              disabled={locked}
              className="rounded-full bg-[var(--abv-ink)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform duration-150 active:scale-[0.98] hover:bg-[#2a2a2a] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {applying
                ? "Cleaning up…"
                : selected.size > 0
                  ? `Merge ${selected.size} selected + clean up`
                  : "Yes, clean it up"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Inline-editable canonical master name for a group. Typing a name that already
 * exists as another area is NOT an error — it's offered as "merge this group
 * into that existing area" (with a confirm). A brand-new name renames in place.
 */
function EditableMaster({
  display,
  variants,
  existingDisplays,
  disabled,
  onRename,
  onMergeInto,
}: {
  display: string;
  variants: string[];
  existingDisplays: string[];
  disabled: boolean;
  onRename: (newDisplay: string) => Promise<boolean>;
  onMergeInto: (target: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(display);
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);
  const listId = useMemo(
    () => `names-${Math.random().toString(36).slice(2)}`,
    [],
  );

  const reset = () => {
    setEditing(false);
    setMergeTarget(null);
  };

  if (!editing) {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium text-gray-900 dark:text-gray-100">
          {display}
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setValue(display);
            setMergeTarget(null);
            setEditing(true);
          }}
          className="shrink-0 text-xs font-medium text-[var(--abv-azure)] hover:underline disabled:opacity-50"
        >
          Rename / merge
        </button>
      </span>
    );
  }

  const save = async () => {
    const v = value.trim();
    if (!v || v.toLowerCase() === display.toLowerCase()) {
      // Same name (or case-only) — apply directly so casing edits still save.
      if (v && v !== display) await onRename(v);
      reset();
      return;
    }
    // Typed an existing area → offer to merge into it instead of renaming.
    const hit = existingDisplays.find((d) => d.toLowerCase() === v.toLowerCase());
    if (hit) {
      setMergeTarget(hit);
      return;
    }
    const ok = await onRename(v);
    if (ok) reset();
  };

  // Confirm step for merge-into-existing.
  if (mergeTarget) {
    return (
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <span className="text-xs text-gray-700 dark:text-gray-300">
          <strong>{mergeTarget}</strong> already exists. Merge{" "}
          <strong>{display}</strong> into it? (counts roll up)
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={async () => {
            const ok = await onMergeInto(mergeTarget);
            if (ok) reset();
          }}
          className="shrink-0 rounded bg-[var(--abv-ink)] px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
        >
          Merge into {mergeTarget}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setMergeTarget(null)}
          className="shrink-0 text-xs text-gray-500 hover:underline disabled:opacity-50"
        >
          Back
        </button>
      </span>
    );
  }

  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5">
      <input
        list={listId}
        value={value}
        autoFocus
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
          if (e.key === "Escape") reset();
        }}
        placeholder="New name, or an existing area to merge into"
        className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-[var(--abv-azure)] focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
      />
      <datalist id={listId}>
        {variants.map((v) => (
          <option key={`v-${v}`} value={v} />
        ))}
        {existingDisplays.map((d) => (
          <option key={`d-${d}`} value={d} />
        ))}
      </datalist>
      <button
        type="button"
        disabled={disabled}
        onClick={() => void save()}
        className="shrink-0 rounded bg-[var(--abv-ink)] px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
      >
        Save
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={reset}
        className="shrink-0 text-xs text-gray-500 hover:underline disabled:opacity-50"
      >
        Cancel
      </button>
    </span>
  );
}

/** Search the full area list, multi-select areas, and merge or move them by hand. */
function ManageAreasPanel({
  report,
  disabled,
  toast,
  areaStats,
  callEdit,
}: {
  report: MergeReport;
  runId: string;
  disabled: boolean;
  toast: Toast;
  areaStats: AreaStatsData | null;
  callEdit: (payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [master, setMaster] = useState("");
  const [preview, setPreview] = useState<{
    combined: number;
    floorSold: number;
    clears: boolean;
  } | null>(null);
  const previewSeq = useRef(0);

  const groups = report.groups ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...groups].sort(
      (a, b) =>
        b.variants.length - a.variants.length ||
        a.display.localeCompare(b.display),
    );
    if (!q) return sorted;
    return sorted.filter(
      (g) =>
        g.display.toLowerCase().includes(q) ||
        g.variants.some((v) => v.toLowerCase().includes(q)),
    );
  }, [groups, query]);

  const selectedGroups = useMemo(
    () => groups.filter((g) => selected.has(g.display)),
    [groups, selected],
  );

  // If the master names an EXISTING area that isn't ticked, the selection folds
  // INTO it — so its names count toward the combined total and the merge is valid
  // even with a single selected group.
  const masterTargetGroup = useMemo(() => {
    const m = master.trim().toLowerCase();
    if (!m) return null;
    const g = groups.find((x) => x.display.toLowerCase() === m);
    return g && !selected.has(g.display) ? g : null;
  }, [groups, master, selected]);

  const effectiveVariants = useMemo(
    () => [
      ...selectedGroups.flatMap((g) => g.variants),
      ...(masterTargetGroup?.variants ?? []),
    ],
    [selectedGroups, masterTargetGroup],
  );

  // Distinct groups that would combine (selection + an unticked existing target).
  const mergeCount = selectedGroups.length + (masterTargetGroup ? 1 : 0);

  // Live combined-sales preview for the proposed merge.
  useEffect(() => {
    if (effectiveVariants.length === 0) {
      // Invalidate any in-flight preview request so a late response can't
      // repopulate the panel after the selection was cleared.
      previewSeq.current++;
      setPreview(null);
      return;
    }
    const seq = ++previewSeq.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/member/knowledge-base/merge/preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ variants: effectiveVariants }),
        });
        const data = await res.json().catch(() => null);
        if (seq === previewSeq.current && res.ok) setPreview(data);
      } catch {
        /* preview is best-effort */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [effectiveVariants]);

  const toggle = (display: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(display)) next.delete(display);
      else next.add(display);
      // Default the master to the largest selected area's name.
      return next;
    });

  // Keep master defaulted to the largest selected group until the member types.
  const [masterTouched, setMasterTouched] = useState(false);
  useEffect(() => {
    if (masterTouched) return;
    if (selectedGroups.length === 0) {
      setMaster("");
      return;
    }
    const biggest = [...selectedGroups].sort(
      (a, b) => b.variants.length - a.variants.length,
    )[0];
    setMaster(biggest.display);
  }, [selectedGroups, masterTouched]);

  const doMerge = async () => {
    if (mergeCount < 2) {
      toast.error(
        "Pick at least two areas to merge — or type an existing area as the master to fold the selection into it.",
      );
      return;
    }
    const ok = await callEdit({
      action: "merge",
      displays: [...selected],
      master: master.trim(),
    });
    if (ok) {
      setSelected(new Set());
      setMaster("");
      setMasterTouched(false);
      setPreview(null);
      toast.success("Areas merged into one master.");
    }
  };

  const otherGroupNames = (current: string) =>
    groups.map((g) => g.display).filter((d) => d !== current);

  return (
    <div className="mt-5 rounded-md border border-gray-200 dark:border-gray-800">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
          Manage / merge areas by hand
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {groups.length} area{groups.length === 1 ? "" : "s"} • {open ? "Hide" : "Show"}
        </span>
      </button>

      {open && (
        <div className="border-t border-gray-200 px-3 py-3 dark:border-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Search your areas, tick the ones to combine, then set a master name —
            type a <strong>new name</strong>, or pick an <strong>existing area</strong>{" "}
            to fold the selection into it. Counts roll up and nothing is dropped.
            You can also move a single name out of a group it was wrongly folded
            into.
          </p>

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search areas…"
            className="mt-3 w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[var(--abv-azure)] focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />

          {/* Merge bar */}
          {selected.size > 0 && (
            <div className="mt-3 rounded-md border border-[var(--abv-azure)]/40 bg-[var(--abv-azure)]/5 p-3">
              <div className="text-xs font-medium text-gray-700 dark:text-gray-200">
                {selected.size} selected
                {masterTargetGroup && (
                  <> → folding into existing “{masterTargetGroup.display}”</>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  list="kb-merge-master-areas"
                  value={master}
                  disabled={disabled}
                  onChange={(e) => {
                    setMaster(e.target.value);
                    setMasterTouched(true);
                  }}
                  placeholder="New name, or an existing area to merge into"
                  className="min-w-[12rem] flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-[var(--abv-azure)] focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                />
                <datalist id="kb-merge-master-areas">
                  {groups.map((g) => (
                    <option key={g.display} value={g.display} />
                  ))}
                </datalist>
                <button
                  type="button"
                  onClick={doMerge}
                  disabled={disabled || mergeCount < 2}
                  className="rounded-full bg-[var(--abv-ink)] px-4 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {masterTargetGroup
                    ? `Merge into ${masterTargetGroup.display}`
                    : `Merge ${selected.size} into master`}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(new Set());
                    setMasterTouched(false);
                  }}
                  disabled={disabled}
                  className="text-xs text-gray-500 hover:underline disabled:opacity-50"
                >
                  Clear
                </button>
              </div>
              {preview && (
                <p
                  className={`mt-2 text-xs ${
                    preview.clears
                      ? "text-green-700 dark:text-green-400"
                      : "text-amber-700 dark:text-amber-400"
                  }`}
                >
                  Combined: <strong>{preview.combined}</strong> sales —{" "}
                  {preview.clears
                    ? `clears the ${preview.floorSold}-sale floor ✓`
                    : `still below the ${preview.floorSold}-sale floor`}
                  <span className="text-gray-400"> (latest upload, estimate)</span>
                </p>
              )}
            </div>
          )}

          {/* Area list */}
          <ul className="mt-3 max-h-72 space-y-1 overflow-auto pr-1">
            {filtered.length === 0 && (
              <li className="px-1 py-2 text-xs text-gray-500 dark:text-gray-400">
                No areas match “{query}”.
              </li>
            )}
            {filtered.slice(0, 200).map((g) => (
              <li
                key={g.display}
                className="rounded border border-gray-200 px-2 py-1.5 dark:border-gray-800"
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(g.display)}
                    onChange={() => toggle(g.display)}
                    disabled={disabled}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--abv-ink)] disabled:opacity-50"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                        {g.display}
                      </span>
                      <span className="shrink-0 text-[11px] text-gray-400">
                        {g.variants.length} name
                        {g.variants.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    {describeVariants(areaStats, g.variants) && (
                      <div className="text-[11px] text-gray-400 dark:text-gray-500">
                        {describeVariants(areaStats, g.variants)}
                      </div>
                    )}
                    {g.variants.length > 1 && (
                      <MoveVariants
                        group={g}
                        otherNames={otherGroupNames(g.display)}
                        disabled={disabled}
                        areaStats={areaStats}
                        callEdit={callEdit}
                      />
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {filtered.length > 200 && (
            <p className="mt-1 text-[11px] text-gray-400">
              Showing first 200 — search to narrow.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Per-group expander letting the member pull a wrongly-folded name out. */
function MoveVariants({
  group,
  otherNames,
  disabled,
  areaStats,
  callEdit,
}: {
  group: CanonicalGroup;
  otherNames: string[];
  disabled: boolean;
  areaStats: AreaStatsData | null;
  callEdit: (payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-[11px] text-gray-500 hover:underline dark:text-gray-400"
      >
        {open ? "Hide names" : `Move a name out (${group.variants.length})`}
      </button>
      {open && (
        <ul className="mt-1 space-y-1">
          {group.variants.map((v) => (
            <li
              key={v}
              className="flex flex-wrap items-center gap-2 rounded bg-gray-50 px-2 py-1 text-[11px] dark:bg-gray-800/50"
            >
              <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300">
                {v}
                {describeVariants(areaStats, [v]) && (
                  <span className="ml-1 text-gray-400 dark:text-gray-500">
                    · {describeVariants(areaStats, [v])}
                  </span>
                )}
                {variantSampleAddress(areaStats, v) && (
                  <span className="ml-1 text-gray-400 dark:text-gray-500">
                    · e.g. {variantSampleAddress(areaStats, v)}
                  </span>
                )}
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  callEdit({ action: "move", variant: v, toDisplay: v })
                }
                className="text-[var(--abv-azure)] hover:underline disabled:opacity-50"
              >
                Split out
              </button>
              {otherNames.length > 0 && (
                <select
                  disabled={disabled}
                  defaultValue=""
                  onChange={(e) => {
                    const to = e.target.value;
                    e.currentTarget.value = "";
                    if (to)
                      void callEdit({
                        action: "move",
                        variant: v,
                        toDisplay: to,
                      });
                  }}
                  className="max-w-[10rem] rounded border border-gray-300 bg-white px-1 py-0.5 text-[11px] text-gray-700 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                >
                  <option value="">Move to…</option>
                  {otherNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
      <div className="text-xl font-semibold text-gray-900 dark:text-gray-100">
        {value}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      {hint && (
        <div className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
          {hint}
        </div>
      )}
    </div>
  );
}

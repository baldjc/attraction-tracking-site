"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";

interface GroupSummary {
  canonical: string;
  variantCount: number;
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
  floorClearing: { before: number; after: number };
}
interface LatestRun {
  id: string;
  status: string;
  report: MergeReport;
  createdAt: string;
  appliedAt: string | null;
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/member/knowledge-base/merge");
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && data.latest) setLatest(data.latest);
      } catch {
        /* non-fatal — control still offers a fresh run */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  async function applyRun(runId: string, report: MergeReport) {
    setState({ phase: "applying", runId, report });
    try {
      const res = await fetch("/api/member/knowledge-base/merge/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mergeRunId: runId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Apply failed.");
      toast.success(
        `Knowledge Base cleaned up — ${report.collapsed} name${report.collapsed === 1 ? "" : "s"} collapsed.`,
      );
      setLatest(null);
      setState({ phase: "idle" });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
      setState({ phase: "review", runId, report });
    }
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
    state.phase === "review" || state.phase === "applying"
      ? state
      : null;

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
            Review merges
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
                : "Clean up / review merges"}
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
          report={reviewing.report}
          applying={reviewing.phase === "applying"}
          onApply={() => applyRun(reviewing.runId, reviewing.report)}
          onDiscard={() => discardRun(reviewing.runId)}
          onClose={() => setState({ phase: "idle" })}
        />
      )}
    </section>
  );
}

function MergeReviewModal({
  report,
  applying,
  onApply,
  onDiscard,
  onClose,
}: {
  runId: string;
  report: MergeReport;
  applying: boolean;
  onApply: () => void;
  onDiscard: () => void;
  onClose: () => void;
}) {
  const floorDelta = report.floorClearing.after - report.floorClearing.before;
  const nothingToDo =
    report.collapsed === 0 && report.reviewQueueCount === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-lg border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Review cleanup
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={applying}
            className="text-sm text-gray-500 hover:underline disabled:opacity-50 dark:text-gray-400"
          >
            Close
          </button>
        </div>

        {nothingToDo ? (
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
            Your areas are already clean — there are no fragmented names to
            collapse and nothing to review.
          </p>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="Names before" value={report.rawCount} />
              <Stat label="Areas after" value={report.canonicalCount} />
              <Stat label="Collapsed" value={report.collapsed} />
              <Stat
                label="Auto-merged (safe)"
                value={report.fuzzyAppliedCount}
              />
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

            {report.topMerges.length > 0 && (
              <div className="mt-5">
                <h4 className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  Biggest merges
                </h4>
                <ul className="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200 text-sm dark:divide-gray-800 dark:border-gray-800">
                  {report.topMerges.slice(0, 12).map((m) => (
                    <li key={m.canonical} className="px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {m.canonical}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {m.variantCount} names →1
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                        {m.variants.slice(0, 8).join(", ")}
                        {m.variants.length > 8 ? "…" : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {report.reviewQueue.length > 0 && (
              <div className="mt-5">
                <h4 className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  Lower-confidence near-duplicates (not merged)
                </h4>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  These were left separate on purpose — they fell below the
                  safe-merge threshold. Applying this cleanup will NOT merge
                  them.
                </p>
                <ul className="mt-2 space-y-1 text-xs">
                  {report.reviewQueue.slice(0, 15).map((p) => (
                    <li
                      key={`${p.from}->${p.into}`}
                      className="rounded border border-gray-200 px-2 py-1.5 dark:border-gray-800"
                    >
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
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onDiscard}
            disabled={applying}
            className="text-sm text-gray-600 hover:underline disabled:opacity-50 dark:text-gray-400"
          >
            Discard
          </button>
          {!nothingToDo && (
            <button
              type="button"
              onClick={onApply}
              disabled={applying}
              className="rounded-full bg-[var(--abv-ink)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform duration-150 active:scale-[0.98] hover:bg-[#2a2a2a] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {applying ? "Cleaning up…" : "Yes, clean it up"}
            </button>
          )}
        </div>
      </div>
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

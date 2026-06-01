"use client";

/**
 * Client surfaces for the Script Builder v2 fact gate:
 *   - <FactBlockGate>     — the 0-fact block. "Link facts now" opens the
 *     in-place picker (NOT a navigation away); "Run data search" is a disabled
 *     Layer-3 stub until on-demand extraction exists.
 *   - <AutoLinkedPanel>   — the non-blocking review panel shown above the editor
 *     when enrichment auto-linked facts. "Review & adjust" opens the picker;
 *     "Looks good — build" dismisses the panel.
 *
 * Both re-run the server gate via router.refresh() after the picker saves.
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/Button";
import { AiThinking } from "@/components/ai/AiThinking";
import { FactPickerModal } from "./FactPickerModal";

const BACK_HREF = "/member/content-planner";

export function FactBlockGate({ planId }: { planId: string }) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="mx-auto mt-10 max-w-xl rounded-lg border border-amber-300 bg-amber-50 p-6 shadow-sm dark:border-amber-700/60 dark:bg-amber-900/15">
      <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        This plan has no linked facts yet
      </h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        Script Builder v2 anchors every script on cited market facts, and this
        plan doesn&apos;t have any linked yet. Link facts to it below to continue.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="inline-flex items-center rounded-md bg-[#185FA5] px-3.5 py-2 text-sm font-medium text-white hover:bg-[#134d87]"
        >
          Link facts now
        </button>
        <button
          type="button"
          disabled
          title="On-demand data search is coming soon"
          className="inline-flex cursor-not-allowed items-center rounded-md border border-gray-200 bg-gray-100 px-3.5 py-2 text-sm font-medium text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500"
        >
          Run data search (coming soon)
        </button>
      </div>
      <Link
        href={BACK_HREF}
        className="mt-4 inline-block text-sm font-medium text-blue-600 hover:underline"
      >
        ← Back to Content Planner
      </Link>

      {pickerOpen && (
        <FactPickerModal
          planId={planId}
          initialLinkedIds={[]}
          onClose={() => setPickerOpen(false)}
          onSaved={(count) => {
            setPickerOpen(false);
            // Any link gets us off the 0-fact block; re-run the server gate.
            if (count > 0) router.refresh();
          }}
        />
      )}
    </div>
  );
}

/**
 * Shown when a Story Lead was turned into a video but its display dataThreads
 * couldn't be matched to any current market data (`factsResolutionState ===
 * "unresolved"`). Replaces the generic 0-fact block with Story-Lead-aware
 * guidance + three escape hatches so the member is never trapped.
 */
export function UnresolvedFactsBanner({ planId }: { planId: string }) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [attempted, setAttempted] = useState(false);
  // router.refresh() is a soft, server-driven re-render; wrapping it in a
  // transition gives us a reliable in-flight flag for the loading state and a
  // completion edge (isPending false after true) to surface the "nothing
  // found" outcome — without inventing a new loading pattern.
  const [isPending, startTransition] = useTransition();

  // Match the informational ("we need your input") treatment used by the
  // AutoLinkedPanel below — same blue card wrapper, NOT the amber block tone.
  return (
    <div className="mx-auto mt-10 max-w-xl rounded-lg border border-blue-200 bg-blue-50 p-6 shadow-sm dark:border-blue-800/60 dark:bg-blue-900/15">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
          <MagnifyingGlassIcon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Unresolved facts
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
            This Story Lead&apos;s data threads couldn&apos;t be matched to your
            current market data. Auto-enrichment will try to find related facts
            when you click Build Script. You can also link facts manually or run
            a fresh data search.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {/* The primary CTA's loading state is the shared AiThinking pill (used
            standalone across the app, never nested in a button), shown in the
            CTA's slot while the server re-runs enrichment. */}
        {isPending ? (
          <AiThinking mode="quick" label="Enriching" />
        ) : (
          <Button
            variant="primary"
            onClick={() => {
              // The server re-runs Layer-1 enrichment on every entry; a refresh
              // is the trigger. No-ops with zero facts to anchor scope, but
              // never errors — the member can still link facts manually below.
              setAttempted(true);
              startTransition(() => router.refresh());
            }}
          >
            Try auto-enrichment now
          </Button>
        )}
        {/* Manual linking stays available during enrichment — parity with the
            original banner (only the primary CTA reflects in-flight state). */}
        <Button variant="outline" onClick={() => setPickerOpen(true)}>
          Link facts manually
        </Button>
        {/* Disabled until the on-demand data-search (Layer-3) extraction ships;
            flip to an enabled handler once that endpoint exists. */}
        <Button
          variant="outline"
          disabled
          title="On-demand data search is coming soon"
        >
          Run data search (coming soon)
        </Button>
      </div>

      {/* Completion edge: a finished refresh that left us on the banner means
          enrichment found nothing (the success path replaces this card with the
          Auto-link Review Panel). Nudge toward the manual path. */}
      {attempted && !isPending && (
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
          No related facts were found automatically. Try linking facts manually
          to continue.
        </p>
      )}

      {pickerOpen && (
        <FactPickerModal
          planId={planId}
          initialLinkedIds={[]}
          onClose={() => setPickerOpen(false)}
          onSaved={(count) => {
            setPickerOpen(false);
            if (count > 0) router.refresh();
          }}
        />
      )}
    </div>
  );
}

export interface AutoLinkedFact {
  id: string;
  neighbourhood: string;
  metricLabel: string;
  metricValueString: string;
  monthYear: string;
}

export function AutoLinkedPanel({
  planId,
  added,
  currentLinkedIds,
}: {
  planId: string;
  added: AutoLinkedFact[];
  currentLinkedIds: string[];
}) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (dismissed || added.length === 0) return null;

  return (
    <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800/60 dark:bg-blue-900/15">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            We auto-linked {added.length} related{" "}
            {added.length === 1 ? "fact" : "facts"}
          </h2>
          <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
            These are in the same scope as your existing facts, added so your
            script has enough to cite. Review them or just build.
          </p>
        </div>
      </div>
      <ul className="mt-3 space-y-1">
        {added.map((f) => (
          <li
            key={f.id}
            className="text-xs text-gray-700 dark:text-gray-200"
          >
            <span className="font-medium">{f.neighbourhood}</span> — {f.metricLabel}
            {f.metricValueString ? `: ${f.metricValueString}` : ""}
            {f.monthYear ? ` (${f.monthYear})` : ""}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="inline-flex items-center rounded-md bg-[#185FA5] px-3.5 py-2 text-sm font-medium text-white hover:bg-[#134d87]"
        >
          Looks good — build
        </button>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          Review &amp; adjust
        </button>
      </div>

      {pickerOpen && (
        <FactPickerModal
          planId={planId}
          initialLinkedIds={currentLinkedIds}
          onClose={() => setPickerOpen(false)}
          onSaved={() => {
            setPickerOpen(false);
            // Links changed — re-run the server gate so counts/banner update.
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

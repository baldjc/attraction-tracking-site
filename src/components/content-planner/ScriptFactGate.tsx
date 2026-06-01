"use client";

/**
 * Client surfaces for the Script Builder v2 fact gate:
 *   - <FactBlockGate>     — the 0-fact block. "Link facts now" opens the
 *     in-place picker (NOT a navigation away); "Run data search" runs the paid
 *     Layer-3 on-demand extraction; "Tell me what's missing" hand-enters a fact.
 *   - <UnresolvedFactsBanner> — Story-Lead variant of the block with the same
 *     three escape hatches.
 *   - <AutoLinkedPanel>   — the non-blocking review panel shown above the editor
 *     when enrichment auto-linked facts. "Review & adjust" opens the picker;
 *     "Looks good — build" dismisses the panel.
 *
 * All re-run the server gate via router.refresh() after a save/search.
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/Button";
import { AiThinking } from "@/components/ai/AiThinking";
import { FactPickerModal } from "./FactPickerModal";
import { formatActionImpactPercent } from "@/lib/cost-display";
import type { ScriptDataNeed } from "@/lib/script-data-resolver";

const BACK_HREF = "/member/content-planner";

/** Serializable need + coarse estimate handed down from the page data layer. */
export interface DataSearchProps {
  need: ScriptDataNeed | null;
  estimatedCostUsd: number;
  /** Member's monthly Content Tools allowance cap (USD) — used to render the
   *  estimate as a percentage; the raw dollar figure is never shown to members. */
  capUsd: number;
}

// ── Shared Layer-3 controls ─────────────────────────────────────────────────

type SearchState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; message: string; tone: "ok" | "warn" };

/**
 * The paid "Run data search (~$X.XX)" button. POSTs the need to the extractor
 * endpoint; on a successful extraction the new fact is linked server-side, so a
 * router.refresh() clears the gate. Every non-success outcome is shown inline.
 */
function RunDataSearchButton({
  planId,
  need,
  estimatedCostUsd,
  capUsd,
}: {
  planId: string;
} & DataSearchProps) {
  const router = useRouter();
  const [state, setState] = useState<SearchState>({ kind: "idle" });

  if (!need) {
    return (
      <Button
        variant="outline"
        disabled
        title="Upload market data to enable on-demand search"
      >
        Run data search (no market data)
      </Button>
    );
  }

  async function run() {
    setState({ kind: "running" });
    try {
      const res = await fetch("/api/member/script-data/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, need }),
      });
      if (!res.ok) {
        setState({
          kind: "done",
          tone: "warn",
          message: "Data search failed. Please try again.",
        });
        return;
      }
      const data = (await res.json()) as {
        result:
          | { source: "on_demand_extraction" }
          | { source: "none"; reason: string };
        softWarning: boolean;
      };
      if (data.result.source === "on_demand_extraction") {
        // Fact linked server-side — re-run the gate; this card is replaced.
        router.refresh();
        return;
      }
      const reasonMsg =
        data.result.reason === "cost_cap_hit"
          ? "Your monthly AI spend cap was reached, so the search was stopped before any cost."
          : data.result.reason === "sample_too_small"
            ? "Not enough rows in scope to compute a reliable number."
            : "No matching data was found in your uploads.";
      setState({
        kind: "done",
        tone: data.softWarning ? "warn" : "ok",
        message: data.softWarning
          ? `${reasonMsg} Note: you're close to your monthly AI spend cap.`
          : reasonMsg,
      });
    } catch {
      setState({
        kind: "done",
        tone: "warn",
        message: "Data search failed. Please try again.",
      });
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {state.kind === "running" ? (
        <AiThinking mode="quick" label="Searching your data" />
      ) : (
        <Button variant="outline" onClick={run}>
          Run data search ({formatActionImpactPercent(estimatedCostUsd, capUsd)}{" "}
          of monthly allowance)
        </Button>
      )}
      {state.kind === "done" && (
        <p
          className={`text-xs ${
            state.tone === "warn"
              ? "text-amber-700 dark:text-amber-300"
              : "text-gray-600 dark:text-gray-300"
          }`}
        >
          {state.message}
        </p>
      )}
    </div>
  );
}

const FAMILY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "MEDIAN", label: "Median sale price" },
  { value: "AVG", label: "Average sale price" },
  { value: "BENCHMARK", label: "Benchmark price" },
  { value: "PSF", label: "Price per sq ft" },
  { value: "DOM", label: "Days on market" },
  { value: "MOI", label: "Months of inventory" },
  { value: "SP_LP", label: "Sale-to-list ratio" },
  { value: "INVENTORY", label: "Listing count" },
  { value: "FAILURE_RATE", label: "Failure rate" },
];

/**
 * "Tell me what's missing" — hand-enter a fact the data search can't find. The
 * result is stored as member-provided (texture-only, never validator-verified)
 * and linked to the plan so a thin plan can still clear the gate.
 */
function ManualFactModal({
  planId,
  defaultNeighbourhood,
  defaultPropertyType,
  onClose,
  onSaved,
}: {
  planId: string;
  defaultNeighbourhood: string;
  defaultPropertyType: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [neighbourhood, setNeighbourhood] = useState(defaultNeighbourhood);
  const [propertyType, setPropertyType] = useState(defaultPropertyType);
  const [metricFamily, setMetricFamily] = useState("MEDIAN");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!neighbourhood.trim() || !value.trim()) {
      setError("Neighbourhood and value are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/member/script-data/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          neighbourhood,
          propertyType,
          metricFamily,
          value,
          note,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Save failed (${res.status})`);
      }
      onSaved();
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
      aria-label="Tell me what's missing"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-900">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Tell me what&apos;s missing
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Add a fact you already know. It&apos;s saved as member-provided (not
          validator-verified) and linked to this plan.
        </p>

        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="text-gray-700 dark:text-gray-200">Neighbourhood</span>
            <input
              type="text"
              value={neighbourhood}
              onChange={(e) => setNeighbourhood(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              placeholder="e.g. Bridgeland"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700 dark:text-gray-200">
              Property type (optional)
            </span>
            <input
              type="text"
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              placeholder="e.g. Detached (leave blank for all)"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700 dark:text-gray-200">Metric</span>
            <select
              value={metricFamily}
              onChange={(e) => setMetricFamily(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            >
              {FAMILY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-gray-700 dark:text-gray-200">Value</span>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              placeholder="e.g. $750,000 or 18 days"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700 dark:text-gray-200">Note (optional)</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              placeholder="Where this came from"
            />
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Add fact"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Block surfaces ──────────────────────────────────────────────────────────

export function FactBlockGate({
  planId,
  dataSearch,
}: {
  planId: string;
  dataSearch?: DataSearchProps;
}) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  return (
    <div className="mx-auto mt-10 max-w-xl rounded-lg border border-amber-300 bg-amber-50 p-6 shadow-sm dark:border-amber-700/60 dark:bg-amber-900/15">
      <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        This plan has no linked facts yet
      </h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        Script Builder v2 anchors every script on cited market facts, and this
        plan doesn&apos;t have any linked yet. Link facts, run a data search, or
        add one yourself to continue.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="inline-flex items-center rounded-md bg-[#185FA5] px-3.5 py-2 text-sm font-medium text-white hover:bg-[#134d87]"
        >
          Link facts now
        </button>
        <RunDataSearchButton
          planId={planId}
          need={dataSearch?.need ?? null}
          estimatedCostUsd={dataSearch?.estimatedCostUsd ?? 0}
          capUsd={dataSearch?.capUsd ?? 0}
        />
        <Button variant="outline" onClick={() => setManualOpen(true)}>
          Tell me what&apos;s missing
        </Button>
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
            if (count > 0) router.refresh();
          }}
        />
      )}
      {manualOpen && (
        <ManualFactModal
          planId={planId}
          defaultNeighbourhood={dataSearch?.need?.neighbourhood ?? ""}
          defaultPropertyType={dataSearch?.need?.propertyType ?? ""}
          onClose={() => setManualOpen(false)}
          onSaved={() => {
            setManualOpen(false);
            router.refresh();
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
 * guidance + the same three escape hatches so the member is never trapped.
 */
export function UnresolvedFactsBanner({
  planId,
  dataSearch,
}: {
  planId: string;
  dataSearch?: DataSearchProps;
}) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
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
            when you click Build Script. You can also link facts manually, run a
            fresh data search, or add a fact yourself.
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
        <RunDataSearchButton
          planId={planId}
          need={dataSearch?.need ?? null}
          estimatedCostUsd={dataSearch?.estimatedCostUsd ?? 0}
          capUsd={dataSearch?.capUsd ?? 0}
        />
        <Button variant="outline" onClick={() => setManualOpen(true)}>
          Tell me what&apos;s missing
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
      {manualOpen && (
        <ManualFactModal
          planId={planId}
          defaultNeighbourhood={dataSearch?.need?.neighbourhood ?? ""}
          defaultPropertyType={dataSearch?.need?.propertyType ?? ""}
          onClose={() => setManualOpen(false)}
          onSaved={() => {
            setManualOpen(false);
            router.refresh();
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
  /** Provenance: validator (default) | on_demand_extraction | member_provided. */
  sourceType?: string | null;
}

/** Per-provenance badge so unverified facts are never mistaken for validated. */
function SourceBadge({ sourceType }: { sourceType?: string | null }) {
  if (sourceType === "member_provided") {
    return (
      <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
        Member-provided — not validator-verified
      </span>
    );
  }
  if (sourceType === "on_demand_extraction") {
    return (
      <span className="ml-2 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
        On-demand — not validator-verified
      </span>
    );
  }
  return null;
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
            We linked {added.length} related{" "}
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
          <li key={f.id} className="text-xs text-gray-700 dark:text-gray-200">
            <span className="font-medium">{f.neighbourhood}</span> — {f.metricLabel}
            {f.metricValueString ? `: ${f.metricValueString}` : ""}
            {f.monthYear ? ` (${f.monthYear})` : ""}
            <SourceBadge sourceType={f.sourceType} />
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

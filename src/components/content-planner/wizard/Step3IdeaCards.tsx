"use client";

/**
 * Wave 2 wizard — Step 3: Generate idea cards.
 *
 * Reads pinned context from URL (?storyLeadId | ?rotationSlot | ?validatedIdea),
 * POSTs to /api/ai-tools/content-engine-v2 with count=5, renders the resulting
 * cards. Picking a card stashes it in sessionStorage and advances to Step 4
 * with the storage key in the URL (so refresh-in-tab is safe).
 *
 * <AiThinking mode="phase" /> driven by useAiThinking with fallback phases
 * sized for the typical 30-60s wall time we observed in sanity runs.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AiThinking } from "@/components/ai/AiThinking";
import { useAiThinking } from "@/lib/use-ai-thinking";
import type { RotationSlotKey } from "@/lib/content-engine-validation";

interface IdeaCard {
  title: string;
  rotationSlot: string;
  titlePromise: string;
  thumbnailCallouts: string[];
  clarityPremise: string;
  citedFactIds: string[];
  visualPeak: string;
  subPersonas: string[];
  framework: string;
  tactileType: string;
  estimatedRuntime?: string;
  whyItWorks?: string;
}

interface BatchResponse {
  ideas: IdeaCard[];
  upload: { id: string; monthYear: string; label: string };
  storyLeadId: string | null;
  factsConsidered: number;
  requestedCount: number;
  returnedCount: number;
  partial: boolean;
  error?: string;
  message?: string;
}

interface Props {
  storyLeadId?: string;
  rotationSlot?: RotationSlotKey;
  validatedIdea?: string;
  uploadLabel: string;
  uploadMonthYear: string;
}

const PHASES = [
  "Reading your facts library…",
  "Picking a framework…",
  "Drafting candidate titles…",
  "Drafting 5 ideas…",
  "Validating titles against the gate…",
  "Finalizing the batch…",
];

export function Step3IdeaCards({
  storyLeadId,
  rotationSlot,
  validatedIdea,
  uploadLabel,
  uploadMonthYear,
}: Props) {
  const router = useRouter();
  const [result, setResult] = useState<BatchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const thinking = useAiThinking({
    mode: "phase",
    fallbackPhases: PHASES,
    fallbackIntervalMs: 5000,
  });
  // Guard against React StrictMode double-effect in dev.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let cancelled = false;
    (async () => {
      thinking.start();
      try {
        const r = await fetch("/api/ai-tools/content-engine-v2", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            count: 5,
            storyLeadId: storyLeadId ?? undefined,
            rotationSlot: rotationSlot ?? undefined,
            validatedIdea: validatedIdea ?? undefined,
          }),
        });
        const j = (await r.json()) as BatchResponse;
        if (cancelled) return;
        if (!r.ok) {
          setError(j.message ?? j.error ?? `Generation failed (${r.status})`);
        } else {
          setResult(j);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) thinking.stop();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pick(idea: IdeaCard) {
    if (!result) return;
    const key = `wizard:picked:${crypto.randomUUID()}`;
    sessionStorage.setItem(
      key,
      JSON.stringify({
        idea,
        sourceUploadId: result.upload.id,
        storyLeadId: result.storyLeadId,
      }),
    );
    router.push(`/member/content-planner/wizard?step=4&picked=${encodeURIComponent(key)}`);
  }

  if (thinking.isThinking) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 dark:border-gray-700 dark:bg-gray-800">
        <p className="mb-3 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Anchored on {uploadLabel} ({uploadMonthYear})
        </p>
        <AiThinking mode="phase" phaseLabel={thinking.phaseLabel} />
        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          This usually takes 30-60 seconds. Don&apos;t navigate away.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-6 dark:border-red-700 dark:bg-red-950/40">
        <p className="text-sm font-medium text-red-900 dark:text-red-100">
          Couldn&apos;t generate ideas
        </p>
        <p className="mt-2 text-sm text-red-800 dark:text-red-200">{error}</p>
        <div className="mt-4">
          <Link
            href="/member/content-planner/wizard?step=1"
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Start over
          </Link>
        </div>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {result.returnedCount} idea(s) from {result.factsConsidered} facts in your {uploadLabel} upload.
          {storyLeadId && " Anchored on a Story Lead."}
          {rotationSlot && ` Rotation slot pinned to ${rotationSlot}.`}
        </p>
      </div>

      {result.partial && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          Generated {result.returnedCount} of {result.requestedCount} — the
          validation gate trimmed some. You can pick from these or{" "}
          <Link
            href={typeof window !== "undefined" ? window.location.pathname + window.location.search : "#"}
            className="underline"
            onClick={(e) => {
              e.preventDefault();
              window.location.reload();
            }}
          >
            generate again
          </Link>
          .
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {result.ideas.map((idea, i) => (
          <IdeaCardView key={i} idea={idea} onPick={() => pick(idea)} />
        ))}
      </div>
    </div>
  );
}

function IdeaCardView({ idea, onPick }: { idea: IdeaCard; onPick: () => void }) {
  return (
    <div className="flex flex-col rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {idea.title}
        </h3>
        <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
          {idea.rotationSlot}
        </span>
      </div>
      <p className="mt-2 text-sm italic text-gray-600 dark:text-gray-400">
        {idea.titlePromise}
      </p>

      <p className="mt-3 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Clarity premise
      </p>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        {idea.clarityPremise}
      </p>

      <p className="mt-3 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Visual peak
      </p>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        {idea.visualPeak}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {idea.thumbnailCallouts.map((c, i) => (
          <span
            key={i}
            className="rounded bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-200"
          >
            {c}
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          {idea.framework}
        </span>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
          {idea.tactileType}
        </span>
        {idea.estimatedRuntime && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
            {idea.estimatedRuntime}
          </span>
        )}
        {idea.subPersonas.slice(0, 3).map((p) => (
          <span
            key={p}
            className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
          >
            {p}
          </span>
        ))}
      </div>

      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
        {idea.citedFactIds.length} cited fact(s)
        {idea.whyItWorks && ` • ${idea.whyItWorks}`}
      </p>

      <div className="mt-4">
        <button
          type="button"
          onClick={onPick}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Pick this idea →
        </button>
      </div>
    </div>
  );
}

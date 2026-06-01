"use client";

/**
 * Wave 2 wizard — Step 3: Generate idea cards.
 * Wave 4 — forwards `propertyTypeFocus` to the generator so the validator
 * gate refuses any card that drifts off the lock, AND stashes the focus
 * inside the picked-card session payload so Step 4 → save-idea pins it on
 * the resulting ContentPlan row.
 *
 * <AiThinking mode="phase" /> driven by useAiThinking with fallback phases
 * sized for the typical 30-60s wall time we observed in sanity runs.
 */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AiThinking } from "@/components/ai/AiThinking";
import { useAiThinking } from "@/lib/use-ai-thinking";
import {
  ROTATION_SLOTS,
  rotationSlotToTheme,
  type RotationSlotKey,
} from "@/lib/content-engine-validation";
import type { PropertyTypeFocus } from "@/lib/property-type-focus";
import { IdeaCard, rotationSlotToThemeKey } from "@/components/cards";

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
  propertyTypeFocus: PropertyTypeFocus;
  uploadId: string;
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

/** Stable sessionStorage key for the wizard's last generated batch — read
 *  by WizardDraftShell so a refreshed/restored draft can rehydrate the
 *  cards without re-paying for Claude. */
export const WIZARD_BATCH_SESSION_KEY = "wizard:lastBatch";

/** Window event name. Steps fire this after writing rich state into
 *  sessionStorage (batch arrived, validation context updated, etc.) so
 *  WizardDraftShell knows to recompute its snapshot and autosave even
 *  though the URL didn't change. */
export const WIZARD_DRAFT_DIRTY_EVENT = "wizard:draft-dirty";

export function Step3IdeaCards({
  storyLeadId,
  rotationSlot,
  validatedIdea,
  propertyTypeFocus,
  uploadId,
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
  useEffect(() => {
    // Resume short-circuit: if a draft restored a previously-generated
    // batch into sessionStorage AND the context (storyLead/rotationSlot/
    // validatedIdea/focus) still matches what the URL is asking for,
    // skip the Anthropic call and just rehydrate the cards. Saves
    // members from paying for a regenerated batch after a tab reload.
    try {
      const raw = sessionStorage.getItem(WIZARD_BATCH_SESSION_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as {
          ideas?: IdeaCard[];
          upload?: { id: string; monthYear: string; label: string };
          storyLeadId?: string | null;
          propertyTypeFocus?: PropertyTypeFocus;
          context?: { rotationSlot?: string; validatedIdea?: string };
          savedAt?: number;
        };
        const sameLead = (cached.storyLeadId ?? null) === (storyLeadId ?? null);
        const sameFocus = (cached.propertyTypeFocus ?? "Any") === propertyTypeFocus;
        const sameSlot = (cached.context?.rotationSlot ?? "") === (rotationSlot ?? "");
        const sameIdea = (cached.context?.validatedIdea ?? "") === (validatedIdea ?? "");
        // Hard upload-identity gate: only short-circuit if the cached
        // batch was generated against the same market upload the server
        // would resolve right now. If the member uploaded fresh market
        // data after the draft was saved, `uploadId` will differ and we
        // fall through to regeneration.
        const sameUpload = cached.upload?.id === uploadId;
        if (
          cached.ideas &&
          cached.upload &&
          sameLead &&
          sameFocus &&
          sameSlot &&
          sameIdea &&
          sameUpload
        ) {
          setResult({
            ideas: cached.ideas,
            upload: cached.upload,
            storyLeadId: cached.storyLeadId ?? null,
            factsConsidered: 0,
            requestedCount: cached.ideas.length,
            returnedCount: cached.ideas.length,
            partial: false,
          });
          return;
        }
      }
    } catch {
      /* corrupt cache — fall through to fresh generation */
    }
    thinking.start();
    const ctrl = new AbortController();
    (async () => {
      try {
        const r = await fetch("/api/ai-tools/content-engine-v2", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            count: 5,
            storyLeadId: storyLeadId ?? undefined,
            rotationSlot: rotationSlot ?? undefined,
            validatedIdea: validatedIdea ?? undefined,
            propertyTypeFocus,
          }),
          signal: ctrl.signal,
        });
        if (ctrl.signal.aborted) return;
        const j = (await r.json()) as BatchResponse;
        if (ctrl.signal.aborted) return;
        if (!r.ok) {
          setError(j.message ?? j.error ?? `Generation failed (${r.status})`);
        } else {
          setResult(j);
          // Stash for draft rehydration / My Work draft preview, then
          // poke WizardDraftShell so the new batch gets autosaved into
          // the draft row (URL didn't change, so the shell wouldn't
          // otherwise notice). Listener is set up in WizardDraftShell.
          try {
            sessionStorage.setItem(
              WIZARD_BATCH_SESSION_KEY,
              JSON.stringify({
                ideas: j.ideas,
                upload: j.upload,
                storyLeadId: j.storyLeadId,
                propertyTypeFocus,
                context: {
                  rotationSlot: rotationSlot ?? "",
                  validatedIdea: validatedIdea ?? "",
                },
                savedAt: Date.now(),
              }),
            );
            window.dispatchEvent(new CustomEvent(WIZARD_DRAFT_DIRTY_EVENT));
          } catch {
            /* quota — best effort */
          }
        }
        thinking.stop();
      } catch (e) {
        if (ctrl.signal.aborted || (e as Error).name === "AbortError") return;
        setError((e as Error).message);
        thinking.stop();
      }
    })();
    return () => {
      ctrl.abort();
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
        propertyTypeFocus,
      }),
    );
    const params = new URLSearchParams({
      step: "4",
      picked: key,
    });
    if (propertyTypeFocus !== "Any") {
      params.set("propertyTypeFocus", propertyTypeFocus);
    }
    router.push(`/member/content-planner/wizard?${params.toString()}`);
  }

  if (thinking.isThinking) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 dark:border-gray-700 dark:bg-gray-800">
        <p className="mb-3 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Anchored on {uploadLabel} ({uploadMonthYear})
        </p>
        <AiThinking
          mode="phase"
          toolName="Content Engine"
          currentPhase={thinking.phaseLabel}
        />
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

  // Defensive: never render an uncited idea card. The server validator
  // already guarantees ≥3 real cited facts per card, but if anything ever
  // slips through we drop it rather than show a card whose footer reads
  // "0 cited facts" — an uncited idea card isn't useful.
  const ideas = result.ideas.filter((c) => (c.citedFactIds?.length ?? 0) > 0);

  // Single source of truth for the header fact count: the union of fact
  // IDs actually cited across the shown cards. Deriving it from the cards
  // (rather than a separate server counter) means the header can never
  // contradict the per-card "N cited facts" footers, and it survives the
  // sessionStorage resume path — which previously hardcoded 0 here and
  // produced "3 idea(s) from 0 facts" while every card cited 4.
  const citedFactUnion = new Set<string>();
  for (const c of ideas) {
    for (const id of c.citedFactIds ?? []) citedFactUnion.add(id);
  }
  const factCount = citedFactUnion.size;
  const shownCount = ideas.length;
  const missing = Math.max(result.requestedCount - shownCount, 0);
  const isPartial = missing > 0;
  const pinnedThemeLabel = rotationSlot
    ? ROTATION_SLOTS.includes(rotationSlot as RotationSlotKey)
      ? rotationSlotToTheme(rotationSlot as RotationSlotKey)
      : rotationSlot
    : null;

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {shownCount} idea(s) from {factCount} cited fact{factCount === 1 ? "" : "s"} in your {uploadLabel} upload.
          {storyLeadId && " Anchored on a Story Lead."}
          {pinnedThemeLabel && ` Theme pinned to ${pinnedThemeLabel}.`}
        </p>
      </div>

      {isPartial && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          {pinnedThemeLabel
            ? `Couldn't produce ${missing} more on-theme idea${missing === 1 ? "" : "s"} from this upload — try unpinning the theme or generating from a different upload. `
            : `Generated ${shownCount} of ${result.requestedCount} — the validation gate trimmed some. `}
          You can pick from these or{" "}
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
        {ideas.map((idea, i) => (
          <IdeaCardView key={i} idea={idea} onPick={() => pick(idea)} />
        ))}
      </div>
    </div>
  );
}

function IdeaCardView({ idea, onPick }: { idea: IdeaCard; onPick: () => void }) {
  // Map the wizard's idea shape onto the shared IdeaCard's mockup-aligned
  // props. `rotationSlot` carries the theme; thumbnail callouts become hook
  // chips (capped at 3 inside the component); framework/tactileType/runtime
  // become the frame + intent chips; subPersonas become avatar chips.
  const intentChips = [
    { label: idea.tactileType, primary: true },
    ...(idea.estimatedRuntime ? [{ label: idea.estimatedRuntime }] : []),
  ];
  const themeKey = rotationSlotToThemeKey(idea.rotationSlot);
  const themeLabel = ROTATION_SLOTS.includes(idea.rotationSlot as RotationSlotKey)
    ? rotationSlotToTheme(idea.rotationSlot as RotationSlotKey)
    : idea.rotationSlot;
  return (
    <IdeaCard
      title={idea.title}
      themeKey={themeKey}
      themeLabel={themeLabel}
      premise={idea.titlePromise}
      clarityPremise={idea.clarityPremise}
      visualPeak={idea.visualPeak}
      hookChips={idea.thumbnailCallouts}
      frameChip={idea.framework}
      intentChips={intentChips}
      avatarChips={idea.subPersonas.slice(0, 3)}
      citedFactCount={idea.citedFactIds.length}
      justification={idea.whyItWorks ?? null}
      onPick={onPick}
    />
  );
}

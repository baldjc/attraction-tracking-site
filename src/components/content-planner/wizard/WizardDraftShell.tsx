"use client";

/**
 * Wave 4 — wizard draft persistence + resume prompt shell.
 *
 * Wraps every wizard step. Two jobs:
 *   1. On mount, fetch the caller's most recent in-progress draft. If one
 *      exists AND the user landed on the bare mode-picker (step=1 with no
 *      other params), show a banner offering "Resume from {step}" /
 *      "Start fresh". Anything else means the user intentionally navigated
 *      somewhere — don't nag.
 *   2. Auto-save the wizard's URL state + a snapshot of any rich
 *      sessionStorage data (last generated batch, etc.) on every URL
 *      change. Debounced + coalesced via useAutoSave so a fast click-
 *      through doesn't burst-save.
 *
 * Saving is opportunistic: a network error doesn't surface to the user
 * (the draft is a convenience, not the source of truth — the wizard
 * survives without it via URL + sessionStorage).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAutoSave } from "@/hooks/useAutoSave";
import { Button } from "@/components/ui/Button";
import {
  WIZARD_BATCH_SESSION_KEY,
  WIZARD_DRAFT_DIRTY_EVENT,
} from "./Step3IdeaCards";
import { WIZARD_VALIDATION_SESSION_KEY } from "./Step2BIdeaValidation";

interface DraftRow {
  currentStep: string;
  propertyTypeFocus: string | null;
  storyLeadId: string | null;
  rotationSlot: string | null;
  validatedIdea: string | null;
  pickedKey: string | null;
  expiresAt: string;
  updatedAt: string;
  generatedIdeaCards?: unknown;
  validationContext?: unknown;
}

interface Snapshot {
  currentStep: string;
  propertyTypeFocus: string | null;
  storyLeadId: string | null;
  rotationSlot: string | null;
  validatedIdea: string | null;
  pickedKey: string | null;
  generatedIdeaCards: unknown;
  validationContext: unknown;
  storyLeadFactIds: unknown;
}

const KNOWN_STEPS = new Set(["1", "2a", "2b", "2c", "3", "4"]);

export function WizardDraftShell({ children }: { children: React.ReactNode }) {
  const params = useSearchParams();
  const router = useRouter();
  const [resumeDraft, setResumeDraft] = useState<DraftRow | null>(null);
  const [resumeChecked, setResumeChecked] = useState(false);
  // Bumped whenever a step writes new rich state to sessionStorage and
  // fires WIZARD_DRAFT_DIRTY_EVENT. Forces the snapshot useMemo to
  // re-read sessionStorage even though the URL hasn't changed.
  const [dirtyTick, setDirtyTick] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onDirty = () => setDirtyTick((n) => n + 1);
    window.addEventListener(WIZARD_DRAFT_DIRTY_EVENT, onDirty);
    return () => window.removeEventListener(WIZARD_DRAFT_DIRTY_EVENT, onDirty);
  }, []);

  // ── Resume prompt: fetch once on mount when URL is bare step=1 ──
  useEffect(() => {
    const step = params.get("step") ?? "1";
    const otherKeys = Array.from(params.keys()).filter((k) => k !== "step");
    if (step !== "1" || otherKeys.length > 0) {
      setResumeChecked(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/member/content-planner/wizard/draft");
        if (!r.ok) return;
        const j = (await r.json()) as { draft: DraftRow | null };
        if (cancelled) return;
        if (j.draft && KNOWN_STEPS.has(j.draft.currentStep) && j.draft.currentStep !== "1") {
          setResumeDraft(j.draft);
        }
      } catch {
        /* non-fatal */
      } finally {
        if (!cancelled) setResumeChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // We intentionally only run on first mount; nav changes call this hook
    // again with different params, which would suppress the banner because
    // step !== "1" — that's the correct UX (banner only on landing).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Build a snapshot from URL + sessionStorage on every URL change ──
  const snapshot = useMemo<Snapshot | null>(() => {
    const step = params.get("step") ?? "1";
    if (!KNOWN_STEPS.has(step)) return null;
    // Don't save a meaningless empty draft on the bare landing page.
    const otherKeys = Array.from(params.keys()).filter((k) => k !== "step");
    if (step === "1" && otherKeys.length === 0) return null;
    let lastBatch: unknown = null;
    let lastValidation: unknown = null;
    if (typeof window !== "undefined") {
      try {
        const raw = sessionStorage.getItem(WIZARD_BATCH_SESSION_KEY);
        if (raw) lastBatch = JSON.parse(raw);
      } catch {
        /* corrupt — ignore */
      }
      try {
        const raw = sessionStorage.getItem(WIZARD_VALIDATION_SESSION_KEY);
        if (raw) lastValidation = JSON.parse(raw);
      } catch {
        /* corrupt — ignore */
      }
    }
    return {
      currentStep: step,
      propertyTypeFocus: params.get("propertyTypeFocus"),
      storyLeadId: params.get("storyLeadId"),
      rotationSlot: params.get("rotationSlot"),
      validatedIdea: params.get("validatedIdea"),
      pickedKey: params.get("picked"),
      generatedIdeaCards: lastBatch,
      validationContext: lastValidation,
      storyLeadFactIds: null,
    };
  }, [params, dirtyTick]);

  const onSave = useCallback(async (snap: Snapshot | null) => {
    if (!snap) return;
    await fetch("/api/member/content-planner/wizard/draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(snap),
    });
  }, []);

  const { status, lastSavedAt } = useAutoSave({ value: snapshot, delay: 800, onSave });

  function resume() {
    if (!resumeDraft) return;
    // Hydrate the rich state back into sessionStorage BEFORE the
    // navigation so Step 3 / Step 2B mount with their caches warm and
    // can short-circuit the regeneration / re-validation calls.
    if (typeof window !== "undefined") {
      try {
        // Always overwrite — including removing the key when the draft
        // carries no value — so stale session data from a prior wizard
        // run can't leak into the resumed flow's caches.
        if (resumeDraft.generatedIdeaCards) {
          sessionStorage.setItem(
            WIZARD_BATCH_SESSION_KEY,
            JSON.stringify(resumeDraft.generatedIdeaCards),
          );
        } else {
          sessionStorage.removeItem(WIZARD_BATCH_SESSION_KEY);
        }
        if (resumeDraft.validationContext) {
          sessionStorage.setItem(
            WIZARD_VALIDATION_SESSION_KEY,
            JSON.stringify(resumeDraft.validationContext),
          );
        } else {
          sessionStorage.removeItem(WIZARD_VALIDATION_SESSION_KEY);
        }
      } catch {
        /* quota — non-fatal */
      }
    }
    const next = new URLSearchParams({ step: resumeDraft.currentStep });
    if (resumeDraft.propertyTypeFocus) {
      next.set("propertyTypeFocus", resumeDraft.propertyTypeFocus);
    }
    if (resumeDraft.storyLeadId) next.set("storyLeadId", resumeDraft.storyLeadId);
    if (resumeDraft.rotationSlot) next.set("rotationSlot", resumeDraft.rotationSlot);
    if (resumeDraft.validatedIdea) next.set("validatedIdea", resumeDraft.validatedIdea);
    if (resumeDraft.pickedKey) next.set("picked", resumeDraft.pickedKey);
    setResumeDraft(null);
    router.push(`/member/content-planner/wizard?${next.toString()}`);
  }

  async function discard() {
    setResumeDraft(null);
    // True "start fresh": also wipe the local rich-state caches so the
    // next wizard run can't replay batches/verdicts from the previous
    // one. (resume() does this on the success path; discard() needs
    // the same cleanup on the abandon path.)
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem(WIZARD_BATCH_SESSION_KEY);
        sessionStorage.removeItem(WIZARD_VALIDATION_SESSION_KEY);
      } catch {
        /* non-fatal */
      }
    }
    try {
      await fetch("/api/member/content-planner/wizard/draft", { method: "DELETE" });
    } catch {
      /* non-fatal */
    }
  }

  return (
    <>
      {resumeChecked && resumeDraft && (
        <ResumeBanner
          draft={resumeDraft}
          onResume={resume}
          onDiscard={discard}
        />
      )}
      {snapshot && <SavedIndicator status={status} lastSavedAt={lastSavedAt} />}
      {children}
    </>
  );
}

function ResumeBanner({
  draft,
  onResume,
  onDiscard,
}: {
  draft: DraftRow;
  onResume: () => void;
  onDiscard: () => void;
}) {
  const label = STEP_LABEL[draft.currentStep] ?? `Step ${draft.currentStep}`;
  return (
    <div
      className="mt-4 rounded-lg border p-4"
      style={{
        borderColor: "var(--abv-azure)",
        background: "var(--abv-azure-tint)",
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--abv-ink)] dark:text-white">
            Resume your last wizard run?
          </p>
          <p className="mt-1 text-xs text-[var(--abv-text)]/80 dark:text-white/80">
            You were on {label}
            {draft.propertyTypeFocus
              ? ` · focus: ${draft.propertyTypeFocus}`
              : ""}
            . Drafts expire after 14 days.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="primary" onClick={onResume}>
            Resume
          </Button>
          <Button size="sm" variant="outline" onClick={onDiscard}>
            Start fresh
          </Button>
        </div>
      </div>
    </div>
  );
}

function SavedIndicator({
  status,
  lastSavedAt,
}: {
  status: string;
  lastSavedAt: Date | null;
}) {
  // Re-render every ~10s so the "Saved Ns ago" label stays fresh.
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 10_000);
    return () => window.clearInterval(id);
  }, []);

  let label: string;
  if (status === "saving") label = "Saving…";
  else if (status === "error") label = "Couldn’t save draft";
  else if (lastSavedAt) {
    const seconds = Math.max(0, Math.round((Date.now() - lastSavedAt.getTime()) / 1000));
    if (seconds < 5) label = "Saved just now";
    else if (seconds < 60) label = `Saved ${seconds}s ago`;
    else if (seconds < 3600) label = `Saved ${Math.round(seconds / 60)}m ago`;
    else label = `Saved ${Math.round(seconds / 3600)}h ago`;
  } else {
    label = "Draft auto-saves as you work";
  }

  const tone =
    status === "error"
      ? "text-red-600 dark:text-red-400"
      : "text-gray-500 dark:text-gray-400";
  return (
    <p className={`mt-2 text-[11px] ${tone}`} aria-live="polite">
      {label}
    </p>
  );
}

const STEP_LABEL: Record<string, string> = {
  "1": "the mode picker",
  "2a": "browsing Story Leads",
  "2b": "validating an idea",
  "2c": "picking a theme",
  "3": "reviewing idea cards",
  "4": "saving an idea",
};

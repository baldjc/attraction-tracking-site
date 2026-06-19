"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import type { TierCohort } from "@/lib/onboarding-tier";
import { totalWizardSteps } from "@/lib/onboarding-tier";
import Step1Welcome from "./steps/Step1Welcome";
import Step2MarketData from "./steps/Step2MarketData";
import Step3Avatar from "./steps/Step3Avatar";
import Step4SubPersonas from "./steps/Step4SubPersonas";
import Step5TeamCredentials from "./steps/Step5TeamCredentials";
import Step6KnowledgeBase from "./steps/Step6KnowledgeBase";
import Step7VoiceGuide from "./steps/Step7VoiceGuide";
import Step8FirstPlan from "./steps/Step8FirstPlan";
import Step9Done from "./steps/Step9Done";

interface Props {
  cohort: TierCohort;
  voiceGuideEnabled: boolean;
  /** Wizard step to render initially (1-9). Spec stores LAST COMPLETED step. */
  startStep: number;
}

/**
 * Wizard step plan (identity-first; slow async tasks tail the flow):
 *   1 Welcome → 2 Avatar → 3 Sub-personas → 4 Team credentials →
 *   [5 Voice Guide — gated by tool_member_voice_guide] →
 *   6 Market data (non-blocking) → 7 Knowledge Base (non-blocking) →
 *   8 First plan → 9 Done
 *
 * When the voice-guide flag is off, step 5 is hidden entirely: continue from
 * step 4 jumps straight to step 6, and the progress dots show 6 visible
 * positions instead of 7. The internal step numbers (used for persistence
 * and URL ?step=) are contiguous 1-9 — only the visible count changes.
 *
 * Note: the component *file* names (Step2MarketData, Step3Avatar, …) reflect
 * the original ordering and are intentionally left unchanged; the mapping
 * below is the source of truth for render order.
 */
export default function OnboardingWizardClient({
  cohort,
  voiceGuideEnabled,
  startStep,
}: Props) {
  const router = useRouter();
  const [step, setStepLocal] = useState<number>(() => {
    const clamped = Math.max(1, Math.min(9, startStep));
    // Voice (step 5) is hidden without the flag — never land a resume there.
    return clamped === 5 && !voiceGuideEnabled ? 6 : clamped;
  });

  const visibleSteps = useMemo(() => {
    const list = [1, 2, 3, 4];
    if (voiceGuideEnabled) list.push(5);
    list.push(6, 7, 8, 9);
    return list;
  }, [voiceGuideEnabled]);

  const totalForDisplay = totalWizardSteps(voiceGuideEnabled); // 6 or 7 (excludes 1=welcome, 9=done)
  const positionInDisplay = useMemo(() => {
    // Welcome (1) and Done (9) show no counter. Every other visible step's
    // display position is just its index in the visible sequence (Welcome at
    // index 0 ⇒ first numbered step = index 1 = "Step 1 of N").
    if (step <= 1 || step >= 9) return null;
    const idx = visibleSteps.indexOf(step);
    return idx > 0 ? idx : null;
  }, [step, visibleSteps]);

  const stepLabel =
    positionInDisplay !== null
      ? `Step ${positionInDisplay} of ${totalForDisplay}`
      : undefined;

  const persistProgress = useCallback(
    async (completedStep: number) => {
      try {
        await fetch("/api/member/onboarding/progress", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ step: completedStep }),
        });
      } catch {
        // Best-effort. UI advances regardless so a flaky network doesn't
        // strand the member mid-setup; the next successful PATCH catches up.
      }
    },
    [],
  );

  const advance = useCallback(
    async (fromStep: number) => {
      await persistProgress(fromStep);
      // Next visible step. Skip 7 if the flag is off.
      const idx = visibleSteps.indexOf(fromStep);
      const next = idx >= 0 && idx + 1 < visibleSteps.length
        ? visibleSteps[idx + 1]
        : Math.min(9, fromStep + 1);
      setStepLocal(next);
      // Keep URL in sync so refresh / bookmark works.
      router.replace(`/member/onboarding?step=${next}`, { scroll: false });
      if (typeof window !== "undefined") window.scrollTo({ top: 0 });
    },
    [persistProgress, router, visibleSteps],
  );

  const finish = useCallback(async () => {
    try {
      await fetch("/api/member/onboarding/progress", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step: 9, completed: true }),
      });
    } catch {
      // ignore — if this fails we still leave them on Step 9 with a working
      // "Take me to my dashboard" CTA.
    }
  }, []);

  const skip = useCallback(async () => {
    try {
      await fetch("/api/member/onboarding/skip", { method: "POST" });
    } catch {
      // ignore
    }
    router.push("/member/dashboard");
  }, [router]);

  const stepProps = {
    cohort,
    onContinue: () => advance(step),
    onSkip: skip,
    stepLabel,
  };

  return (
    <div className="mx-auto max-w-[760px]">
      {/* Progress indicator — hidden on Welcome (step 1) and Done (step 9) */}
      {positionInDisplay !== null && (
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Step {positionInDisplay} of {totalForDisplay}
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            {Array.from({ length: totalForDisplay }).map((_, i) => {
              const filled = i + 1 <= positionInDisplay;
              const current = i + 1 === positionInDisplay;
              return (
                <span
                  key={i}
                  className={[
                    "h-1.5 flex-1 rounded-full transition-colors",
                    filled
                      ? "bg-gray-900 dark:bg-white"
                      : "bg-gray-200 dark:bg-gray-800",
                    current ? "opacity-100" : filled ? "opacity-80" : "",
                  ].join(" ")}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Step card */}
      <section className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm p-8 sm:p-10">
        {/* Render order (identity-first); component file names keep their
            original numbering — see the step-plan comment above. */}
        {step === 1 && <Step1Welcome {...stepProps} />}
        {step === 2 && <Step3Avatar {...stepProps} />}
        {step === 3 && <Step4SubPersonas {...stepProps} />}
        {step === 4 && <Step5TeamCredentials {...stepProps} />}
        {step === 5 && voiceGuideEnabled && <Step7VoiceGuide {...stepProps} />}
        {step === 6 && <Step2MarketData {...stepProps} />}
        {step === 7 && <Step6KnowledgeBase {...stepProps} />}
        {step === 8 && <Step8FirstPlan {...stepProps} />}
        {step === 9 && <Step9Done cohort={cohort} onFinish={finish} />}
      </section>
    </div>
  );
}

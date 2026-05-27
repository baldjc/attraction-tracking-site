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
 * Wizard step plan:
 *   1 Welcome → 2 Market data → 3 Avatar → 4 Sub-personas →
 *   5 Team credentials → 6 Knowledge Base →
 *   [7 Voice Guide — gated by tool_member_voice_guide] →
 *   8 First plan → 9 Done
 *
 * When the voice-guide flag is off, step 7 is hidden entirely: continue from
 * step 6 jumps straight to step 8, and the progress dots show 6 visible
 * positions instead of 7. The internal step numbers (used for persistence
 * and URL ?step=) are stable across tiers — only the visible count changes.
 */
export default function OnboardingWizardClient({
  cohort,
  voiceGuideEnabled,
  startStep,
}: Props) {
  const router = useRouter();
  const [step, setStepLocal] = useState<number>(
    Math.max(1, Math.min(9, startStep)),
  );

  const visibleSteps = useMemo(() => {
    const list = [1, 2, 3, 4, 5, 6];
    if (voiceGuideEnabled) list.push(7);
    list.push(8, 9);
    return list;
  }, [voiceGuideEnabled]);

  const totalForDisplay = totalWizardSteps(voiceGuideEnabled); // 6 or 7 (excludes 1=welcome, 9=done)
  const positionInDisplay = useMemo(() => {
    // Spec labels step 2 as "Step 1 of 6", step 3 as "Step 2 of 6", etc.
    // (Welcome and Done don't count.) Step 7 is "Step 6 of 6 (DWY only)".
    if (step <= 1 || step >= 9) return null;
    if (step === 7) return totalForDisplay; // always last numbered step when shown
    return step - 1; // step 2 → 1, step 3 → 2, ..., step 8 → 7 (or 6 if no voice guide)
  }, [step, totalForDisplay]);

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

  const stepProps = { cohort, onContinue: () => advance(step), onSkip: skip };

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
        {step === 1 && <Step1Welcome {...stepProps} />}
        {step === 2 && <Step2MarketData {...stepProps} />}
        {step === 3 && <Step3Avatar {...stepProps} />}
        {step === 4 && <Step4SubPersonas {...stepProps} />}
        {step === 5 && <Step5TeamCredentials {...stepProps} />}
        {step === 6 && <Step6KnowledgeBase {...stepProps} />}
        {step === 7 && voiceGuideEnabled && <Step7VoiceGuide {...stepProps} />}
        {step === 8 && <Step8FirstPlan {...stepProps} />}
        {step === 9 && <Step9Done cohort={cohort} onFinish={finish} />}
      </section>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface OnboardingStatus {
  onboardingComplete: boolean;
  onboardingCompletedAt?: string | null;
  onboardingSkippedAt?: string | null;
  onboardingStep?: number;
  voiceGuideEnabled?: boolean;
  avatarName?: string | null;
}

/**
 * Dashboard nudge banner.
 *
 * Visible when the new Onboarding Wizard is unfinished:
 *   - onboardingCompletedAt is null AND (onboardingStep > 0 OR
 *     onboardingSkippedAt set)
 *
 * Falls back to the legacy "no avatar" prompt for accounts that pre-date the
 * wizard (onboardingStep === 0 and never skipped) so existing members still
 * get the avatar-building nudge they used to.
 */
export default function OnboardingBanner() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/member/onboarding")
      .then((r) => r.json())
      .then((data) => {
        setStatus(data ?? null);
      })
      .catch(() => {
        setStatus(null);
      })
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded || !status) return null;

  // Wizard completed → nothing to nudge.
  if (status.onboardingCompletedAt || status.onboardingComplete) return null;

  const startedButUnfinished = (status.onboardingStep ?? 0) > 0;
  const skipped = !!status.onboardingSkippedAt;
  const showWizardNudge = startedButUnfinished || skipped;

  const totalSteps = status.voiceGuideEnabled ? 7 : 6;
  const stepLabel = Math.min(status.onboardingStep ?? 0, totalSteps);

  if (showWizardNudge) {
    return (
      <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between mb-6">
        <div>
          <p className="font-semibold text-amber-900 dark:text-amber-200 text-sm">
            Finish setting up your system
          </p>
          <p className="text-amber-800 dark:text-amber-300 text-sm mt-0.5">
            You completed {stepLabel} of {totalSteps} steps. Scripts work
            better with complete setup.
          </p>
        </div>
        <Link
          href="/member/onboarding"
          className="inline-flex items-center justify-center px-6 py-2.5 rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold hover:bg-black dark:hover:bg-gray-100"
        >
          Continue setup →
        </Link>
      </div>
    );
  }

  // Legacy fallback for accounts that pre-date the wizard.
  if (!status.avatarName) {
    return (
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-lg p-4 flex items-start gap-3 mb-6">
        <span className="text-xl shrink-0">🎯</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            Finish building your avatar to unlock all AI tools
          </p>
          <Link
            href="/member/content-tools/avatar-architect"
            className="text-xs text-amber-700 dark:text-amber-400 underline underline-offset-2 mt-0.5 inline-block"
          >
            Build your avatar →
          </Link>
        </div>
      </div>
    );
  }

  return null;
}

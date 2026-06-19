"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Notice, { NOTICE_PILL_CLASS } from "@/components/ui/Notice";

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
      <Notice
        variant="info"
        className="mb-6"
        title="Finish setting up your system"
        action={
          <Link href="/member/onboarding" className={NOTICE_PILL_CLASS}>
            Continue setup →
          </Link>
        }
      >
        You completed {stepLabel} of {totalSteps} steps. Scripts work better
        with complete setup.
      </Notice>
    );
  }

  // Legacy fallback for accounts that pre-date the wizard.
  if (!status.avatarName) {
    return (
      <Notice
        variant="info"
        className="mb-6"
        icon={<span className="text-xl">🎯</span>}
        title="Finish building your avatar to unlock all AI tools"
      >
        <Link
          href="/member/content-tools/avatar-architect"
          className="underline underline-offset-2 inline-block"
        >
          Build your avatar →
        </Link>
      </Notice>
    );
  }

  return null;
}

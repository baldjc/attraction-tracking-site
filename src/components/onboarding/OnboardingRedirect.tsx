"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

export default function OnboardingRedirect() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/member/onboarding") return;

    fetch("/api/member/onboarding")
      .then((r) => r.json())
      .then((data) => {
        // Only force members into the wizard if they have neither finished it
        // nor explicitly opted out. "Skip for now" stamps onboardingSkippedAt
        // (and finishing stamps onboardingCompletedAt) — without honoring those
        // here, skipping would bounce the member straight back to onboarding.
        if (
          data?.onboardingComplete === false &&
          !data?.onboardingDismissedAt &&
          !data?.onboardingSkippedAt &&
          !data?.onboardingCompletedAt
        ) {
          router.push("/member/onboarding");
        }
      })
      .catch(() => {});
  }, [pathname, router]);

  return null;
}

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
        if (data?.onboardingComplete === false && !data?.onboardingDismissedAt) {
          router.push("/member/onboarding");
        }
      })
      .catch(() => {});
  }, [pathname, router]);

  return null;
}

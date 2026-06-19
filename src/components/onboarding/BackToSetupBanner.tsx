"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isOnboardingHelperPath } from "@/components/onboarding/onboarding-allowlist";

/**
 * Quiet "← Back to setup" affordance shown on the onboarding helper pages
 * (market data, knowledge base, content planner, avatar architect) while a
 * member's onboarding is still incomplete.
 *
 * The wizard opens these pages in a new tab, so a member can lose the wizard
 * tab or navigate here in the same tab. This gives them a clear way home.
 * It's on-brand (warm canvas, no alarm styling) and disappears once onboarding
 * is complete.
 */
export default function BackToSetupBanner() {
  const pathname = usePathname();
  const [incomplete, setIncomplete] = useState(false);

  const onHelperPage = isOnboardingHelperPath(pathname);

  useEffect(() => {
    if (!onHelperPage) {
      setIncomplete(false);
      return;
    }
    let cancelled = false;
    fetch("/api/member/onboarding")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setIncomplete(
          data?.onboardingComplete === false && !data?.onboardingCompletedAt,
        );
      })
      .catch(() => {
        if (!cancelled) setIncomplete(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onHelperPage, pathname]);

  if (!onHelperPage || !incomplete) return null;

  return (
    <div className="mb-6">
      <Link
        href="/member/onboarding"
        className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-stone-50 px-4 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-100 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300 dark:hover:bg-gray-900/70"
      >
        <span aria-hidden>←</span>
        Back to setup
      </Link>
    </div>
  );
}

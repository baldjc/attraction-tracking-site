"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function OnboardingBanner() {
  const [state, setState] = useState<"loading" | "hidden" | "no_avatar" | "incomplete">("loading");

  useEffect(() => {
    fetch("/api/member/onboarding")
      .then((r) => r.json())
      .then((data) => {
        if (data?.onboardingComplete) {
          setState("hidden");
        } else if (!data?.avatarName) {
          setState("no_avatar");
        } else {
          setState("incomplete");
        }
      })
      .catch(() => setState("hidden"));
  }, []);

  if (state === "loading" || state === "hidden") return null;

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-lg p-4 flex items-start gap-3 mb-6">
      <span className="text-xl shrink-0">🎯</span>
      <div className="flex-1">
        {state === "no_avatar" ? (
          <>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Finish building your avatar to unlock all AI tools</p>
            <Link
              href="/member/ai-tools/avatar-architect"
              className="text-xs text-amber-700 dark:text-amber-400 underline underline-offset-2 mt-0.5 inline-block"
            >
              Build your avatar →
            </Link>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Complete your setup to get the most out of the platform</p>
            <Link
              href="/member/onboarding"
              className="text-xs text-amber-700 dark:text-amber-400 underline underline-offset-2 mt-0.5 inline-block"
            >
              Finish setup →
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

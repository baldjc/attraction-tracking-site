"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { TierCohort } from "@/lib/onboarding-tier";

/**
 * Step 9 — Done / orientation. On mount we fire-and-forget the "completed"
 * PATCH so onboardingCompletedAt is set even if the member just closes the
 * tab. The primary CTA simply routes to /member/dashboard.
 */
export default function Step9Done({
  cohort,
  onFinish,
}: {
  cohort: TierCohort;
  onFinish: () => Promise<void> | void;
}) {
  const router = useRouter();
  // Guard against StrictMode double-invoke and any future re-mounts —
  // onFinish writes onboardingCompletedAt and we only need that to land once.
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    void onFinish();
    // onFinish is stable for the lifetime of OnboardingWizardClient.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-gray-50 sm:text-5xl">
        You&rsquo;re set up. Here&rsquo;s what&rsquo;s next.
      </h1>
      <p className="mt-3 text-sm text-gray-500">
        {cohort} tier · setup complete
      </p>

      <div className="mt-6 space-y-4 text-base leading-relaxed text-gray-700 dark:text-gray-300">
        <p>Your system is ready. Three places to go from here:</p>
        <ul className="list-disc list-inside space-y-2 marker:text-gray-400">
          <li>
            <strong>Build your first script</strong> —{" "}
            <Link
              href="/member/content-planner"
              className="underline underline-offset-2"
            >
              /member/content-planner
            </Link>
          </li>
          <li>
            <strong>Watch a quick-start lesson</strong> —{" "}
            <Link href="/member/academy" className="underline underline-offset-2">
              /member/academy
            </Link>
          </li>
          <li>
            <strong>Check your YouTube performance</strong> —{" "}
            <Link href="/member/scores" className="underline underline-offset-2">
              /member/scores
            </Link>
          </li>
        </ul>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Setup steps you can revisit anytime live in{" "}
          <Link
            href="/member/market-data/setup"
            className="underline underline-offset-2"
          >
            /member/market-data/setup
          </Link>
          . Your Knowledge Base research lives in{" "}
          <Link
            href="/member/knowledge-base"
            className="underline underline-offset-2"
          >
            /member/knowledge-base
          </Link>
          . You can update or add to either whenever you want.
        </p>
      </div>

      <div className="mt-8 flex justify-end border-t border-gray-200 dark:border-gray-800 pt-5">
        <button
          type="button"
          onClick={() => router.push("/member/dashboard")}
          className="rounded-full bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white dark:bg-white dark:text-gray-900"
        >
          Take me to my dashboard →
        </button>
      </div>
    </div>
  );
}

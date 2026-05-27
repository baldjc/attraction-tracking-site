"use client";

import { TimePill, type StepProps } from "./_shared";

/**
 * Step 1 — Welcome (no progress dot; sets the tone before the numbered steps).
 * The time pill copy varies by cohort: DWY members get an extra step (Voice
 * Guide) so the total goes from ~25 to ~30 minutes.
 */
export default function Step1Welcome({ cohort, onContinue, onSkip }: StepProps) {
  const isLongPath = cohort === "DWY";
  return (
    <div>
      <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-gray-50 sm:text-5xl">
        Welcome. Glad you&rsquo;re here.
      </h1>
      <div className="mt-6 space-y-4 text-base leading-relaxed text-gray-700 dark:text-gray-300">
        <p>
          The next {isLongPath ? "30" : "25"} minutes are about getting your
          system set up. By the end of this, every script you make from here on
          starts from your real data, your real audience, your real team. Not
          from a blank page.
        </p>
        <p>
          We&rsquo;ll walk through {isLongPath ? "seven" : "six"} quick steps.
          You can do them all now, or save and come back. Either way, when you
          finish, you&rsquo;ll have the system you need to publish videos that
          actually convert.
        </p>
      </div>
      <div className="mt-8 flex flex-col gap-3 border-t border-gray-200 dark:border-gray-800 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <TimePill label={isLongPath ? "About 30 minutes" : "About 25 minutes"} />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onSkip()}
            className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            Skip for now
          </button>
          <button
            type="button"
            onClick={() => onContinue()}
            className="rounded-full bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-black dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
          >
            Let&rsquo;s go
          </button>
        </div>
      </div>
    </div>
  );
}

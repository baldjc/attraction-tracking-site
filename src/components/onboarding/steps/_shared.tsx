"use client";

import type { TierCohort } from "@/lib/onboarding-tier";

export interface StepProps {
  cohort: TierCohort;
  onContinue: () => void | Promise<void>;
  onSkip: () => void | Promise<void>;
}

/** Header used by every numbered step (2-8). */
export function StepHeader({
  label,
  title,
  subtitle,
}: {
  label: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="mb-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-purple-700 dark:text-purple-400">
        {label}
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-2 text-base text-gray-600 dark:text-gray-300">
          {subtitle}
        </p>
      )}
    </header>
  );
}

/** "Why this matters" — soft-grey side note used on every step. */
export function WhyBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-relaxed text-gray-700 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300">
      <p className="font-semibold text-gray-900 dark:text-gray-100">
        Why this matters
      </p>
      <p className="mt-1 italic">{children}</p>
    </div>
  );
}

/** Time pill in the footer of each step. */
export function TimePill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 dark:bg-gray-800 px-3 py-1 text-xs font-medium text-stone-700 dark:text-stone-300">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="h-3 w-3"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      {label}
    </span>
  );
}

/** Footer with primary "Continue" + secondary "Save and finish later". */
export function StepFooter({
  time,
  primary,
  primaryDisabled,
  primaryBusy,
  onPrimary,
  onSkip,
  primaryLabel = "Continue",
  secondaryLabel = "Save and finish later",
  extras,
}: {
  time: string;
  primary?: boolean;
  primaryDisabled?: boolean;
  primaryBusy?: boolean;
  onPrimary: () => void | Promise<void>;
  onSkip?: () => void | Promise<void>;
  primaryLabel?: string;
  secondaryLabel?: string;
  extras?: React.ReactNode;
}) {
  return (
    <div className="mt-8 flex flex-col gap-3 border-t border-gray-200 dark:border-gray-800 pt-5 sm:flex-row sm:items-center sm:justify-between">
      <TimePill label={time} />
      <div className="flex flex-wrap items-center gap-2">
        {extras}
        {onSkip && (
          <button
            type="button"
            onClick={() => onSkip()}
            className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            {secondaryLabel}
          </button>
        )}
        <button
          type="button"
          onClick={() => onPrimary()}
          disabled={primaryDisabled || primaryBusy}
          className="rounded-full bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
        >
          {primaryBusy ? "Working…" : primaryLabel}
        </button>
      </div>
    </div>
  );
}

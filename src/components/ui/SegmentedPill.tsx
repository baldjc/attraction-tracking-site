"use client";

import type { ReactNode } from "react";

export interface SegmentedPillOption<T extends string = string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  ariaLabel?: string;
}

interface Props<T extends string = string> {
  options: SegmentedPillOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: "sm" | "md";
  ariaLabel?: string;
}

const SIZES = {
  sm: "px-3 py-1 text-[11.5px]",
  md: "px-4 py-[9px] text-[12.5px]",
};

export function SegmentedPill<T extends string = string>({
  options,
  value,
  onChange,
  className,
  size = "md",
  ariaLabel,
}: Props<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={["flex flex-wrap gap-2", className ?? ""].filter(Boolean).join(" ")}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        const base =
          "rounded-full font-semibold transition-colors transition-transform duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--abv-azure)] disabled:cursor-not-allowed disabled:opacity-50";
        const activeCls =
          "bg-[var(--abv-ink)] text-white border border-[var(--abv-ink)]";
        const inactiveCls =
          "bg-white text-[var(--abv-text)] border border-[var(--abv-border-strong)] hover:bg-[var(--abv-bg-warm)] dark:bg-[#1a2433] dark:text-white dark:border-white/15 dark:hover:bg-white/5";
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.ariaLabel}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className={[base, SIZES[size], active ? activeCls : inactiveCls]
              .filter(Boolean)
              .join(" ")}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

interface Props {
  active: boolean;
  step?: string;
  /** Steps that the operation moves through, in order. The first one
   *  matched in `step` becomes the current position on the bar. */
  steps?: string[];
  /** Estimated total seconds for the operation; the bar will progress
   *  smoothly toward (but never reach) 100%. Defaults to 45s. */
  estimatedSeconds?: number;
  /** Top-level title shown next to the spinner. */
  title?: string;
  /** Optional subtitle / hint shown under the progress bar. */
  hint?: string;
}

export default function AnalysisProgress({
  active,
  step,
  steps,
  estimatedSeconds = 45,
  title = "Working…",
  hint = "Please keep this tab open — leaving now will lose your progress.",
}: Props) {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (!active) {
      setPct(0);
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      // Asymptotic curve: rises fast then slows, capped at 92%.
      const target = 92 * (1 - Math.exp(-elapsed / estimatedSeconds));
      setPct((prev) => Math.max(prev, target));
    }, 250);
    return () => clearInterval(timer);
  }, [active, estimatedSeconds]);

  // Warn the user if they try to close / refresh / navigate while busy.
  useEffect(() => {
    if (!active) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active]);

  if (!active) return null;

  const currentIndex = steps && step
    ? Math.max(
        0,
        steps.findIndex((s) => s.toLowerCase() === step.toLowerCase()),
      )
    : -1;

  return (
    <div className="mb-5 rounded-lg border border-[#6ba3c7]/30 bg-[#6ba3c7]/5 p-4">
      <div className="flex items-center gap-3">
        <span className="flex shrink-0 gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#6ba3c7]"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </span>
        <p className="text-sm font-semibold text-[#2f3437] dark:text-white">
          {title}
        </p>
        {step && (
          <span className="ml-auto text-xs text-[#2f3437]/60 dark:text-white/60">
            {step}
          </span>
        )}
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#6ba3c7]/15">
        <div
          className="h-full rounded-full bg-[#6ba3c7] transition-[width] duration-300 ease-out"
          style={{ width: `${pct.toFixed(1)}%` }}
        />
      </div>

      {steps && steps.length > 0 && (
        <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {steps.map((s, i) => {
            const done = currentIndex > i;
            const current = currentIndex === i;
            return (
              <li
                key={s}
                className={
                  current
                    ? "font-semibold text-[#6ba3c7]"
                    : done
                      ? "text-[#2f3437]/50 line-through dark:text-white/40"
                      : "text-[#2f3437]/40 dark:text-white/35"
                }
              >
                {done ? "✓" : current ? "→" : "•"} {s}
              </li>
            );
          })}
        </ol>
      )}

      <p className="mt-3 text-xs text-[#2f3437]/55 dark:text-white/45">
        {hint}
      </p>
    </div>
  );
}

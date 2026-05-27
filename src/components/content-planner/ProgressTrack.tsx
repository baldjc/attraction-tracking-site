"use client";

import { useState } from "react";
export type ProgressStep = {
  key: "idea" | "script" | "review" | "title" | "description" | "repurpose" | "ready";
  label: string;
  status: "done" | "current" | "upcoming";
  lastEditedAt?: Date;
  score?: number;
  onClick: () => void;
  // Auto-detection result (data exists for this step). Distinct from
  // `manualDone` so the UI can disable manual toggles for steps that are
  // already done from real content.
  autoDone?: boolean;
  manualDone?: boolean;
  onToggleManual?: () => void;
};

type Props = {
  steps: ProgressStep[];
  compact?: boolean;
};

function Tooltip({ children, content }: { children: React.ReactNode; content: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && content && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[var(--abv-dark)] text-white text-[10px] rounded whitespace-nowrap z-50 pointer-events-none shadow-lg">
          {content}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[var(--abv-dark)]" />
        </div>
      )}
    </div>
  );
}

function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days !== 1 ? "s" : ""} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months !== 1 ? "s" : ""} ago`;
}

function stepTooltip(step: ProgressStep): string {
  const parts: string[] = [];
  if (step.lastEditedAt) {
    try {
      parts.push(`Edited ${relativeTime(step.lastEditedAt)}`);
    } catch {}
  }
  if (step.score !== undefined) {
    parts.push(`Score: ${step.score}/100`);
  }
  return parts.join(" · ");
}

export default function ProgressTrack({ steps, compact = false }: Props) {
  if (compact) {
    return (
      <div className="flex items-center gap-0.5">
        {steps.map((step, i) => {
          const tooltip = stepTooltip(step);
          const dot = (
            <button
              key={step.key}
              type="button"
              onClick={(e) => { e.stopPropagation(); step.onClick(); }}
              className={`rounded-full transition-transform hover:scale-125 ${
                step.status === "done"
                  ? "bg-[#185FA5]"
                  : step.status === "current"
                  ? "bg-[#185FA5]"
                  : "bg-gray-200 dark:bg-[#2a2a2a]"
              }`}
              style={{ width: 7, height: 7, flexShrink: 0 }}
              aria-label={step.label}
            />
          );
          return tooltip ? (
            <Tooltip key={step.key} content={tooltip}>
              {dot}
            </Tooltip>
          ) : dot;
        })}
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-x-auto md:overflow-x-visible">
      <div
        className="flex items-start min-w-max md:min-w-0 md:w-full pb-1"
        style={{ paddingRight: "2rem" }}
      >
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;
          const tooltip = stepTooltip(step);

          const circle = (
            <button
              type="button"
              onClick={() => step.onClick()}
              className={`relative flex items-center justify-center rounded-full border-2 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#185FA5]/40 ${
                step.status === "done"
                  ? "bg-[#185FA5] border-[#185FA5] text-white"
                  : step.status === "current"
                  ? "bg-[#185FA5] border-[#185FA5] text-white"
                  : "bg-white dark:bg-[#1a1a1a] border-gray-300 dark:border-[#2a2a2a] text-gray-300 dark:text-[#94a3b8]"
              }`}
              style={{
                width: 28,
                height: 28,
                transform: step.status === "current" ? "scale(1.1)" : "scale(1)",
                flexShrink: 0,
              }}
              aria-label={step.label}
            >
              {step.status === "done" ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <span className="text-[9px] font-bold">{i + 1}</span>
              )}
              {step.status === "current" && (
                <span className="absolute inset-0 rounded-full animate-ping bg-[#185FA5]/40 pointer-events-none" />
              )}
            </button>
          );

          return (
            <div key={step.key} className={`flex flex-col items-center ${isLast ? "flex-none" : "flex-1"}`}>
              <div className="flex items-center w-full">
                {tooltip ? (
                  <Tooltip content={tooltip}>{circle}</Tooltip>
                ) : circle}

                {!isLast && (
                  <div
                    className={`flex-1 h-0.5 mx-0.5 transition-colors ${
                      step.status === "done" ? "bg-[#185FA5]" : "bg-gray-200 dark:bg-[#2a2a2a]"
                    }`}
                  />
                )}
              </div>

              <span
                className={`mt-1.5 text-[10px] leading-tight text-center whitespace-nowrap select-none ${
                  step.status === "done"
                    ? "text-[#185FA5]"
                    : step.status === "current"
                    ? "font-bold text-[#185FA5]"
                    : "text-[var(--abv-text)]/60 dark:text-[#94a3b8]"
                }`}
              >
                {step.label}
              </span>
              {/* Per-step "done" checkbox — small blue affordance under the
                  label so the user can manually flag a step complete. Hidden
                  when the step is auto-detected as done from real content
                  (the filled circle already says it). */}
              {step.onToggleManual && !step.autoDone && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); step.onToggleManual?.(); }}
                  className="mt-1 inline-flex items-center gap-1 group focus:outline-none"
                  aria-pressed={!!step.manualDone}
                  aria-label={`Mark ${step.label} ${step.manualDone ? "not done" : "done"}`}
                  title={step.manualDone ? "Marked done — click to undo" : "Mark done"}
                >
                  <span
                    className={`flex items-center justify-center rounded-[3px] border transition-colors ${
                      step.manualDone
                        ? "bg-[#185FA5] border-[#185FA5] text-white"
                        : "bg-white border-gray-300 group-hover:border-[#185FA5]"
                    }`}
                    style={{ width: 12, height: 12 }}
                  >
                    {step.manualDone && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={4} className="w-2.5 h-2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <span
                    className={`text-[9px] uppercase tracking-wider transition-colors ${
                      step.manualDone ? "text-[#185FA5] font-semibold" : "text-[var(--abv-text)]/45 group-hover:text-[#185FA5]"
                    }`}
                  >
                    Done
                  </span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="pointer-events-none absolute top-0 right-0 h-full w-8 bg-gradient-to-l from-white dark:from-[#1a1a1a] to-transparent md:hidden" />
    </div>
  );
}

"use client";

import type { PipelineStep } from "./AiThinking";

interface Props {
  /** Preferred prop name (matches spec). */
  stages?: PipelineStep[];
  /** Legacy alias for stages. */
  steps?: PipelineStep[];
  detailLine?: string;
  timeRemaining?: string;
  className?: string;
}

export function AiThinkingPipeline({ stages, steps, detailLine, timeRemaining, className }: Props) {
  const items = stages ?? steps ?? [];
  return (
    <div className={`ai-thinking-pipeline ${className ?? ""}`} role="status" aria-live="polite">
      {items.map((step, i) => {
        const isLast = i === items.length - 1;
        const nextStatus = items[i + 1]?.status;
        const connectorStatus =
          step.status === "complete"
            ? nextStatus === "pending"
              ? "active"
              : "complete"
            : "pending";
        return (
          <div key={step.key} className={`ai-thinking-step ai-thinking-step-${step.status}`}>
            {!isLast && (
              <span
                className={`ai-thinking-step-connector ai-thinking-step-connector-${connectorStatus}`}
                aria-hidden="true"
              />
            )}
            <span className="ai-thinking-step-dot" aria-hidden="true">
              {step.status === "complete" ? "✓" : ""}
            </span>
            <div className="ai-thinking-step-body">
              <span className="ai-thinking-step-label">{step.label}</span>
              {step.status === "active" && (
                <span className="ai-thinking-step-cascade" aria-hidden="true">
                  <span className="ai-thinking-step-cascade-dot" />
                  <span className="ai-thinking-step-cascade-dot" />
                  <span className="ai-thinking-step-cascade-dot" />
                </span>
              )}
            </div>
          </div>
        );
      })}
      {(detailLine || timeRemaining) && (
        <div className="ai-thinking-pipeline-footer">
          <span className="ai-thinking-pipeline-footer-detail">{detailLine ?? ""}</span>
          {timeRemaining && (
            <span className="ai-thinking-pipeline-footer-time">{timeRemaining}</span>
          )}
        </div>
      )}
      <span className="sr-only">
        AI pipeline progress: {items.map((s) => `${s.label} (${s.status})`).join(", ")}
      </span>
    </div>
  );
}

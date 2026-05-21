"use client";

import type { PipelineStep } from "./AiThinking";

interface Props {
  steps: PipelineStep[];
  className?: string;
}

export function AiThinkingPipeline({ steps, className }: Props) {
  return (
    <div className={`ai-thinking-pipeline ${className ?? ""}`} role="status" aria-live="polite">
      {steps.map((step, i) => (
        <div key={step.key} className={`ai-thinking-step ai-thinking-step-${step.status}`}>
          <span className="ai-thinking-step-dot" aria-hidden="true">
            {step.status === "complete" ? "✓" : ""}
          </span>
          <span className="ai-thinking-step-label">{step.label}</span>
          {i < steps.length - 1 && (
            <span
              className={`ai-thinking-step-connector ai-thinking-step-connector-${step.status}`}
              aria-hidden="true"
            />
          )}
        </div>
      ))}
      <span className="sr-only">
        AI pipeline progress: {steps.map((s) => `${s.label} (${s.status})`).join(", ")}
      </span>
    </div>
  );
}

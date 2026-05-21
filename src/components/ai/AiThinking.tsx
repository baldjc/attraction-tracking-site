"use client";

import { AiThinkingDots } from "./AiThinkingDots";
import { AiThinkingPhase } from "./AiThinkingPhase";
import { AiThinkingPipeline } from "./AiThinkingPipeline";

export type AiThinkingMode = "quick" | "phase" | "pipeline";

export interface PipelineStep {
  key: string;
  label: string;
  status: "pending" | "active" | "complete";
}

export interface AiThinkingProps {
  mode: AiThinkingMode;
  /** For mode='phase': current phase label. Updates as backend emits phase events. */
  phaseLabel?: string;
  /** For mode='pipeline': the steps with status. */
  steps?: PipelineStep[];
  /** Optional className for layout positioning. */
  className?: string;
}

export function AiThinking({ mode, phaseLabel, steps, className }: AiThinkingProps) {
  if (mode === "quick") return <AiThinkingDots className={className} />;
  if (mode === "phase") return <AiThinkingPhase label={phaseLabel} className={className} />;
  if (mode === "pipeline") return <AiThinkingPipeline steps={steps ?? []} className={className} />;
  return null;
}

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
  /** Quick mode: short label rendered next to the dots. */
  label?: string;
  /** Phase mode: mono-caps eyebrow (e.g. "Content Engine"). */
  toolName?: string;
  /** Phase mode: main current-phase label. Preferred over phaseLabel. */
  currentPhase?: string;
  /** Phase mode: optional secondary note line under the phase label. */
  noteText?: string;
  /** Legacy alias for currentPhase. */
  phaseLabel?: string;
  /** Pipeline mode: 5-stage ladder with statuses. Preferred over steps. */
  stages?: PipelineStep[];
  /** Legacy alias for stages. */
  steps?: PipelineStep[];
  /** Pipeline mode: optional mono detail line in the footer. */
  detailLine?: string;
  /** Pipeline mode: optional time-remaining string in the footer. */
  timeRemaining?: string;
  /** Optional className for layout positioning. */
  className?: string;
}

export function AiThinking(props: AiThinkingProps) {
  const {
    mode,
    label,
    toolName,
    currentPhase,
    phaseLabel,
    noteText,
    stages,
    steps,
    detailLine,
    timeRemaining,
    className,
  } = props;

  if (mode === "quick") return <AiThinkingDots label={label} className={className} />;
  if (mode === "phase")
    return (
      <AiThinkingPhase
        toolName={toolName}
        currentPhase={currentPhase ?? phaseLabel}
        noteText={noteText}
        className={className}
      />
    );
  if (mode === "pipeline")
    return (
      <AiThinkingPipeline
        stages={stages ?? steps ?? []}
        detailLine={detailLine}
        timeRemaining={timeRemaining}
        className={className}
      />
    );
  return null;
}

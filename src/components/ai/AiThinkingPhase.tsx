"use client";

interface Props {
  toolName?: string;
  currentPhase?: string;
  noteText?: string;
  /** Legacy alias for currentPhase. */
  label?: string;
  className?: string;
}

export function AiThinkingPhase({ toolName, currentPhase, noteText, label, className }: Props) {
  const phase = currentPhase ?? label ?? "Working...";
  return (
    <div className={`ai-thinking-phase ${className ?? ""}`} role="status" aria-live="polite">
      {toolName && <p className="ai-thinking-phase-eyebrow">{toolName}</p>}
      <div className="ai-thinking-phase-row">
        <span className="ai-thinking-sparkle ai-thinking-sparkle-pulse" aria-hidden="true">
          ✦
        </span>
        <span className="ai-thinking-phase-label">{phase}</span>
      </div>
      {noteText && <p className="ai-thinking-phase-note">{noteText}</p>}
      <div className="ai-thinking-bar" aria-hidden="true" />
      <span className="sr-only">
        {toolName ? `${toolName}: ` : ""}
        {phase}
      </span>
    </div>
  );
}

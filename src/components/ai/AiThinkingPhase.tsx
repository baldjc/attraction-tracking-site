"use client";

interface Props {
  label?: string;
  className?: string;
}

export function AiThinkingPhase({ label, className }: Props) {
  return (
    <div className={`ai-thinking-phase ${className ?? ""}`} role="status" aria-live="polite">
      <div className="ai-thinking-phase-row">
        <span className="ai-thinking-sparkle ai-thinking-sparkle-pulse" aria-hidden="true">
          ✦
        </span>
        <span className="ai-thinking-phase-label">{label ?? "Working..."}</span>
      </div>
      <div className="ai-thinking-bar" aria-hidden="true" />
      <span className="sr-only">{label ?? "AI is working"}</span>
    </div>
  );
}

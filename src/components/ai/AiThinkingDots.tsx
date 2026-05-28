"use client";

interface Props {
  label?: string;
  className?: string;
}

export function AiThinkingDots({ label, className }: Props) {
  return (
    <div className={`ai-thinking-dots ${className ?? ""}`} role="status" aria-live="polite">
      <span className="ai-thinking-sparkle ai-thinking-sparkle-pulse" aria-hidden="true">
        ✦
      </span>
      {label && <span className="ai-thinking-dots-label">{label}</span>}
      <span className="ai-thinking-dot" />
      <span className="ai-thinking-dot" />
      <span className="ai-thinking-dot" />
      <span className="sr-only">{label ?? "AI is thinking"}</span>
    </div>
  );
}

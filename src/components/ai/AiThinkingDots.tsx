"use client";

interface Props {
  className?: string;
}

export function AiThinkingDots({ className }: Props) {
  return (
    <div className={`ai-thinking-dots ${className ?? ""}`} role="status" aria-live="polite">
      <span className="ai-thinking-sparkle" aria-hidden="true">
        ✦
      </span>
      <span className="ai-thinking-dot" />
      <span className="ai-thinking-dot" />
      <span className="ai-thinking-dot" />
      <span className="sr-only">AI is thinking</span>
    </div>
  );
}

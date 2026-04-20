"use client";

import { useState } from "react";
import MarkdownMessage from "@/components/MarkdownMessage";

interface MarkdownTextareaProps {
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}

/**
 * Textarea that lets the user toggle between raw editing and a rendered
 * markdown preview. AI tools (script builder, description generator, etc.)
 * save content with markdown like `# Headings`, `**bold**`, and bullet
 * lists, so readers benefit from a formatted view while still being able
 * to edit the raw text.
 */
export default function MarkdownTextarea({
  value,
  onChange,
  rows = 5,
  placeholder,
  className = "",
  ariaLabel,
}: MarkdownTextareaProps) {
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const hasContent = value.trim().length > 0;

  return (
    <div className="w-full">
      <div className="flex items-center justify-end gap-1 mb-1">
        <button
          type="button"
          onClick={() => setMode("edit")}
          className={`text-[11px] px-2 py-0.5 rounded ${
            mode === "edit"
              ? "bg-[#6ba3c7]/15 text-[#2f3437] font-medium"
              : "text-[#2f3437]/40 hover:text-[#2f3437]/70"
          }`}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => setMode("preview")}
          disabled={!hasContent}
          className={`text-[11px] px-2 py-0.5 rounded ${
            mode === "preview"
              ? "bg-[#6ba3c7]/15 text-[#2f3437] font-medium"
              : "text-[#2f3437]/40 hover:text-[#2f3437]/70"
          } disabled:opacity-30 disabled:cursor-not-allowed`}
          title={hasContent ? "Render markdown" : "Add some content to preview"}
        >
          Preview
        </button>
      </div>
      {mode === "edit" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          aria-label={ariaLabel}
          className={`${className} resize-y`}
        />
      ) : (
        <div
          className={`${className} resize-y overflow-auto bg-white text-sm text-[#2f3437] cursor-text`}
          style={{ minHeight: `${Math.max(rows, 3) * 1.6}rem` }}
          onClick={() => setMode("edit")}
          title="Click to edit"
        >
          {hasContent ? (
            <MarkdownMessage>{value}</MarkdownMessage>
          ) : (
            <span className="text-[#2f3437]/30">{placeholder ?? "Nothing to preview"}</span>
          )}
        </div>
      )}
    </div>
  );
}

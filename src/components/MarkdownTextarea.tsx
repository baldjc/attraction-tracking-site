"use client";

import { useEffect, useState } from "react";
import { ArrowsPointingOutIcon, XMarkIcon } from "@heroicons/react/24/outline";
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
 *
 * Includes an Expand button that opens a large full-screen overlay so
 * long content (e.g. full video scripts) can be edited comfortably.
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
  const [expanded, setExpanded] = useState(false);
  const hasContent = value.trim().length > 0;

  // Lock body scroll while the expanded overlay is open
  useEffect(() => {
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [expanded]);

  const ModeToggle = (
    <div className="flex items-center gap-1">
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
  );

  return (
    <div className="w-full">
      <div className="flex items-center justify-end gap-2 mb-1">
        {ModeToggle}
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded text-[#2f3437]/50 hover:text-[#6ba3c7] hover:bg-[#6ba3c7]/10 transition-colors"
          title="Expand for easier editing"
          aria-label="Expand editor"
        >
          <ArrowsPointingOutIcon className="w-3.5 h-3.5" />
          Expand
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

      {expanded && (
        <div
          className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4 sm:p-6"
          onClick={() => setExpanded(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[92vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#eaeaea]">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold text-[#2f3437]">
                  {ariaLabel ?? "Editor"}
                </h3>
                {ModeToggle}
              </div>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="p-1.5 rounded hover:bg-[#eaeaea]/60 text-[#2f3437]/60"
                aria-label="Close expanded editor"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 p-5 overflow-hidden">
              {mode === "edit" ? (
                <textarea
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  placeholder={placeholder}
                  aria-label={ariaLabel}
                  autoFocus
                  className="w-full h-full resize-none rounded-lg border border-[#eaeaea] focus:border-[#6ba3c7] focus:ring-1 focus:ring-[#6ba3c7] outline-none p-4 text-sm text-[#2f3437] leading-relaxed font-mono"
                />
              ) : (
                <div
                  className="w-full h-full overflow-auto rounded-lg border border-[#eaeaea] bg-white p-4 text-sm text-[#2f3437] cursor-text"
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
            <div className="flex items-center justify-between px-5 py-3 border-t border-[#eaeaea] text-xs text-[#2f3437]/50">
              <span>Press Esc or click outside to close. Changes save automatically.</span>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="px-3 py-1.5 rounded-md bg-[#2f3437] text-white hover:bg-[#2f3437]/90"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

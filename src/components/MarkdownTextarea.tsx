"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowsPointingOutIcon, XMarkIcon } from "@heroicons/react/24/outline";
import MarkdownMessage from "@/components/MarkdownMessage";
import RichMarkdownEditor from "@/components/RichMarkdownEditor";

interface MarkdownTextareaProps {
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}

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
  const [mounted, setMounted] = useState(false);
  const hasContent = value.trim().length > 0;

  useEffect(() => {
    setMounted(true);
  }, []);

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

  return (
    <div className="w-full">
      <div className="flex items-center justify-end gap-2 mb-1">
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
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded text-[#2f3437]/50 hover:text-[#6ba3c7] hover:bg-[#6ba3c7]/10 transition-colors"
          title="Open large editor — edit the formatted preview directly"
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

      {expanded && mounted && createPortal(
        <div
          className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-3 sm:p-6"
          onClick={() => setExpanded(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[94vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[#eaeaea]">
              <h3 className="text-sm font-semibold text-[#2f3437] truncate">
                {ariaLabel ?? "Editor"}
              </h3>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="p-1.5 rounded hover:bg-[#eaeaea]/60 text-[#2f3437]/60"
                aria-label="Close expanded editor"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden p-5">
              <RichMarkdownEditor
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                ariaLabel={ariaLabel}
              />
            </div>

            <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-[#eaeaea] text-xs text-[#2f3437]/50">
              <span>Esc or click outside to close. Changes save automatically.</span>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="px-3 py-1.5 rounded-md bg-[#2f3437] text-white hover:bg-[#2f3437]/90"
              >
                Done
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

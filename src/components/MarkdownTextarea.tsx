"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowsPointingOutIcon,
  XMarkIcon,
  BoldIcon,
  ItalicIcon,
  ListBulletIcon,
  NumberedListIcon,
} from "@heroicons/react/24/outline";
import MarkdownMessage from "@/components/MarkdownMessage";

interface MarkdownTextareaProps {
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}

type ViewMode = "edit" | "preview" | "split";

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
  const [expandedMode, setExpandedMode] = useState<ViewMode>("split");
  const expandedTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const inlineTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const hasContent = value.trim().length > 0;

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

  // ── Formatting helpers ─────────────────────────────────────────────────────
  function applyFormat(
    kind: "bold" | "italic" | "h1" | "h2" | "h3" | "ul" | "ol" | "quote",
    target?: HTMLTextAreaElement | null,
  ) {
    const ta = target ?? expandedTextareaRef.current ?? inlineTextareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const before = value.slice(0, start);
    const selected = value.slice(start, end);
    const after = value.slice(end);

    const wrapInline = (marker: string, placeholderText: string) => {
      const text = selected || placeholderText;
      const next = `${before}${marker}${text}${marker}${after}`;
      onChange(next);
      requestAnimationFrame(() => {
        ta.focus();
        const cursorStart = before.length + marker.length;
        const cursorEnd = cursorStart + text.length;
        ta.setSelectionRange(cursorStart, cursorEnd);
      });
    };

    const prefixLines = (prefixFn: (line: string, i: number) => string, placeholderText: string) => {
      const text = selected || placeholderText;
      const lines = text.split("\n");
      const transformed = lines.map((l, i) => prefixFn(l, i)).join("\n");

      const needsLeadingNewline = before.length > 0 && !before.endsWith("\n");
      const needsTrailingNewline = after.length > 0 && !after.startsWith("\n");
      const lead = needsLeadingNewline ? "\n" : "";
      const trail = needsTrailingNewline ? "\n" : "";

      const next = `${before}${lead}${transformed}${trail}${after}`;
      onChange(next);
      requestAnimationFrame(() => {
        ta.focus();
        const cursorStart = before.length + lead.length;
        const cursorEnd = cursorStart + transformed.length;
        ta.setSelectionRange(cursorStart, cursorEnd);
      });
    };

    switch (kind) {
      case "bold":
        wrapInline("**", "bold text");
        break;
      case "italic":
        wrapInline("*", "italic text");
        break;
      case "h1":
        prefixLines((l) => `# ${l.replace(/^#+\s*/, "")}`, "Heading 1");
        break;
      case "h2":
        prefixLines((l) => `## ${l.replace(/^#+\s*/, "")}`, "Heading 2");
        break;
      case "h3":
        prefixLines((l) => `### ${l.replace(/^#+\s*/, "")}`, "Heading 3");
        break;
      case "ul":
        prefixLines((l) => `- ${l.replace(/^[-*]\s*/, "")}`, "List item");
        break;
      case "ol":
        prefixLines((l, i) => `${i + 1}. ${l.replace(/^\d+\.\s*/, "")}`, "List item");
        break;
      case "quote":
        prefixLines((l) => `> ${l.replace(/^>\s*/, "")}`, "Quote");
        break;
    }
  }

  function Toolbar({ target }: { target: HTMLTextAreaElement | null }) {
    const btn =
      "px-2 py-1 rounded text-[12px] text-[#2f3437]/70 hover:text-[#2f3437] hover:bg-[#eaeaea]/60 transition-colors flex items-center gap-1";
    return (
      <div className="flex items-center flex-wrap gap-0.5 border border-[#eaeaea] rounded-lg bg-[#fafafa] px-1 py-1">
        <button type="button" className={btn} title="Heading 1" onClick={() => applyFormat("h1", target)}>
          H1
        </button>
        <button type="button" className={btn} title="Heading 2" onClick={() => applyFormat("h2", target)}>
          H2
        </button>
        <button type="button" className={btn} title="Heading 3" onClick={() => applyFormat("h3", target)}>
          H3
        </button>
        <span className="w-px h-5 bg-[#eaeaea] mx-1" />
        <button type="button" className={btn} title="Bold (wrap with **)" onClick={() => applyFormat("bold", target)}>
          <BoldIcon className="w-3.5 h-3.5" />
        </button>
        <button type="button" className={btn} title="Italic (wrap with *)" onClick={() => applyFormat("italic", target)}>
          <ItalicIcon className="w-3.5 h-3.5" />
        </button>
        <span className="w-px h-5 bg-[#eaeaea] mx-1" />
        <button type="button" className={btn} title="Bulleted list" onClick={() => applyFormat("ul", target)}>
          <ListBulletIcon className="w-3.5 h-3.5" />
        </button>
        <button type="button" className={btn} title="Numbered list" onClick={() => applyFormat("ol", target)}>
          <NumberedListIcon className="w-3.5 h-3.5" />
        </button>
        <button type="button" className={btn} title="Quote" onClick={() => applyFormat("quote", target)}>
          ❝
        </button>
      </div>
    );
  }

  // ── Inline (compact) view ──────────────────────────────────────────────────
  const InlineModeToggle = (
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
        {InlineModeToggle}
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded text-[#2f3437]/50 hover:text-[#6ba3c7] hover:bg-[#6ba3c7]/10 transition-colors"
          title="Open large editor"
          aria-label="Expand editor"
        >
          <ArrowsPointingOutIcon className="w-3.5 h-3.5" />
          Expand
        </button>
      </div>
      {mode === "edit" ? (
        <textarea
          ref={inlineTextareaRef}
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
          className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-3 sm:p-6"
          onClick={() => setExpanded(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[94vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[#eaeaea]">
              <h3 className="text-sm font-semibold text-[#2f3437] truncate">
                {ariaLabel ?? "Editor"}
              </h3>
              <div className="flex items-center gap-1 bg-[#fafafa] border border-[#eaeaea] rounded-lg p-0.5">
                {(["edit", "split", "preview"] as ViewMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setExpandedMode(m)}
                    disabled={m === "preview" && !hasContent}
                    className={`text-[11px] px-2.5 py-1 rounded capitalize ${
                      expandedMode === m
                        ? "bg-white shadow-sm text-[#2f3437] font-medium"
                        : "text-[#2f3437]/50 hover:text-[#2f3437]/80"
                    } disabled:opacity-30 disabled:cursor-not-allowed`}
                  >
                    {m}
                  </button>
                ))}
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

            {/* Toolbar (only for edit / split) */}
            {expandedMode !== "preview" && (
              <div className="px-5 py-2 border-b border-[#eaeaea]">
                <Toolbar target={expandedTextareaRef.current} />
              </div>
            )}

            {/* Body */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {expandedMode === "edit" && (
                <div className="h-full p-5">
                  <textarea
                    ref={expandedTextareaRef}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    aria-label={ariaLabel}
                    autoFocus
                    className="w-full h-full resize-none rounded-lg border border-[#eaeaea] focus:border-[#6ba3c7] focus:ring-1 focus:ring-[#6ba3c7] outline-none p-4 text-sm text-[#2f3437] leading-relaxed font-mono whitespace-pre-wrap break-words"
                  />
                </div>
              )}

              {expandedMode === "preview" && (
                <div className="h-full p-5">
                  <div className="w-full h-full overflow-auto rounded-lg border border-[#eaeaea] bg-white p-6 text-[15px] text-[#2f3437] leading-relaxed">
                    {hasContent ? (
                      <MarkdownMessage>{value}</MarkdownMessage>
                    ) : (
                      <span className="text-[#2f3437]/30">{placeholder ?? "Nothing to preview"}</span>
                    )}
                  </div>
                </div>
              )}

              {expandedMode === "split" && (
                <div className="h-full grid grid-cols-1 md:grid-cols-2 gap-3 p-5 min-h-0">
                  <div className="min-h-0 flex flex-col">
                    <p className="text-[10px] font-semibold tracking-wider text-[#2f3437]/40 uppercase mb-1.5">
                      Markdown
                    </p>
                    <textarea
                      ref={expandedTextareaRef}
                      value={value}
                      onChange={(e) => onChange(e.target.value)}
                      placeholder={placeholder}
                      aria-label={ariaLabel}
                      autoFocus
                      className="flex-1 min-h-0 w-full resize-none rounded-lg border border-[#eaeaea] focus:border-[#6ba3c7] focus:ring-1 focus:ring-[#6ba3c7] outline-none p-4 text-sm text-[#2f3437] leading-relaxed font-mono whitespace-pre-wrap break-words"
                    />
                  </div>
                  <div className="min-h-0 flex flex-col">
                    <p className="text-[10px] font-semibold tracking-wider text-[#2f3437]/40 uppercase mb-1.5">
                      Preview
                    </p>
                    <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-[#eaeaea] bg-white p-5 text-[15px] text-[#2f3437] leading-relaxed">
                      {hasContent ? (
                        <MarkdownMessage>{value}</MarkdownMessage>
                      ) : (
                        <span className="text-[#2f3437]/30">{placeholder ?? "Nothing to preview"}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
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
        </div>
      )}
    </div>
  );
}

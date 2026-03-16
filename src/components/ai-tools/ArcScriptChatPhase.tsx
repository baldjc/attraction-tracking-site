"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  PaperAirplaneIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@heroicons/react/24/outline";
import ArcProgressBar, { SECTIONS } from "@/components/ai-tools/ArcProgressBar";

interface Message {
  role: "user" | "assistant";
  content: string;
  researchSummary?: string;
}

interface SectionApproval {
  key: string;
  snippet: string;
}

interface Props {
  initialData: {
    title: string;
    talkingPoints: string;
    researchSummary: string;
  };
  onReset: () => void;
}

const MAX_TURNS = 20;

// Strip <SECTION_DATA>…</SECTION_DATA> from display text
function cleanContent(text: string): string {
  return text.replace(/<SECTION_DATA>[\s\S]*?<\/SECTION_DATA>/g, "").trim();
}

// Simple inline markdown (bold, headers, bullets)
function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : p
  );
}

function MarkdownBlock({ content }: { content: string }) {
  const lines = content.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (!t) { i++; continue; }
    if (/^---+$/.test(t)) { nodes.push(<hr key={i} className="my-3 border-[#1e2a38]/10" />); i++; continue; }
    if (t.startsWith("### ")) {
      nodes.push(<h3 key={i} className="text-xs font-bold text-[#1e2a38]/50 uppercase tracking-wider mt-4 mb-1">{renderInline(t.slice(4))}</h3>);
      i++; continue;
    }
    if (t.startsWith("## ")) {
      nodes.push(<h2 key={i} className="text-sm font-bold text-[#1e2a38] mt-5 mb-1.5">{renderInline(t.slice(3))}</h2>);
      i++; continue;
    }
    if (t.startsWith("# ")) {
      nodes.push(<h1 key={i} className="text-base font-bold text-[#1e2a38] mt-2 mb-2">{renderInline(t.slice(2))}</h1>);
      i++; continue;
    }
    if (t.startsWith("- ") || t.startsWith("* ")) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && (lines[i].trim().startsWith("- ") || lines[i].trim().startsWith("* "))) {
        items.push(<li key={i} className="text-sm text-[#1e2a38]/80 leading-relaxed">{renderInline(lines[i].trim().slice(2))}</li>);
        i++;
      }
      nodes.push(<ul key={`ul-${i}`} className="list-disc list-inside space-y-0.5 my-1.5 ml-1">{items}</ul>);
      continue;
    }
    nodes.push(<p key={i} className="text-sm text-[#1e2a38]/80 leading-relaxed my-1.5">{renderInline(t)}</p>);
    i++;
  }
  return <div>{nodes}</div>;
}

function CostCapBanner({ level }: { level: "warning" | "critical" }) {
  if (level === "critical") {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-4">
        ⚠️ You&apos;ve used 90%+ of your monthly AI allowance. Save your work soon.
      </div>
    );
  }
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 mb-4">
      You&apos;ve used 75%+ of your monthly AI allowance.
    </div>
  );
}

export default function ArcScriptChatPhase({ initialData, onReset }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentSection, setCurrentSection] = useState("research_summary");
  const [completedSections, setCompletedSections] = useState<string[]>([]);
  const [sectionApprovals, setSectionApprovals] = useState<SectionApproval[]>([]);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [costCapWarning, setCostCapWarning] = useState<"warning" | "critical" | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initialized = useRef(false);

  const turnCount = messages.length;
  const atTurnLimit = turnCount >= MAX_TURNS;
  const isFinalScript = currentSection === "final_script";

  const finalScriptText = isFinalScript
    ? cleanContent(messages.findLast((m) => m.role === "assistant")?.content ?? "")
    : "";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = useCallback(
    async (userContent: string, researchSummary?: string) => {
      if (loading) return;
      setLoading(true);

      const newUserMsg: Message = {
        role: "user",
        content: userContent,
        ...(researchSummary ? { researchSummary } : {}),
      };

      setMessages((prev) => [...prev, newUserMsg]);
      setInput("");

      const historyWithNew = [...messages, newUserMsg];

      // Placeholder for streaming assistant message
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      try {
        const res = await fetch("/api/ai-tools/arc-script-builder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step: "chat", messages: historyWithNew }),
        });

        if (res.status === 429) {
          const data = await res.json();
          setMessages((prev) => [
            ...prev.slice(0, -1),
            {
              role: "assistant",
              content:
                data.error === "monthly_cap_reached"
                  ? `You've reached your monthly AI usage limit. It resets on ${data.resetsAt}. Please come back then to continue.`
                  : "Monthly limit reached.",
            },
          ]);
          setLoading(false);
          return;
        }

        if (!res.ok || !res.body) {
          setMessages((prev) => [
            ...prev.slice(0, -1),
            { role: "assistant", content: "Something went wrong. Please try again." },
          ]);
          setLoading(false);
          return;
        }

        // Stream the response
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            if (!part.startsWith("data: ")) continue;
            try {
              const payload = JSON.parse(part.slice(6));

              if (payload.type === "text") {
                fullText += payload.text;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "assistant", content: fullText };
                  return updated;
                });
              } else if (payload.type === "done") {
                // Clean SECTION_DATA from display
                const displayText = cleanContent(fullText);
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "assistant", content: displayText };
                  return updated;
                });

                if (payload.sectionData) {
                  const { currentSection: nextSection, sectionApproved } = payload.sectionData;
                  if (sectionApproved) {
                    // Mark the PREVIOUS section as complete
                    const prevIdx = SECTIONS.findIndex((s) => s.key === nextSection) - 1;
                    if (prevIdx >= 0) {
                      const prevKey = SECTIONS[prevIdx].key;
                      setCompletedSections((prev) =>
                        prev.includes(prevKey) ? prev : [...prev, prevKey]
                      );
                      // Store snippet from the last assistant message
                      setSectionApprovals((prev) => {
                        const exists = prev.find((a) => a.key === prevKey);
                        if (exists) return prev;
                        return [
                          ...prev,
                          { key: prevKey, snippet: displayText.slice(0, 300) },
                        ];
                      });
                    }
                  }
                  setCurrentSection(nextSection);
                }

                if (payload.costCapWarning) {
                  setCostCapWarning(payload.costCapWarning);
                }
              } else if (payload.type === "error") {
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "assistant",
                    content: `Error: ${payload.message}`,
                  };
                  return updated;
                });
              }
            } catch {}
          }
        }
      } catch {
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: "assistant", content: "Connection error. Please try again." },
        ]);
      }

      setLoading(false);
    },
    [loading, messages]
  );

  // Auto-send first message on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const firstMessage = `Let's build the ARC script for: "${initialData.title}"${
      initialData.talkingPoints ? `\n\nKey talking points I want to cover:\n${initialData.talkingPoints}` : ""
    }\n\nPlease start with Section 1 — the Research Summary.`;
    sendMessage(firstMessage, initialData.researchSummary);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !loading && !atTurnLimit) sendMessage(input.trim());
    }
  }

  function handleSectionClick(sectionKey: string) {
    setExpandedSection((prev) => (prev === sectionKey ? null : sectionKey));
  }

  async function handleCopy() {
    if (!finalScriptText) return;
    await navigator.clipboard.writeText(finalScriptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSave() {
    if (!finalScriptText) return;
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/ai-tools/save-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoTitle: initialData.title,
          scriptOutline: {
            fullScript: finalScriptText,
            researchSummary: initialData.researchSummary,
            talkingPoints: initialData.talkingPoints,
            approvedSections: sectionApprovals,
          },
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setSaveError("Failed to save. Please try again.");
    }
    setSaving(false);
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Progress Bar */}
      <ArcProgressBar
        currentSection={currentSection}
        completedSections={completedSections}
        onSectionClick={handleSectionClick}
      />

      {/* Section approval inline cards */}
      {expandedSection && (
        <div className="mb-4">
          {sectionApprovals.filter((a) => a.key === expandedSection).map((approval) => {
            const label = SECTIONS.find((s) => s.key === approval.key)?.label ?? approval.key;
            return (
              <div key={approval.key} className="bg-[#3dc3ff]/8 border border-[#3dc3ff]/20 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-[#3dc3ff] uppercase tracking-wide">
                    ✓ Approved: {label}
                  </span>
                  <button onClick={() => setExpandedSection(null)} className="text-[#1e2a38]/40 hover:text-[#1e2a38]">
                    <ChevronUpIcon className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-sm text-[#1e2a38]/70 line-clamp-4">{approval.snippet}…</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Cost cap warning */}
      {costCapWarning && <CostCapBanner level={costCapWarning} />}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4 min-h-0">
        {messages.map((msg, idx) => {
          const displayContent = cleanContent(msg.content);
          return (
            <div
              key={idx}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-[#1e2a38] text-white rounded-tr-sm text-sm leading-relaxed"
                    : "bg-white border border-[#1e2a38]/10 text-[#1e2a38] rounded-tl-sm shadow-sm"
                }`}
              >
                {msg.role === "user" ? (
                  displayContent
                ) : displayContent ? (
                  <MarkdownBlock content={displayContent} />
                ) : (
                  <div className="flex gap-1.5 items-center h-4">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="w-2 h-2 rounded-full bg-[#3dc3ff]/60 animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {loading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex justify-start">
            <div className="bg-white border border-[#1e2a38]/10 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1.5 items-center h-4">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="w-2 h-2 rounded-full bg-[#3dc3ff]/60 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Turn limit message */}
      {atTurnLimit && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 mb-3">
          You&apos;ve reached the 20-turn limit for this session. Save your script or start a new one.
        </div>
      )}

      {/* Final script actions */}
      {isFinalScript && (
        <div className="flex gap-2 mb-3 flex-wrap">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-[#1e2a38]/15 rounded-xl hover:bg-[#1e2a38]/5 transition-colors text-[#1e2a38]"
          >
            {copied ? <CheckIcon className="w-4 h-4 text-green-500" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
            {copied ? "Copied!" : "Copy Script"}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-[#3dc3ff] text-white rounded-xl hover:bg-[#3dc3ff]/90 disabled:opacity-50 transition-colors"
          >
            {saved ? <CheckIcon className="w-4 h-4" /> : null}
            {saving ? "Saving…" : saved ? "Saved!" : "Save Script"}
          </button>
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-[#1e2a38]/15 rounded-xl hover:bg-[#1e2a38]/5 transition-colors text-[#1e2a38]"
          >
            <ArrowPathIcon className="w-4 h-4" />
            Build Another Script
          </button>
          {saveError && <p className="text-xs text-red-500 self-center">{saveError}</p>}
        </div>
      )}

      {/* Input area */}
      {!atTurnLimit && (
        <div className="flex-shrink-0 border-t border-[#1e2a38]/10 pt-4">
          <div className="flex gap-3 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={
                isFinalScript
                  ? "Ask for revisions or type 'looks good' to finish…"
                  : "Type your reply… (Enter to send, Shift+Enter for new line)"
              }
              rows={2}
              className="flex-1 border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 resize-none focus:outline-none focus:border-[#3dc3ff] transition-colors"
            />
            <button
              onClick={() => { if (input.trim() && !loading) sendMessage(input.trim()); }}
              disabled={loading || !input.trim()}
              className="flex-shrink-0 w-11 h-11 flex items-center justify-center bg-[#3dc3ff] text-white rounded-xl hover:bg-[#3dc3ff]/90 disabled:opacity-40 transition-colors"
            >
              <PaperAirplaneIcon className="w-5 h-5" />
            </button>
          </div>
          <div className="flex justify-between mt-1.5">
            <button onClick={onReset} className="text-xs text-[#1e2a38]/30 hover:text-[#1e2a38]/60 flex items-center gap-1">
              <ArrowPathIcon className="w-3 h-3" /> Start over
            </button>
            <span className="text-xs text-[#1e2a38]/25">{turnCount}/{MAX_TURNS} turns</span>
          </div>
        </div>
      )}
    </div>
  );
}

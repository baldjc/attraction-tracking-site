"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  PaperAirplaneIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  ArrowPathIcon,
  ChevronUpIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
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
    clientStory: string;
    leadMagnet: string;
    nextVideoPush: string;
    themeName?: string;
    themeContext?: string;
  };
  onReset: () => void;
}

const MAX_TURNS = 40;

function cleanContent(text: string): string {
  return text.replace(/<SECTION_DATA>[\s\S]*?<\/SECTION_DATA>/g, "").trim();
}

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
    if (/^---+$/.test(t)) { nodes.push(<hr key={i} className="my-3 border-[#2f3437]/10 dark:border-white/10" />); i++; continue; }
    if (t.startsWith("### ")) {
      nodes.push(<h3 key={i} className="text-xs font-bold text-[#2f3437]/50 dark:text-white/50 uppercase tracking-wider mt-4 mb-1">{renderInline(t.slice(4))}</h3>);
      i++; continue;
    }
    if (t.startsWith("## ")) {
      nodes.push(<h2 key={i} className="text-sm font-bold text-[#2f3437] dark:text-white mt-5 mb-1.5">{renderInline(t.slice(3))}</h2>);
      i++; continue;
    }
    if (t.startsWith("# ")) {
      nodes.push(<h1 key={i} className="text-base font-bold text-[#2f3437] dark:text-white mt-2 mb-2">{renderInline(t.slice(2))}</h1>);
      i++; continue;
    }
    if (t.startsWith("- ") || t.startsWith("* ")) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && (lines[i].trim().startsWith("- ") || lines[i].trim().startsWith("* "))) {
        items.push(<li key={i} className="text-sm text-[#2f3437]/80 dark:text-white/80 leading-relaxed">{renderInline(lines[i].trim().slice(2))}</li>);
        i++;
      }
      nodes.push(<ul key={`ul-${i}`} className="list-disc list-inside space-y-0.5 my-1.5 ml-1">{items}</ul>);
      continue;
    }
    nodes.push(<p key={i} className="text-sm text-[#2f3437]/80 dark:text-white/80 leading-relaxed my-1.5">{renderInline(t)}</p>);
    i++;
  }
  return <div>{nodes}</div>;
}

function CostCapBanner({ level }: { level: "warning" | "critical" }) {
  if (level === "critical") {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-400 mb-4">
        You&apos;ve used 90%+ of your monthly AI allowance. Save your work soon.
      </div>
    );
  }
  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500/30 rounded-lg px-4 py-3 text-sm text-amber-700 dark:text-amber-300 mb-4">
      You&apos;ve used 75%+ of your monthly AI allowance.
    </div>
  );
}

export default function ArcScriptChatPhase({ initialData, onReset }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentSection, setCurrentSection] = useState("research_strategy");
  const [completedSections, setCompletedSections] = useState<string[]>([]);
  const [sectionApprovals, setSectionApprovals] = useState<SectionApproval[]>([]);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [costCapWarning, setCostCapWarning] = useState<"warning" | "critical" | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [finalScriptDone, setFinalScriptDone] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const currentSectionRef = useRef("research_strategy");
  const autoSavedRef = useRef(false);

  const turnCount = messages.length;
  const atTurnLimit = turnCount >= MAX_TURNS;
  const isFinalScript = currentSection === "final_script" || currentSection === "assembly_pass";

  const finalScriptText = finalScriptDone
    ? cleanContent(messages.findLast((m) => m.role === "assistant")?.content ?? "")
    : "";

  useEffect(() => {
    if (!finalScriptDone || !finalScriptText || autoSavedRef.current) return;
    autoSavedRef.current = true;
    setSaving(true);
    setSaveError("");
    fetch("/api/ai-tools/save-script", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoTitle: initialData.title,
        scriptOutline: {
          fullScript: finalScriptText,
          researchSummary: initialData.researchSummary,
          talkingPoints: initialData.talkingPoints,
          clientStory: initialData.clientStory,
          approvedSections: sectionApprovals,
        },
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Save failed");
        setSaved(true);
      })
      .catch(() => setSaveError("Auto-save failed. Use the save button below to retry."))
      .finally(() => setSaving(false));
  }, [finalScriptDone, finalScriptText]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom <= 100) {
      container.scrollTop = container.scrollHeight;
    }
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

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      try {
        const res = await fetch("/api/ai-tools/arc-script-builder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            step: "chat",
            messages: historyWithNew,
            leadMagnet: initialData.leadMagnet,
            nextVideoPush: initialData.nextVideoPush,
          }),
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
                const displayText = cleanContent(fullText);
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "assistant", content: displayText };
                  return updated;
                });

                if (payload.sectionData) {
                  const { currentSection: nextSection, sectionApproved } = payload.sectionData;
                  if (sectionApproved) {
                    // Detect script completion:
                    // - Legacy flow: sectionApproved: true on final_script (old conversations)
                    // - New flow: sectionApproved: true on assembly_pass (after all 4 assembly steps done)
                    if (nextSection === "final_script" || nextSection === "assembly_pass") {
                      setFinalScriptDone(true);
                    }
                    const prevIdx = SECTIONS.findIndex((s) => s.key === nextSection) - 1;
                    if (prevIdx >= 0) {
                      const prevKey = SECTIONS[prevIdx].key;
                      setCompletedSections((prev) =>
                        prev.includes(prevKey) ? prev : [...prev, prevKey]
                      );
                      setSectionApprovals((prev) => {
                        if (prev.find((a) => a.key === prevKey)) return prev;
                        return [...prev, { key: prevKey, snippet: displayText.slice(0, 300) }];
                      });
                    }
                  }
                  currentSectionRef.current = nextSection;
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

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const firstMessage = [
      `Let's build the ARC script for: "${initialData.title}"`,
      initialData.themeName
        ? `\n\nCONTENT THEME: ${initialData.themeName}`
        : "",
      initialData.themeContext
        ? `\nTHEME CONTEXT (apply this framing throughout the script):\n${initialData.themeContext}`
        : "",
      initialData.talkingPoints
        ? `\nKey talking points I want to cover:\n${initialData.talkingPoints}`
        : "",
      initialData.researchSummary
        ? `\n\n=== RESEARCH I UPLOADED (use this data in the script) ===\n${initialData.researchSummary}`
        : "",
      initialData.clientStory
        ? `\nClient story / personal experience:\n${initialData.clientStory}`
        : "",
      initialData.leadMagnet
        ? `\nLead magnet for this video: ${initialData.leadMagnet}`
        : "",
      initialData.nextVideoPush
        ? `\nNext video I'm pushing viewers to: ${initialData.nextVideoPush}`
        : "",
      "\nPlease start with Section 1 — Research & Strategy.",
    ].join("");
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
            clientStory: initialData.clientStory,
            approvedSections: sectionApprovals,
          },
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaved(true);
    } catch {
      setSaveError("Save failed. Please try again.");
    }
    setSaving(false);
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <ArcProgressBar
        currentSection={currentSection}
        completedSections={completedSections}
        onSectionClick={handleSectionClick}
      />

      {expandedSection && (
        <div className="mb-4">
          {sectionApprovals.filter((a) => a.key === expandedSection).map((approval) => {
            const label = SECTIONS.find((s) => s.key === approval.key)?.label ?? approval.key;
            return (
              <div key={approval.key} className="bg-[#6ba3c7]/8 border border-[#6ba3c7]/20 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-[#6ba3c7] uppercase tracking-wide">
                    Approved: {label}
                  </span>
                  <button onClick={() => setExpandedSection(null)} className="text-[#2f3437]/40 dark:text-white/40 hover:text-[#2f3437] dark:hover:text-white">
                    <ChevronUpIcon className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-sm text-[#2f3437]/70 dark:text-white/70 line-clamp-4">{approval.snippet}…</p>
              </div>
            );
          })}
        </div>
      )}

      {costCapWarning && <CostCapBanner level={costCapWarning} />}

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pb-4 min-h-0">
        {messages.map((msg, idx) => {
          const displayContent = cleanContent(msg.content);
          return (
            <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-lg px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-[#111] text-white rounded-tr-sm text-sm leading-relaxed"
                    : "bg-white dark:bg-[#1a1a1a] border border-[#2f3437]/10 dark:border-white/10 text-[#2f3437] dark:text-white rounded-tl-sm"
                }`}
              >
                {msg.role === "user" ? (
                  displayContent
                ) : displayContent ? (
                  <MarkdownBlock content={displayContent} />
                ) : (
                  <div className="flex gap-1.5 items-center h-4">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="w-2 h-2 rounded-full bg-[#6ba3c7]/60 animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {loading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-[#1a1a1a] border border-[#2f3437]/10 dark:border-white/10 rounded-lg rounded-tl-sm px-4 py-3">
              <div className="flex gap-1.5 items-center h-4">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="w-2 h-2 rounded-full bg-[#6ba3c7]/60 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {atTurnLimit && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500/30 rounded-lg px-4 py-3 text-sm text-amber-700 dark:text-amber-300 mb-3">
          You&apos;ve reached the 20-turn limit for this session. Save your script or start a new one.
        </div>
      )}

      {finalScriptDone && (
        <div className="flex flex-col gap-2 mb-3">
          {saving && (
            <p className="text-xs text-[#2f3437]/45 dark:text-white/35 px-1">Saving your script…</p>
          )}
          {saved && (
            <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-500/30 rounded-lg px-4 py-3">
              <CheckIcon className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
              <p className="text-sm text-green-700 dark:text-green-300 font-medium">
                Script saved! You can find it in My Scripts above.
              </p>
            </div>
          )}
          {saveError && (
            <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/30 rounded-lg px-4 py-3">
              <p className="text-sm text-red-600 dark:text-red-400 flex-1">{saveError}</p>
              <button
                onClick={handleSave}
                disabled={saving}
                className="shrink-0 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
              >
                Retry save
              </button>
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-[#6ba3c7] text-white rounded-lg hover:bg-[#5490b5] transition-colors"
            >
              {copied ? <CheckIcon className="w-4 h-4" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
              {copied ? "Copied!" : "Copy to Clipboard"}
            </button>
            <button
              onClick={onReset}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-[#2f3437]/15 dark:border-white/15 rounded-lg hover:bg-[#111]/5 dark:hover:bg-white/5 transition-colors text-[#2f3437] dark:text-white"
            >
              <ArrowPathIcon className="w-4 h-4" />
              Build Another Script
            </button>
          </div>
        </div>
      )}

      {!atTurnLimit && (
        <div className="flex-shrink-0 border-t border-[#2f3437]/10 dark:border-white/10 pt-4">
          <div className="flex gap-3 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={
                isFinalScript
                  ? "Ask for revisions or type 'looks good' to finish…"
                  : "Type your reply… (Enter to send, Shift+Enter for new line)"
              }
              rows={2}
              className="flex-1 bg-white dark:bg-[#0f1419] border border-[#2f3437]/20 dark:border-white/20 rounded-lg px-4 py-3 text-sm text-[#2f3437] dark:text-white placeholder-[#2f3437]/30 dark:placeholder-white/30 resize-none focus:outline-none focus:border-[#6ba3c7] transition-colors"
            />
            <button
              onClick={() => { if (input.trim() && !loading) sendMessage(input.trim()); }}
              disabled={loading || !input.trim()}
              className="flex-shrink-0 w-11 h-11 flex items-center justify-center bg-[#6ba3c7] text-white rounded-lg hover:bg-[#6ba3c7]/90 disabled:opacity-40 transition-colors"
            >
              <PaperAirplaneIcon className="w-5 h-5" />
            </button>
          </div>
          <div className="flex justify-between mt-1.5">
            <button onClick={onReset} className="text-xs text-[#2f3437]/30 dark:text-white/30 hover:text-[#2f3437]/60 dark:hover:text-white/60 flex items-center gap-1">
              <ArrowPathIcon className="w-3 h-3" /> Start over
            </button>
            <span className="text-xs text-[#2f3437]/25 dark:text-white/25">{turnCount}/{MAX_TURNS} turns</span>
          </div>
        </div>
      )}
    </div>
  );
}

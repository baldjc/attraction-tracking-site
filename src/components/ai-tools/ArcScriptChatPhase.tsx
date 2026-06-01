"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  PaperAirplaneIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  ArrowPathIcon,
  ChevronUpIcon,
  BookmarkIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import ArcProgressBar, { SECTIONS } from "@/components/ai-tools/ArcProgressBar";
import { AiThinking } from "@/components/ai/AiThinking";
import MarkdownMessage from "@/components/MarkdownMessage";
import NextStepCard from "@/components/ai-tools/NextStepCard";
import { useAiThinking } from "@/lib/use-ai-thinking";
import { parseSseEvent } from "@/lib/ai-thinking-sse";

interface Message {
  role: "user" | "assistant";
  content: string;
  researchSummary?: string;
}

interface SectionApproval {
  key: string;
  snippet: string;
}

interface ContentPlanOption {
  id: string;
  title: string;
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
  onScriptComplete?: (script: string) => void;
  linkedPlanId?: string | null;
  plannerSaving?: boolean;
  plannerSaved?: boolean;
  plannerSaveError?: boolean;
  contentPlans?: ContentPlanOption[];
  onSaveToPlanner?: (planId?: string) => void;
  resumeMessages?: Message[];
  resumeCurrentSection?: string;
  resumeCompletedSections?: string[];
  resumeSectionApprovals?: SectionApproval[];
  draftId?: string;
}

const MAX_TURNS = 40;

function cleanContent(text: string): string {
  return text.replace(/<SECTION_DATA>[\s\S]*?<\/SECTION_DATA>/g, "").trim();
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

export default function ArcScriptChatPhase({
  initialData,
  onReset,
  onScriptComplete,
  linkedPlanId,
  plannerSaving,
  plannerSaved,
  plannerSaveError,
  contentPlans = [],
  onSaveToPlanner,
  resumeMessages,
  resumeCurrentSection,
  resumeCompletedSections,
  resumeSectionApprovals,
  draftId,
}: Props) {
  const [messages, setMessages] = useState<Message[]>(resumeMessages ?? []);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  // Per-turn pipeline: 3 stages keyed to the server's two `phase` events
  // ("Reviewing your inputs..." → "Calling Claude...") plus a final
  // "Streaming response" stage that activates once tokens start arriving.
  // The current ARC section is surfaced in the pipeline footer so members
  // see which section is being drafted on this turn.
  type ChatStageKey = "review" | "call" | "stream";
  const CHAT_STAGE_DEFS: { key: ChatStageKey; label: string }[] = [
    { key: "review", label: "Review your inputs" },
    { key: "call", label: "Call Claude" },
    { key: "stream", label: "Stream response" },
  ];
  function stagesFor(active: ChatStageKey | null, completed: ChatStageKey[]) {
    return CHAT_STAGE_DEFS.map((s) => ({
      key: s.key,
      label: s.label,
      status: completed.includes(s.key)
        ? ("complete" as const)
        : active === s.key
        ? ("active" as const)
        : ("pending" as const),
    }));
  }
  const aiThinking = useAiThinking({
    mode: "phase",
    fallbackPhases: ["Reviewing your inputs..."],
  });
  const [chatActiveStage, setChatActiveStage] = useState<ChatStageKey | null>(null);
  const [chatCompletedStages, setChatCompletedStages] = useState<ChatStageKey[]>([]);
  const [currentSection, setCurrentSection] = useState(resumeCurrentSection ?? "research_strategy");
  const [completedSections, setCompletedSections] = useState<string[]>(resumeCompletedSections ?? []);
  const [sectionApprovals, setSectionApprovals] = useState<SectionApproval[]>(resumeSectionApprovals ?? []);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [costCapWarning, setCostCapWarning] = useState<"warning" | "critical" | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [finalScriptDone, setFinalScriptDone] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftSaved, setDraftSaved] = useState(resumeMessages && resumeMessages.length > 0);
  const [draftSaveError, setDraftSaveError] = useState(false);
  const draftSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftIdRef = useRef<string | null>(draftId ?? null);
  const [savedScriptId, setSavedScriptId] = useState<string | null>(null);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [plannerPlans, setPlannerPlans] = useState<Array<{ id: string; title: string; status: string }>>([]);
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [plannerPushing, setPlannerPushing] = useState(false);
  const [plannerPushed, setPlannerPushed] = useState(false);
  const [plannerError, setPlannerError] = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const currentSectionRef = useRef("research_strategy");
  const autoSavedRef = useRef(false);

  const turnCount = messages.length;
  const atTurnLimit = turnCount >= MAX_TURNS;
  const isFinalScript = currentSection === "final_script" || currentSection === "assembly_pass";

  const finalScriptText = (finalScriptDone || isFinalScript)
    ? cleanContent(messages.findLast((m) => m.role === "assistant")?.content ?? "")
    : "";

  useEffect(() => {
    if (!finalScriptDone || !finalScriptText || autoSavedRef.current) return;
    autoSavedRef.current = true;
    onScriptComplete?.(finalScriptText);
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
      .then(async (res) => {
        if (!res.ok) throw new Error("Save failed");
        const data = await res.json();
        if (data?.id) setSavedScriptId(data.id);
        setSaved(true);
        // Clean up draft — script is now saved permanently
        const cleanupId = draftIdRef.current;
        if (cleanupId) {
          fetch(`/api/ai-tools/arc-script-builder/draft?id=${encodeURIComponent(cleanupId)}`, { method: "DELETE" }).catch(() => {});
        }
      })
      .catch(() => setSaveError("Auto-save failed. Use the save button below to retry."))
      .finally(() => setSaving(false));
  }, [finalScriptDone, finalScriptText]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSaveDraft(currentMessages: Message[], currentSec: string, completedSecs: string[], secApprovals: SectionApproval[]) {
    if (draftSaving || finalScriptDone) return;
    setDraftSaving(true);
    setDraftSaveError(false);
    if (draftSavedTimerRef.current) clearTimeout(draftSavedTimerRef.current);
    try {
      const res = await fetch("/api/ai-tools/arc-script-builder/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: draftIdRef.current ?? undefined,
          videoTitle: initialData.title,
          planId: linkedPlanId ?? undefined,
          initialData,
          messages: currentMessages,
          currentSection: currentSec,
          completedSections: completedSecs,
          sectionApprovals: secApprovals,
        }),
      });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const errBody = await res.json();
          if (errBody?.detail) detail = `${errBody.error ?? "error"}: ${errBody.detail}`;
        } catch {}
        console.error("[arc-draft] save failed", detail);
        throw new Error(detail);
      }
      try {
        const data = await res.json();
        if (data?.id) draftIdRef.current = data.id;
      } catch {}
      setDraftSaved(true);
      draftSavedTimerRef.current = setTimeout(() => setDraftSaved(false), 3000);
    } catch (e) {
      console.error("[arc-draft] save error", e);
      setDraftSaveError(true);
    } finally {
      setDraftSaving(false);
    }
  }

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
      setChatCompletedStages([]);
      setChatActiveStage("review");
      aiThinking.start();

      const newUserMsg: Message = {
        role: "user",
        content: userContent,
        ...(researchSummary ? { researchSummary } : {}),
      };

      setMessages((prev) => [...prev, newUserMsg]);
      setInput("");

      const historyWithNew = [...messages, newUserMsg];

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      // Outer try/finally guarantees aiThinking.stop() + setLoading(false)
      // run on every exit path, including the 429 and !res.ok early returns.
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
          return;
        }

        if (!res.ok || !res.body) {
          setMessages((prev) => [
            ...prev.slice(0, -1),
            { role: "assistant", content: "Something went wrong. Please try again." },
          ]);
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
            const sse = parseSseEvent(part);
            if (!sse) continue;

            // Wave 0.5 phase event — update the AiThinking indicator + advance
            // the per-turn pipeline. Server currently emits two labels for
            // chat: "Reviewing your inputs..." (review) → "Calling Claude..."
            // (call). The "stream" stage flips active on the first text chunk.
            if (sse.event === "phase") {
              try {
                const phasePayload = JSON.parse(sse.data) as { label?: string };
                if (phasePayload.label) {
                  aiThinking.updatePhase(phasePayload.label);
                  const lower = phasePayload.label.toLowerCase();
                  if (lower.includes("review")) {
                    setChatActiveStage("review");
                  } else if (lower.includes("call")) {
                    setChatCompletedStages((prev) =>
                      prev.includes("review") ? prev : [...prev, "review"],
                    );
                    setChatActiveStage("call");
                  }
                }
              } catch {}
              continue;
            }

            try {
              const payload = JSON.parse(sse.data);

              if (payload.type === "text") {
                // First content chunk — dismiss the thinking indicator; the
                // streaming text itself becomes the activity signal. Also
                // mark the prior pipeline stages complete so any final paint
                // before dismissal shows the full progression.
                if (fullText.length === 0) {
                  setChatCompletedStages((prev) => {
                    const next = [...prev];
                    if (!next.includes("review")) next.push("review");
                    if (!next.includes("call")) next.push("call");
                    return next;
                  });
                  setChatActiveStage("stream");
                  aiThinking.stop();
                }
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

                // Text-pattern fallback: detect final script delivery even if sectionApproved signal is missing.
                // "Final Word Count:" + "Final Runtime:" are only written once — in the completed final script.
                const looksLikeFinalScript =
                  displayText.includes("Final Word Count:") && displayText.includes("Final Runtime:");

                let nextSectionForDraft = currentSectionRef.current;
                let draftCompleted = [...completedSections];
                let draftApprovals = [...sectionApprovals];

                if (payload.sectionData) {
                  const { currentSection: nextSection, sectionApproved } = payload.sectionData;
                  const signalsDone =
                    sectionApproved &&
                    (nextSection === "final_script" || nextSection === "assembly_pass");
                  if (signalsDone || looksLikeFinalScript) {
                    setFinalScriptDone(true);
                  }
                  if (sectionApproved) {
                    const prevIdx = SECTIONS.findIndex((s) => s.key === nextSection) - 1;
                    if (prevIdx >= 0) {
                      const prevKey = SECTIONS[prevIdx].key;
                      if (!draftCompleted.includes(prevKey)) draftCompleted = [...draftCompleted, prevKey];
                      if (!draftApprovals.find((a) => a.key === prevKey)) {
                        draftApprovals = [...draftApprovals, { key: prevKey, snippet: displayText.slice(0, 300) }];
                      }
                      setCompletedSections(draftCompleted);
                      setSectionApprovals(draftApprovals);
                    }
                  }
                  currentSectionRef.current = nextSection;
                  nextSectionForDraft = nextSection;
                  setCurrentSection(nextSection);
                } else if (looksLikeFinalScript) {
                  setFinalScriptDone(true);
                }

                if (payload.costCapWarning) {
                  setCostCapWarning(payload.costCapWarning);
                }

                // Auto-save draft after every assistant response (but not for the final script — that gets permanently saved)
                if (!looksLikeFinalScript) {
                  const msgsForDraft = [...historyWithNew, { role: "assistant" as const, content: displayText }];
                  handleSaveDraft(msgsForDraft, nextSectionForDraft, draftCompleted, draftApprovals);
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
      } finally {
        setLoading(false);
        aiThinking.stop();
        setChatActiveStage(null);
        setChatCompletedStages([]);
      }
    },
    [loading, messages, aiThinking]
  );

  // Preserve the old AnalysisProgress beforeunload guard — leaving the tab
  // mid-stream cancels the request and discards the partial response.
  useEffect(() => {
    if (!loading) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [loading]);

  const currentSectionLabel =
    SECTIONS.find((s) => s.key === currentSection)?.label ?? currentSection;

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    // When resuming from draft, skip the opening message — the conversation already exists
    if (resumeMessages && resumeMessages.length > 0) return;
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

  async function openPlanner() {
    setPlannerOpen(true);
    setPlannerError("");
    setPlannerLoading(true);
    try {
      const res = await fetch("/api/member/content-plans");
      if (!res.ok) throw new Error("Failed to load plans");
      const data = await res.json();
      const active = (data.plans ?? []).filter(
        (p: { status: string }) =>
          !["Published", "Archived", "Done"].includes(p.status)
      );
      setPlannerPlans(active);
    } catch {
      setPlannerError("Couldn't load your content planner.");
    } finally {
      setPlannerLoading(false);
    }
  }

  async function pushToPlanner(planId: string | null) {
    if (!finalScriptText || plannerPushing) return;
    setPlannerPushing(true);
    setPlannerError("");
    try {
      if (planId) {
        const res = await fetch(`/api/member/content-plans/${planId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ script: finalScriptText }),
        });
        if (!res.ok) throw new Error("Failed");
      } else {
        const res = await fetch("/api/member/content-plans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: initialData.title,
            status: "Idea",
            notes: initialData.talkingPoints || undefined,
            ...(savedScriptId ? { linkedScriptId: savedScriptId } : {}),
          }),
        });
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        if (data?.plan?.id) {
          await fetch(`/api/member/content-plans/${data.plan.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ script: finalScriptText }),
          });
        }
      }
      setPlannerPushed(true);
      setPlannerOpen(false);
    } catch {
      setPlannerError("Push to planner failed. Try again.");
    } finally {
      setPlannerPushing(false);
    }
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
      const data = await res.json();
      if (data?.id) setSavedScriptId(data.id);
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
              <div key={approval.key} className="bg-[var(--abv-ai-tools)]/8 border border-[var(--abv-ai-tools)]/20 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-[var(--abv-ai-tools)] uppercase tracking-wide">
                    Approved: {label}
                  </span>
                  <button onClick={() => setExpandedSection(null)} className="text-[var(--abv-text)]/40 dark:text-white/40 hover:text-[var(--abv-text)] dark:hover:text-white">
                    <ChevronUpIcon className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-sm text-[var(--abv-text)]/70 dark:text-white/70 line-clamp-4">{approval.snippet}…</p>
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
                    : "bg-white dark:bg-[#1a1a1a] border border-[var(--abv-text)]/10 dark:border-white/10 text-[var(--abv-text)] dark:text-white rounded-tl-sm"
                }`}
              >
                {msg.role === "user" ? (
                  displayContent
                ) : displayContent ? (
                  <MarkdownMessage className="text-sm">{displayContent}</MarkdownMessage>
                ) : (
                  <div className="flex gap-1.5 items-center h-4">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="w-2 h-2 rounded-full bg-[var(--abv-ai-tools)]/60 animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {aiThinking.isThinking &&
          !messages[messages.length - 1]?.content && (
            <div className="flex justify-start w-full">
              <AiThinking
                mode="pipeline"
                stages={stagesFor(chatActiveStage, chatCompletedStages)}
                detailLine={`Drafting ${currentSectionLabel}`}
              />
            </div>
          )}
        <div ref={bottomRef} />
      </div>

      {atTurnLimit && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500/30 rounded-lg px-4 py-3 text-sm text-amber-700 dark:text-amber-300 mb-3">
          You&apos;ve reached the 20-turn limit for this session. Save your script or start a new one.
        </div>
      )}

      {(finalScriptDone || isFinalScript) && (
        <div className="flex flex-col gap-2 mb-3">
          {saving && (
            <p className="text-xs text-[var(--abv-text)]/45 dark:text-white/35 px-1">Saving your script…</p>
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

          {/* Content Planner save section */}
          {linkedPlanId ? (
            plannerSaved ? (
              <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-500/30 rounded-lg px-4 py-3">
                <CheckIcon className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
                <p className="text-sm text-green-700 dark:text-green-300 font-medium flex-1">
                  Script saved to your Content Plan.
                </p>
                <a
                  href="/member/content-planner"
                  className="shrink-0 text-xs font-semibold text-green-700 dark:text-green-400 underline hover:no-underline"
                >
                  View in Planner →
                </a>
              </div>
            ) : plannerSaving ? (
              <p className="text-xs text-[var(--abv-text)]/45 dark:text-white/35 px-1">Saving script to your Content Plan…</p>
            ) : plannerSaveError ? (
              <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/30 rounded-lg px-4 py-3">
                <p className="text-sm text-red-600 dark:text-red-400 flex-1">Could not save to Content Plan.</p>
                <button
                  onClick={() => onSaveToPlanner?.()}
                  className="shrink-0 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-md transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : null
          ) : onSaveToPlanner ? (
            plannerSaved ? (
              <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-500/30 rounded-lg px-4 py-3">
                <CheckIcon className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
                <p className="text-sm text-green-700 dark:text-green-300 font-medium flex-1">
                  Script saved to your Content Plan.
                </p>
                <a
                  href="/member/content-planner"
                  className="shrink-0 text-xs font-semibold text-green-700 dark:text-green-400 underline hover:no-underline"
                >
                  View in Planner →
                </a>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-[var(--abv-text)]/60 dark:text-white/50 shrink-0">
                  📅 Save script to Content Plan:
                </span>
                {contentPlans.length > 0 ? (
                  <>
                    <select
                      value={selectedPlanId}
                      onChange={(e) => setSelectedPlanId(e.target.value)}
                      className="flex-1 min-w-0 bg-white dark:bg-[#0f1419] border border-[var(--abv-text)]/20 dark:border-white/20 rounded-md px-3 py-1.5 text-xs text-[var(--abv-text)] dark:text-white focus:outline-none focus:border-[var(--abv-ai-tools)] transition-colors"
                    >
                      <option value="">— Choose a plan —</option>
                      {contentPlans.map((p) => (
                        <option key={p.id} value={p.id}>{p.title}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => { if (selectedPlanId) onSaveToPlanner(selectedPlanId); }}
                      disabled={!selectedPlanId || plannerSaving}
                      className="shrink-0 px-3 py-1.5 text-xs font-semibold bg-[var(--abv-ai-tools)] text-white rounded-md hover:bg-[var(--abv-ai-tools)]/85 transition-colors disabled:opacity-40"
                    >
                      {plannerSaving ? "Saving…" : "Save"}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => onSaveToPlanner()}
                    disabled={plannerSaving}
                    className="shrink-0 px-3 py-1.5 text-xs font-semibold bg-[var(--abv-ai-tools)] text-white rounded-md hover:bg-[var(--abv-ai-tools)]/85 transition-colors disabled:opacity-40"
                  >
                    {plannerSaving ? "Saving…" : "Save to Planner"}
                  </button>
                )}
                {plannerSaveError && (
                  <p className="text-xs text-red-500 w-full">Save failed. Please try again.</p>
                )}
              </div>
            )
          ) : null}

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-[var(--abv-ai-tools)] text-white rounded-lg hover:bg-[var(--abv-ai-tools)]/85 transition-colors"
            >
              {copied ? <CheckIcon className="w-4 h-4" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
              {copied ? "Copied!" : "Copy to Clipboard"}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || saved}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-[var(--abv-text)]/15 dark:border-white/15 rounded-lg hover:bg-[#111]/5 dark:hover:bg-white/5 transition-colors text-[var(--abv-text)] dark:text-white disabled:opacity-50"
            >
              {saved ? <CheckIcon className="w-4 h-4" /> : <span>💾</span>}
              {saved ? "Saved" : saving ? "Saving…" : "Save Script"}
            </button>
            <button
              onClick={() => {
                if (linkedPlanId) {
                  // Script came from a planner item — save directly, skip modal
                  pushToPlanner(linkedPlanId);
                } else {
                  openPlanner();
                }
              }}
              disabled={plannerPushed || plannerSaved || plannerPushing}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-[var(--abv-text)]/15 dark:border-white/15 rounded-lg hover:bg-[#111]/5 dark:hover:bg-white/5 transition-colors text-[var(--abv-text)] dark:text-white disabled:opacity-50"
            >
              <span>📅</span>
              {plannerPushed || plannerSaved
                ? "In Planner ✓"
                : plannerPushing
                  ? "Saving…"
                  : linkedPlanId
                    ? "Save to Content Planner"
                    : "Push to Content Planner"}
            </button>
            <button
              onClick={onReset}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-[var(--abv-text)]/15 dark:border-white/15 rounded-lg hover:bg-[#111]/5 dark:hover:bg-white/5 transition-colors text-[var(--abv-text)] dark:text-white"
            >
              <ArrowPathIcon className="w-4 h-4" />
              Build Another Script
            </button>
          </div>

          {saved && (
            <NextStepCard
              emoji="📋"
              title="Review Your Script"
              description="Score your finished script against the 14 Attraction principles and get a coaching breakdown."
              href="/member/content-tools/script-review"
              buttonLabel="Open Script Review"
            />
          )}
        </div>
      )}

      {plannerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !plannerPushing && setPlannerOpen(false)}>
          <div className="bg-white dark:bg-[#1a1a1a] rounded-lg border border-[var(--abv-text)]/10 dark:border-white/10 max-w-md w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[var(--abv-text)]/10 dark:border-white/10">
              <h3 className="text-sm font-bold text-[var(--abv-text)] dark:text-white">Push to Content Planner</h3>
              <p className="text-xs text-[var(--abv-text)]/60 dark:text-white/60 mt-0.5">Add this script to an existing item or create a new one.</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              <button
                onClick={() => pushToPlanner(null)}
                disabled={plannerPushing}
                className="w-full text-left px-3 py-2.5 rounded-lg border border-dashed border-[var(--abv-ai-tools)]/40 hover:bg-[var(--abv-ai-tools)]/5 text-sm font-semibold text-[var(--abv-ai-tools)] disabled:opacity-50"
              >
                + Create new planner item for &quot;{initialData.title}&quot;
              </button>
              {plannerLoading && (
                <p className="text-xs text-[var(--abv-text)]/50 dark:text-white/50 px-3 py-4 text-center">Loading…</p>
              )}
              {!plannerLoading && plannerPlans.length === 0 && (
                <p className="text-xs text-[var(--abv-text)]/50 dark:text-white/50 px-3 py-4 text-center">No active planner items yet.</p>
              )}
              {!plannerLoading && plannerPlans.map((p) => (
                <button
                  key={p.id}
                  onClick={() => pushToPlanner(p.id)}
                  disabled={plannerPushing}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-[var(--abv-text)]/10 dark:border-white/10 hover:bg-[#111]/5 dark:hover:bg-white/5 disabled:opacity-50"
                >
                  <p className="text-sm font-medium text-[var(--abv-text)] dark:text-white truncate">{p.title}</p>
                  <p className="text-[10px] text-[var(--abv-text)]/50 dark:text-white/50 mt-0.5 uppercase tracking-wide">{p.status}</p>
                </button>
              ))}
            </div>
            {plannerError && (
              <p className="px-5 pb-2 text-xs text-red-500">{plannerError}</p>
            )}
            <div className="px-5 py-3 border-t border-[var(--abv-text)]/10 dark:border-white/10 flex justify-end">
              <button
                onClick={() => setPlannerOpen(false)}
                disabled={plannerPushing}
                className="text-xs text-[var(--abv-text)]/60 dark:text-white/60 hover:text-[var(--abv-text)] dark:hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {!atTurnLimit && (
        <div className="flex-shrink-0 border-t border-[var(--abv-text)]/10 dark:border-white/10 pt-4">
          {loading && (
            <div className="mb-5">
              <AiThinking
                mode="phase"
                toolName="ARC Script Builder"
                currentPhase="Generating script…"
                noteText="The AI is writing this section. Please keep this tab open — leaving now will lose the response."
              />
            </div>
          )}
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
              className="flex-1 bg-white dark:bg-[#0f1419] border border-[var(--abv-text)]/20 dark:border-white/20 rounded-lg px-4 py-3 text-sm text-[var(--abv-text)] dark:text-white placeholder-[var(--abv-text)]/30 dark:placeholder-white/30 resize-none focus:outline-none focus:border-[var(--abv-ai-tools)] transition-colors"
            />
            <button
              onClick={() => { if (input.trim() && !loading) sendMessage(input.trim()); }}
              disabled={loading || !input.trim()}
              className="flex-shrink-0 w-11 h-11 flex items-center justify-center bg-[var(--abv-ai-tools)] text-white rounded-lg hover:bg-[var(--abv-ai-tools)]/90 disabled:opacity-40 transition-colors"
            >
              <PaperAirplaneIcon className="w-5 h-5" />
            </button>
          </div>
          <div className="flex justify-between mt-1.5">
            <div className="flex items-center gap-3">
              <button onClick={onReset} className="text-xs text-[var(--abv-text)]/30 dark:text-white/30 hover:text-[var(--abv-text)]/60 dark:hover:text-white/60 flex items-center gap-1">
                <ArrowPathIcon className="w-3 h-3" /> Start over
              </button>
              <button
                onClick={() => handleSaveDraft(messages, currentSection, completedSections, sectionApprovals)}
                disabled={draftSaving || messages.length < 2}
                className="text-xs text-[var(--abv-ai-tools)] hover:text-[var(--abv-ai-tools)] dark:text-[var(--abv-ai-tools)]/80 dark:hover:text-[var(--abv-ai-tools)] flex items-center gap-1 transition-colors disabled:opacity-40"
              >
                {draftSaving ? (
                  <span>Saving…</span>
                ) : draftSaved ? (
                  <><CheckIcon className="w-3 h-3" /> Saved</>
                ) : (
                  <><BookmarkIcon className="w-3 h-3" /> Save progress</>
                )}
              </button>
              {draftSaveError && (
                <span className="text-xs text-red-400">Save failed</span>
              )}
            </div>
            <span className="text-xs text-[var(--abv-text)]/25 dark:text-white/25">{turnCount}/{MAX_TURNS} turns</span>
          </div>
        </div>
      )}
    </div>
  );
}

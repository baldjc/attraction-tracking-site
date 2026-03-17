"use client";

import { useState, useEffect } from "react";
import { ArrowLeftIcon, ArrowPathIcon, CheckIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import ArcScriptUploadPhase from "@/components/ai-tools/ArcScriptUploadPhase";
import RecentConversations from "@/components/ai-tools/RecentConversations";

interface Props {
  basePath: string;
  isAdmin?: boolean;
}

interface UsageData {
  percentUsed: number;
  cap: string;
  totalCost: string;
  resetsAt: string;
}

interface UploadData {
  title: string;
  talkingPoints: string;
  researchSummary: string;
}

interface PrefillData {
  title: string;
  talkingPoints: string[];
  theme?: string;
  framework?: string | null;
  whyItWorks?: string | null;
  ideaId?: string;
}

interface IntroPattern {
  name: string;
  subtype?: string;
  variation?: number;
  script: string;
}

interface ExpertiseBridge {
  name: string;
  script: string;
  best_when: string;
}

interface CredibilitySuggestion {
  line: string;
  placement: string;
}

interface InsightSlot {
  slot: number;
  label: string;
  prompts: {
    what: string;
    why: string;
    when: string;
    story: string;
    connection: string;
  };
  drafts?: {
    what: string;
    why: string;
    when: string;
    story: string;
    connection: string;
  };
}

interface TalkingPointCard {
  id: string;
  ideaTitle: string;
  text: string;
}

interface RetentionSuggestion {
  timestamp?: string;
  location?: string;
  issue: string;
  fix: string;
}

interface ChecklistItem {
  key: string;
  label: string;
}

const CHECKLIST_LABELS: ChecklistItem[] = [
  { key: "opening_hook_strong", label: "Opening hook creates immediate tension or curiosity" },
  { key: "arc_invisible", label: "ARC structure invisible — no WHAT/WHY/WHEN labels" },
  { key: "narrative_escalates", label: "Each section builds and escalates from the previous" },
  { key: "one_story_threaded", label: "One primary story threaded through (not per-section placeholders)" },
  { key: "analogies_present", label: "At least one vivid analogy per major section" },
  { key: "data_specific", label: "Specific data and numbers woven throughout" },
  { key: "lead_magnet_organic_3x", label: "Lead magnet mentioned organically 3 times" },
  { key: "playbook_included", label: "\"What to do about it\" playbook with numbered actions" },
  { key: "curiosity_bridges_specific", label: "Curiosity bridges create specific open loops" },
  { key: "next_video_bridge_specific", label: "Next video push connects specifically to this content" },
  { key: "credentials_exact", label: "Member's exact credentials appear verbatim" },
  { key: "conversational_tone", label: "Conversational tone — contractions, fragments, rhetorical questions" },
  { key: "visual_cues_specific", label: "Visual cues specific and tied to content" },
];

type Phase = "upload" | "research" | "opening_context" | "opening" | "credibility" | "insights" | "final" | "done";

function UsageBanner({ percentUsed, resetsAt }: { percentUsed: number; resetsAt: string }) {
  if (percentUsed < 50) return null;
  const isLocked = percentUsed >= 100;
  const isRed = percentUsed >= 90;
  const isAmber = percentUsed >= 75;
  const bg = isLocked || isRed ? "bg-red-50 border-red-200" : isAmber ? "bg-amber-50 border-amber-200" : "bg-blue-50 border-blue-200";
  const sub = isLocked || isRed ? "text-red-600" : isAmber ? "text-amber-600" : "text-blue-600";
  const message = isLocked
    ? "You've reached your monthly AI usage limit. Scripting is locked until the cap resets."
    : `You've used ${Math.round(percentUsed)}% of your monthly AI budget. Resets ${resetsAt}.`;
  return (
    <div className={`mb-5 flex items-start gap-3 border rounded-xl p-4 ${bg}`}>
      <span className="text-lg">{isLocked || isRed ? "🚫" : isAmber ? "⚠️" : "ℹ️"}</span>
      <p className={`text-sm ${sub}`}>{message}</p>
    </div>
  );
}

function StepHeader({ step, total, label }: { step: number; total: number; label: string }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="w-8 h-8 rounded-full bg-[#3dc3ff] text-white flex items-center justify-center text-sm font-bold shrink-0">
        {step}
      </div>
      <div>
        <p className="text-xs text-[#1e2a38]/40 uppercase tracking-wider font-semibold">Step {step} of {total}</p>
        <h2 className="font-bold text-[#1e2a38] text-lg">{label}</h2>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center gap-2 py-8">
      <div className="w-2 h-2 rounded-full bg-[#3dc3ff] animate-bounce" style={{ animationDelay: "0ms" }} />
      <div className="w-2 h-2 rounded-full bg-[#3dc3ff] animate-bounce" style={{ animationDelay: "150ms" }} />
      <div className="w-2 h-2 rounded-full bg-[#3dc3ff] animate-bounce" style={{ animationDelay: "300ms" }} />
    </div>
  );
}

function getNichePlaceholders(niche: string | null) {
  const n = (niche ?? "").toLowerCase();
  if (n.includes("real estate") || n.includes("realtor") || n.includes("agent")) {
    return {
      uniqueAngle: "e.g. Most agents get this backwards — here's why",
      before: "e.g. confused, anxious, overwhelmed",
      after: "e.g. confident, clear, ready to act",
    };
  }
  if (n.includes("financial") || n.includes("advisor") || n.includes("finance") || n.includes("wealth") || n.includes("invest")) {
    return {
      uniqueAngle: "e.g. Most advisors miss this completely — here's the truth",
      before: "e.g. stressed, uncertain, afraid of making a mistake",
      after: "e.g. in control, informed, ready to take the next step",
    };
  }
  if (n.includes("mortgage") || n.includes("broker") || n.includes("lending") || n.includes("lender")) {
    return {
      uniqueAngle: "e.g. Most brokers won't tell you this — but you need to know",
      before: "e.g. confused by options, worried about rates, unsure who to trust",
      after: "e.g. clear on their best option, confident in their decision",
    };
  }
  return {
    uniqueAngle: "e.g. Most people in your space get this wrong — here's why",
    before: "e.g. confused, frustrated, stuck",
    after: "e.g. confident, clear, ready to take action",
  };
}

// ─── Standalone formatter ─────────────────────────────────────────────────────
// Takes the raw finalData result + title and returns a fully-formatted markdown
// string. Used by handleCopy, handleSave, and the auto-save conversation payload.

function buildFullScriptMarkdown(finalData: any, title: string): string {
  const checklistLookup = Object.fromEntries(CHECKLIST_LABELS.map((c) => [c.key, c.label]));
  if (!finalData) return "";
  const lines: string[] = [];

  lines.push(`# ARC Script: ${title}`, "");

  // ── New flat-script format ──────────────────────────────────────────────────
  if (finalData.script) {
    lines.push(finalData.script, "");
  } else if (finalData.script_outline) {
    // ── Legacy labelled-outline format (backward compat) ─────────────────────
    const s = finalData.script_outline;
    if (s.opening)      lines.push("## OPENING", "", s.opening, "");
    if (s.credibility)  lines.push("## CREDIBILITY SIGNAL", "", s.credibility, "");
    if (s.lead_magnet_1) lines.push("## LEAD MAGNET — Mention #1", "", s.lead_magnet_1, "");
    if (s.insights?.length) {
      s.insights.forEach((ins: any, i: number) => {
        lines.push(`## INSIGHT ${i + 1}`, "");
        if (ins.what)           lines.push(`**WHAT:** ${ins.what}`, "");
        if (ins.why)            lines.push(`**WHY:** ${ins.why}`, "");
        if (ins.when)           lines.push(`**WHEN:** ${ins.when}`, "");
        if (ins.story)          lines.push(`**STORY / PROOF:** ${ins.story}`, "");
        if (ins.connection)     lines.push(`**WHAT THIS MEANS:** ${ins.connection}`, "");
        if (ins.curiosity_bridge) lines.push(`**CURIOSITY BRIDGE:** ${ins.curiosity_bridge}`, "");
        if (ins.visual_prompt)  lines.push(`> 🎬 Visual: ${ins.visual_prompt}`, "");
      });
    }
    if (s.lead_magnet_2) lines.push("## LEAD MAGNET — Mention #2", "", s.lead_magnet_2, "");
    if (s.closing)       lines.push("## CLOSING", "", s.closing, "");
  } else {
    return "";
  }

  // CHECKLIST
  if (finalData.checklist && Object.keys(finalData.checklist).length) {
    lines.push("---", "", "## CHECKLIST", "");
    for (const [key, val] of Object.entries(finalData.checklist as Record<string, boolean>)) {
      const label = checklistLookup[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      lines.push(`- [${val ? "x" : " "}] ${label}`);
    }
    lines.push("");
  }

  // RETENTION NOTES
  const retNotes = finalData.retentionNotes ?? finalData.retention_suggestions ?? [];
  if (retNotes.length) {
    lines.push("## RETENTION NOTES", "");
    retNotes.forEach((rs: any, i: number) => {
      const label = rs.timestamp ?? rs.location ?? `Note ${i + 1}`;
      lines.push(`**${i + 1}. ${label}**`);
      if (rs.issue) lines.push(`Issue: ${rs.issue}`);
      if (rs.fix)   lines.push(`Fix: ${rs.fix}`);
      lines.push("");
    });
  }

  return lines.join("\n");
}

export default function ArcScriptBuilderTool({ basePath, isAdmin = false }: Props) {
  const [phase, setPhase] = useState<Phase>("upload");
  const [prefillData, setPrefillData] = useState<PrefillData | null>(null);
  const [uploadData, setUploadData] = useState<UploadData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [niche, setNiche] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 1: Opening data
  const [introPatterns, setIntroPatterns] = useState<IntroPattern[]>([]);
  const [expertiseBridges, setExpertiseBridges] = useState<ExpertiseBridge[]>([]);
  const [hookStarters, setHookStarters] = useState<string[]>([]);
  const [leadMagnetLine, setLeadMagnetLine] = useState("");
  const [selectedPattern, setSelectedPattern] = useState("");
  const [selectedBridge, setSelectedBridge] = useState("");

  // Step 2: Opening form fields
  const [conventionalWisdom, setConventionalWisdom] = useState("");
  const [uniqueAngle, setUniqueAngle] = useState("");
  const [viewerEmotion, setViewerEmotion] = useState("");
  const [viewerQuestion, setViewerQuestion] = useState("");
  const [viewerFear, setViewerFear] = useState("");
  const [viewerHope, setViewerHope] = useState("");

  // Step 3: Credibility (4 structured fields)
  const [credClientsHelped, setCredClientsHelped] = useState("");
  const [credSpecificResult, setCredSpecificResult] = useState("");
  const [credFrequency, setCredFrequency] = useState("");
  const [credSurprise, setCredSurprise] = useState("");

  // Step 4: Client story
  const [clientStory, setClientStory] = useState("");
  const [credibilitySuggestions, setCredibilitySuggestions] = useState<CredibilitySuggestion[]>([]);
  const [selectedCredibility, setSelectedCredibility] = useState("");

  // Step 4: Insights
  const [insightCount, setInsightCount] = useState(5);
  const [insightSlots, setInsightSlots] = useState<InsightSlot[]>([]);
  const [insightAnswers, setInsightAnswers] = useState<Record<number, Record<string, string>>>({});
  const [savedTalkingPoints, setSavedTalkingPoints] = useState<TalkingPointCard[]>([]);
  const [selectedTalkingPointIds, setSelectedTalkingPointIds] = useState<Set<string>>(new Set());
  const [editingField, setEditingField] = useState<string | null>(null);
  const [nextVideoTitle, setNextVideoTitle] = useState("");
  const [nextVideoWhy, setNextVideoWhy] = useState("");
  const [nextVideoTranscript, setNextVideoTranscript] = useState("");
  const [nextVideoSelectedId, setNextVideoSelectedId] = useState("");

  // Video picker state
  const [showVideoPicker, setShowVideoPicker] = useState(false);
  const [memberVideos, setMemberVideos] = useState<Array<{ videoId: string; title: string; uploadDate: string }>>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [videoPickerError, setVideoPickerError] = useState("");
  const [videoSearch, setVideoSearch] = useState("");
  const [loadingTranscript, setLoadingTranscript] = useState(false);

  // Opening: generate more hooks
  const [loadingMoreHooks, setLoadingMoreHooks] = useState(false);

  // Step 5: Final
  const [finalData, setFinalData] = useState<any>(null);
  const [retentionSuggestions, setRetentionSuggestions] = useState<RetentionSuggestion[]>([]);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Conversation history
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);

  // Check for Content Engine prefill on mount
  useEffect(() => {
    const raw = sessionStorage.getItem("arc_prefill");
    if (raw) {
      sessionStorage.removeItem("arc_prefill");
      try {
        const data = JSON.parse(raw) as PrefillData;
        setPrefillData(data);
        setPhase("research");
      } catch {
        // ignore invalid data
      }
    }
  }, []);

  useEffect(() => {
    fetch("/api/ai-tools/usage/me")
      .then((r) => r.json())
      .then(setUsage)
      .catch(() => {});
    fetch("/api/member/avatar")
      .then((r) => r.json())
      .then((d) => setNiche(d?.niche ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (phase === "insights" && insightSlots.length === 0 && prefillData) {
      const cards: TalkingPointCard[] = (prefillData.talkingPoints ?? []).map((pt, i) => ({
        id: `prefill-${i}`,
        ideaTitle: prefillData.title,
        text: String(pt),
      }));
      setSavedTalkingPoints(cards);
      setSelectedTalkingPointIds(new Set(cards.map((c) => c.id)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function toggleTalkingPoint(id: string) {
    setSelectedTalkingPointIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const isLocked = (usage?.percentUsed ?? 0) >= 100;

  async function callStep(step: string, extra: Record<string, any>) {
    const res = await fetch("/api/ai-tools/arc-script-builder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step, title: uploadData?.title, topic: uploadData?.title, ...extra }),
    });
    if (res.status === 429) {
      const d = await res.json();
      throw new Error(d.error === "monthly_cap_reached"
        ? `Monthly AI limit reached. Resets ${d.resetsAt}.`
        : "Monthly limit reached.");
    }
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || "API error");
    }
    return res.json();
  }

  // ── Normal flow: Upload → Opening generation ──
  async function handleStartBuilding(data: UploadData) {
    setUploadData(data);
    setLoading(true);
    setError("");
    try {
      const result = await callStep("opening", {
        title: data.title,
        topic: data.title,
        conventionalWisdom,
        uniqueAngle,
        viewerEmotion,
        viewerQuestion,
        viewerFear,
        viewerHope,
      });
      setIntroPatterns(result.intro_patterns ?? []);
      setExpertiseBridges(result.expertise_bridges ?? []);
      setHookStarters(result.hook_starters ?? []);
      setLeadMagnetLine(result.lead_magnet_line ?? "");
      setPhase("opening");
    } catch (e: any) {
      setError(e.message || "Failed to generate opening. Please try again.");
    }
    setLoading(false);
  }

  // ── Prefill flow: Research complete → opening_context ──
  function handleResearchComplete(data: UploadData) {
    setUploadData(data);
    setPhase("opening_context");
  }

  // ── Prefill flow: Skip research → opening_context ──
  function handleSkipResearch() {
    if (!prefillData) return;
    setUploadData({
      title: prefillData.title,
      talkingPoints: prefillData.talkingPoints.join("\n"),
      researchSummary: "",
    });
    setPhase("opening_context");
  }

  // ── Prefill flow: opening_context → Generate opening ──
  async function handleGenerateOpening() {
    if (!uploadData) return;
    setLoading(true);
    setError("");
    try {
      const result = await callStep("opening", {
        title: uploadData.title,
        topic: uploadData.title,
        conventionalWisdom,
        uniqueAngle,
        viewerEmotion,
        viewerQuestion,
        viewerFear,
        viewerHope,
        talkingPoints: prefillData?.talkingPoints.join("\n") || uploadData.talkingPoints || undefined,
      });
      setIntroPatterns(result.intro_patterns ?? []);
      setExpertiseBridges(result.expertise_bridges ?? []);
      setHookStarters(result.hook_starters ?? []);
      setLeadMagnetLine(result.lead_magnet_line ?? "");
      setPhase("opening");
    } catch (e: any) {
      setError(e.message || "Failed to generate opening. Please try again.");
    }
    setLoading(false);
  }

  // ── Step: Opening → Credibility ──
  async function handleOpeningNext() {
    if (!selectedPattern || !selectedBridge) {
      setError("Please select an intro pattern and an expertise bridge before continuing.");
      return;
    }
    setError("");
    setPhase("credibility");
  }

  // ── Step: Credibility generation ──
  async function handleGenerateCredibility() {
    const hasAnyField = credClientsHelped.trim() || credSpecificResult.trim() || credFrequency.trim() || credSurprise.trim();
    if (!hasAnyField) {
      setError("Please fill in at least one credential field.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await callStep("credibility", {
        credClientsHelped,
        credSpecificResult,
        credFrequency,
        credSurprise,
      });
      setCredibilitySuggestions(result.suggestions ?? []);
    } catch (e: any) {
      setError(e.message || "Failed to generate credibility suggestions.");
    }
    setLoading(false);
  }

  // ── Step: Credibility → Insights ──
  function handleCredibilityNext() {
    if (!selectedCredibility) {
      setError("Please select a credibility line before continuing.");
      return;
    }
    setError("");
    setPhase("insights");
  }

  // ── Opening: Generate more hooks ──
  async function handleGenerateMoreHooks() {
    setLoadingMoreHooks(true);
    try {
      const result = await callStep("hooks", {});
      if (result.hook_starters?.length) {
        setHookStarters(result.hook_starters);
      }
    } catch {
      // silently fail — hooks are optional
    }
    setLoadingMoreHooks(false);
  }

  // ── Video picker: open and fetch videos ──
  async function handleOpenVideoPicker() {
    setShowVideoPicker(true);
    if (memberVideos.length > 0) return;
    setLoadingVideos(true);
    setVideoPickerError("");
    try {
      const res = await fetch("/api/member/my-videos");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load videos");
      setMemberVideos(data.videos ?? []);
    } catch (e: any) {
      setVideoPickerError(e.message);
    }
    setLoadingVideos(false);
  }

  async function handleSelectVideo(video: { videoId: string; title: string }) {
    setNextVideoTitle(video.title);
    setNextVideoSelectedId(video.videoId);
    setNextVideoTranscript("");
    setShowVideoPicker(false);
    setVideoSearch("");
    setLoadingTranscript(true);
    try {
      const res = await fetch(`/api/youtube/video-transcript?videoId=${video.videoId}`);
      const data = await res.json();
      if (data.excerpt) setNextVideoTranscript(data.excerpt);
    } catch {
      // transcript is optional — no error shown
    }
    setLoadingTranscript(false);
  }

  function handleClearNextVideo() {
    setNextVideoTitle("");
    setNextVideoWhy("");
    setNextVideoTranscript("");
    setNextVideoSelectedId("");
  }

  // ── Step: Insights generation ──
  async function handleGenerateInsights() {
    setLoading(true);
    setError("");
    try {
      const selectedPoints = savedTalkingPoints
        .filter((c) => selectedTalkingPointIds.has(c.id))
        .map((c) => c.text);
      const result = await callStep("insights", {
        insightCount,
        selectedTalkingPoints: selectedPoints,
        sourceTheme: prefillData?.theme,
        viewerEmotion,
        viewerQuestion,
        viewerFear,
        viewerHope,
        clientStory,
      });
      setInsightSlots(result.insight_slots ?? []);
      const initial: Record<number, Record<string, string>> = {};
      (result.insight_slots ?? []).forEach((slot: InsightSlot) => {
        initial[slot.slot] = slot.drafts ?? { what: "", why: "", when: "", story: "", connection: "" };
      });
      setInsightAnswers(initial);
    } catch (e: any) {
      setError(e.message || "Failed to generate insight frameworks.");
    }
    setLoading(false);
  }

  // ── Step: Insights → Final assembly ──
  async function handleBuildFinalScript() {
    setLoading(true);
    setError("");
    try {
      const insightsText = insightSlots.map((slot) => {
        const a = insightAnswers[slot.slot] ?? {};
        return `Insight ${slot.slot} (${slot.label}):
- What: ${a.what || "(not provided)"}
- Why: ${a.why || "(not provided)"}
- When: ${a.when || "(not provided)"}
- Story: ${a.story || "(not provided)"}
- Connection: ${a.connection || "(not provided)"}`;
      }).join("\n\n");

      console.log("[ARC] ── Final step: all research fields being sent to AI ──", {
        "ANGLE — Conventional wisdom": conventionalWisdom || "(blank)",
        "ANGLE — Unique belief": uniqueAngle || "(blank)",
        "VIEWER — Emotion": viewerEmotion || "(blank)",
        "VIEWER — Question": viewerQuestion || "(blank)",
        "VIEWER — Fear": viewerFear || "(blank)",
        "VIEWER — Hope": viewerHope || "(blank)",
        "CRED — Clients helped": credClientsHelped || "(blank)",
        "CRED — Specific result": credSpecificResult || "(blank)",
        "CRED — Frequency": credFrequency || "(blank)",
        "CRED — Surprise fact": credSurprise || "(blank)",
        "CLIENT STORY": clientStory ? `${clientStory.slice(0, 80)}…` : "(blank)",
        "SELECTED OPENING (chars)": selectedPattern?.length ?? 0,
        "SELECTED BRIDGE (chars)": selectedBridge?.length ?? 0,
        "SELECTED CREDIBILITY (chars)": selectedCredibility?.length ?? 0,
        "NEXT VIDEO TITLE": nextVideoTitle || "(blank)",
        "NEXT VIDEO TRANSCRIPT": nextVideoTranscript ? `${nextVideoTranscript.length} chars` : "(none)",
        "SOURCE THEME": prefillData?.theme || "(none)",
      });
      const result = await callStep("final", {
        conventionalWisdom,
        uniqueAngle,
        viewerEmotion,
        viewerQuestion,
        viewerFear,
        viewerHope,
        selectedOpening: selectedPattern,
        selectedBridge,
        leadMagnetLine,
        credibility: selectedCredibility,
        credClientsHelped,
        credSpecificResult,
        credFrequency,
        credSurprise,
        clientStory,
        insights: insightsText,
        values: "",
        interests: "",
        nextVideoTitle,
        nextVideoWhy,
        nextVideoTranscript,
        sourceTheme: prefillData?.theme,
      });
      setFinalData(result);
      setRetentionSuggestions(result.retentionNotes ?? result.retention_suggestions ?? []);
      setPhase("done");

      // Auto-save to 30-day conversation history
      const scriptTitle = uploadData?.title || "ARC Script";
      const fullMarkdown = buildFullScriptMarkdown(result, scriptTitle);
      const savedMetadata: Record<string, any> = { videoTitle: uploadData?.title ?? null };
      if (isAdmin) {
        savedMetadata.inputSnapshot = {
          videoTitle: uploadData?.title ?? null,
          talkingPoints: uploadData?.talkingPoints ?? null,
          conventionalWisdom,
          uniqueAngle,
          viewerEmotion,
          viewerQuestion,
          viewerFear,
          viewerHope,
          credClientsHelped,
          credSpecificResult,
          credFrequency,
          credSurprise,
          selectedCredibility,
          clientStory,
          leadMagnetLine,
          nextVideoTitle,
          nextVideoWhy,
          prefillSource: prefillData
            ? { title: prefillData.title, theme: prefillData.theme ?? null, ideaId: prefillData.ideaId ?? null }
            : null,
        };
      }
      fetch("/api/ai-tools/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolType: "arc_script_builder",
          title: scriptTitle,
          messages: [
            {
              role: "assistant",
              content: fullMarkdown,
            },
          ],
          metadata: savedMetadata,
        }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d?.id) setConversationId(d.id);
          setRefreshCounter((n) => n + 1);
        })
        .catch(() => {});
    } catch (e: any) {
      setError(e.message || "Failed to assemble final script.");
    }
    setLoading(false);
  }

  async function handleCopy() {
    const text = buildFullScriptMarkdown(finalData, uploadData?.title || "");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function buildFullScriptText(): string {
    return buildFullScriptMarkdown(finalData, uploadData?.title || "");
  }

  async function handleSave() {
    const text = buildFullScriptText();
    if (!text) return;
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/ai-tools/save-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoTitle: uploadData?.title,
          scriptOutline: { fullScript: text, finalData, researchSummary: uploadData?.researchSummary },
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      if (prefillData?.ideaId) {
        fetch("/api/ai-tools/content-engine/delete-idea", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: prefillData.ideaId }),
        }).catch(() => {});
      }
    } catch {
      setSaveError("Failed to save. Please try again.");
    }
    setSaving(false);
  }

  function handleReset() {
    setPhase("upload");
    setPrefillData(null);
    setUploadData(null);
    setIntroPatterns([]);
    setExpertiseBridges([]);
    setHookStarters([]);
    setSelectedPattern("");
    setSelectedBridge("");
    setLeadMagnetLine("");
    setConventionalWisdom("");
    setUniqueAngle("");
    setViewerEmotion("");
    setViewerQuestion("");
    setViewerFear("");
    setViewerHope("");
    setCredClientsHelped("");
    setCredSpecificResult("");
    setCredFrequency("");
    setCredSurprise("");
    setClientStory("");
    setCredibilitySuggestions([]);
    setSelectedCredibility("");
    setInsightSlots([]);
    setInsightAnswers({});
    setNextVideoTitle("");
    setNextVideoWhy("");
    setNextVideoTranscript("");
    setNextVideoSelectedId("");
    setShowVideoPicker(false);
    setFinalData(null);
    setRetentionSuggestions([]);
    setError("");
  }

  // ─── Group intro patterns by subtype for CONTRADICTION ───
  const contradictionSubtypes = [
    "Validation Pivot", "Universal Flip", "Logic Trap", "Obvious Wrong", "Smart People Mistake",
  ];
  const contradictionBySubtype: Record<string, IntroPattern[]> = {};
  const otherPatterns: IntroPattern[] = [];
  introPatterns.forEach((p) => {
    if (p.subtype && contradictionSubtypes.includes(p.subtype)) {
      if (!contradictionBySubtype[p.subtype]) contradictionBySubtype[p.subtype] = [];
      contradictionBySubtype[p.subtype].push(p);
    } else {
      otherPatterns.push(p);
    }
  });

  const subtitle = phase === "upload" ? "Upload your research and set up your video details"
    : phase === "research" ? "Add supporting research (optional)"
    : phase === "opening_context" ? "Tell the AI about your viewer's journey"
    : phase === "opening" ? "Select your opening pattern and expertise bridge"
    : phase === "credibility" ? "Generate and choose your credibility signal"
    : phase === "insights" ? "Build your insight frameworks"
    : phase === "done" ? "Your ARC Script is ready"
    : "Assembling your script…";

  const placeholders = getNichePlaceholders(niche);

  return (
    <div>
      <div className="mb-6">
        <Link href={basePath} className="flex items-center gap-1.5 text-xs text-[#1e2a38]/50 hover:text-[#3dc3ff] transition-colors mb-3">
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          Back to AI Tools
        </Link>
        <h1 className="text-2xl font-bold text-[#1e2a38]">🎬 ARC Script Builder</h1>
        <p className="text-sm text-[#1e2a38]/50">{subtitle}</p>
      </div>

      {usage && <UsageBanner percentUsed={usage.percentUsed} resetsAt={usage.resetsAt} />}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── RECENT SCRIPTS ── */}
      {phase === "upload" && (
        <RecentConversations
          toolType="arc_script_builder"
          label="Recent Scripts"
          emptyLabel="No scripts saved in the last 30 days."
          refreshTrigger={refreshCounter}
        />
      )}

      {/* ── UPLOAD PHASE (normal flow) ── */}
      {phase === "upload" && (
        isLocked ? (
          <div className="text-center py-10 space-y-3">
            <p className="text-4xl">🔒</p>
            <p className="font-semibold text-[#1e2a38]">Monthly limit reached</p>
            <p className="text-sm text-[#1e2a38]/60">
              Your AI usage cap resets on <span className="font-medium">{usage?.resetsAt}</span>.
              Contact support if you need an extension.
            </p>
          </div>
        ) : (
          <ArcScriptUploadPhase
            onStartBuilding={handleStartBuilding}
            cap={usage?.cap ? parseFloat(usage.cap) : 15}
            openingContext={{
              conventionalWisdom,
              uniqueAngle,
              viewerEmotion,
              viewerQuestion,
              viewerFear,
              viewerHope,
              placeholders: { before: placeholders.before },
              onConventionalWisdomChange: setConventionalWisdom,
              onUniqueAngleChange: setUniqueAngle,
              onViewerEmotionChange: setViewerEmotion,
              onViewerQuestionChange: setViewerQuestion,
              onViewerFearChange: setViewerFear,
              onViewerHopeChange: setViewerHope,
            }}
          />
        )
      )}

      {/* ── RESEARCH PHASE (prefill flow) ── */}
      {phase === "research" && !loading && (
        isLocked ? (
          <div className="text-center py-10 space-y-3">
            <p className="text-4xl">🔒</p>
            <p className="font-semibold text-[#1e2a38]">Monthly limit reached</p>
            <p className="text-sm text-[#1e2a38]/60">
              Your AI usage cap resets on <span className="font-medium">{usage?.resetsAt}</span>.
            </p>
          </div>
        ) : (
          <ArcScriptUploadPhase
            onStartBuilding={handleResearchComplete}
            cap={usage?.cap ? parseFloat(usage.cap) : 15}
            prefillData={prefillData ?? undefined}
            onSkip={handleSkipResearch}
          />
        )
      )}

      {/* ── OPENING CONTEXT PHASE (prefill flow) ── */}
      {phase === "opening_context" && !loading && (
        <div className="space-y-5">
          {/* Title banner */}
          <div className="bg-[#3dc3ff]/8 border border-[#3dc3ff]/25 rounded-xl px-4 py-3">
            <p className="text-xs font-semibold text-[#3dc3ff] uppercase tracking-wider mb-0.5">Building script for</p>
            <p className="text-sm font-semibold text-[#1e2a38]">{uploadData?.title}</p>
          </div>

          <div className="space-y-5">
            <div>
              <h3 className="font-semibold text-[#1e2a38] mb-1">Opening Context</h3>
              <p className="text-sm text-[#1e2a38]/50">
                These details shape every opening pattern, insight, and bridge. All fields optional — but specificity is what makes the script sound like you.
              </p>
            </div>

            {/* Unique angle vs conventional wisdom */}
            <div className="bg-white border border-[#1e2a38]/10 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wider">Your Angle</p>
              <div>
                <label className="block text-xs font-medium text-[#1e2a38]/60 mb-1">What does conventional wisdom say about this topic?</label>
                <input
                  type="text"
                  value={conventionalWisdom}
                  onChange={(e) => setConventionalWisdom(e.target.value)}
                  placeholder="What does everyone else in your industry tell people about this?"
                  className="w-full bg-[#f8f8f6] border border-[#1e2a38]/15 rounded-lg px-3 py-2 text-sm text-[#1e2a38] focus:outline-none focus:border-[#3dc3ff]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1e2a38]/60 mb-1">What do YOU believe that's different?</label>
                <input
                  type="text"
                  value={uniqueAngle}
                  onChange={(e) => setUniqueAngle(e.target.value)}
                  placeholder="What have you seen with real clients that contradicts the standard advice?"
                  className="w-full bg-[#f8f8f6] border border-[#1e2a38]/15 rounded-lg px-3 py-2 text-sm text-[#1e2a38] focus:outline-none focus:border-[#3dc3ff]"
                />
              </div>
            </div>

            {/* Viewer emotional state */}
            <div className="bg-white border border-[#1e2a38]/10 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wider">Viewer's Internal State</p>
              <div>
                <label className="block text-xs font-medium text-[#1e2a38]/60 mb-1">What emotion is your viewer feeling right now?</label>
                <input type="text" value={viewerEmotion} onChange={(e) => setViewerEmotion(e.target.value)}
                  placeholder={placeholders.before}
                  className="w-full bg-[#f8f8f6] border border-[#1e2a38]/15 rounded-lg px-3 py-2 text-sm text-[#1e2a38] focus:outline-none focus:border-[#3dc3ff]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1e2a38]/60 mb-1">What question are they asking themselves that they won't say out loud?</label>
                <input type="text" value={viewerQuestion} onChange={(e) => setViewerQuestion(e.target.value)}
                  placeholder="e.g. Did we wait too long? Are we being greedy? Can we actually afford this?"
                  className="w-full bg-[#f8f8f6] border border-[#1e2a38]/15 rounded-lg px-3 py-2 text-sm text-[#1e2a38] focus:outline-none focus:border-[#3dc3ff]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1e2a38]/60 mb-1">What are they afraid this video might confirm?</label>
                <input type="text" value={viewerFear} onChange={(e) => setViewerFear(e.target.value)}
                  placeholder="e.g. That they missed their window, that they're not ready, that this will be harder than they thought"
                  className="w-full bg-[#f8f8f6] border border-[#1e2a38]/15 rounded-lg px-3 py-2 text-sm text-[#1e2a38] focus:outline-none focus:border-[#3dc3ff]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1e2a38]/60 mb-1">What do they secretly hope this video will tell them?</label>
                <input type="text" value={viewerHope} onChange={(e) => setViewerHope(e.target.value)}
                  placeholder="e.g. That it's not too late, that their situation is normal, that there's a clear next step"
                  className="w-full bg-[#f8f8f6] border border-[#1e2a38]/15 rounded-lg px-3 py-2 text-sm text-[#1e2a38] focus:outline-none focus:border-[#3dc3ff]"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-between pt-2">
              <button
                onClick={() => setPhase("research")}
                className="px-4 py-2 text-sm border border-[#1e2a38]/15 rounded-xl text-[#1e2a38]/60 hover:bg-[#1e2a38]/5 transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={handleGenerateOpening}
                className="px-6 py-2.5 text-sm font-semibold bg-[#3dc3ff] text-white rounded-xl hover:bg-[#3dc3ff]/90 transition-colors"
              >
                Generate Opening →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── LOADING ── */}
      {loading && (
        <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-6">
          <Spinner />
          <p className="text-center text-sm text-[#1e2a38]/40 mt-2">Generating with AI…</p>
        </div>
      )}

      {/* ── OPENING PHASE ── */}
      {phase === "opening" && !loading && (
        <div className="space-y-6">
          <StepHeader step={1} total={4} label="Choose Your Opening" />

          {/* ALL patterns + lead magnet + hooks — ONE card */}
          <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-5 space-y-6">
            <div>
              <h3 className="font-semibold text-[#1e2a38] mb-1">Opening Patterns</h3>
              <p className="text-xs text-[#1e2a38]/50">Pick the opening that fits this video best. Select one to carry through.</p>
            </div>

            {/* Contradiction patterns */}
            {contradictionSubtypes.some((st) => contradictionBySubtype[st]?.length) && (
              <div className="space-y-4">
                <p className="text-xs font-semibold text-[#1e2a38]/40 uppercase tracking-wider">Contradiction</p>
                {contradictionSubtypes.map((subtype) => {
                  const variants = contradictionBySubtype[subtype];
                  if (!variants?.length) return null;
                  return (
                    <div key={subtype}>
                      <p className="text-xs font-medium text-[#1e2a38]/50 mb-2">{subtype}</p>
                      <div className="space-y-2">
                        {variants.map((p, vi) => (
                          <button
                            key={vi}
                            onClick={() => { setSelectedPattern(p.script); setError(""); }}
                            className={`w-full text-left rounded-xl border px-4 py-3 text-sm leading-relaxed transition-all ${
                              selectedPattern === p.script
                                ? "border-[#3dc3ff] bg-[#3dc3ff]/5 text-[#1e2a38]"
                                : "border-[#1e2a38]/10 text-[#1e2a38]/70 hover:border-[#3dc3ff]/40"
                            }`}
                          >
                            <span className="text-xs text-[#1e2a38]/30 font-medium mr-2">Variation {p.variation}</span>
                            {p.script}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Other patterns (Confirmation, Empathy, Stakes) */}
            {otherPatterns.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-[#1e2a38]/8">
                <p className="text-xs font-semibold text-[#1e2a38]/40 uppercase tracking-wider mb-3">Other Openings</p>
                {otherPatterns.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => { setSelectedPattern(p.script); setError(""); }}
                    className={`w-full text-left rounded-xl border px-4 py-3 transition-all ${
                      selectedPattern === p.script
                        ? "border-[#3dc3ff] bg-[#3dc3ff]/5"
                        : "border-[#1e2a38]/10 hover:border-[#3dc3ff]/40"
                    }`}
                  >
                    <p className="text-xs font-semibold text-[#1e2a38]/50 mb-1">{p.name}</p>
                    <p className="text-sm text-[#1e2a38]/80 leading-relaxed">{p.script}</p>
                  </button>
                ))}
              </div>
            )}

            {/* Lead magnet line */}
            {leadMagnetLine && (
              <div className="pt-2 border-t border-[#1e2a38]/8">
                <p className="text-xs font-semibold text-[#3dc3ff] uppercase tracking-wider mb-1.5">Lead Magnet Line</p>
                <p className="text-sm text-[#1e2a38]/80 italic">{leadMagnetLine}</p>
                <p className="text-xs text-[#1e2a38]/40 mt-1">Goes right after your intro pattern (~4-5 seconds).</p>
              </div>
            )}

            {/* Hook starters */}
            {hookStarters.length > 0 && (
              <div className="pt-2 border-t border-[#1e2a38]/8">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-[#1e2a38]/40 uppercase tracking-wider">Hook Starter Ideas</p>
                  <button
                    onClick={handleGenerateMoreHooks}
                    disabled={loadingMoreHooks}
                    className="text-xs text-[#3dc3ff] hover:text-[#2bb0ec] font-medium disabled:opacity-40 transition-colors flex items-center gap-1"
                  >
                    {loadingMoreHooks ? (
                      <><ArrowPathIcon className="w-3 h-3 animate-spin" /> Generating…</>
                    ) : (
                      <><ArrowPathIcon className="w-3 h-3" /> Generate More</>
                    )}
                  </button>
                </div>
                <ul className="space-y-1.5">
                  {hookStarters.map((h, i) => (
                    <li key={i} className="text-sm text-[#1e2a38]/70 leading-relaxed">— {h}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Expertise Bridge picker — separate card */}
          <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-5">
            <h3 className="font-semibold text-[#1e2a38] mb-1">Expertise Bridge</h3>
            <p className="text-xs text-[#1e2a38]/50 mb-4">Goes AFTER the lead magnet — layers your credibility into the first insight naturally.</p>
            <div className="space-y-3">
              {expertiseBridges.map((bridge, i) => (
                <button
                  key={i}
                  onClick={() => { setSelectedBridge(bridge.script); setError(""); }}
                  className={`w-full text-left rounded-xl border px-4 py-4 transition-all ${
                    selectedBridge === bridge.script
                      ? "border-[#3dc3ff] bg-[#3dc3ff]/5"
                      : "border-[#1e2a38]/10 hover:border-[#3dc3ff]/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-xs font-bold text-[#1e2a38]/70 uppercase tracking-wide">{bridge.name}</p>
                    {selectedBridge === bridge.script && (
                      <CheckIcon className="w-4 h-4 text-[#3dc3ff] shrink-0" />
                    )}
                  </div>
                  <p className="text-sm text-[#1e2a38]/80 leading-relaxed mb-2">{bridge.script}</p>
                  <p className="text-xs text-[#1e2a38]/40 italic">Best when: {bridge.best_when}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <button
              onClick={() => prefillData ? setPhase("opening_context") : handleReset()}
              className="px-4 py-2 text-sm border border-[#1e2a38]/15 rounded-xl text-[#1e2a38]/60 hover:bg-[#1e2a38]/5 transition-colors"
            >
              {prefillData ? "← Back" : "Start Over"}
            </button>
            <button
              onClick={handleOpeningNext}
              className="px-6 py-2 text-sm font-semibold bg-[#3dc3ff] text-white rounded-xl hover:bg-[#3dc3ff]/90 transition-colors"
            >
              Continue to Credibility →
            </button>
          </div>
        </div>
      )}

      {/* ── CREDIBILITY PHASE ── */}
      {phase === "credibility" && !loading && (
        <div className="space-y-6">
          <StepHeader step={2} total={4} label="Build Your Credibility Signal" />

          <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-5 space-y-4">
            <div>
              <p className="text-sm text-[#1e2a38]/70 mb-1">Fill in what you know — at least one field required. The AI will use your exact words, not a paraphrase.</p>
              <p className="text-xs text-[#3dc3ff] font-medium">All numbers and specifics will appear verbatim in your script.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wider mb-1">How many clients/families/businesses have you helped?</label>
              <input
                type="text"
                value={credClientsHelped}
                onChange={(e) => setCredClientsHelped(e.target.value)}
                placeholder='e.g. "200+ families" or "closed 87 deals last year"'
                className="w-full border border-[#1e2a38]/15 rounded-lg px-3 py-2.5 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:border-[#3dc3ff]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wider mb-1">What's a specific result you've helped someone achieve?</label>
              <input
                type="text"
                value={credSpecificResult}
                onChange={(e) => setCredSpecificResult(e.target.value)}
                placeholder='e.g. "Helped a family save $40K by timing their sale right"'
                className="w-full border border-[#1e2a38]/15 rounded-lg px-3 py-2.5 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:border-[#3dc3ff]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wider mb-1">What's a stat about how often you do this work?</label>
              <input
                type="text"
                value={credFrequency}
                onChange={(e) => setCredFrequency(e.target.value)}
                placeholder='e.g. "We close a deal every 6 days"'
                className="w-full border border-[#1e2a38]/15 rounded-lg px-3 py-2.5 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:border-[#3dc3ff]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wider mb-1">What would surprise someone about your track record?</label>
              <input
                type="text"
                value={credSurprise}
                onChange={(e) => setCredSurprise(e.target.value)}
                placeholder='e.g. "22 years in Calgary real estate, started before the 2008 crash"'
                className="w-full border border-[#1e2a38]/15 rounded-lg px-3 py-2.5 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:border-[#3dc3ff]"
              />
            </div>
            <button
              onClick={handleGenerateCredibility}
              disabled={loading || !(credClientsHelped.trim() || credSpecificResult.trim() || credFrequency.trim() || credSurprise.trim())}
              className="px-5 py-2 text-sm font-semibold bg-[#1e2a38] text-white rounded-xl hover:bg-[#1e2a38]/80 disabled:opacity-50 transition-colors"
            >
              Generate Suggestions
            </button>
          </div>

          {credibilitySuggestions.length > 0 && (
            <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-5">
              <h3 className="font-semibold text-[#1e2a38] mb-4">Choose a Credibility Line</h3>
              <div className="space-y-3">
                {credibilitySuggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => { setSelectedCredibility(s.line); setError(""); }}
                    className={`w-full text-left rounded-xl border px-4 py-4 transition-all ${
                      selectedCredibility === s.line
                        ? "border-[#3dc3ff] bg-[#3dc3ff]/5"
                        : "border-[#1e2a38]/10 hover:border-[#3dc3ff]/40"
                    }`}
                  >
                    <p className="text-sm text-[#1e2a38] leading-relaxed mb-1">{s.line}</p>
                    <p className="text-xs text-[#1e2a38]/40 italic">Placement: {s.placement}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-between">
            <button onClick={() => setPhase("opening")} className="px-4 py-2 text-sm border border-[#1e2a38]/15 rounded-xl text-[#1e2a38]/60 hover:bg-[#1e2a38]/5 transition-colors">
              ← Back
            </button>
            <button
              onClick={handleCredibilityNext}
              disabled={!selectedCredibility}
              className="px-6 py-2 text-sm font-semibold bg-[#3dc3ff] text-white rounded-xl hover:bg-[#3dc3ff]/90 disabled:opacity-40 transition-colors"
            >
              Continue to Insights →
            </button>
          </div>
        </div>
      )}

      {/* ── INSIGHTS PHASE ── */}
      {phase === "insights" && !loading && (
        <div className="space-y-6">
          <StepHeader step={3} total={4} label="Build Your Insights" />

          {insightSlots.length === 0 ? (
            <div className="space-y-4">
              {/* Talking points from the launched Content Engine idea */}
              <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-5">
                {!prefillData ? (
                  <>
                    <p className="text-sm font-semibold text-[#1e2a38] mb-1">Talking points</p>
                    <p className="text-sm text-[#1e2a38]/50 italic">
                      Start from a Content Engine idea to get pre-loaded talking points, or fill in your insights manually below.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-[#1e2a38] mb-0.5">
                      Talking points
                    </p>
                    <p className="text-xs text-[#1e2a38]/40 mb-4">
                      From: <span className="font-medium text-[#1e2a38]/60">{prefillData.title}</span>
                      {prefillData.theme && (
                        <span className="ml-2 bg-[#3dc3ff]/10 text-[#3dc3ff] text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                          {prefillData.theme}
                        </span>
                      )}
                      {" "}— uncheck any you don&apos;t want to use.
                    </p>
                    <div className="space-y-2">
                      {savedTalkingPoints.map((card) => (
                        <button
                          key={card.id}
                          onClick={() => toggleTalkingPoint(card.id)}
                          className={`w-full text-left flex items-start gap-3 p-3 rounded-xl border transition-all ${
                            selectedTalkingPointIds.has(card.id)
                              ? "border-[#3dc3ff] bg-[#3dc3ff]/5"
                              : "border-[#1e2a38]/10 bg-white hover:bg-[#f1f1ef]"
                          }`}
                        >
                          <div className={`mt-0.5 w-4 h-4 flex-shrink-0 rounded border flex items-center justify-center ${
                            selectedTalkingPointIds.has(card.id) ? "bg-[#3dc3ff] border-[#3dc3ff]" : "border-[#1e2a38]/30"
                          }`}>
                            {selectedTalkingPointIds.has(card.id) && (
                              <CheckIcon className="w-3 h-3 text-white" />
                            )}
                          </div>
                          <p className="text-sm text-[#1e2a38] leading-snug">{card.text}</p>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Client story bank */}
              <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-5">
                <p className="text-sm font-semibold text-[#1e2a38] mb-0.5">Client Story Bank</p>
                <p className="text-xs text-[#1e2a38]/50 mb-3">
                  Include a name (real or changed), a specific situation, a moment where something shifted, and what happened. 3–5 sentences. Leave blank to get placeholder text you can fill in later.
                </p>
                <textarea
                  rows={4}
                  value={clientStory}
                  onChange={(e) => setClientStory(e.target.value)}
                  placeholder={'e.g. Mark and Dana came to us after sitting on the fence for 2 years. Their rent had gone up twice. They thought they needed 20% down. When we showed them the math on 5% down vs waiting, they realized waiting was costing them $800/month in lost equity. They closed 6 weeks later.'}
                  className="w-full border border-[#1e2a38]/15 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/25 focus:outline-none focus:border-[#3dc3ff] resize-none"
                />
                {!clientStory.trim() && (
                  <p className="text-xs text-amber-600/70 mt-1.5">If left blank, the AI will write [INSERT YOUR STORY HERE] placeholders — never a made-up generic story.</p>
                )}
              </div>

              {/* Count selector + generate button */}
              <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-5">
                <p className="text-sm text-[#1e2a38]/70 mb-4">
                  How many insights will this video cover?
                </p>
                <div className="flex items-center gap-3 mb-5">
                  {[3, 5, 7].map((n) => (
                    <button
                      key={n}
                      onClick={() => setInsightCount(n)}
                      className={`w-10 h-10 rounded-xl font-semibold text-sm transition-all ${
                        insightCount === n
                          ? "bg-[#3dc3ff] text-white"
                          : "bg-[#1e2a38]/5 text-[#1e2a38]/60 hover:bg-[#1e2a38]/10"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleGenerateInsights}
                  className="px-5 py-2 text-sm font-semibold bg-[#1e2a38] text-white rounded-xl hover:bg-[#1e2a38]/80 transition-colors"
                >
                  Build Insights →
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {insightSlots.map((slot) => (
                <div key={slot.slot} className="bg-white border border-[#1e2a38]/10 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 rounded-full bg-[#1e2a38] text-white text-xs flex items-center justify-center font-bold">
                      {slot.slot}
                    </div>
                    <p className="font-semibold text-[#1e2a38] text-sm">{slot.label}</p>
                  </div>
                  <div className="space-y-3">
                    {(["what", "why", "when", "story", "connection"] as const).map((field) => {
                      const editKey = `${slot.slot}-${field}`;
                      const isEditing = editingField === editKey;
                      const value = insightAnswers[slot.slot]?.[field] ?? "";
                      const fieldLabel = field === "connection" ? "What this means" : field.charAt(0).toUpperCase() + field.slice(1);
                      return (
                        <div key={field}>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wider">
                              {fieldLabel}
                            </label>
                            {!isEditing && (
                              <span className="text-[10px] text-[#1e2a38]/25 select-none">click to edit</span>
                            )}
                          </div>
                          {isEditing ? (
                            <>
                              {slot.prompts[field] && (
                                <p className="text-xs text-[#1e2a38]/40 italic mb-1">{slot.prompts[field]}</p>
                              )}
                              <textarea
                                autoFocus
                                rows={field === "story" ? 4 : 2}
                                value={value}
                                onChange={(e) => {
                                  setInsightAnswers((prev) => ({
                                    ...prev,
                                    [slot.slot]: { ...(prev[slot.slot] ?? {}), [field]: e.target.value },
                                  }));
                                }}
                                onBlur={() => setEditingField(null)}
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") setEditingField(null);
                                }}
                                className="w-full border border-[#3dc3ff] rounded-lg px-3 py-2 text-sm text-[#1e2a38] focus:outline-none resize-none"
                              />
                            </>
                          ) : (
                            <div
                              onClick={() => setEditingField(editKey)}
                              className="cursor-text rounded-lg px-3 py-2 text-sm text-[#1e2a38] leading-relaxed min-h-[40px] hover:bg-[#3dc3ff]/5 hover:ring-1 hover:ring-[#3dc3ff]/20 transition-all"
                            >
                              {value ? (
                                <span className="whitespace-pre-wrap">{value}</span>
                              ) : (
                                <span className="text-[#1e2a38]/25 italic">Click to add…</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {insightSlots.length > 0 && (
            <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-5 space-y-4">
              <div>
                <p className="text-sm font-semibold text-[#1e2a38] mb-0.5">Next Video Push</p>
                <p className="text-xs text-[#1e2a38]/50">
                  The AI will write a bridge that flows naturally from this video into your next one — not a generic "check out my other video."
                </p>
              </div>

              {/* Title field + Choose from my videos */}
              <div>
                <label className="block text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wider mb-1">
                  What video are you pushing viewers to next?
                </label>
                {nextVideoSelectedId ? (
                  <div className="flex items-center gap-2 bg-[#3dc3ff]/5 border border-[#3dc3ff]/20 rounded-lg px-3 py-2">
                    <span className="flex-1 text-sm text-[#1e2a38] truncate">{nextVideoTitle}</span>
                    {loadingTranscript && <span className="text-xs text-[#1e2a38]/40 animate-pulse">Loading transcript…</span>}
                    <button onClick={handleClearNextVideo} className="text-[#1e2a38]/40 hover:text-[#1e2a38] text-sm flex-shrink-0">✕</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={nextVideoTitle}
                      onChange={(e) => setNextVideoTitle(e.target.value)}
                      placeholder="e.g. Why renting out your home if it doesn't sell is riskier than you think"
                      className="flex-1 border border-[#1e2a38]/10 rounded-lg px-3 py-2 text-sm text-[#1e2a38] placeholder-[#1e2a38]/25 focus:outline-none focus:border-[#3dc3ff] transition-colors"
                    />
                    <button
                      onClick={handleOpenVideoPicker}
                      className="flex-shrink-0 text-xs font-medium border border-[#1e2a38]/15 text-[#1e2a38]/60 hover:text-[#3dc3ff] hover:border-[#3dc3ff]/40 px-3 py-2 rounded-lg transition-colors whitespace-nowrap"
                    >
                      Choose from my videos
                    </button>
                  </div>
                )}
              </div>

              {/* Video picker panel */}
              {showVideoPicker && (
                <div className="border border-[#1e2a38]/10 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-[#f8f8f6] border-b border-[#1e2a38]/8">
                    <p className="text-xs font-semibold text-[#1e2a38]/60">Your recent videos</p>
                    <button onClick={() => setShowVideoPicker(false)} className="text-[#1e2a38]/40 hover:text-[#1e2a38] text-sm">✕</button>
                  </div>
                  <div className="p-2">
                    <input
                      type="text"
                      value={videoSearch}
                      onChange={(e) => setVideoSearch(e.target.value)}
                      placeholder="Search by title…"
                      className="w-full border border-[#1e2a38]/10 rounded-lg px-3 py-2 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:border-[#3dc3ff] mb-2"
                    />
                    {loadingVideos && <p className="text-center text-xs text-[#1e2a38]/40 py-4 animate-pulse">Loading your videos…</p>}
                    {videoPickerError && <p className="text-center text-xs text-red-500 py-3">{videoPickerError}</p>}
                    {!loadingVideos && !videoPickerError && memberVideos.length === 0 && (
                      <p className="text-center text-xs text-[#1e2a38]/40 py-3">No videos found. Make sure your YouTube channel is set in your profile.</p>
                    )}
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {memberVideos
                        .filter((v) => !videoSearch || v.title.toLowerCase().includes(videoSearch.toLowerCase()))
                        .map((v) => (
                          <button
                            key={v.videoId}
                            onClick={() => handleSelectVideo(v)}
                            className="w-full text-left px-3 py-2 text-sm text-[#1e2a38]/80 hover:bg-[#3dc3ff]/5 hover:text-[#1e2a38] rounded-lg transition-colors truncate"
                          >
                            {v.title}
                          </button>
                        ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Transcript excerpt (read-only) */}
              {nextVideoTranscript && (
                <div className="bg-[#f8f8f6] rounded-lg p-3">
                  <p className="text-xs font-semibold text-[#1e2a38]/40 uppercase tracking-wider mb-1">Opening transcript (first 30 sec)</p>
                  <p className="text-xs text-[#1e2a38]/60 leading-relaxed line-clamp-4">{nextVideoTranscript}</p>
                  <p className="text-[10px] text-[#3dc3ff] mt-1">AI will use this to write a natural bridge into the next video</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wider mb-1">
                  Why should they watch it? (1–2 sentences)
                </label>
                <textarea
                  rows={2}
                  value={nextVideoWhy}
                  onChange={(e) => setNextVideoWhy(e.target.value)}
                  placeholder="e.g. Because most sellers think holding makes them safe — this video unpacks why that plan has changed."
                  className="w-full border border-[#1e2a38]/10 rounded-lg px-3 py-2 text-sm text-[#1e2a38] placeholder-[#1e2a38]/25 focus:outline-none focus:border-[#3dc3ff] resize-none transition-colors"
                />
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-between">
            <button onClick={() => setPhase("credibility")} className="px-4 py-2 text-sm border border-[#1e2a38]/15 rounded-xl text-[#1e2a38]/60 hover:bg-[#1e2a38]/5 transition-colors">
              ← Back
            </button>
            {insightSlots.length > 0 && (
              <button
                onClick={handleBuildFinalScript}
                disabled={loading}
                className="px-6 py-2 text-sm font-semibold bg-[#3dc3ff] text-white rounded-xl hover:bg-[#3dc3ff]/90 disabled:opacity-40 transition-colors"
              >
                Build Final Script →
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── DONE PHASE ── */}
      {phase === "done" && !loading && finalData && (
        <div className="space-y-6">
          <StepHeader step={4} total={4} label="Your ARC Script is Ready" />

          {/* ── Flowing script display ─────────────────────────────────────── */}
          {(finalData.script || finalData.script_outline) && (
            <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-5">
              {finalData.script ? (
                // New format: flowing monologue with inline cues
                <div className="text-sm text-[#1e2a38]/85 leading-relaxed whitespace-pre-wrap font-mono">
                  {finalData.script.split(/(\[(?:STORY CUE|CALLBACK|ON SCREEN):[^\]]*\])/g).map((part: string, i: number) => {
                    if (/^\[STORY CUE:/i.test(part)) {
                      return (
                        <span key={i} className="inline-block bg-amber-50 border border-amber-200 text-amber-700 rounded px-2 py-0.5 text-xs font-medium not-italic my-0.5">
                          {part}
                        </span>
                      );
                    }
                    if (/^\[CALLBACK:/i.test(part)) {
                      return (
                        <span key={i} className="inline-block bg-violet-50 border border-violet-200 text-violet-700 rounded px-2 py-0.5 text-xs font-medium not-italic my-0.5">
                          {part}
                        </span>
                      );
                    }
                    if (/^\[ON SCREEN:/i.test(part)) {
                      return (
                        <span key={i} className="inline-block bg-blue-50 border border-blue-200 text-[#3dc3ff]/90 rounded px-2 py-0.5 text-xs font-medium not-italic my-0.5">
                          {part}
                        </span>
                      );
                    }
                    return <span key={i}>{part}</span>;
                  })}
                </div>
              ) : (
                // Legacy format: labelled outline sections
                (() => {
                  const s = finalData.script_outline;
                  return (
                    <div className="space-y-5">
                      {s.opening && (
                        <div>
                          <p className="text-xs font-bold text-[#3dc3ff] uppercase tracking-wider mb-2">Opening</p>
                          <p className="text-sm text-[#1e2a38]/80 leading-relaxed whitespace-pre-wrap">{s.opening}</p>
                        </div>
                      )}
                      {s.insights?.map((ins: any, i: number) => (
                        <div key={i} className="border-t border-[#1e2a38]/5 pt-4">
                          <p className="text-xs font-bold text-[#1e2a38]/50 uppercase tracking-wider mb-3">Insight {i + 1}</p>
                          <div className="space-y-2">
                            {ins.what && <div><span className="text-xs font-semibold text-[#1e2a38]/40 mr-2">WHAT</span><span className="text-sm text-[#1e2a38]/80">{ins.what}</span></div>}
                            {ins.why && <div><span className="text-xs font-semibold text-[#1e2a38]/40 mr-2">WHY</span><span className="text-sm text-[#1e2a38]/80">{ins.why}</span></div>}
                            {ins.when && <div><span className="text-xs font-semibold text-[#1e2a38]/40 mr-2">WHEN</span><span className="text-sm text-[#1e2a38]/80">{ins.when}</span></div>}
                            {ins.story && <div><span className="text-xs font-semibold text-[#1e2a38]/40 mr-2">STORY</span><span className="text-sm text-[#1e2a38]/80">{ins.story}</span></div>}
                            {ins.connection && <div><span className="text-xs font-semibold text-[#1e2a38]/40 mr-2">CONNECTION</span><span className="text-sm text-[#1e2a38]/80">{ins.connection}</span></div>}
                            {ins.visual_prompt && <div className="bg-[#f1f1ef] rounded-lg px-3 py-2 text-xs text-[#1e2a38]/60 mt-1">📷 {ins.visual_prompt}</div>}
                            {ins.curiosity_bridge && <div className="text-xs text-[#3dc3ff] italic mt-1">→ {ins.curiosity_bridge}</div>}
                          </div>
                        </div>
                      ))}
                      {s.lead_magnet_2 && (
                        <div className="border-t border-[#1e2a38]/5 pt-4">
                          <p className="text-xs font-bold text-[#3dc3ff] uppercase tracking-wider mb-2">Lead Magnet #2</p>
                          <p className="text-sm text-[#1e2a38]/80">{s.lead_magnet_2}</p>
                        </div>
                      )}
                      {s.closing && (
                        <div className="border-t border-[#1e2a38]/5 pt-4">
                          <p className="text-xs font-bold text-[#3dc3ff] uppercase tracking-wider mb-2">Closing</p>
                          <p className="text-sm text-[#1e2a38]/80 whitespace-pre-wrap">{s.closing}</p>
                        </div>
                      )}
                    </div>
                  );
                })()
              )}

              {/* Cue legend for new format */}
              {finalData.script && (
                <div className="mt-4 pt-4 border-t border-[#1e2a38]/5 flex flex-wrap gap-3 text-xs text-[#1e2a38]/50">
                  <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-200" />Story Cue</span>
                  <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-violet-200" />Story Callback</span>
                  <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-200" />On Screen</span>
                </div>
              )}
            </div>
          )}

          {/* ── Checklist (collapsible) ────────────────────────────────────── */}
          {finalData.checklist && (
            <details className="bg-white border border-[#1e2a38]/10 rounded-2xl p-5 group">
              <summary className="font-semibold text-[#1e2a38] cursor-pointer list-none flex items-center justify-between">
                ARC Script Checklist
                <span className="text-xs text-[#1e2a38]/40 group-open:hidden">▼ Show</span>
                <span className="text-xs text-[#1e2a38]/40 hidden group-open:inline">▲ Hide</span>
              </summary>
              <div className="space-y-2 mt-4">
                {CHECKLIST_LABELS.map((item) => {
                  const pass = finalData.checklist[item.key];
                  return (
                    <div key={item.key} className="flex items-center gap-3">
                      <span className={`text-sm font-bold ${pass ? "text-green-500" : "text-red-400"}`}>
                        {pass ? "✓" : "✗"}
                      </span>
                      <span className="text-sm text-[#1e2a38]/70">{item.label}</span>
                    </div>
                  );
                })}
              </div>
            </details>
          )}

          {/* ── Retention Analysis (collapsible) ──────────────────────────── */}
          {retentionSuggestions.length > 0 && (
            <details className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <summary className="font-semibold text-amber-800 cursor-pointer list-none flex items-center justify-between">
                Retention Analysis
                <span className="text-xs text-amber-500">▼ Show</span>
              </summary>
              <div className="space-y-4 mt-4">
                {retentionSuggestions.map((s, i) => (
                  <div key={i} className="space-y-1">
                    <p className="text-xs font-bold text-amber-600 uppercase tracking-wider">{s.timestamp ?? s.location}</p>
                    <p className="text-sm text-amber-800"><span className="font-semibold">Issue:</span> {s.issue}</p>
                    <p className="text-sm text-amber-800"><span className="font-semibold">Fix:</span> {s.fix}</p>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Actions */}
          <div className="flex gap-3 flex-wrap">
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
              onClick={handleReset}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-[#1e2a38]/15 rounded-xl hover:bg-[#1e2a38]/5 transition-colors text-[#1e2a38]"
            >
              <ArrowPathIcon className="w-4 h-4" />
              Build Another Script
            </button>
            {saveError && <p className="text-xs text-red-500 self-center">{saveError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

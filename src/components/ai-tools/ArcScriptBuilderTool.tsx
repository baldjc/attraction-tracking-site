"use client";

import { useState, useEffect } from "react";
import { ArrowLeftIcon, ArrowPathIcon, CheckIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import ArcScriptUploadPhase from "@/components/ai-tools/ArcScriptUploadPhase";
import RecentConversations from "@/components/ai-tools/RecentConversations";

interface Props {
  basePath: string;
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
}

interface RetentionSuggestion {
  location: string;
  issue: string;
  fix: string;
}

interface ChecklistItem {
  key: string;
  label: string;
}

const CHECKLIST_LABELS: ChecklistItem[] = [
  { key: "opening_length_ok", label: "Opening is ~20-25 seconds" },
  { key: "opening_approves_click", label: "Opening approves the click" },
  { key: "expertise_bridge_after_lead_magnet", label: "Expertise bridge comes after lead magnet" },
  { key: "credibility_natural", label: "Credibility woven in naturally" },
  { key: "lead_magnet_3_times", label: "Lead magnet mentioned 3 times" },
  { key: "value_loops_correct", label: "Each insight follows the Value Loop" },
  { key: "no_how_to_implement", label: "No 'how to implement' anywhere" },
  { key: "connection_phrases_4_5", label: "4-5 connection phrases integrated" },
  { key: "values_peppered", label: "2-3 values/interests peppered in" },
  { key: "curiosity_bridges", label: "Curiosity bridges between sections" },
  { key: "grade_5_language", label: "Grade 5 reading level" },
  { key: "visual_prompts_identified", label: "Visual prompts identified" },
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

export default function ArcScriptBuilderTool({ basePath }: Props) {
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

  // Step 2: Opening form fields (used in both upload phase and opening_context phase)
  const [uniqueAngle, setUniqueAngle] = useState("");
  const [beforeFeeling, setBeforeFeeling] = useState("");
  const [afterFeeling, setAfterFeeling] = useState("");

  // Step 3: Credibility
  const [credentialInput, setCredentialInput] = useState("");
  const [credibilitySuggestions, setCredibilitySuggestions] = useState<CredibilitySuggestion[]>([]);
  const [selectedCredibility, setSelectedCredibility] = useState("");

  // Step 4: Insights
  const [insightCount, setInsightCount] = useState(3);
  const [insightSlots, setInsightSlots] = useState<InsightSlot[]>([]);
  const [insightAnswers, setInsightAnswers] = useState<Record<number, Record<string, string>>>({});

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
        uniqueAngle,
        beforeFeeling,
        afterFeeling,
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
        uniqueAngle,
        beforeFeeling,
        afterFeeling,
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
    if (!credentialInput.trim()) {
      setError("Please enter a credential or proof point.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await callStep("credibility", {
        credentialInput,
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

  // ── Step: Insights generation ──
  async function handleGenerateInsights() {
    setLoading(true);
    setError("");
    try {
      const result = await callStep("insights", { insightCount });
      setInsightSlots(result.insight_slots ?? []);
      const initial: Record<number, Record<string, string>> = {};
      (result.insight_slots ?? []).forEach((slot: InsightSlot) => {
        initial[slot.slot] = { what: "", why: "", when: "", story: "", connection: "" };
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

      const result = await callStep("final", {
        uniqueAngle,
        selectedOpening: selectedPattern,
        selectedBridge,
        leadMagnetLine,
        credibility: selectedCredibility,
        insights: insightsText,
        values: "",
        interests: "",
      });
      setFinalData(result);
      setRetentionSuggestions(result.retention_suggestions ?? []);
      setPhase("done");

      // Auto-save to 30-day conversation history
      fetch("/api/ai-tools/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolType: "arc_script_builder",
          title: uploadData?.title || "ARC Script",
          messages: [
            {
              role: "assistant",
              content: `Script complete: ${uploadData?.title || "ARC Script"}`,
            },
          ],
          metadata: { videoTitle: uploadData?.title ?? null },
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
    const text = buildFullScriptText();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function buildFullScriptText(): string {
    if (!finalData?.script_outline) return "";
    const s = finalData.script_outline;
    const lines: string[] = [];
    lines.push(`ARC Script: ${uploadData?.title || ""}`, "");
    lines.push("== OPENING ==", s.opening || "", "");
    if (s.insights?.length) {
      s.insights.forEach((ins: any, i: number) => {
        lines.push(`== INSIGHT ${i + 1} ==`);
        if (ins.what) lines.push(`WHAT: ${ins.what}`);
        if (ins.why) lines.push(`WHY: ${ins.why}`);
        if (ins.when) lines.push(`WHEN: ${ins.when}`);
        if (ins.story) lines.push(`STORY: ${ins.story}`);
        if (ins.connection) lines.push(`CONNECTION: ${ins.connection}`);
        if (ins.curiosity_bridge) lines.push(`BRIDGE: ${ins.curiosity_bridge}`);
        if (ins.visual_prompt) lines.push(`[VISUAL: ${ins.visual_prompt}]`);
        lines.push("");
      });
    }
    if (s.lead_magnet_2) lines.push(`== LEAD MAGNET #2 ==`, s.lead_magnet_2, "");
    if (s.closing) lines.push("== CLOSING ==", s.closing, "");
    return lines.join("\n");
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
    setSelectedPattern("");
    setSelectedBridge("");
    setLeadMagnetLine("");
    setUniqueAngle("");
    setBeforeFeeling("");
    setAfterFeeling("");
    setCredentialInput("");
    setCredibilitySuggestions([]);
    setSelectedCredibility("");
    setInsightSlots([]);
    setInsightAnswers({});
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
      <div className="mb-6 flex items-center gap-3">
        <Link href={basePath} className="p-1.5 rounded-lg hover:bg-[#1e2a38]/10 transition-colors">
          <ArrowLeftIcon className="w-5 h-5 text-[#1e2a38]/50" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[#1e2a38]">ARC Script Builder</h1>
          <p className="text-sm text-[#1e2a38]/50">{subtitle}</p>
        </div>
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
              uniqueAngle,
              beforeFeeling,
              afterFeeling,
              placeholders,
              onUniqueAngleChange: setUniqueAngle,
              onBeforeFeelingChange: setBeforeFeeling,
              onAfterFeelingChange: setAfterFeeling,
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

          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-[#1e2a38] mb-1">Opening Context</h3>
              <p className="text-sm text-[#1e2a38]/50">
                These details help the AI write an opening that speaks directly to your viewer's situation.
                All fields are optional but the more you add, the better the output.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1e2a38]/60 mb-1">Unique angle or hook for this video</label>
              <input
                type="text"
                value={uniqueAngle}
                onChange={(e) => setUniqueAngle(e.target.value)}
                placeholder={placeholders.uniqueAngle}
                className="w-full bg-white border border-[#1e2a38]/15 rounded-lg px-3 py-2 text-sm text-[#1e2a38] focus:outline-none focus:border-[#3dc3ff]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#1e2a38]/60 mb-1">How viewer feels BEFORE watching</label>
                <input
                  type="text"
                  value={beforeFeeling}
                  onChange={(e) => setBeforeFeeling(e.target.value)}
                  placeholder={placeholders.before}
                  className="w-full bg-white border border-[#1e2a38]/15 rounded-lg px-3 py-2 text-sm text-[#1e2a38] focus:outline-none focus:border-[#3dc3ff]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1e2a38]/60 mb-1">How viewer feels AFTER watching</label>
                <input
                  type="text"
                  value={afterFeeling}
                  onChange={(e) => setAfterFeeling(e.target.value)}
                  placeholder={placeholders.after}
                  className="w-full bg-white border border-[#1e2a38]/15 rounded-lg px-3 py-2 text-sm text-[#1e2a38] focus:outline-none focus:border-[#3dc3ff]"
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

          {/* CONTRADICTION patterns */}
          {contradictionSubtypes.some((st) => contradictionBySubtype[st]?.length) && (
            <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-5">
              <h3 className="font-semibold text-[#1e2a38] mb-1">Contradiction Patterns</h3>
              <p className="text-xs text-[#1e2a38]/50 mb-4">Start with the opposite of what the viewer expects.</p>
              <div className="space-y-4">
                {contradictionSubtypes.map((subtype) => {
                  const variants = contradictionBySubtype[subtype];
                  if (!variants?.length) return null;
                  return (
                    <div key={subtype}>
                      <p className="text-xs font-semibold text-[#1e2a38]/60 uppercase tracking-wider mb-2">{subtype}</p>
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
            </div>
          )}

          {/* Other patterns */}
          {otherPatterns.length > 0 && (
            <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-5">
              <h3 className="font-semibold text-[#1e2a38] mb-4">Other Opening Patterns</h3>
              <div className="space-y-2">
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
            </div>
          )}

          {/* Lead magnet line */}
          {leadMagnetLine && (
            <div className="bg-[#3dc3ff]/5 border border-[#3dc3ff]/20 rounded-2xl p-5">
              <p className="text-xs font-semibold text-[#3dc3ff] uppercase tracking-wider mb-2">Generated Lead Magnet Line</p>
              <p className="text-sm text-[#1e2a38]/80 italic">{leadMagnetLine}</p>
              <p className="text-xs text-[#1e2a38]/40 mt-2">This line goes right after your intro pattern (~4-5 seconds).</p>
            </div>
          )}

          {/* Expertise Bridge picker */}
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

          {/* Hook starters */}
          {hookStarters.length > 0 && (
            <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-5">
              <p className="text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wider mb-2">Hook Starter Options</p>
              <ul className="space-y-1.5">
                {hookStarters.map((h, i) => (
                  <li key={i} className="text-sm text-[#1e2a38]/70 leading-relaxed">— {h}</li>
                ))}
              </ul>
            </div>
          )}

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

          <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-5">
            <p className="text-sm text-[#1e2a38]/70 mb-4">
              Enter a credential, result, or proof point. AI will generate 3 ways to weave it naturally into your script.
            </p>
            <textarea
              value={credentialInput}
              onChange={(e) => setCredentialInput(e.target.value)}
              rows={3}
              placeholder="e.g. I've helped 150+ families buy homes in Calgary over 8 years, closing $2M last month alone"
              className="w-full border border-[#1e2a38]/15 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:border-[#3dc3ff] resize-none"
            />
            <button
              onClick={handleGenerateCredibility}
              disabled={loading || !credentialInput.trim()}
              className="mt-3 px-5 py-2 text-sm font-semibold bg-[#1e2a38] text-white rounded-xl hover:bg-[#1e2a38]/80 disabled:opacity-50 transition-colors"
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
            <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-5">
              <p className="text-sm text-[#1e2a38]/70 mb-4">
                How many insights will this video cover?
              </p>
              <div className="flex items-center gap-3 mb-5">
                {[2, 3, 4, 5].map((n) => (
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
                Generate Insight Frameworks
              </button>
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
                    {(["what", "why", "when", "story", "connection"] as const).map((field) => (
                      <div key={field}>
                        <label className="block text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wider mb-1">
                          {field === "connection" ? "What this means" : field.charAt(0).toUpperCase() + field.slice(1)}
                        </label>
                        <p className="text-xs text-[#1e2a38]/40 italic mb-1">{slot.prompts[field]}</p>
                        <textarea
                          rows={field === "story" ? 3 : 2}
                          value={insightAnswers[slot.slot]?.[field] ?? ""}
                          onChange={(e) => {
                            setInsightAnswers((prev) => ({
                              ...prev,
                              [slot.slot]: { ...(prev[slot.slot] ?? {}), [field]: e.target.value },
                            }));
                          }}
                          placeholder="Your answer…"
                          className="w-full border border-[#1e2a38]/10 rounded-lg px-3 py-2 text-sm text-[#1e2a38] placeholder-[#1e2a38]/25 focus:outline-none focus:border-[#3dc3ff] resize-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
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

          {/* Script outline */}
          {finalData.script_outline && (() => {
            const s = finalData.script_outline;
            return (
              <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-5 space-y-5">
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
          })()}

          {/* Checklist */}
          {finalData.checklist && (
            <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-5">
              <h3 className="font-semibold text-[#1e2a38] mb-4">ARC Checklist</h3>
              <div className="space-y-2">
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
            </div>
          )}

          {/* Retention Analysis */}
          {retentionSuggestions.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <h3 className="font-semibold text-amber-800 mb-4">Retention Analysis</h3>
              <div className="space-y-4">
                {retentionSuggestions.map((s, i) => (
                  <div key={i} className="space-y-1">
                    <p className="text-xs font-bold text-amber-600 uppercase tracking-wider">{s.location}</p>
                    <p className="text-sm text-amber-800"><span className="font-semibold">Issue:</span> {s.issue}</p>
                    <p className="text-sm text-amber-800"><span className="font-semibold">Fix:</span> {s.fix}</p>
                  </div>
                ))}
              </div>
            </div>
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

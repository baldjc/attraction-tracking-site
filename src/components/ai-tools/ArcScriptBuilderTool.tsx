"use client";

import { useState, useEffect } from "react";
import { CheckIcon, ArrowLeftIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import Link from "next/link";

interface AvatarData {
  avatarName?: string;
  contentThemes?: string[];
}

interface Props {
  basePath: string;
}

const STEPS = [
  "Topic & Avatar",
  "Title",
  "Unique Approach",
  "Opening",
  "Credibility",
  "Review & Generate",
];

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex-1">
          <div className={`h-1.5 rounded-full transition-colors ${i <= step ? "bg-[#3dc3ff]" : "bg-[#1e2a38]/10"}`} />
          <p className={`text-xs mt-1.5 text-center leading-tight ${i === step ? "text-[#3dc3ff] font-semibold" : "text-[#1e2a38]/30"}`}>
            {STEPS[i]}
          </p>
        </div>
      ))}
    </div>
  );
}

interface OpeningOption {
  name: string;
  script: string;
}

interface ScriptOutline {
  opening: string;
  credibility: string;
  lead_magnet_1: string;
  insights: Array<{
    slot: number;
    what: string;
    why: string;
    when: string;
    story: string;
    connection: string;
    curiosity_bridge: string;
  }>;
  lead_magnet_2: string;
  closing: string;
  visual_prompts: string[];
  connection_phrases: Array<{ phrase: string; placement: string }>;
  values_placed: Array<{ value: string; placement: string }>;
}

interface Checklist {
  opening_length_ok: boolean;
  opening_approves_click: boolean;
  credibility_natural: boolean;
  lead_magnet_3_times: boolean;
  value_loops_correct: boolean;
  no_how_to_implement: boolean;
  connection_phrases_4_5: boolean;
  values_peppered: boolean;
  curiosity_bridges: boolean;
  grade_5_language: boolean;
  visual_prompts_identified: boolean;
}

const CHECKLIST_LABELS: Record<keyof Checklist, string> = {
  opening_length_ok: "Opening is ~20-25 seconds",
  opening_approves_click: "Opening approves the click",
  credibility_natural: "Credibility woven in naturally",
  lead_magnet_3_times: "Lead magnet mentioned 3 times",
  value_loops_correct: "Each insight follows the Value Loop",
  no_how_to_implement: "No 'how to implement'",
  connection_phrases_4_5: "4-5 connection phrases integrated",
  values_peppered: "Values/interests peppered in",
  curiosity_bridges: "Curiosity bridges between sections",
  grade_5_language: "Grade 5 reading level",
  visual_prompts_identified: "Visual prompts identified",
};

export default function ArcScriptBuilderTool({ basePath }: Props) {
  const [step, setStep] = useState(0);
  const [avatar, setAvatar] = useState<AvatarData | null>(null);

  const [topic, setTopic] = useState("");
  const [selectedTheme, setSelectedTheme] = useState("");
  const [title, setTitle] = useState("");
  const [uniqueAngle, setUniqueAngle] = useState("");
  const [beforeFeeling, setBeforeFeeling] = useState("");
  const [afterFeeling, setAfterFeeling] = useState("");
  const [selectedOpening, setSelectedOpening] = useState("");
  const [credentialInput, setCredentialInput] = useState("");
  const [values, setValues] = useState("");
  const [interests, setInterests] = useState("");

  const [openingOptions, setOpeningOptions] = useState<OpeningOption[]>([]);
  const [hookStarters, setHookStarters] = useState<string[]>([]);
  const [leadMagnetLine, setLeadMagnetLine] = useState("");
  const [credibilitySuggestions, setCredibilitySuggestions] = useState<Array<{ line: string; placement: string }>>([]);
  const [scriptOutline, setScriptOutline] = useState<ScriptOutline | null>(null);
  const [checklist, setChecklist] = useState<Checklist | null>(null);

  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/member/avatar").then((r) => r.json()).then(setAvatar).catch(() => {});
  }, []);

  const themes: string[] = Array.isArray(avatar?.contentThemes) ? (avatar!.contentThemes as string[]) : [];

  async function callAPI(stepName: string, extraData = {}) {
    setLoading(true);
    const allStepData = {
      topic, title, uniqueAngle, beforeFeeling, afterFeeling,
      selectedOpening, credentialInput, values, interests, ...extraData,
    };
    const res = await fetch("/api/ai-tools/arc-script-builder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: stepName, allStepData }),
    });
    const data = await res.json();
    setLoading(false);
    return data.result;
  }

  async function goToStep4() {
    const result = await callAPI("opening");
    if (result?.intro_patterns) setOpeningOptions(result.intro_patterns);
    if (result?.hook_starters) setHookStarters(result.hook_starters);
    if (result?.lead_magnet_line) setLeadMagnetLine(result.lead_magnet_line);
    setStep(3);
  }

  async function goToStep5() {
    if (!selectedOpening) return;
    const result = await callAPI("credibility");
    if (result?.suggestions) setCredibilitySuggestions(result.suggestions);
    setStep(4);
  }

  async function generateFinal() {
    const result = await callAPI("final");
    if (result?.script_outline) setScriptOutline(result.script_outline);
    if (result?.checklist) setChecklist(result.checklist);
    setStep(5);
  }

  async function saveScript() {
    if (!scriptOutline) return;
    await fetch("/api/ai-tools/save-script", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoTitle: title || topic, scriptOutline }),
    });
    setSaved(true);
  }

  function copyScript() {
    if (!scriptOutline) return;
    const text = [
      `VIDEO: ${title || topic}`,
      "",
      "OPENING:",
      scriptOutline.opening,
      "",
      "CREDIBILITY:",
      scriptOutline.credibility,
      "",
      "LEAD MAGNET (1):",
      scriptOutline.lead_magnet_1,
      "",
      ...(scriptOutline.insights || []).flatMap((ins, i) => [
        `INSIGHT ${i + 1}:`,
        `What: ${ins.what}`,
        `Why: ${ins.why}`,
        `When: ${ins.when}`,
        `Story: ${ins.story}`,
        `What This Means: ${ins.connection}`,
        `Bridge: ${ins.curiosity_bridge}`,
        "",
      ]),
      "LEAD MAGNET (2):",
      scriptOutline.lead_magnet_2,
      "",
      "CLOSING:",
      scriptOutline.closing,
    ].join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href={basePath} className="p-1.5 rounded-lg hover:bg-[#1e2a38]/10 transition-colors">
          <ArrowLeftIcon className="w-5 h-5 text-[#1e2a38]/50" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[#1e2a38]">ARC Script Builder</h1>
          <p className="text-sm text-[#1e2a38]/50">Build your video script outline step by step</p>
        </div>
      </div>

      <ProgressBar step={step} total={STEPS.length} />

      {step === 0 && (
        <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-6 space-y-5">
          <div>
            <h2 className="font-semibold text-[#1e2a38] mb-1">Step 1: Topic & Avatar</h2>
            {avatar?.avatarName ? (
              <p className="text-sm text-[#3dc3ff]">Using your avatar: <strong>{avatar.avatarName}</strong></p>
            ) : (
              <p className="text-sm text-amber-600">No avatar saved — <Link href={`${basePath}/avatar-architect`} className="underline">build one first</Link></p>
            )}
          </div>

          {themes.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-[#1e2a38] mb-2">Content Theme</label>
              <div className="flex flex-wrap gap-2">
                {themes.map((t) => (
                  <button
                    key={t}
                    onClick={() => setSelectedTheme(t === selectedTheme ? "" : t)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      selectedTheme === t ? "bg-[#3dc3ff] text-white border-[#3dc3ff]" : "border-[#1e2a38]/20 text-[#1e2a38]/60 hover:border-[#3dc3ff]"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-[#1e2a38] mb-2">What's this video about?</label>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              rows={4}
              placeholder="What specific challenge does your ideal client face? What insight will you share?"
              className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:border-[#3dc3ff] resize-none"
            />
          </div>

          <button
            onClick={() => setStep(1)}
            disabled={!topic.trim()}
            className="w-full bg-[#3dc3ff] text-white py-3 rounded-xl font-semibold hover:bg-[#3dc3ff]/90 disabled:opacity-50 transition-colors"
          >
            Next: Title →
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-6 space-y-5">
          <div>
            <h2 className="font-semibold text-[#1e2a38] mb-1">Step 2: Working Title</h2>
            <p className="text-sm text-[#1e2a38]/50">
              Don't have a title yet? <Link href={`${basePath}/title-creator`} className="text-[#3dc3ff] underline" target="_blank">Open Title Creator →</Link>
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#1e2a38] mb-2">Video Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Paste or type your working title..."
              className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:border-[#3dc3ff]"
            />
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(0)} className="flex-1 border border-[#1e2a38]/20 text-[#1e2a38] py-3 rounded-xl font-semibold hover:bg-[#1e2a38]/5 transition-colors flex items-center justify-center gap-2">
              <ArrowLeftIcon className="w-4 h-4" /> Back
            </button>
            <button
              onClick={() => setStep(2)}
              disabled={!title.trim()}
              className="flex-1 bg-[#3dc3ff] text-white py-3 rounded-xl font-semibold hover:bg-[#3dc3ff]/90 disabled:opacity-50 transition-colors"
            >
              Next: Approach →
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-6 space-y-5">
          <h2 className="font-semibold text-[#1e2a38]">Step 3: Your Unique Approach</h2>

          <div>
            <label className="block text-sm font-semibold text-[#1e2a38] mb-2">
              What's your unique perspective that differs from common advice?
            </label>
            <textarea
              value={uniqueAngle}
              onChange={(e) => setUniqueAngle(e.target.value)}
              rows={3}
              placeholder="What do you say that other agents don't?"
              className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:border-[#3dc3ff] resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#1e2a38] mb-2">How does your viewer feel BEFORE this video?</label>
            <textarea
              value={beforeFeeling}
              onChange={(e) => setBeforeFeeling(e.target.value)}
              rows={2}
              placeholder="Confused, anxious, frustrated, overwhelmed..."
              className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:border-[#3dc3ff] resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#1e2a38] mb-2">How do they feel AFTER?</label>
            <textarea
              value={afterFeeling}
              onChange={(e) => setAfterFeeling(e.target.value)}
              rows={2}
              placeholder="Clear, confident, informed, ready to take action..."
              className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:border-[#3dc3ff] resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="flex-1 border border-[#1e2a38]/20 text-[#1e2a38] py-3 rounded-xl font-semibold hover:bg-[#1e2a38]/5 transition-colors flex items-center justify-center gap-2">
              <ArrowLeftIcon className="w-4 h-4" /> Back
            </button>
            <button
              onClick={goToStep4}
              disabled={loading || !uniqueAngle.trim()}
              className="flex-1 bg-[#3dc3ff] text-white py-3 rounded-xl font-semibold hover:bg-[#3dc3ff]/90 disabled:opacity-50 transition-colors"
            >
              {loading ? "Generating openings..." : "Next: Opening →"}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-5">
          <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-6">
            <h2 className="font-semibold text-[#1e2a38] mb-1">Step 4: Choose Your Opening</h2>
            <p className="text-sm text-[#1e2a38]/50 mb-5">Pick the intro pattern that resonates most with your style and topic.</p>
            <div className="space-y-4">
              {openingOptions.map((opt, i) => (
                <div
                  key={i}
                  onClick={() => setSelectedOpening(opt.script)}
                  className={`border rounded-xl p-4 cursor-pointer transition-all ${
                    selectedOpening === opt.script
                      ? "border-[#3dc3ff] bg-[#3dc3ff]/5"
                      : "border-[#1e2a38]/10 hover:border-[#3dc3ff]/40"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm text-[#1e2a38]">{opt.name}</span>
                    {selectedOpening === opt.script && <CheckIcon className="w-4 h-4 text-[#3dc3ff]" />}
                  </div>
                  <p className="text-sm text-[#1e2a38]/70 leading-relaxed whitespace-pre-wrap">{opt.script}</p>
                </div>
              ))}
            </div>
          </div>

          {hookStarters.length > 0 && (
            <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-6">
              <h3 className="font-semibold text-[#1e2a38] mb-3">Hook Starters (Optional)</h3>
              <ul className="space-y-2">
                {hookStarters.map((h, i) => <li key={i} className="text-sm text-[#1e2a38]/70 flex gap-2"><span className="text-[#3dc3ff]">→</span>{h}</li>)}
              </ul>
            </div>
          )}

          {leadMagnetLine && (
            <div className="bg-[#3dc3ff]/5 border border-[#3dc3ff]/20 rounded-xl p-4">
              <p className="text-xs font-semibold text-[#1e2a38]/40 uppercase tracking-wide mb-1">Lead Magnet Line</p>
              <p className="text-sm text-[#1e2a38]">{leadMagnetLine}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="flex-1 border border-[#1e2a38]/20 text-[#1e2a38] py-3 rounded-xl font-semibold hover:bg-[#1e2a38]/5 transition-colors flex items-center justify-center gap-2">
              <ArrowLeftIcon className="w-4 h-4" /> Back
            </button>
            <button
              onClick={goToStep5}
              disabled={loading || !selectedOpening}
              className="flex-1 bg-[#3dc3ff] text-white py-3 rounded-xl font-semibold hover:bg-[#3dc3ff]/90 disabled:opacity-50 transition-colors"
            >
              {loading ? "Processing..." : "Next: Credibility →"}
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-5">
          <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-6 space-y-4">
            <h2 className="font-semibold text-[#1e2a38]">Step 5: Credibility Signal</h2>
            <div>
              <label className="block text-sm font-semibold text-[#1e2a38] mb-2">
                What proof point or credential establishes your authority on this topic?
              </label>
              <textarea
                value={credentialInput}
                onChange={(e) => setCredentialInput(e.target.value)}
                rows={3}
                placeholder="E.g., 'I've helped 200+ families in Calgary navigate this exact situation', 'I've done this myself twice', etc."
                className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:border-[#3dc3ff] resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#1e2a38] mb-2">Values to pepper in (2-3)</label>
              <input
                type="text"
                value={values}
                onChange={(e) => setValues(e.target.value)}
                placeholder="Transparency, family-first, education..."
                className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:border-[#3dc3ff]"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#1e2a38] mb-2">Personal interests (1-2)</label>
              <input
                type="text"
                value={interests}
                onChange={(e) => setInterests(e.target.value)}
                placeholder="Hockey dad, renovations, fitness..."
                className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:border-[#3dc3ff]"
              />
            </div>
          </div>

          {credibilitySuggestions.length > 0 && (
            <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-6">
              <h3 className="font-semibold text-[#1e2a38] mb-3">Credibility Suggestions</h3>
              <div className="space-y-3">
                {credibilitySuggestions.map((s, i) => (
                  <div key={i} className="bg-[#f1f1ef] rounded-xl px-4 py-3">
                    <p className="text-sm text-[#1e2a38]">{s.line}</p>
                    <p className="text-xs text-[#1e2a38]/40 mt-1">{s.placement}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep(3)} className="flex-1 border border-[#1e2a38]/20 text-[#1e2a38] py-3 rounded-xl font-semibold hover:bg-[#1e2a38]/5 transition-colors flex items-center justify-center gap-2">
              <ArrowLeftIcon className="w-4 h-4" /> Back
            </button>
            <button
              onClick={generateFinal}
              disabled={loading}
              className="flex-1 bg-[#1e2a38] text-white py-3 rounded-xl font-semibold hover:bg-[#1e2a38]/90 disabled:opacity-50 transition-colors"
            >
              {loading ? "Assembling script..." : "Generate Full Script →"}
            </button>
          </div>
        </div>
      )}

      {step === 5 && scriptOutline && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-[#1e2a38] text-lg">Your Script Outline</h2>
              <p className="text-sm text-[#1e2a38]/50">{title || topic}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={copyScript}
                className="flex items-center gap-1.5 text-sm border border-[#1e2a38]/20 px-3 py-2 rounded-xl text-[#1e2a38]/60 hover:text-[#1e2a38] transition-colors"
              >
                <ClipboardDocumentIcon className="w-4 h-4" />
                {copied ? "Copied!" : "Copy"}
              </button>
              <button
                onClick={saveScript}
                disabled={saved}
                className="flex items-center gap-1.5 text-sm bg-[#3dc3ff] text-white px-4 py-2 rounded-xl font-semibold hover:bg-[#3dc3ff]/90 disabled:opacity-50 transition-colors"
              >
                {saved ? <><CheckIcon className="w-4 h-4" /> Saved</> : "Save Script"}
              </button>
            </div>
          </div>

          {checklist && (
            <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-6">
              <h3 className="font-semibold text-[#1e2a38] mb-4">Final Script Checklist</h3>
              <div className="space-y-2">
                {(Object.entries(checklist) as [keyof Checklist, boolean][]).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-2">
                    <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${val ? "bg-green-100" : "bg-red-100"}`}>
                      {val ? <CheckIcon className="w-3.5 h-3.5 text-green-600" /> : <span className="text-red-500 text-xs">✗</span>}
                    </div>
                    <span className={`text-sm ${val ? "text-[#1e2a38]" : "text-red-600"}`}>{CHECKLIST_LABELS[key]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {[
            { label: "Opening (~20-25 sec)", content: scriptOutline.opening },
            { label: "Credibility Signal", content: scriptOutline.credibility },
            { label: "Lead Magnet Mention #1", content: scriptOutline.lead_magnet_1 },
          ].map((section) => (
            <div key={section.label} className="bg-white border border-[#1e2a38]/10 rounded-2xl p-5">
              <p className="text-xs font-semibold text-[#1e2a38]/40 uppercase tracking-wide mb-3">{section.label}</p>
              <p className="text-sm text-[#1e2a38] leading-relaxed whitespace-pre-wrap">{section.content}</p>
            </div>
          ))}

          {(scriptOutline.insights || []).map((ins, i) => (
            <div key={i} className="bg-white border border-[#1e2a38]/10 rounded-2xl p-5 space-y-3">
              <p className="text-xs font-semibold text-[#1e2a38]/40 uppercase tracking-wide">Insight {i + 1}</p>
              {[
                { label: "What", value: ins.what },
                { label: "Why", value: ins.why },
                { label: "When", value: ins.when },
                { label: "Story", value: ins.story },
                { label: "What This Means", value: ins.connection },
                { label: "Curiosity Bridge", value: ins.curiosity_bridge },
              ].map((f) => (
                <div key={f.label}>
                  <p className="text-xs font-semibold text-[#1e2a38]/40 mb-1">{f.label}</p>
                  <p className="text-sm text-[#1e2a38] leading-relaxed">{f.value}</p>
                </div>
              ))}
            </div>
          ))}

          {[
            { label: "Lead Magnet Mention #2", content: scriptOutline.lead_magnet_2 },
            { label: "Closing", content: scriptOutline.closing },
          ].map((section) => (
            <div key={section.label} className="bg-white border border-[#1e2a38]/10 rounded-2xl p-5">
              <p className="text-xs font-semibold text-[#1e2a38]/40 uppercase tracking-wide mb-3">{section.label}</p>
              <p className="text-sm text-[#1e2a38] leading-relaxed whitespace-pre-wrap">{section.content}</p>
            </div>
          ))}

          {scriptOutline.visual_prompts?.length > 0 && (
            <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-5">
              <p className="text-xs font-semibold text-[#1e2a38]/40 uppercase tracking-wide mb-3">Visual Prompts</p>
              <ul className="space-y-1.5">
                {scriptOutline.visual_prompts.map((v, i) => (
                  <li key={i} className="text-sm text-[#1e2a38] flex gap-2"><span className="text-[#3dc3ff]">📷</span>{v}</li>
                ))}
              </ul>
            </div>
          )}

          {scriptOutline.connection_phrases?.length > 0 && (
            <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-5">
              <p className="text-xs font-semibold text-[#1e2a38]/40 uppercase tracking-wide mb-3">Connection Phrases</p>
              <div className="space-y-2">
                {scriptOutline.connection_phrases.map((cp, i) => (
                  <div key={i} className="bg-[#f1f1ef] rounded-lg px-4 py-2.5">
                    <p className="text-sm font-medium text-[#1e2a38]">"{cp.phrase}"</p>
                    <p className="text-xs text-[#1e2a38]/40 mt-0.5">{cp.placement}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => { setStep(0); setScriptOutline(null); setChecklist(null); setSaved(false); }}
            className="w-full border border-[#1e2a38]/20 text-[#1e2a38] py-3 rounded-xl font-semibold hover:bg-[#1e2a38]/5 transition-colors"
          >
            Build Another Script
          </button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { StepFooter, StepHeader, WhyBlock, type StepProps } from "./_shared";

type Tab = "upload" | "questionnaire";

const TONE_OPTIONS = [
  "Warm coach (steady, encouraging)",
  "Sharp analyst (data-first, direct)",
  "Storyteller (anecdotes, examples)",
  "Friend (casual, peer-to-peer)",
  "Expert authority (confident, definitive)",
  "Curious explainer (asking-with-you energy)",
];

const ENERGY_OPTIONS = [
  "Warm + steady (radio-host calm)",
  "High + enthusiastic (130% energy, projected)",
  "Sharp + analytical (direct, no fluff)",
  "Chill + thoughtful (slower pace, deeper)",
];

interface QuestionnaireState {
  audience: string;
  tones: string[];
  signature: string;
  banned: string;
  energy: string;
}

const EMPTY_Q: QuestionnaireState = {
  audience: "",
  tones: [],
  signature: "",
  banned: "",
  energy: ENERGY_OPTIONS[0],
};

/**
 * Step 7 — Voice Guide (DWY tier, gated by tool_member_voice_guide flag).
 *
 * Two tabs:
 *   A. Upload — paste OR file upload, goes straight to the existing
 *      POST /api/member/voice-guide/upload (which validates 500-50,000 chars).
 *   B. Questionnaire (Recommended) — 5 questions → assembles a markdown voice
 *      guide via a fixed template, shows it in an editable preview textarea
 *      for one last edit, then saves to the same endpoint.
 */
export default function Step7VoiceGuide({ onContinue, onSkip, stepLabel }: StepProps) {
  const [tab, setTab] = useState<Tab>("questionnaire");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tab A state
  const [paste, setPaste] = useState("");

  // Tab B state
  const [q, setQ] = useState<QuestionnaireState>(EMPTY_Q);
  const [draft, setDraft] = useState<string | null>(null);

  const generated = useMemo(() => {
    return buildVoiceGuideMarkdown(q);
  }, [q]);

  function toggleTone(option: string) {
    setQ((prev) => {
      const has = prev.tones.includes(option);
      if (has) return { ...prev, tones: prev.tones.filter((t) => t !== option) };
      if (prev.tones.length >= 2) return prev;
      return { ...prev, tones: [...prev.tones, option] };
    });
  }

  async function saveText(text: string, sourceFile: string | null) {
    setError(null);
    if (text.trim().length < 500) {
      setError("Voice guide must be at least 500 characters.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("text", text);
      if (sourceFile) form.append("sourceFile", sourceFile);
      const res = await fetch("/api/member/voice-guide/upload", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Could not save voice guide.");
      }
      await onContinue();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <StepHeader
        label={stepLabel ? `${stepLabel} — Your voice` : "Your voice"}
        title="Your voice (Done-With-You only)"
        subtitle="If your scripts should sound like YOU, not the channel default."
      />
      <WhyBlock>
        By default, your scripts use the channel&rsquo;s voice register —
        coach-style, plain-language, quality real estate context. Most members
        want this. But if you&rsquo;ve been on camera for years and
        you&rsquo;ve developed your own voice, we can capture it so your
        scripts sound like you instead.
      </WhyBlock>

      {/* Tab switcher */}
      <div className="mt-5 flex gap-2 border-b border-gray-200 dark:border-gray-800">
        <TabBtn active={tab === "questionnaire"} onClick={() => setTab("questionnaire")}>
          Answer 5 questions (Recommended)
        </TabBtn>
        <TabBtn active={tab === "upload"} onClick={() => setTab("upload")}>
          Upload a voice guide
        </TabBtn>
      </div>

      {tab === "upload" && (
        <div className="mt-5 space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Paste it here or upload the file. Minimum 500 characters, max
            50,000.
          </p>
          <textarea
            rows={10}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-mono dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
            placeholder="# Voice guide&#10;&#10;## Tone register&#10;Warm coach, plain-language…"
          />
          <p className="text-[11px] text-gray-500">
            {paste.length} / 50,000 characters (minimum 500)
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <StepFooter
            time="3 minutes"
            primaryBusy={busy}
            primaryDisabled={busy || paste.trim().length < 500}
            onPrimary={() => void saveText(paste, null)}
            onSkip={onSkip}
            primaryLabel="Save voice guide → Continue"
            secondaryLabel="Skip — use the channel default"
          />
        </div>
      )}

      {tab === "questionnaire" && (
        <div className="mt-5 space-y-5">
          {!draft && (
            <>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Three minutes of questions about how you speak, what you say,
                what you&rsquo;d never say. We assemble the voice guide from
                your answers. You can edit it after.
              </p>

              <Q label="Q1. Who's the one person you're imagining as you film?">
                <textarea
                  rows={2}
                  value={q.audience}
                  onChange={(e) => setQ((p) => ({ ...p, audience: e.target.value }))}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                  placeholder="A move-up family in Calgary with teens at home, dual income $180-300K, anxious about timing the market."
                />
              </Q>

              <Q label="Q2. What's your tone register? Pick up to 2.">
                <div className="mt-1 grid gap-2 sm:grid-cols-2">
                  {TONE_OPTIONS.map((opt) => {
                    const checked = q.tones.includes(opt);
                    const disabled = !checked && q.tones.length >= 2;
                    return (
                      <label
                        key={opt}
                        className={[
                          "flex cursor-pointer items-start gap-2 rounded border px-3 py-2 text-xs",
                          checked
                            ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                            : "border-gray-200 dark:border-gray-800",
                          disabled ? "cursor-not-allowed opacity-50" : "",
                        ].join(" ")}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleTone(opt)}
                        />
                        <span>{checked ? "✓" : "○"}</span>
                        <span>{opt}</span>
                      </label>
                    );
                  })}
                </div>
              </Q>

              <Q label="Q3. What 3-5 phrases do you say often that feel like YOU?">
                <textarea
                  rows={2}
                  value={q.signature}
                  onChange={(e) => setQ((p) => ({ ...p, signature: e.target.value }))}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                  placeholder={`"Trust me on this." / "Here's the thing." / "Hold on, let me show you something."`}
                />
              </Q>

              <Q label="Q4. What words or phrases would feel wrong coming out of your mouth?">
                <textarea
                  rows={2}
                  value={q.banned}
                  onChange={(e) => setQ((p) => ({ ...p, banned: e.target.value }))}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                  placeholder={`"Hey guys" / "Smooth transition" / industry jargon / "Don't miss out."`}
                />
              </Q>

              <Q label="Q5. What energy level?">
                <div className="mt-1 space-y-1.5">
                  {ENERGY_OPTIONS.map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="energy"
                        checked={q.energy === opt}
                        onChange={() => setQ((p) => ({ ...p, energy: opt }))}
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              </Q>

              {error && <p className="text-sm text-red-600">{error}</p>}
              <StepFooter
                time="3 minutes"
                primaryLabel="Generate my voice guide"
                primaryDisabled={
                  !q.audience.trim() || q.tones.length === 0 || !q.signature.trim()
                }
                onPrimary={() => setDraft(generated)}
                onSkip={onSkip}
                secondaryLabel="Skip — use the channel default"
              />
            </>
          )}

          {draft !== null && (
            <div>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Here&rsquo;s what we put together from your answers. Edit
                anything that&rsquo;s off, then save.
              </p>
              <textarea
                rows={16}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="mt-3 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-mono dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
              />
              <p className="mt-1 text-[11px] text-gray-500">
                {draft.length} / 50,000 characters (minimum 500)
              </p>
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
              <StepFooter
                time="3 minutes"
                primaryBusy={busy}
                primaryDisabled={busy || draft.trim().length < 500}
                onPrimary={() => void saveText(draft, "onboarding-questionnaire")}
                onSkip={onSkip}
                primaryLabel="Save voice guide → Continue"
                secondaryLabel="Skip — use the channel default"
                extras={
                  <button
                    type="button"
                    onClick={() => setDraft(null)}
                    className="rounded-full px-4 py-2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                  >
                    Back to questions
                  </button>
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-t-md px-4 py-2 text-sm font-medium border-b-2",
        active
          ? "border-gray-900 text-gray-900 dark:border-white dark:text-white"
          : "border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Q({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
        {label}
      </p>
      {children}
    </div>
  );
}

function buildVoiceGuideMarkdown(q: QuestionnaireState) {
  const today = new Date().toISOString().slice(0, 10);
  const sigList = q.signature
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `- ${s}`)
    .join("\n");
  const bannedList = q.banned
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `- ${s}`)
    .join("\n");
  return `# My Voice Guide

## Audience
${q.audience.trim() || "(not set)"}

## Tone Register
${q.tones.join(", ") || "(not set)"}

## Signature Phrases I Use
${sigList || "- (none yet)"}

## Words and Phrases I Avoid
${bannedList || "- (none yet)"}

## Energy Level
${q.energy}

## Notes
This voice guide was built from a 5-question onboarding questionnaire on ${today}. Edit anything that's off, and re-upload as needed via /member/market-data/setup.
`;
}

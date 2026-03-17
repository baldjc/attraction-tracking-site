"use client";

import { useState, useEffect } from "react";
import { EyeSlashIcon } from "@heroicons/react/24/outline";

// ─── Feature Visibility ───────────────────────────────────────────────────────

interface FeatureFlags {
  campaigns: boolean;
  ai_tools: boolean;
  resources: boolean;
  tool_avatar_architect: boolean;
  tool_content_engine: boolean;
  tool_arc_script_builder: boolean;
  tool_title_analyzer: boolean;
  tool_script_review: boolean;
  [key: string]: boolean;
}

const FEATURE_DEFS = [
  {
    group: "Navigation",
    items: [
      { key: "campaigns", label: "Campaigns & Link Tracking", desc: "Campaigns, conversions, and link tracker pages" },
      { key: "ai_tools", label: "AI Tools Hub", desc: "The entire AI tools section — also controls individual tools below" },
      { key: "resources", label: "Resources", desc: "Resource library page" },
    ],
  },
  {
    group: "AI Tools",
    items: [
      { key: "tool_avatar_architect", label: "Avatar Architect", desc: "Client avatar builder" },
      { key: "tool_content_engine", label: "Content Engine", desc: "Video idea generation" },
      { key: "tool_arc_script_builder", label: "ARC Script Builder", desc: "Video script outline builder" },
      { key: "tool_title_analyzer", label: "Title & Thumbnail Analyzer", desc: "Title/thumbnail scoring" },
      { key: "tool_script_review", label: "Script Review", desc: "Script scoring and feedback" },
      { key: "tool_repurpose_content", label: "Repurpose Content", desc: "Turn transcripts into newsletters and LinkedIn articles" },
    ],
  },
];

function Toggle({ enabled, onChange, disabled }: { enabled: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${
        disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
      } ${enabled ? "bg-[#3dc3ff]" : "bg-[#1e2a38]/20"}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          enabled ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function FeatureVisibilitySection() {
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    fetch("/api/admin/feature-visibility")
      .then((r) => r.json())
      .then(setFlags)
      .catch(() => setLoadError(true));
  }, []);

  async function toggleFlag(key: string, newValue: boolean) {
    if (!flags) return;
    setSaving(key);
    const prev = { ...flags };
    setFlags({ ...flags, [key]: newValue });
    try {
      const res = await fetch("/api/admin/feature-visibility", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: newValue }),
      });
      if (res.ok) {
        const updated = await res.json();
        setFlags(updated);
      } else {
        setFlags(prev);
      }
    } catch {
      setFlags(prev);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-[#1e2a38]">Feature Visibility</h2>
        <p className="text-sm text-[#1e2a38]/50 mt-0.5">
          Control what members can see and access. Changes take effect immediately.
          You always see everything when viewing as a member.
        </p>
      </div>

      {loadError && <p className="text-sm text-red-500">Failed to load settings.</p>}

      {!flags && !loadError && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-[#1e2a38]/5 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {flags && FEATURE_DEFS.map((group) => {
        const isAiGroup = group.group === "AI Tools";
        const aiOn = flags.ai_tools !== false;

        return (
          <div key={group.group} className="mb-5 last:mb-0">
            <p className="text-xs font-semibold text-[#1e2a38]/40 uppercase tracking-wider mb-2">
              {group.group}
              {isAiGroup && !aiOn && (
                <span className="ml-2 font-normal text-amber-600 normal-case tracking-normal">
                  — hidden (AI Tools Hub is off)
                </span>
              )}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const isOn = flags[item.key] !== false;
                const isSaving = saving === item.key;
                const dimmed = isAiGroup && !aiOn;

                return (
                  <div
                    key={item.key}
                    className={`flex items-center justify-between gap-4 px-4 py-3 rounded-xl border transition-colors ${
                      dimmed
                        ? "bg-[#1e2a38]/3 border-[#1e2a38]/5 opacity-50"
                        : isOn
                        ? "bg-white border-[#1e2a38]/10"
                        : "bg-[#ff0033]/3 border-[#ff0033]/15"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOn && !dimmed ? "bg-[#3dc3ff]" : "bg-[#1e2a38]/20"}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#1e2a38]">{item.label}</p>
                        <p className="text-xs text-[#1e2a38]/45">{item.desc}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!isOn && !dimmed && (
                        <span className="text-[10px] font-semibold text-[#ff0033] uppercase tracking-wide flex items-center gap-0.5">
                          <EyeSlashIcon className="w-3 h-3" /> Hidden
                        </span>
                      )}
                      {isSaving ? (
                        <div className="w-9 flex justify-center">
                          <span className="w-4 h-4 border-2 border-[#3dc3ff] border-t-transparent rounded-full animate-spin" />
                        </div>
                      ) : (
                        <Toggle
                          enabled={isOn}
                          onChange={(v) => toggleFlag(item.key, v)}
                          disabled={dimmed || saving !== null}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── AI Scoring Prompt ────────────────────────────────────────────────────────

function AIScoringPromptSection() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => { setPrompt(d.audit_prompt ?? ""); setLoading(false); });
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audit_prompt: prompt }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function handleReset() {
    await fetch("/api/settings?key=audit_prompt", { method: "DELETE" });
    const res = await fetch("/api/settings");
    const d = await res.json();
    setPrompt(d.audit_prompt ?? "");
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-semibold text-[#1e2a38]">AI Scoring Prompt</h2>
        <button onClick={handleReset} className="text-xs text-[#1e2a38]/50 hover:text-[#1e2a38] underline">
          Reset to Default
        </button>
      </div>
      <p className="text-xs text-[#1e2a38]/50 mb-3">
        System prompt sent to Claude when running audits. Changes take effect on the next audit run.
      </p>
      {loading ? (
        <div className="h-64 bg-gray-50 rounded-lg animate-pulse" />
      ) : (
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={24}
          className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-[#1e2a38] font-mono focus:outline-none focus:ring-2 focus:ring-[#3dc3ff]/30 resize-y"
        />
      )}
      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="bg-[#3dc3ff] hover:bg-[#2bb3ef] disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
        >
          {saving ? "Saving…" : "Save Prompt"}
        </button>
        {saved && <span className="text-sm text-green-600 font-medium">✓ Saved</span>}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1e2a38]">Settings</h1>
        <p className="text-[#1e2a38]/60 mt-1 text-sm">Configure platform preferences and AI scoring.</p>
      </div>
      <FeatureVisibilitySection />
      <AIScoringPromptSection />
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { DEFAULT_SCORING_PROMPT } from "@/lib/audit-engine";

export default function SettingsPage() {
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

  function handleReset() {
    setPrompt(DEFAULT_SCORING_PROMPT);
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#1e2a38]">Settings</h1>
        <p className="text-[#1e2a38]/60 mt-1">Configure AI scoring and platform preferences.</p>
      </div>

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
    </div>
  );
}

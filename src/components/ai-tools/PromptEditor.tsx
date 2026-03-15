"use client";

import { useState, useEffect } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import { useSession } from "next-auth/react";

interface PlaceholderDef {
  key: string;
  description: string;
}

interface Props {
  toolKey: string;
  defaultPrompt: string;
  placeholders?: PlaceholderDef[];
}

export default function PromptEditor({ toolKey, defaultPrompt, placeholders }: Props) {
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === "admin";

  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin || !open || value !== "") return;
    setLoading(true);
    fetch(`/api/settings?key=${toolKey}`)
      .then((r) => r.json())
      .then((d) => setValue(d.value ?? defaultPrompt))
      .catch(() => setValue(defaultPrompt))
      .finally(() => setLoading(false));
  }, [isAdmin, open, toolKey, defaultPrompt, value]);

  if (!isAdmin) return null;

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: toolKey, value }),
      });
      showToast("Prompt saved");
    } catch {
      showToast("Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!confirm("Reset to default prompt? This will discard any custom edits.")) return;
    setSaving(true);
    try {
      await fetch(`/api/settings?key=${toolKey}`, { method: "DELETE" });
      setValue(defaultPrompt);
      showToast("Reset to default");
    } catch {
      showToast("Reset failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-6 border border-[#3dc3ff]/30 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#3dc3ff]/5 hover:bg-[#3dc3ff]/10 transition-colors"
      >
        <span className="text-xs font-semibold text-[#3dc3ff] uppercase tracking-wider">
          ⚙️ Edit System Prompt
        </span>
        {open ? (
          <ChevronUpIcon className="w-4 h-4 text-[#3dc3ff]" />
        ) : (
          <ChevronDownIcon className="w-4 h-4 text-[#3dc3ff]" />
        )}
      </button>

      {open && (
        <div className="p-4 bg-white space-y-3">
          {loading ? (
            <p className="text-sm text-[#1e2a38]/40 animate-pulse">Loading prompt…</p>
          ) : (
            <>
              <textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                rows={20}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-xs font-mono text-[#1e2a38] focus:outline-none focus:ring-2 focus:ring-[#3dc3ff]/40 resize-y"
              />

              {placeholders && placeholders.length > 0 && (
                <div className="bg-[#f1f1ef] rounded-lg p-3">
                  <p className="text-xs font-semibold text-[#1e2a38]/60 uppercase tracking-wider mb-2">
                    Available Placeholders
                  </p>
                  <div className="space-y-1">
                    {placeholders.map((p) => (
                      <div key={p.key} className="flex items-start gap-2 text-xs">
                        <code className="bg-white px-1.5 py-0.5 rounded font-mono text-[#3dc3ff] border border-[#3dc3ff]/20 shrink-0">
                          {p.key}
                        </code>
                        <span className="text-[#1e2a38]/60">{p.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-[#3dc3ff] text-white text-xs font-semibold rounded-lg hover:bg-[#3dc3ff]/90 disabled:opacity-50 transition-colors"
                >
                  {saving ? "Saving…" : "Save Prompt"}
                </button>
                <button
                  onClick={handleReset}
                  disabled={saving}
                  className="px-4 py-2 border border-gray-200 text-[#1e2a38]/60 text-xs font-semibold rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  Reset to Default
                </button>
                {toast && (
                  <span className="text-xs text-green-600 font-medium">{toast}</span>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

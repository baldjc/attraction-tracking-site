"use client";

import { useState, useEffect } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import MarkdownTextarea from "@/components/MarkdownTextarea";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";

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
  const pathname = usePathname();

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

  if (!isAdmin || !pathname?.startsWith("/admin")) return null;

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
    <div className="mb-6 border border-[var(--abv-ai-tools)]/30 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[var(--abv-ai-tools)]/5 hover:bg-[var(--abv-ai-tools)]/10 transition-colors"
      >
        <span className="text-xs font-semibold text-[var(--abv-ai-tools)] uppercase tracking-wider">
          ⚙️ Edit System Prompt
        </span>
        {open ? (
          <ChevronUpIcon className="w-4 h-4 text-[var(--abv-ai-tools)]" />
        ) : (
          <ChevronDownIcon className="w-4 h-4 text-[var(--abv-ai-tools)]" />
        )}
      </button>

      {open && (
        <div className="p-4 bg-white space-y-3">
          {loading ? (
            <p className="text-sm text-[var(--abv-text)]/40 animate-pulse">Loading prompt…</p>
          ) : (
            <>
              <MarkdownTextarea
                value={value}
                onChange={setValue}
                rows={20}
                ariaLabel="Prompt Editor"
              />

              {placeholders && placeholders.length > 0 && (
                <div className="bg-[var(--abv-bg)] rounded-lg p-3">
                  <p className="text-xs font-semibold text-[var(--abv-text)]/60 uppercase tracking-wider mb-2">
                    Available Placeholders
                  </p>
                  <div className="space-y-1">
                    {placeholders.map((p) => (
                      <div key={p.key} className="flex items-start gap-2 text-xs">
                        <code className="bg-white px-1.5 py-0.5 rounded font-mono text-[var(--abv-ai-tools)] border border-[var(--abv-ai-tools)]/20 shrink-0">
                          {p.key}
                        </code>
                        <span className="text-[var(--abv-text)]/60">{p.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-[var(--abv-ai-tools)] text-white text-xs font-semibold rounded-lg hover:bg-[var(--abv-ai-tools)]/90 disabled:opacity-50 transition-colors"
                >
                  {saving ? "Saving…" : "Save Prompt"}
                </button>
                <button
                  onClick={handleReset}
                  disabled={saving}
                  className="px-4 py-2 border border-gray-200 text-[var(--abv-text)]/60 text-xs font-semibold rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
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

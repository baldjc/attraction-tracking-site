"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";

export interface Idea {
  title: string;
  talkingPoints: string[];
  framework: string | null;
  whyItWorks: string | null;
}

interface Props {
  idea: Idea;
  theme: string;
  onSaved?: (id: string) => void;
  savedId?: string | null;
  onDelete?: () => void;
}

export default function IdeaCard({ idea, theme, onSaved, savedId, onDelete }: Props) {
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [localSavedId, setLocalSavedId] = useState<string | null>(savedId ?? null);
  const router = useRouter();
  const pathname = usePathname();

  const isSaved = !!localSavedId;

  async function handleSave() {
    if (isSaved || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/ai-tools/content-engine/save-idea", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme,
          title: idea.title,
          talkingPoints: idea.talkingPoints,
          framework: idea.framework,
          whyItWorks: idea.whyItWorks,
          source: "batch",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setLocalSavedId(data.id);
        onSaved?.(data.id);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!onDelete || deleting) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  }

  function handleBuildScript() {
    sessionStorage.setItem(
      "arc_prefill",
      JSON.stringify({
        title: idea.title,
        talkingPoints: idea.talkingPoints,
        theme,
        framework: idea.framework,
        whyItWorks: idea.whyItWorks,
        ...(localSavedId ? { ideaId: localSavedId } : {}),
      })
    );
    const base = pathname.startsWith("/admin") ? "/admin" : "/member";
    router.push(`${base}/ai-tools/arc-script-builder`);
  }

  return (
    <div className="bg-[#f8f8f6] dark:bg-[#242b3d] rounded-xl border border-[#1e2a38]/10 dark:border-white/10 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-[#1e2a38] dark:text-white text-sm leading-snug flex-1">{idea.title}</h3>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {onDelete && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              title="Delete saved idea"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#1e2a38]/30 dark:text-white/30 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              {deleting ? <span className="text-xs animate-spin">↻</span> : <span className="text-sm">✕</span>}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={isSaved || saving || !!onDelete}
            title={isSaved ? "Saved" : "Save idea"}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              isSaved
                ? "bg-[#3dc3ff]/20 text-[#3dc3ff]"
                : "bg-[#1e2a38]/5 dark:bg-white/5 hover:bg-[#3dc3ff]/10 text-[#1e2a38]/40 dark:text-white/40 hover:text-[#3dc3ff]"
            }`}
          >
            {saving ? (
              <span className="text-xs animate-spin">↻</span>
            ) : (
              <span className="text-sm">{isSaved ? "★" : "☆"}</span>
            )}
          </button>
        </div>
      </div>

      {idea.framework && (
        <span className="inline-block text-xs font-medium text-[#3dc3ff] bg-[#3dc3ff]/10 px-2 py-0.5 rounded-full">
          {idea.framework}
        </span>
      )}

      {idea.talkingPoints.length > 0 && (
        <>
          <ol className="space-y-1">
            {idea.talkingPoints.map((pt, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-[#1e2a38]/70 dark:text-white/70">
                <span className="text-[#3dc3ff] font-bold flex-shrink-0">{i + 1}.</span>
                <span>{pt}</span>
              </li>
            ))}
          </ol>
          <p className="text-[10px] text-[#1e2a38]/40 dark:text-white/40 italic mt-1.5">
            These are starting points — use fewer, combine them, or add your own.
          </p>
        </>
      )}

      {idea.whyItWorks && (
        <p className="text-xs text-[#1e2a38]/50 dark:text-white/50 italic border-t border-[#1e2a38]/5 dark:border-white/5 pt-2">
          {idea.whyItWorks}
        </p>
      )}

      <div className="border-t border-[#1e2a38]/5 dark:border-white/5 pt-2">
        <button
          onClick={handleBuildScript}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold text-[#1e2a38] dark:text-white bg-[#1e2a38]/5 dark:bg-white/5 hover:bg-[#3dc3ff]/10 hover:text-[#3dc3ff] dark:hover:text-[#3dc3ff] rounded-lg transition-colors"
        >
          <span>🎬</span>
          Build Script
        </button>
      </div>
    </div>
  );
}

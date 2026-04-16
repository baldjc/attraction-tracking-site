"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import ContentPlanEditModal, { type ContentPlan } from "@/components/content-planner/ContentPlanEditModal";

export interface TitleOption {
  title: string;
  framework: string;
}

export interface Idea {
  titleOptions?: TitleOption[];
  title?: string;
  talkingPoints: string[];
  framework?: string | null;
  whyItWorks?: string | null;
  dataToFind?: string | null;
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
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [addingToPlanner, setAddingToPlanner] = useState(false);
  const [addedToPlanner, setAddedToPlanner] = useState(false);
  const [createdPlan, setCreatedPlan] = useState<ContentPlan | null>(null);
  const [plannerServiceTier, setPlannerServiceTier] = useState("foundations");
  const router = useRouter();
  const pathname = usePathname();

  const isSaved = !!localSavedId;

  const titleOptions: TitleOption[] = idea.titleOptions && idea.titleOptions.length > 0
    ? idea.titleOptions
    : [{ title: idea.title ?? "", framework: idea.framework ?? "" }];

  const selectedOption = titleOptions[selectedIdx] ?? titleOptions[0];

  async function handleSave() {
    if (isSaved || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/ai-tools/content-engine/save-idea", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme,
          title: selectedOption.title,
          talkingPoints: idea.talkingPoints,
          dataToFind: idea.dataToFind ?? null,
          framework: selectedOption.framework,
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

  async function handleAddToPlanner() {
    if (addedToPlanner || addingToPlanner) return;
    setAddingToPlanner(true);
    try {
      let notes: string | undefined;
      if (idea.talkingPoints.length > 0) {
        notes = "• " + idea.talkingPoints.join("\n• ");
        if (idea.dataToFind) {
          notes += "\n\n--- Data to Find ---\n" + idea.dataToFind;
        }
      } else if (idea.dataToFind) {
        notes = "--- Data to Find ---\n" + idea.dataToFind;
      }
      const res = await fetch("/api/member/content-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: selectedOption.title,
          theme,
          status: "Idea",
          ...(notes ? { notes } : {}),
          ...(localSavedId ? { linkedIdeaId: localSavedId } : {}),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAddedToPlanner(true);
        if (data.plan) {
          setPlannerServiceTier(data.serviceTier ?? "foundations");
          setCreatedPlan(data.plan as ContentPlan);
        }
      }
    } catch {
      /* silently fail */
    } finally {
      setAddingToPlanner(false);
    }
  }

  function handleBuildScript() {
    sessionStorage.setItem(
      "arc_prefill",
      JSON.stringify({
        title: selectedOption.title,
        talkingPoints: idea.talkingPoints,
        theme,
        framework: selectedOption.framework,
        whyItWorks: idea.whyItWorks,
        dataToFind: idea.dataToFind ?? null,
        ...(localSavedId ? { ideaId: localSavedId } : {}),
        ...(createdPlan?.id ? { planId: createdPlan.id } : {}),
      })
    );
    const base = pathname.startsWith("/admin") ? "/admin" : "/member";
    router.push(`${base}/ai-tools/arc-script-builder`);
  }

  const hasMultipleOptions = titleOptions.length > 1;

  return (
    <div className="bg-[#f8f8f6] dark:bg-[#1a1a1a] rounded-lg border border-[#2f3437]/10 dark:border-white/10 p-4 space-y-3">
      {/* Title options */}
      {hasMultipleOptions ? (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-[#2f3437]/40 dark:text-white/40 uppercase tracking-wider">
            Pick a title
          </p>
          {titleOptions.map((opt, i) => (
            <button
              key={i}
              onClick={() => setSelectedIdx(i)}
              className={`w-full text-left rounded-lg px-3 py-2.5 border transition-all ${
                selectedIdx === i
                  ? "border-[#6ba3c7] bg-[#6ba3c7]/8 dark:bg-[#6ba3c7]/15"
                  : "border-[#2f3437]/10 dark:border-white/10 hover:border-[#2f3437]/25 dark:hover:border-white/25 bg-white dark:bg-white/5"
              }`}
            >
              <div className="flex items-start gap-2">
                <span
                  className={`shrink-0 mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                    selectedIdx === i
                      ? "border-[#6ba3c7] bg-[#6ba3c7]"
                      : "border-[#2f3437]/30 dark:border-white/30"
                  }`}
                >
                  {selectedIdx === i && (
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#2f3437] dark:text-white leading-snug">{opt.title}</p>
                  {opt.framework && (
                    <p className="text-[10px] text-[#2f3437]/40 dark:text-white/40 mt-0.5">{opt.framework}</p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold text-[#2f3437] dark:text-white text-sm leading-snug flex-1">
            {selectedOption.title}
          </h3>
        </div>
      )}

      {/* Action buttons (save / delete) */}
      <div className="flex items-center justify-end gap-1.5">
        {onDelete && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            title="Delete saved idea"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#2f3437]/30 dark:text-white/30 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            {deleting ? <span className="text-xs animate-spin">↻</span> : <span className="text-sm">✕</span>}
          </button>
        )}
        {!onDelete && (
          <button
            onClick={handleSave}
            disabled={isSaved || saving}
            title={isSaved ? "Saved" : "Save selected title"}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              isSaved
                ? "bg-[#6ba3c7]/20 text-[#6ba3c7]"
                : "bg-[#111]/5 dark:bg-white/5 hover:bg-[#6ba3c7]/10 text-[#2f3437]/40 dark:text-white/40 hover:text-[#6ba3c7]"
            }`}
          >
            {saving ? (
              <span className="text-xs animate-spin">↻</span>
            ) : (
              <span className="text-sm">{isSaved ? "★" : "☆"}</span>
            )}
          </button>
        )}
      </div>

      {/* Framework badge (single-title mode) */}
      {!hasMultipleOptions && selectedOption.framework && (
        <span className="inline-block text-xs font-medium text-[#6ba3c7] bg-[#6ba3c7]/10 px-2 py-0.5 rounded-full">
          {selectedOption.framework}
        </span>
      )}

      {/* Talking points */}
      {idea.talkingPoints.length > 0 && (
        <>
          <ol className="space-y-1">
            {idea.talkingPoints.map((pt, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-[#2f3437]/70 dark:text-white/70">
                <span className="text-[#6ba3c7] font-bold flex-shrink-0">{i + 1}.</span>
                <span>{pt}</span>
              </li>
            ))}
          </ol>
          <p className="text-[10px] text-[#2f3437]/40 dark:text-white/40 italic mt-1.5">
            These are starting points — use fewer, combine them, or add your own.
          </p>
        </>
      )}

      {/* Why it works */}
      {idea.whyItWorks && (
        <p className="text-xs text-[#2f3437]/50 dark:text-white/50 italic border-t border-[#2f3437]/5 dark:border-white/5 pt-2">
          {idea.whyItWorks}
        </p>
      )}

      {idea.dataToFind && (
        <div className="border-t border-[#2f3437]/5 dark:border-white/5 pt-2 mt-1">
          <p className="text-xs font-medium text-[#2f3437]/60 dark:text-white/60 mb-1">Data to Find:</p>
          <p className="text-xs text-[#2f3437]/50 dark:text-white/50">
            {idea.dataToFind}
          </p>
        </div>
      )}

      {createdPlan && (
        <ContentPlanEditModal
          plan={createdPlan}
          serviceTier={plannerServiceTier}
          apiBase="/api/member/content-plans"
          onClose={() => setCreatedPlan(null)}
          onSaved={() => { setCreatedPlan(null); }}
          onDeleted={() => { setCreatedPlan(null); setAddedToPlanner(false); }}
        />
      )}

      {/* Build Script + Add to Planner */}
      <div className="border-t border-[#2f3437]/5 dark:border-white/5 pt-2 flex gap-2">
        <button
          onClick={handleBuildScript}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold text-[#2f3437] dark:text-white bg-[#111]/5 dark:bg-white/5 hover:bg-[#6ba3c7]/10 hover:text-[#6ba3c7] dark:hover:text-[#6ba3c7] rounded-lg transition-colors"
        >
          <span>🎬</span>
          {createdPlan?.id ? "Build Script (updates this plan)" : "Build Script"}
        </button>
        {addedToPlanner ? (
          <Link
            href={pathname.startsWith("/admin") ? "/admin/content-calendar" : "/member/content-planner"}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold rounded-lg bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400 hover:bg-green-100 transition-colors"
          >
            <span>✓</span>
            In Planner →
          </Link>
        ) : (
          <button
            onClick={handleAddToPlanner}
            disabled={addingToPlanner}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold rounded-lg transition-colors text-[#2f3437] dark:text-white bg-[#111]/5 dark:bg-white/5 hover:bg-[#6ba3c7]/10 hover:text-[#6ba3c7] dark:hover:text-[#6ba3c7]"
          >
            <span>📅</span>
            {addingToPlanner ? "Adding…" : "Add to Planner"}
          </button>
        )}
      </div>
    </div>
  );
}

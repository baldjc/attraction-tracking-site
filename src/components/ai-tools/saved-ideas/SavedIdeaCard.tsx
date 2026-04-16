"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import UpgradeModal, { type UpgradeTrigger } from "@/components/upgrade/UpgradeModal";

export interface SavedIdea {
  id: string;
  theme: string;
  title: string;
  talkingPoints: unknown;
  dataToFind?: string | null;
  framework?: string | null;
  whyItWorks?: string | null;
  source?: string | null;
  createdAt: string;
}

interface Props {
  idea: SavedIdea;
  onDeleted: () => void;
  isFoundations: boolean;
  upgradeFlagOn: boolean;
  alreadyDismissed: boolean;
}

function getTalkingPoints(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string");
  return [];
}

export default function SavedIdeaCard({
  idea,
  onDeleted,
  isFoundations,
  upgradeFlagOn,
  alreadyDismissed,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState<UpgradeTrigger | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  const talkingPoints = getTalkingPoints(idea.talkingPoints);
  const shouldGate = isFoundations && upgradeFlagOn && !alreadyDismissed;

  async function handleAddToPlanner() {
    if (added || adding) return;
    if (shouldGate) {
      setShowUpgrade("add_to_planner");
      return;
    }
    setAdding(true);
    try {
      let notes: string | undefined;
      if (talkingPoints.length > 0) {
        notes = "• " + talkingPoints.join("\n• ");
        if (idea.dataToFind) notes += "\n\n--- Data to Find ---\n" + idea.dataToFind;
      } else if (idea.dataToFind) {
        notes = "--- Data to Find ---\n" + idea.dataToFind;
      }
      const res = await fetch("/api/member/content-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: idea.title,
          theme: idea.theme,
          status: "Idea",
          ...(notes ? { notes } : {}),
          linkedIdeaId: idea.id,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAdded(true);
        if (data?.plan?.id) setPlanId(data.plan.id);
      }
    } finally {
      setAdding(false);
    }
  }

  function handleBuildScript() {
    sessionStorage.setItem(
      "arc_prefill",
      JSON.stringify({
        title: idea.title,
        talkingPoints,
        theme: idea.theme,
        framework: idea.framework ?? "",
        whyItWorks: idea.whyItWorks ?? "",
        dataToFind: idea.dataToFind ?? null,
        ideaId: idea.id,
        ...(planId ? { planId } : {}),
      })
    );
    const base = pathname.startsWith("/admin") ? "/admin" : "/member";
    router.push(`${base}/ai-tools/arc-script-builder`);
  }

  async function handleDelete() {
    if (deleting) return;
    if (!confirm("Delete this saved idea?")) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/ai-tools/content-engine/delete-idea", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: idea.id }),
      });
      if (res.ok) onDeleted();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-[#2f3437]/10 p-4 space-y-3 hover:shadow-sm transition-shadow">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider bg-[#6ba3c7]/10 text-[#6ba3c7] px-2 py-0.5 rounded-full">
                {idea.theme}
              </span>
              {idea.framework && (
                <span className="text-[10px] text-[#2f3437]/40">{idea.framework}</span>
              )}
            </div>
            <h3 className="font-semibold text-[#2f3437] text-sm leading-snug">{idea.title}</h3>
          </div>
          <button
            onClick={handleDelete}
            disabled={deleting}
            title="Delete idea"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#2f3437]/30 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
          >
            {deleting ? <span className="text-xs animate-spin">↻</span> : <span className="text-sm">🗑</span>}
          </button>
        </div>

        {talkingPoints.length > 0 && (
          <ol className="space-y-1">
            {talkingPoints.map((pt, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-[#2f3437]/70">
                <span className="text-[#6ba3c7] font-bold">{i + 1}.</span>
                <span>{pt}</span>
              </li>
            ))}
          </ol>
        )}

        {idea.whyItWorks && (
          <p className="text-xs text-[#2f3437]/50 italic border-t border-[#2f3437]/5 pt-2">
            {idea.whyItWorks}
          </p>
        )}

        {idea.dataToFind && (
          <div className="border-t border-[#2f3437]/5 pt-2">
            <p className="text-xs font-medium text-[#2f3437]/60 mb-1">Data to Find:</p>
            <p className="text-xs text-[#2f3437]/50">{idea.dataToFind}</p>
          </div>
        )}

        <div className="border-t border-[#2f3437]/5 pt-2 flex gap-2">
          <button
            onClick={handleBuildScript}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold text-[#2f3437] bg-[#111]/5 hover:bg-[#6ba3c7]/10 hover:text-[#6ba3c7] rounded-lg transition-colors"
          >
            <span>🎬</span> Build Script
          </button>
          {added ? (
            <Link
              href="/member/content-planner"
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
            >
              <span>✓</span> In Planner →
            </Link>
          ) : (
            <button
              onClick={handleAddToPlanner}
              disabled={adding}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold rounded-lg text-[#2f3437] bg-[#111]/5 hover:bg-[#6ba3c7]/10 hover:text-[#6ba3c7] transition-colors"
            >
              <span>📅</span>
              {adding ? "Adding…" : "Add to Planner"}
            </button>
          )}
        </div>

        <p className="text-[10px] text-[#2f3437]/35">
          Saved {new Date(idea.createdAt).toLocaleDateString()}
        </p>
      </div>

      <UpgradeModal
        trigger={showUpgrade ?? "add_to_planner"}
        open={!!showUpgrade}
        onClose={() => setShowUpgrade(null)}
      />
    </>
  );
}

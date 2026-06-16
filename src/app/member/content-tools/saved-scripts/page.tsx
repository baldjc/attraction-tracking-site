"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeftIcon, DocumentTextIcon, ClockIcon, ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";

interface SavedScript {
  id: string;
  videoTitle: string;
  arcScores: unknown;
  createdAt: string;
  scriptOpening: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

function ScriptCard({ script }: { script: SavedScript }) {
  const [expanded, setExpanded] = useState(false);
  const [addingToPlanner, setAddingToPlanner] = useState(false);
  const [addedToPlanner, setAddedToPlanner] = useState(false);
  const hasPreview = script.scriptOpening.trim().length > 0;

  async function handleAddToPlanner() {
    if (addedToPlanner || addingToPlanner) return;
    setAddingToPlanner(true);
    try {
      await fetch("/api/member/content-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: script.videoTitle,
          status: "Scripted",
          linkedScriptId: script.id,
        }),
      });
      setAddedToPlanner(true);
    } catch {
      /* silently fail */
    } finally {
      setAddingToPlanner(false);
    }
  }

  return (
    <div className="bg-white border border-[var(--abv-text)]/10 rounded-xl overflow-hidden transition-shadow hover:shadow-sm">
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[var(--abv-ai-tools)]/10 flex items-center justify-center shrink-0 mt-0.5">
              <DocumentTextIcon className="w-5 h-5 text-[var(--abv-ai-tools)]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-[var(--abv-text)] leading-snug">{script.videoTitle}</h3>
              <div className="flex items-center gap-1.5 mt-1">
                <ClockIcon className="w-3.5 h-3.5 text-[var(--abv-text)]/35 shrink-0" />
                <span className="text-xs text-[var(--abv-text)]/45">{formatDate(script.createdAt)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleAddToPlanner}
              disabled={addedToPlanner || addingToPlanner}
              className={`inline-flex items-center gap-1 text-xs font-medium transition-colors mt-1 ${
                addedToPlanner
                  ? "text-green-600 cursor-default"
                  : "text-[var(--abv-text)]/45 hover:text-[var(--abv-ai-tools)]"
              }`}
            >
              <span>{addedToPlanner ? "✓" : "📅"}</span>
              {addingToPlanner ? "Adding…" : addedToPlanner ? "In Planner" : "Add to Planner"}
            </button>
            {hasPreview && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="flex items-center gap-1 text-xs text-[var(--abv-ai-tools)] hover:text-[var(--abv-ai-tools)] font-medium transition-colors mt-1"
              >
                {expanded ? (
                  <>Hide preview <ChevronUpIcon className="w-3.5 h-3.5" /></>
                ) : (
                  <>View script <ChevronDownIcon className="w-3.5 h-3.5" /></>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {expanded && hasPreview && (
        <div className="px-5 pb-5 pt-0">
          <div className="bg-[var(--abv-bg)] rounded-lg p-4 border border-[var(--abv-text)]/8">
            <p className="text-xs font-semibold text-[var(--abv-text)]/50 uppercase tracking-wider mb-2">Script Preview</p>
            <pre className="text-sm text-[var(--abv-text)]/75 whitespace-pre-wrap font-sans leading-relaxed">
              {script.scriptOpening}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SavedScriptsPage() {
  const [scripts, setScripts] = useState<SavedScript[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/ai-tools/saved-scripts")
      .then((r) => r.json())
      .then((d) => {
        setScripts(d.scripts ?? []);
      })
      .catch(() => setError("Failed to load saved scripts."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-6">
        <Link
          href="/member/content-tools"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--abv-text)]/50 hover:text-[var(--abv-ai-tools)] transition-colors mb-4"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Content Tools
        </Link>
        <h1 className="text-2xl font-bold text-[var(--abv-text)]">Saved Scripts</h1>
        <p className="text-sm text-[var(--abv-text)]/60 mt-1">Your last 30 ARC scripts — saved after completing the builder.</p>
      </div>

      {loading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-white border border-[var(--abv-text)]/10 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && scripts.length === 0 && (
        <div className="bg-white border border-[var(--abv-text)]/10 rounded-xl px-6 py-12 text-center">
          <DocumentTextIcon className="w-10 h-10 text-[var(--abv-text)]/20 mx-auto mb-3" />
          <p className="font-semibold text-[var(--abv-text)] mb-1">No scripts saved yet</p>
          <p className="text-sm text-[var(--abv-text)]/50 mb-5">
            Complete an ARC Script Builder session and save your script to see it here.
          </p>
          <Link
            href="/member/content-tools/arc-script-builder"
            className="inline-flex items-center gap-2 bg-[var(--abv-ai-tools)] hover:bg-[var(--abv-ai-tools)]/85 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
          >
            Start building
          </Link>
        </div>
      )}

      {!loading && !error && scripts.length > 0 && (
        <div className="space-y-3">
          {scripts.map((s) => (
            <ScriptCard key={s.id} script={s} />
          ))}
        </div>
      )}
    </div>
  );
}

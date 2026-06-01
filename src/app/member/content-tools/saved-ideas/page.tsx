"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import SavedIdeaCard, { type SavedIdea } from "@/components/ai-tools/saved-ideas/SavedIdeaCard";
import { useUpgradeGate } from "@/components/upgrade/useUpgradeGate";

export default function SavedIdeasPage() {
  const [ideas, setIdeas] = useState<SavedIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeThemes, setActiveThemes] = useState<Set<string>>(new Set());
  const gate = useUpgradeGate();

  useEffect(() => {
    fetch("/api/ai-tools/content-engine/saved-ideas?limit=200")
      .then((r) => r.json())
      .then((d) => {
        setIdeas(Array.isArray(d?.ideas) ? d.ideas : []);
      })
      .catch(() => setError("Failed to load saved ideas."))
      .finally(() => setLoading(false));
  }, []);

  const themes = useMemo(() => {
    const s = new Set<string>();
    ideas.forEach((i) => i.theme && s.add(i.theme));
    return Array.from(s).sort();
  }, [ideas]);

  const filtered = useMemo(() => {
    if (activeThemes.size === 0) return ideas;
    return ideas.filter((i) => activeThemes.has(i.theme));
  }, [ideas, activeThemes]);

  function toggleTheme(theme: string) {
    setActiveThemes((prev) => {
      const next = new Set(prev);
      if (next.has(theme)) next.delete(theme);
      else next.add(theme);
      return next;
    });
  }

  function handleDeleted(id: string) {
    setIdeas((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <PageHeader
        emoji="💡"
        title="My Saved Ideas"
        description="Every idea you've starred. Push to your planner or build a script when you're ready."
      />

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-44 bg-white border border-[var(--abv-text)]/10 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700">{error}</div>
      )}

      {!loading && !error && ideas.length === 0 && (
        <div className="bg-white border border-[var(--abv-text)]/10 rounded-xl px-6 py-12 text-center">
          <p className="text-3xl mb-3">💡</p>
          <p className="font-semibold text-[var(--abv-text)] mb-1">No saved ideas yet</p>
          <p className="text-sm text-[var(--abv-text)]/50 mb-5">
            Star ideas in the Content Engine to save them here for later.
          </p>
          <Link
            href="/member/content-tools/content-engine"
            className="inline-flex items-center gap-2 $1var(--abv-ai-tools)$2 hover:bg-[var(--abv-ai-tools)]/85 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
          >
            Go to Content Engine →
          </Link>
        </div>
      )}

      {!loading && !error && ideas.length > 0 && (
        <>
          {themes.length > 1 && (
            <div className="flex items-center gap-2 flex-wrap mb-5">
              <span className="text-xs font-semibold text-[var(--abv-text)]/50 uppercase tracking-wider mr-1">
                Filter:
              </span>
              {themes.map((t) => {
                const active = activeThemes.has(t);
                return (
                  <button
                    key={t}
                    onClick={() => toggleTheme(t)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                      active
                        ? "bg-[var(--abv-ai-tools)] border-[var(--abv-ai-tools)] text-white"
                        : "bg-white border-[var(--abv-text)]/15 text-[var(--abv-text)]/70 hover:border-[var(--abv-ai-tools)] hover:text-[var(--abv-ai-tools)]"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
              {activeThemes.size > 0 && (
                <button
                  onClick={() => setActiveThemes(new Set())}
                  className="text-xs text-[var(--abv-text)]/40 hover:text-[var(--abv-text)] underline"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {filtered.length === 0 ? (
            <p className="text-sm text-[var(--abv-text)]/50">No ideas match the selected themes.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filtered.map((idea) => (
                <SavedIdeaCard
                  key={idea.id}
                  idea={idea}
                  onDeleted={() => handleDeleted(idea.id)}
                  isFoundations={gate.isFoundations}
                  upgradeFlagOn={gate.flagOn}
                  alreadyDismissed={gate.dismissed.has("add_to_planner")}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

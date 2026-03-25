"use client";

import { useState, useEffect } from "react";
import IdeaCard, { Idea } from "./IdeaCard";

export interface ContentTheme {
  name: string;
  emoji?: string | null;
  colour?: string | null;
  coreStress?: string | null;
  content_engine_prompt?: string | null;
}

interface SavedIdea {
  id: string;
  title: string;
  talkingPoints: string[];
  framework: string | null;
  whyItWorks: string | null;
  source: string;
  createdAt: string;
}

interface Props {
  theme: ContentTheme | string;
  index: number;
  onGoDeeper: (theme: ContentTheme | string) => void;
  initialIdeas?: Idea[];
}

const FALLBACK_EMOJIS = ["🎯", "⚡", "🔥", "🌿", "💡", "💎", "🌊", "🚀"];
const FALLBACK_COLOURS = ["#3B82F6", "#F59E0B", "#EF4444", "#10B981", "#8B5CF6", "#EC4899", "#06B6D4", "#F97316"];

function themeObj(t: ContentTheme | string, index: number): ContentTheme {
  const fallbackEmoji = FALLBACK_EMOJIS[index % FALLBACK_EMOJIS.length];
  const fallbackColour = FALLBACK_COLOURS[index % FALLBACK_COLOURS.length];
  if (typeof t === "string") {
    return { name: t, emoji: fallbackEmoji, colour: fallbackColour, coreStress: null };
  }
  return { ...t, emoji: t.emoji ?? fallbackEmoji, colour: t.colour ?? fallbackColour };
}

export default function ThemeCard({ theme, index, onGoDeeper, initialIdeas }: Props) {
  const t = themeObj(theme, index);
  const colour = t.colour ?? "#3dc3ff";

  const [expanded, setExpanded] = useState(false);
  const [ideas, setIdeas] = useState<Idea[]>([]);

  useEffect(() => {
    if (initialIdeas && initialIdeas.length > 0) {
      setIdeas(initialIdeas);
      setExpanded(true);
    }
  }, [initialIdeas]);

  const [shownTitles, setShownTitles] = useState<string[]>([]);
  const [savedIdeas, setSavedIdeas] = useState<SavedIdea[]>([]);
  const [savedPage, setSavedPage] = useState(1);
  const [savedTotal, setSavedTotal] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [savedLoaded, setSavedLoaded] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/ai-tools/content-engine/saved-ideas?theme=${encodeURIComponent(t.name)}&limit=1`)
      .then((r) => r.json())
      .then((d) => { if (d.total != null) setSavedCount(d.total); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadSaved(page = 1) {
    setLoadingSaved(true);
    try {
      const res = await fetch(`/api/ai-tools/content-engine/saved-ideas?theme=${encodeURIComponent(t.name)}&page=${page}&limit=20`);
      const data = await res.json();
      setSavedIdeas(data.ideas ?? []);
      setSavedTotal(data.total ?? 0);
      setSavedPage(page);
      setSavedCount(data.total ?? 0);
    } finally {
      setLoadingSaved(false);
      setSavedLoaded(true);
    }
  }

  function handleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next && !savedLoaded) loadSaved(1);
  }

  async function callBatch(): Promise<Idea[]> {
    const res = await fetch("/api/ai-tools/content-engine/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: t.name, shownTitles }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? `Server error ${res.status}`);
    }
    return (data.ideas ?? []) as Idea[];
  }

  async function handleGenerate() {
    setExpanded(true);
    setGenerating(true);
    setGenerateError(null);
    try {
      const newIdeas = await callBatch();
      setIdeas(newIdeas);
      const allTitles = newIdeas.flatMap((i) =>
        i.titleOptions?.map((o) => o.title) ?? (i.title ? [i.title] : [])
      );
      setShownTitles((prev) => [...new Set([...prev, ...allTitles])]);
    } catch (err) {
      console.error("[ThemeCard] Generate failed:", err);
      setGenerateError(err instanceof Error ? err.message : "Generation failed. Please try again.");
    } finally {
      setGenerating(false);
    }
    if (!savedLoaded) loadSaved(1);
  }

  async function handleGenerateMore() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const newIdeas = await callBatch();
      setIdeas(newIdeas);
      const allTitles = newIdeas.flatMap((i) =>
        i.titleOptions?.map((o) => o.title) ?? (i.title ? [i.title] : [])
      );
      setShownTitles((prev) => [...new Set([...prev, ...allTitles])]);
    } catch (err) {
      console.error("[ThemeCard] Generate more failed:", err);
      setGenerateError(err instanceof Error ? err.message : "Generation failed. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleDeleteSaved(id: string) {
    const res = await fetch("/api/ai-tools/content-engine/delete-idea", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setSavedIdeas((prev) => prev.filter((s) => s.id !== id));
      setSavedTotal((prev) => prev - 1);
      setSavedCount((prev) => (prev ?? 1) - 1);
    }
  }

  const displaySavedCount = savedCount ?? 0;

  return (
    <div
      className="bg-white dark:bg-[#242b3d] rounded-2xl border border-[#1e2a38]/10 dark:border-white/10 overflow-hidden shadow-sm"
      style={{ borderTopColor: colour, borderTopWidth: 3 }}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {t.emoji && <span className="text-2xl flex-shrink-0">{t.emoji}</span>}
            <div className="min-w-0">
              <h3 className="font-bold text-[#1e2a38] dark:text-white text-sm">{t.name}</h3>
              {t.coreStress && (
                <p className="text-xs text-[#1e2a38]/50 dark:text-white/50 mt-0.5 italic leading-relaxed">"{t.coreStress}"</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {displaySavedCount > 0 && (
              <span className="text-xs bg-[#f1f1ef] dark:bg-white/10 text-[#1e2a38]/60 dark:text-white/60 px-2 py-0.5 rounded-full font-medium">
                {displaySavedCount} saved
              </span>
            )}
            <button
              onClick={handleExpand}
              className="text-[#1e2a38]/30 dark:text-white/30 hover:text-[#1e2a38]/60 dark:hover:text-white/60 transition-colors text-sm px-1"
            >
              {expanded ? "▲" : "▼"}
            </button>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex-1 text-sm font-semibold py-2 rounded-lg transition-colors disabled:opacity-50 text-white"
            style={{ backgroundColor: colour }}
          >
            {generating ? "Generating..." : ideas.length > 0 ? "Regenerate" : "Generate Ideas"}
          </button>
          <button
            onClick={() => onGoDeeper(theme)}
            className="px-4 text-sm font-semibold py-2 rounded-lg border border-[#1e2a38]/20 dark:border-white/20 text-[#1e2a38] dark:text-white hover:border-[#1e2a38]/40 dark:hover:border-white/40 transition-colors"
          >
            Go Deeper
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[#1e2a38]/10 dark:border-white/10 bg-[#fafafa] dark:bg-[#1a1f2e]">
          {generateError && (
            <div className="mx-4 mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
              {generateError}
            </div>
          )}
          {ideas.length > 0 && (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold text-[#1e2a38]/50 dark:text-white/50 uppercase tracking-wide">Generated Ideas</h4>
                <button
                  onClick={handleGenerateMore}
                  disabled={generating}
                  className="text-xs text-[#3dc3ff] hover:text-[#2bb0ec] font-medium disabled:opacity-50"
                >
                  {generating ? "Generating..." : "Generate More"}
                </button>
              </div>
              <div className="space-y-3">
                {generating && ideas.length === 0 ? (
                  <div className="text-center py-6 text-sm text-[#1e2a38]/40 dark:text-white/40">Generating ideas...</div>
                ) : (
                  ideas.map((idea, i) => (
                    <IdeaCard
                      key={i}
                      idea={idea}
                      theme={t.name}
                      onSaved={(id) => {
                        setSavedTotal((prev) => prev + 1);
                        setSavedCount((prev) => (prev ?? 0) + 1);
                        const newSaved: SavedIdea = {
                          id,
                          title: idea.title ?? "",
                          talkingPoints: idea.talkingPoints ?? [],
                          framework: idea.framework ?? null,
                          whyItWorks: idea.whyItWorks ?? null,
                          source: "batch",
                          createdAt: new Date().toISOString(),
                        };
                        setSavedIdeas((prev) => [newSaved, ...prev]);
                        setSavedLoaded(true);
                      }}
                    />
                  ))
                )}
              </div>
            </div>
          )}

          {generating && ideas.length === 0 && (
            <div className="p-6 text-center text-sm text-[#1e2a38]/40 dark:text-white/40">Generating ideas...</div>
          )}

          <div className="p-4 border-t border-[#1e2a38]/10 dark:border-white/10">
            <h4 className="text-xs font-semibold text-[#1e2a38]/50 dark:text-white/50 uppercase tracking-wide mb-3">
              Saved Ideas {savedTotal > 0 && `(${savedTotal})`}
            </h4>

            {loadingSaved ? (
              <p className="text-xs text-[#1e2a38]/40 dark:text-white/40 text-center py-4">Loading saved ideas...</p>
            ) : savedIdeas.length === 0 ? (
              <p className="text-xs text-[#1e2a38]/40 dark:text-white/40 text-center py-4">No saved ideas yet. Generate some and star the ones you like.</p>
            ) : (
              <div className="space-y-3">
                {savedIdeas.map((idea) => (
                  <IdeaCard
                    key={idea.id}
                    idea={{ title: idea.title, talkingPoints: idea.talkingPoints, framework: idea.framework, whyItWorks: idea.whyItWorks }}
                    theme={t.name}
                    savedId={idea.id}
                    onDelete={() => handleDeleteSaved(idea.id)}
                  />
                ))}
                {savedTotal > savedIdeas.length && (
                  <button
                    onClick={() => loadSaved(savedPage + 1)}
                    className="w-full text-xs text-[#3dc3ff] hover:text-[#2bb0ec] font-medium py-2"
                  >
                    Load more
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

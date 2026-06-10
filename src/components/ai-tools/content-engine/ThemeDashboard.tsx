"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import PromptEditor from "@/components/ai-tools/PromptEditor";
import ThemeCard, { ContentTheme } from "./ThemeCard";
import ContentEngineChat from "./ContentEngineChat";
import NicheSetup from "./NicheSetup";
import type { Idea } from "./IdeaCard";
import { AiThinking } from "@/components/ai/AiThinking";
import { useAiThinking } from "@/lib/use-ai-thinking";
import { Button } from "@/components/ui/Button";

interface Props {
  themes: Array<ContentTheme | string>;
  niche: string | null;
  city: string | null;
}

export default function ThemeDashboard({ themes, niche, city }: Props) {
  const [chatTheme, setChatTheme] = useState<ContentTheme | string | null>(null);
  const [showNicheModal, setShowNicheModal] = useState(false);
  const [currentNiche, setCurrentNiche] = useState(niche);
  const [currentCity, setCurrentCity] = useState(city);
  const [generatingAll, setGeneratingAll] = useState(false);
  const aiThinking = useAiThinking({
    mode: "phase",
    fallbackPhases: [
      "Generating ideas across all Avatar Stressors…",
      "This usually takes 30–60 seconds…",
    ],
  });
  const [allGenerated, setAllGenerated] = useState<Record<string, Idea[]>>({});
  const [reordering, setReordering] = useState(false);
  const [orderedThemes, setOrderedThemes] = useState<Array<ContentTheme | string>>(themes);
  const [savingOrder, setSavingOrder] = useState(false);

  const hasOldFormat = themes.some((t) => {
    if (typeof t === "string") return true;
    const obj = t as ContentTheme;
    return !obj.colour;
  });

  const themeName = (t: ContentTheme | string) => (typeof t === "string" ? t : t.name);

  function moveTheme(index: number, direction: -1 | 1) {
    const next = [...orderedThemes];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOrderedThemes(next);
  }

  async function saveOrder() {
    setSavingOrder(true);
    try {
      await fetch("/api/member/avatar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentThemes: orderedThemes }),
      });
      setReordering(false);
    } finally {
      setSavingOrder(false);
    }
  }

  function cancelReorder() {
    setOrderedThemes(themes);
    setReordering(false);
  }

  async function handleGenerateAll() {
    setGeneratingAll(true);
    aiThinking.start();
    try {
      const results = await Promise.allSettled(
        themes.map(async (t) => {
          const res = await fetch("/api/ai-tools/content-engine/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ theme: themeName(t) }),
          });
          const data = await res.json();
          return { theme: themeName(t), ideas: data.ideas ?? [] };
        })
      );
      const map: Record<string, Idea[]> = {};
      for (const r of results) {
        if (r.status === "fulfilled") {
          map[r.value.theme] = r.value.ideas;
        }
      }
      setAllGenerated(map);
    } finally {
      aiThinking.stop();
      setGeneratingAll(false);
    }
  }

  if (chatTheme) {
    return (
      <div className="bg-white dark:bg-[#1a1a1a] rounded-lg border border-[var(--abv-text)]/10 dark:border-white/10 p-6 h-[calc(100vh-200px)] flex flex-col">
        <ContentEngineChat theme={chatTheme} onBack={() => setChatTheme(null)} />
      </div>
    );
  }

  return (
    <div>
      <PromptEditor toolKey="content_engine_prompt" defaultPrompt="" placeholders={[]} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link
            href="/member/content-tools"
            className="flex items-center gap-1.5 text-xs text-[var(--abv-text)]/50 dark:text-white/50 hover:text-[var(--abv-ai-tools)] transition-colors mb-3"
          >
            <ArrowLeftIcon className="w-3.5 h-3.5" />
            Back to Content Tools
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-[var(--abv-text)] dark:text-white">🚀 Content Engine</h1>
            <Link
              href="/member/content-tools/saved-ideas"
              className="text-xs font-medium text-[var(--abv-ai-tools)] hover:text-[var(--abv-ai-tools)] transition-colors"
            >
              💡 My saved ideas →
            </Link>
          </div>
          <p className="text-sm text-[var(--abv-text)]/50 dark:text-white/50 mt-0.5">
            {currentNiche
              ? `${currentNiche === "real_estate" ? "Real Estate" : currentNiche === "financial_planning" ? "Financial Planning" : "Other"}${currentCity ? ` · ${currentCity}` : ""}`
              : "No niche set"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {reordering ? (
            <>
              <Button variant="aiTools" size="sm" onClick={saveOrder} disabled={savingOrder}>
                {savingOrder ? "Saving..." : "Save Order"}
              </Button>
              <Button variant="outline" size="sm" onClick={cancelReorder}>Cancel</Button>
            </>
          ) : (
            <>
              <Button variant="aiTools" size="sm" onClick={handleGenerateAll} disabled={generatingAll}>
                {generatingAll ? "Generating..." : "Generate All"}
              </Button>
              <button
                onClick={() => setReordering(true)}
                className="w-9 h-9 rounded-lg border border-[var(--abv-text)]/20 dark:border-white/20 flex items-center justify-center text-[var(--abv-text)]/50 dark:text-white/50 hover:text-[var(--abv-text)] dark:hover:text-white hover:border-[var(--abv-text)]/40 dark:hover:border-white/40 transition-colors"
                title="Reorder Avatar Stressors"
              >
                ↕
              </button>
              <button
                onClick={() => setShowNicheModal(true)}
                className="w-9 h-9 rounded-lg border border-[var(--abv-text)]/20 dark:border-white/20 flex items-center justify-center text-[var(--abv-text)]/50 dark:text-white/50 hover:text-[var(--abv-text)] dark:hover:text-white hover:border-[var(--abv-text)]/40 dark:hover:border-white/40 transition-colors"
                title="Edit niche settings"
              >
                ⚙
              </button>
            </>
          )}
        </div>
      </div>

      {hasOldFormat && (
        <div className="mb-5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-start gap-3">
          <span className="text-amber-500 text-lg flex-shrink-0">⚠️</span>
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Your Avatar Stressors are from an older format</p>
            <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
              Re-run the Avatar Architect to get emoji, colour, and stress quotes on your Avatar Stressor cards. The Content Engine still works fully in the meantime.
            </p>
          </div>
        </div>
      )}

      {generatingAll && (
        <div className="mb-4 flex justify-center">
          <AiThinking
            mode="phase"
            toolName="Content Engine"
            currentPhase={aiThinking.phaseLabel}
          />
        </div>
      )}

      {reordering ? (
        <div className="space-y-3">
          <p className="text-xs text-[var(--abv-text)]/40 dark:text-white/40 mb-4">Use the arrows to set the order you want, then click Save Order.</p>
          {orderedThemes.map((t, i) => {
            const obj = typeof t === "string" ? null : t as ContentTheme;
            const name = typeof t === "string" ? t : t.name;
            const emoji = obj?.emoji ?? "🎯";
            const colour = obj?.colour ?? "var(--abv-ai-tools)";
            return (
              <div key={i} className="flex items-center gap-3 bg-white dark:bg-[#1a1a1a] rounded-lg border border-[var(--abv-text)]/10 dark:border-white/10 p-4">
                <span className="text-xl flex-shrink-0">{emoji}</span>
                <div
                  className="w-1 h-8 rounded-full flex-shrink-0"
                  style={{ backgroundColor: colour }}
                />
                <span className="flex-1 font-medium text-[var(--abv-text)] dark:text-white text-sm">{name}</span>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => moveTheme(i, -1)}
                    disabled={i === 0}
                    className="w-7 h-7 rounded-md border border-[var(--abv-text)]/15 dark:border-white/15 flex items-center justify-center text-[var(--abv-text)]/50 dark:text-white/50 hover:text-[var(--abv-text)] dark:hover:text-white hover:border-[var(--abv-text)]/30 dark:hover:border-white/30 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-xs"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveTheme(i, 1)}
                    disabled={i === orderedThemes.length - 1}
                    className="w-7 h-7 rounded-md border border-[var(--abv-text)]/15 dark:border-white/15 flex items-center justify-center text-[var(--abv-text)]/50 dark:text-white/50 hover:text-[var(--abv-text)] dark:hover:text-white hover:border-[var(--abv-text)]/30 dark:hover:border-white/30 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-xs"
                  >
                    ▼
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
          {orderedThemes.map((t, i) => (
            <ThemeCard
              key={i}
              theme={t}
              index={i}
              onGoDeeper={(theme) => setChatTheme(theme)}
              initialIdeas={allGenerated[themeName(t)]}
            />
          ))}
        </div>
      )}

      {showNicheModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#1a1a1a] rounded-lg border border-[var(--abv-text)]/10 dark:border-white/10 p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-[var(--abv-text)] dark:text-white">Niche Settings</h2>
              <button
                onClick={() => setShowNicheModal(false)}
                className="text-[var(--abv-text)]/40 dark:text-white/40 hover:text-[var(--abv-text)] dark:hover:text-white text-xl"
              >
                ✕
              </button>
            </div>
            <NicheSetup
              initialNiche={currentNiche}
              initialCity={currentCity}
              isModal
              onSaved={(n, c) => {
                setCurrentNiche(n);
                setCurrentCity(c);
                setShowNicheModal(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  VideoCameraIcon,
  AcademicCapIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { getSectionIcon } from "@/lib/academy-section-icons";

interface Section {
  id: string;
  title: string;
  slug: string;
  sortOrder: number;
  lessonCount: number;
  completedCount: number;
}

interface Lesson {
  id: string;
  title: string;
  slug: string;
  sortOrder: number;
  completedAt: string | null;
}

interface ContinueTarget {
  sectionSlug: string;
  sectionTitle: string;
  sectionSortOrder: number;
  lessonSlug: string;
  lessonTitle: string;
  sectionLessonCount: number;
  sectionCompletedCount: number;
}

function SectionCardSkeleton() {
  return (
    <div className="bg-white dark:bg-[#1a2433] border border-[var(--abv-border-strong)] dark:border-white/10 rounded-xl p-5 animate-pulse">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-[var(--abv-border-strong)] dark:bg-white/10 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="h-4 bg-[var(--abv-border-strong)] dark:bg-white/10 rounded w-3/4 mb-2" />
          <div className="h-3 bg-[var(--abv-border-strong)] dark:bg-white/10 rounded w-1/3 mb-4" />
          <div className="h-1.5 bg-[var(--abv-border-strong)] dark:bg-white/10 rounded-full mb-2" />
          <div className="h-3 bg-[var(--abv-border-strong)] dark:bg-white/10 rounded w-1/4" />
        </div>
      </div>
    </div>
  );
}

export default function AcademyHome() {
  const [sections, setSections] = useState<Section[]>([]);
  const [continueTarget, setContinueTarget] = useState<ContinueTarget | null>(null);
  const [liveCallCount, setLiveCallCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [allComplete, setAllComplete] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [sectionsRes, callsRes] = await Promise.all([
          fetch("/api/member/academy/sections"),
          fetch("/api/member/academy/live-calls"),
        ]);

        const sectionsRaw = sectionsRes.ok ? await sectionsRes.json() : [];
        const sectionsData: Section[] = Array.isArray(sectionsRaw) ? sectionsRaw : (sectionsRaw.sections ?? []);
        const callsData = callsRes.ok ? await callsRes.json() : [];

        setSections(sectionsData);
        setLiveCallCount(Array.isArray(callsData) ? callsData.length : 0);

        const totalLessons = sectionsData.reduce((s, sec) => s + sec.lessonCount, 0);
        const totalCompleted = sectionsData.reduce((s, sec) => s + sec.completedCount, 0);

        if (totalLessons > 0 && totalCompleted >= totalLessons) {
          setAllComplete(true);
          setLoading(false);
          return;
        }

        // Find the first section that is not fully complete
        const continueSection = sectionsData.find(
          (sec) => sec.completedCount < sec.lessonCount
        );

        if (continueSection) {
          try {
            const lessonsRes = await fetch(
              `/api/member/academy/sections/${continueSection.slug}/lessons`
            );
            if (lessonsRes.ok) {
              const lessons: Lesson[] = await lessonsRes.json();
              const firstIncomplete = lessons
                .slice()
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .find((l) => !l.completedAt);

              if (firstIncomplete) {
                setContinueTarget({
                  sectionSlug: continueSection.slug,
                  sectionTitle: continueSection.title,
                  sectionSortOrder: continueSection.sortOrder,
                  lessonSlug: firstIncomplete.slug,
                  lessonTitle: firstIncomplete.title,
                  sectionLessonCount: continueSection.lessonCount,
                  sectionCompletedCount: continueSection.completedCount,
                });
              }
            }
          } catch {
            // silently skip; hero will just not show
          }
        }
      } catch {
        // leave state as defaults
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const totalCompleted = sections.reduce((s, sec) => s + sec.completedCount, 0);

  // ── Zone 1: Continue Learning Hero ──────────────────────────────────────────

  function HeroCard() {
    if (loading) {
      return (
        <div className="bg-gradient-to-r from-[var(--abv-azure)]/5 to-[var(--abv-azure)]/10 dark:from-[var(--abv-azure)]/10 dark:to-[var(--abv-azure)]/15 border border-[var(--abv-azure)]/20 dark:border-[var(--abv-azure)]/30 rounded-2xl p-6 animate-pulse">
          <div className="h-3 bg-[var(--abv-dark)]/20 rounded w-24 mb-3" />
          <div className="h-3 bg-[var(--abv-dark)]/20 rounded w-40 mb-2" />
          <div className="h-6 bg-[var(--abv-dark)]/20 rounded w-2/3 mb-5" />
          <div className="h-1.5 bg-[var(--abv-dark)]/20 rounded-full" />
        </div>
      );
    }

    if (allComplete) {
      return (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-700/40 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <CheckCircleIcon className="w-7 h-7 text-green-500 shrink-0" />
            <span className="text-xs font-semibold tracking-widest text-green-600 dark:text-green-400 uppercase">
              Course Complete!
            </span>
          </div>
          <p className="text-[var(--abv-text)] dark:text-white font-semibold text-lg mb-4">
            You&apos;ve completed the entire Foundations course — well done!
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/member/academy/ai-tools"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700 dark:text-green-400 hover:underline"
            >
              Explore AI Tools <ArrowRightIcon className="w-4 h-4" />
            </Link>
            <Link
              href="/member/academy/foundations"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--abv-text)]/60 dark:text-white/50 hover:underline"
            >
              Review Lessons
            </Link>
          </div>
        </div>
      );
    }

    if (!continueTarget) return null;

    const progressPct =
      continueTarget.sectionLessonCount > 0
        ? Math.round(
            (continueTarget.sectionCompletedCount / continueTarget.sectionLessonCount) * 100
          )
        : 0;

    const isStarting = totalCompleted === 0;

    return (
      <Link
        href={`/member/academy/foundations/${continueTarget.sectionSlug}/${continueTarget.lessonSlug}`}
        className="block bg-gradient-to-r from-[var(--abv-azure)]/5 to-[var(--abv-azure)]/10 dark:from-[var(--abv-azure)]/10 dark:to-[var(--abv-azure)]/15 border border-[var(--abv-azure)]/20 dark:border-[var(--abv-azure)]/30 rounded-2xl p-6 hover:border-[var(--abv-azure)]/40 dark:hover:border-[var(--abv-azure)]/50 transition-colors group"
      >
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold tracking-widest text-[var(--abv-azure)] uppercase mb-1">
              {isStarting ? "Start Learning" : "Continue Learning"}
            </p>
            <p className="text-xs text-[var(--abv-text)]/55 dark:text-white/40 mb-2 flex items-center gap-1.5">
              <span>{getSectionIcon(continueTarget.sectionSortOrder)}</span>
              <span>Section {continueTarget.sectionSortOrder} &mdash; {continueTarget.sectionTitle}</span>
            </p>
            <p className="text-lg font-bold text-[var(--abv-text)] dark:text-white leading-snug mb-4 truncate">
              {continueTarget.lessonTitle}
            </p>

            {/* Progress bar */}
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-[var(--abv-dark)]/15 dark:bg-[var(--abv-dark)]/20 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-[var(--abv-dark)] rounded-full transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="text-xs text-[var(--abv-text)]/55 dark:text-white/40 shrink-0 tabular-nums">
                {continueTarget.sectionCompletedCount}/{continueTarget.sectionLessonCount} lessons
              </span>
            </div>
          </div>

          <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-[var(--abv-dark)]/15 dark:bg-[var(--abv-dark)]/20 group-hover:bg-[var(--abv-dark)]/25 transition-colors mt-1">
            <ArrowRightIcon className="w-5 h-5 text-[var(--abv-azure)]" />
          </div>
        </div>
      </Link>
    );
  }

  // ── Zone 2: Section Cards ────────────────────────────────────────────────────

  function SectionGrid() {
    if (loading) {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SectionCardSkeleton key={i} />
          ))}
        </div>
      );
    }

    const orderedSections = sections.slice().sort((a, b) => a.sortOrder - b.sortOrder);

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {orderedSections.map((sec, idx) => {
            const stepNum = idx + 1;
            const pct =
              sec.lessonCount > 0
                ? Math.round((sec.completedCount / sec.lessonCount) * 100)
                : 0;
            const isComplete = sec.completedCount >= sec.lessonCount && sec.lessonCount > 0;
            const isInProgress = sec.completedCount > 0 && !isComplete;

            return (
              <Link
                key={sec.id}
                href={`/member/academy/foundations/${sec.slug}`}
                className="bg-white dark:bg-[#1a2433] border border-[var(--abv-border-strong)] dark:border-white/10 rounded-xl p-5 hover:border-[var(--abv-azure)]/40 dark:hover:border-[var(--abv-azure)]/40 hover:shadow-sm transition-all group flex flex-col gap-4"
              >
                {/* Header row */}
                <div className="flex items-start gap-3">
                  <div className="relative w-10 h-10 rounded-lg bg-[var(--abv-dark)]/10 dark:bg-[var(--abv-dark)]/15 flex items-center justify-center shrink-0 text-lg">
                    {getSectionIcon(sec.sortOrder, sec.slug)}
                    <span
                      className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-[var(--abv-text)] dark:bg-white text-white dark:text-[var(--abv-text)] text-[10px] font-bold flex items-center justify-center shadow-sm tabular-nums"
                      aria-hidden
                    >
                      {stepNum}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold tracking-wider text-[var(--abv-azure)] uppercase">
                      Section {stepNum}
                    </p>
                    <p className="font-semibold text-[var(--abv-text)] dark:text-white leading-snug line-clamp-2">
                      {sec.title}
                    </p>
                    <p className="text-xs text-[var(--abv-text)]/50 dark:text-white/40 mt-0.5">
                      {sec.lessonCount} lesson{sec.lessonCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                  {isComplete && (
                    <CheckCircleIcon className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                  )}
                </div>

                {/* Progress */}
                <div className="space-y-1.5">
                  <div className="bg-[var(--abv-border-strong)] dark:bg-white/10 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isComplete ? "bg-green-500" : "bg-[var(--abv-dark)]"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--abv-text)]/50 dark:text-white/40 tabular-nums">
                      {sec.completedCount}/{sec.lessonCount} complete
                    </span>
                    {/* Status badge */}
                    {isComplete ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                        Complete
                      </span>
                    ) : isInProgress ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--abv-dark)]/10 dark:bg-[var(--abv-dark)]/20 text-[var(--abv-azure)]">
                        In Progress
                      </span>
                    ) : (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--abv-border-strong)] dark:bg-white/10 text-[var(--abv-text)]/50 dark:text-white/40">
                        Not Started
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
      </div>
    );
  }

  // ── Zone 3: Resources Row ────────────────────────────────────────────────────

  const resourceCards = [
    ...(liveCallCount > 0
      ? [
          {
            label: "Live Q&A Calls",
            description: `${liveCallCount} recorded session${liveCallCount !== 1 ? "s" : ""} with Q&A`,
            href: "/member/academy?tab=live-calls",
            icon: <VideoCameraIcon className="w-5 h-5" />,
            colour: "violet",
          },
        ]
      : []),
    {
      label: "Browse by Principle",
      description: "Explore lessons organised by the 16 Attraction principles",
      href: "/member/academy?tab=browse",
      icon: <AcademicCapIcon className="w-5 h-5" />,
      colour: "blue",
    },
    {
      label: "Search All Content",
      description: "Find any lesson, call, or moment across the entire Academy",
      href: "/member/academy?tab=search",
      icon: <MagnifyingGlassIcon className="w-5 h-5" />,
      colour: "grey",
    },
  ];

  const colourMap: Record<string, string> = {
    violet:
      "bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 border-violet-100 dark:border-violet-700/30",
    blue: "bg-[var(--abv-dark)]/10 dark:bg-[var(--abv-dark)]/15 text-[var(--abv-azure)] border-[var(--abv-azure)]/20 dark:border-[var(--abv-azure)]/30",
    grey: "bg-[var(--abv-border-strong)] dark:bg-white/10 text-[var(--abv-text)]/60 dark:text-white/50 border-[var(--abv-border-strong)] dark:border-white/10",
  };

  function ResourceRow() {
    if (loading) {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="bg-white dark:bg-[#1a2433] border border-[var(--abv-border-strong)] dark:border-white/10 rounded-xl p-4 animate-pulse"
            >
              <div className="w-8 h-8 rounded-lg bg-[var(--abv-border-strong)] dark:bg-white/10 mb-3" />
              <div className="h-4 bg-[var(--abv-border-strong)] dark:bg-white/10 rounded w-3/4 mb-2" />
              <div className="h-3 bg-[var(--abv-border-strong)] dark:bg-white/10 rounded w-full" />
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {resourceCards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="bg-white dark:bg-[#1a2433] border border-[var(--abv-border-strong)] dark:border-white/10 rounded-xl p-4 hover:border-[var(--abv-azure)]/40 dark:hover:border-[var(--abv-azure)]/40 hover:shadow-sm transition-all group flex flex-col gap-3"
          >
            <div
              className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${colourMap[card.colour]}`}
            >
              {card.icon}
            </div>
            <div>
              <p className="font-semibold text-[var(--abv-text)] dark:text-white text-sm leading-snug group-hover:text-[var(--abv-azure)] transition-colors">
                {card.label}
              </p>
              <p className="text-xs text-[var(--abv-text)]/50 dark:text-white/40 mt-0.5 leading-relaxed">
                {card.description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-10">
      {/* Zone 1 */}
      <HeroCard />

      {/* Zone 2 */}
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-xs font-semibold tracking-widest text-[var(--abv-text)]/40 dark:text-white/30 uppercase">
            Course Sections
          </h2>
          <p className="text-xs text-[var(--abv-text)]/40 dark:text-white/30">
            Work through these in order
          </p>
        </div>
        <SectionGrid />
      </section>

      {/* Zone 3 */}
      <section>
        <h2 className="text-xs font-semibold tracking-widest text-[var(--abv-text)]/40 dark:text-white/30 uppercase mb-4">
          Resources
        </h2>
        <ResourceRow />
      </section>
    </div>
  );
}

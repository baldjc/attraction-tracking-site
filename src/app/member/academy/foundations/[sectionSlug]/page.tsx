"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { ArrowLeftIcon, CheckCircleIcon, PlayCircleIcon, DocumentTextIcon } from "@heroicons/react/24/outline";
import { getSectionIcon } from "@/lib/academy-section-icons";

interface Lesson {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  youtubeUrl: string | null;
  sortOrder: number;
  completed: boolean;
  principleTags: string[];
}

interface Section {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  lessonCount: number;
  completedCount: number;
}

export default function SectionPage({ params }: { params: Promise<{ sectionSlug: string }> }) {
  const { sectionSlug } = use(params);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [section, setSection] = useState<Section | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/member/academy/sections/${sectionSlug}/lessons`).then((r) => r.json()),
      fetch("/api/member/academy/sections").then((r) => r.json()),
    ]).then(([lessonData, sectionData]) => {
      setLessons(lessonData.lessons ?? []);
      const sec = (sectionData.sections ?? []).find((s: Section) => s.slug === sectionSlug);
      setSection(sec ?? null);
    }).finally(() => setLoading(false));
  }, [sectionSlug]);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <Link
          href="/member/academy"
          className="flex items-center gap-1.5 text-sm text-[var(--abv-text)]/50 dark:text-white/50 hover:text-[var(--abv-text)] dark:hover:text-white transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Academy
        </Link>
        <span className="text-[var(--abv-text)]/30 dark:text-white/30">/</span>
        <Link
          href="/member/academy/foundations"
          className="text-sm text-[var(--abv-text)]/50 dark:text-white/50 hover:text-[var(--abv-text)] dark:hover:text-white transition-colors"
        >
          Foundations
        </Link>
        <span className="text-[var(--abv-text)]/30 dark:text-white/30">/</span>
        <span className="text-sm text-[var(--abv-text)] dark:text-white font-medium truncate">
          {section?.title ?? sectionSlug}
        </span>
      </div>

      {section && (
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">{getSectionIcon(section.sortOrder, section.slug)}</span>
            <div>
              <p className="text-xs font-bold text-[var(--abv-text)]/30 dark:text-white/30 uppercase tracking-wider">
                Section {section.sortOrder}
              </p>
              <h1 className="text-2xl font-bold text-[var(--abv-text)] dark:text-white">{section.title}</h1>
            </div>
          </div>
          {section.description && (
            <p className="text-[var(--abv-text)]/60 dark:text-white/60 mt-2 text-sm leading-relaxed">
              {section.description}
            </p>
          )}
          {!loading && (
            <p className="text-xs text-[var(--abv-text)]/40 dark:text-white/40 mt-2">
              {section.completedCount}/{section.lessonCount} lessons complete
            </p>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-[#1a2433] rounded-lg border border-[var(--abv-border-strong)] dark:border-white/10 p-5 animate-pulse h-20" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {lessons.map((lesson, i) => (
            <Link
              key={lesson.id}
              href={`/member/academy/foundations/${sectionSlug}/${lesson.slug}`}
              className="flex items-start gap-4 bg-white dark:bg-[#1a2433] rounded-lg border border-[var(--abv-border-strong)] dark:border-white/10 p-5 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all group"
            >
              <div className="shrink-0 mt-0.5">
                {lesson.completed ? (
                  <CheckCircleIcon className="w-6 h-6 text-green-500" />
                ) : (
                  <div className="w-6 h-6 rounded-full border-2 border-[var(--abv-border-strong)] dark:border-white/20" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-[var(--abv-text)] dark:text-white group-hover:text-[var(--abv-azure)] transition-colors">
                    <span className="text-[var(--abv-text)]/30 dark:text-white/30 font-normal mr-1.5">{i + 1}.</span>
                    {lesson.title}
                  </p>
                </div>
                {lesson.description && (
                  <p className="text-xs text-[var(--abv-text)]/55 dark:text-white/45 mt-1 leading-relaxed line-clamp-2">
                    {lesson.description}
                  </p>
                )}
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {lesson.youtubeUrl ? (
                    <span className="flex items-center gap-1 text-[10px] text-[var(--abv-text)]/40 dark:text-white/40">
                      <PlayCircleIcon className="w-3.5 h-3.5" />
                      Video
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] text-[var(--abv-text)]/40 dark:text-white/40">
                      <DocumentTextIcon className="w-3.5 h-3.5" />
                      Workbook
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

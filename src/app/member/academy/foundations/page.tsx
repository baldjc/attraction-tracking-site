"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeftIcon, CheckCircleIcon } from "@heroicons/react/24/outline";

interface Section {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  lessonCount: number;
  completedCount: number;
}

export default function FoundationsPage() {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/member/academy/sections")
      .then((r) => r.json())
      .then((d) => setSections(d.sections ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/member/academy"
          className="flex items-center gap-1.5 text-sm text-[var(--abv-text)]/50 dark:text-white/50 hover:text-[var(--abv-text)] dark:hover:text-white transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Academy
        </Link>
        <span className="text-[var(--abv-text)]/30 dark:text-white/30">/</span>
        <span className="text-sm text-[var(--abv-text)] dark:text-white font-medium">The Foundations Library</span>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--abv-text)] dark:text-white">The Foundations Library</h1>
        <p className="text-[var(--abv-text)]/50 dark:text-white/50 mt-1 text-sm">
          Master the Attraction by Video system — from avatar clarity to packaging
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-[#1a2433] rounded-lg border border-[var(--abv-border-strong)] dark:border-white/10 p-6 animate-pulse h-24" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {sections.map((section) => {
            const pct = section.lessonCount > 0
              ? Math.round((section.completedCount / section.lessonCount) * 100) : 0;
            const done = section.completedCount === section.lessonCount && section.lessonCount > 0;
            return (
              <Link
                key={section.id}
                href={`/member/academy/foundations/${section.slug}`}
                className="block bg-white dark:bg-[#1a2433] rounded-lg border border-[var(--abv-border-strong)] dark:border-white/10 p-6 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-[var(--abv-text)]/30 dark:text-white/30 uppercase tracking-wider">
                        Section {section.sortOrder}
                      </span>
                      {done && (
                        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                          <CheckCircleIcon className="w-3.5 h-3.5" />
                          Complete
                        </span>
                      )}
                    </div>
                    <h2 className="text-base font-semibold text-[var(--abv-text)] dark:text-white group-hover:text-[var(--abv-azure)] transition-colors mb-1">
                      {section.title}
                    </h2>
                    {section.description && (
                      <p className="text-sm text-[var(--abv-text)]/50 dark:text-white/50 leading-relaxed line-clamp-2">
                        {section.description}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-[var(--abv-text)] dark:text-white">
                      {section.completedCount}/{section.lessonCount}
                    </p>
                    <p className="text-xs text-[var(--abv-text)]/40 dark:text-white/40">lessons</p>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-[var(--abv-text)]/40 dark:text-white/40 mb-1">
                    <span>{pct}% complete</span>
                  </div>
                  <div className="h-1.5 bg-[var(--abv-border-strong)] dark:bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${done ? "bg-green-500" : "bg-[var(--abv-dark)]"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

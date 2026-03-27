"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AcademicCapIcon, ArrowRightIcon, CheckCircleIcon } from "@heroicons/react/24/outline";

interface Section {
  id: string;
  title: string;
  slug: string;
  sortOrder: number;
  lessonCount: number;
  completedCount: number;
}

export default function AcademyPage() {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/member/academy/sections")
      .then((r) => r.json())
      .then((d) => setSections(d.sections ?? []))
      .finally(() => setLoading(false));
  }, []);

  const totalLessons = sections.reduce((s, sec) => s + sec.lessonCount, 0);
  const totalCompleted = sections.reduce((s, sec) => s + sec.completedCount, 0);
  const overallPct = totalLessons > 0 ? Math.round((totalCompleted / totalLessons) * 100) : 0;

  const continueSection =
    sections.find((s) => s.completedCount < s.lessonCount) ?? sections[0];

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#2f3437] dark:text-white">Academy</h1>
        <p className="text-[#2f3437]/50 dark:text-white/50 mt-1 text-sm">
          Your complete Attraction by Video learning library.
        </p>
      </div>

      {loading ? (
        <div className="bg-white dark:bg-[#1a2433] rounded-lg border border-[#eaeaea] dark:border-white/10 p-8 text-center text-sm text-[#2f3437]/40 dark:text-white/40">
          Loading…
        </div>
      ) : (
        <div className="bg-white dark:bg-[#1a2433] rounded-lg border border-[#eaeaea] dark:border-white/10 p-8">
          <div className="flex items-start gap-5">
            <div className="p-3 bg-[#6ba3c7]/10 rounded-xl shrink-0">
              <AcademicCapIcon className="w-8 h-8 text-[#6ba3c7]" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-[#2f3437] dark:text-white mb-1">
                The Foundations Library
              </h2>
              <p className="text-sm text-[#2f3437]/60 dark:text-white/60 mb-5">
                Master the Attraction by Video system — from avatar clarity to packaging
              </p>

              <div className="mb-5">
                <div className="flex items-center justify-between text-xs text-[#2f3437]/50 dark:text-white/50 mb-1.5">
                  <span>Overall progress</span>
                  <span className="font-semibold">
                    {totalCompleted}/{totalLessons} lessons complete
                  </span>
                </div>
                <div className="h-2 bg-[#eaeaea] dark:bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#6ba3c7] rounded-full transition-all"
                    style={{ width: `${overallPct}%` }}
                  />
                </div>
                <p className="text-xs text-[#2f3437]/40 dark:text-white/40 mt-1">{overallPct}% complete</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                {continueSection && (
                  <Link
                    href={`/member/academy/foundations/${continueSection.slug}`}
                    className="flex items-center gap-2 bg-[#6ba3c7] hover:bg-[#5490b5] text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                  >
                    {totalCompleted === 0 ? "Start Learning" : "Continue Learning"}
                    <ArrowRightIcon className="w-4 h-4" />
                  </Link>
                )}
                <Link
                  href="/member/academy/foundations"
                  className="flex items-center gap-2 border border-[#eaeaea] dark:border-white/10 text-[#2f3437] dark:text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#f7f6f3] dark:hover:bg-white/5 transition-colors"
                >
                  Browse All Sections
                </Link>
                <Link
                  href="/member/academy/principles"
                  className="flex items-center gap-2 border border-[#eaeaea] dark:border-white/10 text-[#2f3437] dark:text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#f7f6f3] dark:hover:bg-white/5 transition-colors"
                >
                  Browse by Principle
                </Link>
              </div>
            </div>
          </div>

          {sections.length > 0 && (
            <div className="mt-8 pt-6 border-t border-[#eaeaea] dark:border-white/10">
              <h3 className="text-sm font-semibold text-[#2f3437]/60 dark:text-white/60 uppercase tracking-wider mb-3">
                Sections
              </h3>
              <div className="space-y-2">
                {sections.map((s) => {
                  const pct = s.lessonCount > 0 ? Math.round((s.completedCount / s.lessonCount) * 100) : 0;
                  const done = s.completedCount === s.lessonCount && s.lessonCount > 0;
                  return (
                    <Link
                      key={s.id}
                      href={`/member/academy/foundations/${s.slug}`}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-[#f7f6f3] dark:hover:bg-white/5 transition-colors group"
                    >
                      {done ? (
                        <CheckCircleIcon className="w-5 h-5 text-green-500 shrink-0" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-[#eaeaea] dark:border-white/20 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#2f3437] dark:text-white group-hover:text-[#6ba3c7] transition-colors truncate">
                          {s.sortOrder}. {s.title}
                        </p>
                      </div>
                      <span className="text-xs text-[#2f3437]/40 dark:text-white/40 shrink-0">
                        {s.completedCount}/{s.lessonCount}
                      </span>
                      <div className="w-16 h-1.5 bg-[#eaeaea] dark:bg-white/10 rounded-full overflow-hidden shrink-0">
                        <div className="h-full bg-[#6ba3c7] rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

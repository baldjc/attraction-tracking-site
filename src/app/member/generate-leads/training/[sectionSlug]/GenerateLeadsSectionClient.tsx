"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeftIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { PRINCIPLE_NAMES, PRINCIPLE_COLORS } from "@/lib/academy-constants";

interface Lesson {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  youtubeUrl: string | null;
  principleTags: string[];
  completed: boolean;
}

interface Section {
  id: string;
  title: string;
  slug: string;
}

export default function GenerateLeadsSectionClient({ sectionSlug }: { sectionSlug: string }) {
  const [section, setSection] = useState<Section | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/member/generate-leads/training/sections/${sectionSlug}/lessons`)
      .then((r) => r.json())
      .then((d) => {
        setSection(d.section ?? null);
        setLessons(d.lessons ?? []);
      })
      .finally(() => setLoading(false));
  }, [sectionSlug]);

  if (loading) {
    return (
      <div className="max-w-3xl">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-[#eaeaea] dark:bg-white/10 rounded w-1/3" />
          <div className="h-8 bg-[#eaeaea] dark:bg-white/10 rounded w-2/3" />
        </div>
      </div>
    );
  }

  if (!section) {
    return (
      <div className="max-w-3xl">
        <p className="text-sm text-[#2f3437]/50 dark:text-white/50">Section not found.</p>
      </div>
    );
  }

  const completedCount = lessons.filter((l) => l.completed).length;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/member/generate-leads"
          className="flex items-center gap-1.5 text-sm text-[#2f3437]/50 dark:text-white/50 hover:text-[#2f3437] dark:hover:text-white transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Generate Leads
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#2f3437] dark:text-white mb-1">{section.title}</h1>
        <p className="text-sm text-[#2f3437]/50 dark:text-white/50">
          {completedCount} of {lessons.length} lesson{lessons.length !== 1 ? "s" : ""} completed
        </p>
      </div>

      {lessons.length === 0 ? (
        <div className="bg-white dark:bg-[#1a1a1a] border border-[#2f3437]/10 dark:border-white/10 rounded-lg p-10 text-center">
          <p className="text-sm text-[#2f3437]/40 dark:text-white/40">No lessons yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {lessons.map((lesson, i) => (
            <Link
              key={lesson.id}
              href={`/member/generate-leads/training/${sectionSlug}/${lesson.slug}`}
              className="block bg-white dark:bg-[#1a1a1a] border border-[#2f3437]/10 dark:border-white/10 rounded-lg p-5 hover:border-[#6ba3c7]/40 hover:shadow-sm transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 mt-0.5 ${
                  lesson.completed
                    ? "border-green-500 bg-green-500 text-white"
                    : "border-[#2f3437]/20 dark:border-white/20 text-[#2f3437]/40 dark:text-white/40"
                }`}>
                  {lesson.completed ? <CheckCircleIcon className="w-4 h-4" /> : i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-[#2f3437] dark:text-white group-hover:text-[#6ba3c7] transition-colors">
                    {lesson.title}
                  </h3>
                  {lesson.description && (
                    <p className="text-sm text-[#2f3437]/50 dark:text-white/50 mt-1 line-clamp-2">
                      {lesson.description}
                    </p>
                  )}
                  {lesson.principleTags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {lesson.principleTags.map((tag) => (
                        <span key={tag} className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRINCIPLE_COLORS[tag] ?? "bg-gray-100 text-gray-600"}`}>
                          {PRINCIPLE_NAMES[tag] ?? tag}
                        </span>
                      ))}
                    </div>
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

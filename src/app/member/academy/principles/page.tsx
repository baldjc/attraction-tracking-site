"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon, TagIcon } from "@heroicons/react/24/outline";
import { PRINCIPLE_NAMES, PRINCIPLE_COLORS } from "@/lib/academy-constants";

interface Principle {
  slug: string;
  name: string;
  lessonCount: number;
}

interface PrincipleLesson {
  id: string;
  title: string;
  slug: string;
  sectionTitle: string;
  sectionSlug: string;
}

export default function PrinciplesPage() {
  const searchParams = useSearchParams();
  const tagFilter = searchParams.get("tag");

  const [principles, setPrinciples] = useState<Principle[]>([]);
  const [selected, setSelected] = useState<string | null>(tagFilter);
  const [lessons, setLessons] = useState<PrincipleLesson[]>([]);
  const [loadingPrinciples, setLoadingPrinciples] = useState(true);
  const [loadingLessons, setLoadingLessons] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/member/academy/principles")
      .then((r) => r.json())
      .then((d) => setPrinciples(d.principles ?? []))
      .finally(() => setLoadingPrinciples(false));
  }, []);

  useEffect(() => {
    if (!selected) { setLessons([]); return; }
    setLoadingLessons(true);
    fetch(`/api/member/academy/principles/${selected}`)
      .then((r) => r.json())
      .then((d) => setLessons(d.lessons ?? []))
      .finally(() => setLoadingLessons(false));
  }, [selected]);

  useEffect(() => {
    if (selected && sectionRef.current) {
      setTimeout(() => sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    }
  }, [selected]);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/member/academy"
          className="flex items-center gap-1.5 text-sm text-[#2f3437]/50 dark:text-white/50 hover:text-[#2f3437] dark:hover:text-white transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Academy
        </Link>
        <span className="text-[#2f3437]/30 dark:text-white/30">/</span>
        <span className="text-sm text-[#2f3437] dark:text-white font-medium">Browse by Principle</span>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#2f3437] dark:text-white">Browse by Principle</h1>
        <p className="text-[#2f3437]/50 dark:text-white/50 mt-1 text-sm">
          The 17 core principles behind the Attraction by Video system. Click a principle to see its lessons.
        </p>
      </div>

      {loadingPrinciples ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[...Array(9)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-[#1a2433] rounded-lg border border-[#eaeaea] dark:border-white/10 p-4 animate-pulse h-16" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
          {principles.map((p) => (
            <button
              key={p.slug}
              onClick={() => setSelected(selected === p.slug ? null : p.slug)}
              className={`text-left p-4 rounded-lg border transition-all ${
                selected === p.slug
                  ? "border-[#6ba3c7] bg-[#6ba3c7]/5 dark:bg-[#6ba3c7]/10"
                  : "bg-white dark:bg-[#1a2433] border-[#eaeaea] dark:border-white/10 hover:border-[#6ba3c7]/40 hover:shadow-sm"
              }`}
            >
              <div className="flex items-start gap-2">
                <span className={`mt-0.5 inline-flex text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${PRINCIPLE_COLORS[p.slug] ?? "bg-gray-100 text-gray-600"}`}>
                  <TagIcon className="w-2.5 h-2.5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#2f3437] dark:text-white leading-tight">
                    {p.name}
                  </p>
                  <p className="text-xs text-[#2f3437]/40 dark:text-white/40 mt-0.5">
                    {p.lessonCount} lesson{p.lessonCount !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div ref={sectionRef}>
          <div className="flex items-center gap-2 mb-4">
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${PRINCIPLE_COLORS[selected] ?? "bg-gray-100 text-gray-600"}`}>
              {PRINCIPLE_NAMES[selected] ?? selected}
            </span>
            <span className="text-sm text-[#2f3437]/50 dark:text-white/50">
              {loadingLessons ? "Loading…" : `${lessons.length} lesson${lessons.length !== 1 ? "s" : ""}`}
            </span>
          </div>

          {loadingLessons ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-white dark:bg-[#1a2433] rounded-lg border border-[#eaeaea] dark:border-white/10 p-4 animate-pulse h-14" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {lessons.map((l) => (
                <Link
                  key={l.id}
                  href={`/member/academy/foundations/${l.sectionSlug}/${l.slug}`}
                  className="flex items-center justify-between gap-3 bg-white dark:bg-[#1a2433] rounded-lg border border-[#eaeaea] dark:border-white/10 p-4 hover:shadow-sm hover:border-[#6ba3c7]/30 transition-all group"
                >
                  <div>
                    <p className="text-sm font-medium text-[#2f3437] dark:text-white group-hover:text-[#6ba3c7] transition-colors">
                      {l.title}
                    </p>
                    <p className="text-xs text-[#2f3437]/40 dark:text-white/40 mt-0.5">{l.sectionTitle}</p>
                  </div>
                  <span className="text-xs text-[#6ba3c7] font-medium shrink-0">View →</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

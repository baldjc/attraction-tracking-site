"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  AcademicCapIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  PlayCircleIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  CalendarDaysIcon,
  VideoCameraIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";

import {
  PRINCIPLES,
  PRINCIPLE_COLORS,
  Entry,
  TranscriptMatch,
  fmtDate,
  fmtTime,
  fmtDuration,
  EmptyState,
  PrincipleFilter,
  EntryCard,
  EntryGrid,
  TranscriptMatchCard,
  MomentDetailModal,
} from "@/components/resources-shared";

import {
  PRINCIPLE_NAMES as ACAD_PRINCIPLE_NAMES,
  PRINCIPLE_COLORS as ACAD_PRINCIPLE_COLORS,
} from "@/lib/academy-constants";

type AcademyTab = "foundations" | "live-calls" | "browse" | "search" | "moments" | "saved";

interface Section {
  id: string;
  title: string;
  slug: string;
  sortOrder: number;
  lessonCount: number;
  completedCount: number;
}

interface LiveCall {
  id: string;
  title: string;
  callDate: string;
  duration: number | null;
  fathomShareUrl: string;
  summary: string;
  principles: string[];
  momentCount: number;
}

interface LiveCallMonth {
  label: string;
  calls: LiveCall[];
}

interface SectionLesson {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  completed: boolean;
  principleTags: string[];
}

function FoundationsTab() {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [lessonMap, setLessonMap] = useState<Map<string, SectionLesson[]>>(new Map());
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/member/academy/sections")
      .then((r) => r.json())
      .then((d) => setSections(d.sections ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function toggleSection(section: Section) {
    const isOpen = expandedIds.has(section.id);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      isOpen ? next.delete(section.id) : next.add(section.id);
      return next;
    });
    if (!isOpen && !lessonMap.has(section.id)) {
      setLoadingIds((prev) => new Set([...prev, section.id]));
      try {
        const data = await fetch(`/api/member/academy/sections/${section.slug}/lessons`).then((r) => r.json());
        setLessonMap((prev) => new Map([...prev, [section.id, data.lessons ?? []]]));
      } finally {
        setLoadingIds((prev) => { const n = new Set(prev); n.delete(section.id); return n; });
      }
    }
  }

  const totalLessons = sections.reduce((s, sec) => s + sec.lessonCount, 0);
  const totalCompleted = sections.reduce((s, sec) => s + sec.completedCount, 0);
  const overallPct = totalLessons > 0 ? Math.round((totalCompleted / totalLessons) * 100) : 0;
  const continueSection = sections.find((s) => s.completedCount < s.lessonCount) ?? sections[0];

  if (loading) {
    return (
      <div className="bg-white dark:bg-[#1a2433] rounded-lg border border-[var(--abv-border-strong)] dark:border-white/10 p-8 text-center text-sm text-[var(--abv-text)]/40 dark:text-white/40">
        Loading…
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-[#1a2433] rounded-lg border border-[var(--abv-border-strong)] dark:border-white/10 p-8">
      <div className="flex items-start gap-5">
        <div className="p-3 bg-[var(--abv-dark)]/10 rounded-xl shrink-0">
          <AcademicCapIcon className="w-8 h-8 text-[var(--abv-azure)]" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-[var(--abv-text)] dark:text-white mb-1">
            The Foundations Library
          </h2>
          <p className="text-sm text-[var(--abv-text)]/60 dark:text-white/60 mb-5">
            Master the Attraction by Video system — from avatar clarity to packaging
          </p>

          <div className="mb-5">
            <div className="flex items-center justify-between text-xs text-[var(--abv-text)]/50 dark:text-white/50 mb-1.5">
              <span>Overall progress</span>
              <span className="font-semibold">{totalCompleted}/{totalLessons} lessons complete</span>
            </div>
            <div className="h-2 bg-[var(--abv-border-strong)] dark:bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-[var(--abv-dark)] rounded-full transition-all" style={{ width: `${overallPct}%` }} />
            </div>
            <p className="text-xs text-[var(--abv-text)]/40 dark:text-white/40 mt-1">{overallPct}% complete</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            {continueSection && (
              <Link
                href={`/member/academy/foundations/${continueSection.slug}`}
                className="flex items-center gap-2 bg-[var(--abv-dark)] hover:bg-black/85 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
              >
                {totalCompleted === 0 ? "Start Learning" : "Continue Learning"}
                <ArrowRightIcon className="w-4 h-4" />
              </Link>
            )}
            <Link
              href="/member/academy/foundations"
              className="flex items-center gap-2 border border-[var(--abv-border-strong)] dark:border-white/10 text-[var(--abv-text)] dark:text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-[var(--abv-bg)] dark:hover:bg-white/5 transition-colors"
            >
              Browse All Sections
            </Link>
            <Link
              href="/member/academy?tab=browse"
              className="flex items-center gap-2 border border-[var(--abv-border-strong)] dark:border-white/10 text-[var(--abv-text)] dark:text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-[var(--abv-bg)] dark:hover:bg-white/5 transition-colors"
            >
              Browse by Principle
            </Link>
          </div>
        </div>
      </div>

      {sections.length > 0 && (
        <div className="mt-8 pt-6 border-t border-[var(--abv-border-strong)] dark:border-white/10">
          <h3 className="text-sm font-semibold text-[var(--abv-text)]/60 dark:text-white/60 uppercase tracking-wider mb-3">
            Sections
          </h3>
          <div className="space-y-1">
            {sections.map((s) => {
              const pct = s.lessonCount > 0 ? Math.round((s.completedCount / s.lessonCount) * 100) : 0;
              const done = s.completedCount === s.lessonCount && s.lessonCount > 0;
              const isExpanded = expandedIds.has(s.id);
              const isLoadingLessons = loadingIds.has(s.id);
              const lessons = lessonMap.get(s.id) ?? [];

              return (
                <div key={s.id} className="rounded-lg border border-transparent hover:border-[var(--abv-border-strong)] dark:hover:border-white/10 transition-colors">
                  <button
                    onClick={() => toggleSection(s)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--abv-bg)] dark:hover:bg-white/5 transition-colors group text-left"
                  >
                    {isExpanded ? (
                      <ChevronDownIcon className="w-4 h-4 text-[var(--abv-text)]/40 dark:text-white/40 shrink-0 transition-transform" />
                    ) : (
                      <ChevronRightIcon className="w-4 h-4 text-[var(--abv-text)]/40 dark:text-white/40 shrink-0 transition-transform" />
                    )}
                    {done ? (
                      <CheckCircleIcon className="w-5 h-5 text-green-500 shrink-0" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-[var(--abv-border-strong)] dark:border-white/20 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--abv-text)] dark:text-white group-hover:text-[var(--abv-azure)] transition-colors truncate">
                        {s.sortOrder}. {s.title}
                      </p>
                    </div>
                    <span className="text-xs text-[var(--abv-text)]/40 dark:text-white/40 shrink-0">
                      {s.completedCount}/{s.lessonCount}
                    </span>
                    <div className="w-16 h-1.5 bg-[var(--abv-border-strong)] dark:bg-white/10 rounded-full overflow-hidden shrink-0">
                      <div className="h-full bg-[var(--abv-dark)] rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </button>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateRows: isExpanded ? "1fr" : "0fr",
                      transition: "grid-template-rows 250ms ease",
                    }}
                  >
                    <div style={{ overflow: "hidden" }}>
                      <div className="pb-2 px-3">
                        {isLoadingLessons ? (
                          <div className="space-y-2 py-2">
                            {[...Array(3)].map((_, i) => (
                              <div key={i} className="h-10 rounded bg-[var(--abv-bg)] dark:bg-white/5 animate-pulse" />
                            ))}
                          </div>
                        ) : (
                          <div className="border-l-2 border-[var(--abv-border-strong)] dark:border-white/10 ml-2 pl-4 space-y-0.5 py-1">
                            {lessons.map((lesson, i) => (
                              <Link
                                key={lesson.id}
                                href={`/member/academy/foundations/${s.slug}/${lesson.slug}`}
                                className="flex items-start gap-3 py-2.5 px-2 rounded-lg hover:bg-[var(--abv-bg)] dark:hover:bg-white/5 transition-colors group/lesson"
                              >
                                <div className="shrink-0 mt-0.5">
                                  {lesson.completed ? (
                                    <CheckCircleIcon className="w-4.5 h-4.5 text-green-500" style={{ width: "1.125rem", height: "1.125rem" }} />
                                  ) : (
                                    <div className="w-[1.125rem] h-[1.125rem] rounded-full border-2 border-[#d0d0d0] dark:border-white/20" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-[var(--abv-text)] dark:text-white group-hover/lesson:text-[var(--abv-azure)] transition-colors leading-snug">
                                    <span className="text-[var(--abv-text)]/30 dark:text-white/30 font-normal mr-1">{i + 1}.</span>
                                    {lesson.title}
                                  </p>
                                  {lesson.description && (
                                    <p className="text-xs text-[var(--abv-text)]/50 dark:text-white/40 mt-0.5 leading-relaxed line-clamp-2">
                                      {lesson.description}
                                    </p>
                                  )}
                                  {(lesson.principleTags as string[]).length > 0 && (
                                    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                                      {(lesson.principleTags as string[]).slice(0, 3).map((tag) => (
                                        <span
                                          key={tag}
                                          className={`inline-flex text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ACAD_PRINCIPLE_COLORS[tag] ?? "bg-gray-100 text-gray-600"}`}
                                        >
                                          {ACAD_PRINCIPLE_NAMES[tag] ?? tag}
                                        </span>
                                      ))}
                                      {(lesson.principleTags as string[]).length > 3 && (
                                        <span className="text-[10px] text-[var(--abv-text)]/30 dark:text-white/30">
                                          +{(lesson.principleTags as string[]).length - 3}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function LiveCallsTab() {
  const [months, setMonths] = useState<LiveCallMonth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/member/academy/live-calls")
      .then((r) => r.json())
      .then((d) => setMonths(d.months ?? []))
      .catch(() => setMonths([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-[#1a1a1a] rounded-lg border border-[var(--abv-border-strong)] dark:border-white/10 h-36 animate-pulse" />
        ))}
      </div>
    );
  }

  if (months.length === 0) {
    return (
      <EmptyState
        message="No live calls available yet"
        sub="Processed Q&A calls will appear here once they're reviewed and published"
      />
    );
  }

  return (
    <div className="space-y-8">
      {months.map((month) => (
        <div key={month.label}>
          <h3 className="text-sm font-semibold text-[var(--abv-text)]/60 dark:text-white/60 uppercase tracking-wider mb-3">
            {month.label}
          </h3>
          <div className="space-y-3">
            {month.calls.map((call) => (
              <LiveCallCard key={call.id} call={call} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function LiveCallCard({ call }: { call: LiveCall }) {
  return (
    <Link
      href={`/member/academy/calls/${call.id}`}
      className="block bg-white dark:bg-[#1a1a1a] rounded-lg border border-violet-100 dark:border-violet-900/30 overflow-hidden hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-shadow"
    >
      <div className="flex items-center justify-between px-4 py-2 border-b bg-violet-50 dark:bg-violet-900/10 border-violet-100 dark:border-violet-900/20">
        <div className="flex items-center gap-2">
          <VideoCameraIcon className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
          <span className="text-xs font-medium text-[var(--abv-text)]/60 dark:text-white/50">
            Q&A Call · {fmtDate(call.callDate)}
          </span>
        </div>
        {call.duration != null && (
          <span className="text-[10px] font-semibold font-mono text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 px-2 py-0.5 rounded-full">
            {fmtDuration(call.duration)}
          </span>
        )}
      </div>

      <div className="p-4">
        <h3 className="font-semibold text-[var(--abv-text)] dark:text-white text-sm mb-1.5 leading-snug">
          {call.title}
        </h3>
        {call.summary && (
          <p className="text-xs text-[var(--abv-text)]/60 dark:text-white/50 leading-relaxed mb-3 line-clamp-2">
            {call.summary}
          </p>
        )}
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-1">
            {call.principles.slice(0, 3).map((p) => (
              <span key={p} className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${PRINCIPLE_COLORS[p] ?? "bg-gray-100 text-gray-600"}`}>
                {p}
              </span>
            ))}
            {call.principles.length > 3 && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#111]/5 dark:bg-white/10 text-[var(--abv-text)]/50 dark:text-white/40">
                +{call.principles.length - 3} more
              </span>
            )}
          </div>
          <span className="flex items-center gap-1 text-xs font-semibold text-violet-600 dark:text-violet-400 ml-3 flex-shrink-0">
            <PlayCircleIcon className="w-4 h-4" />
            View call
          </span>
        </div>
      </div>
    </Link>
  );
}

function BrowseTab({
  onPlay,
  onSaved,
}: {
  onPlay: (e: Entry) => void;
  onSaved: (id: string, saved: boolean) => void;
}) {
  const searchParams = useSearchParams();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [principle, setPrinciple] = useState<string | null>(() => {
    const tag = searchParams.get("tag");
    if (!tag) return null;
    return ACAD_PRINCIPLE_NAMES[tag] ?? null;
  });
  const [sourceType, setSourceType] = useState<"" | "foundations_lesson" | "qa_call">("");

  const load = useCallback(async () => {
    setLoading(true);

    // Fetch KB entries (skip if filtering to foundations only)
    const kbPromise = sourceType === "foundations_lesson"
      ? Promise.resolve([])
      : (async () => {
          const params = new URLSearchParams();
          if (principle) params.set("principle", principle);
          if (sourceType) params.set("sourceType", sourceType);
          const res = await fetch(`/api/member/resources?${params}`);
          return res.ok ? res.json() : [];
        })();

    // Fetch academy foundations lessons (skip if filtering to Q&A only)
    const flPromise = sourceType === "qa_call"
      ? Promise.resolve([])
      : (async () => {
          const params = new URLSearchParams();
          if (principle) params.set("principle", principle);
          const res = await fetch(`/api/member/academy/browse-lessons?${params}`);
          if (!res.ok) return [];
          const lessons = await res.json();
          // Convert academy lessons to Entry format
          return (lessons as any[]).map((l: any) => ({
            id: l.id,
            sourceType: "foundations_lesson",
            sourceId: l.id,
            principles: l.principles ?? [],
            subTopic: l.title,
            summary: l.description ?? "",
            searchableText: null,
            timestampStart: null,
            timestampEnd: null,
            isGeneralTeaching: true,
            isSaved: false,
            source: null,
            // Extra fields for foundations card rendering
            sectionSlug: l.sectionSlug,
            sectionTitle: l.sectionTitle,
            lessonSlug: l.slug,
          }));
        })();

    const [kbEntries, flEntries] = await Promise.all([kbPromise, flPromise]);

    // Merge: foundations lessons first, then KB entries
    setEntries([...flEntries, ...kbEntries]);
    setLoading(false);
  }, [principle, sourceType]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex gap-2">
          {(["", "foundations_lesson", "qa_call"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSourceType(s)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
                sourceType === s
                  ? "bg-[#111] text-white border-[var(--abv-text)] dark:bg-white dark:text-[var(--abv-text)]"
                  : "border-[var(--abv-text)]/20 dark:border-white/20 text-[var(--abv-text)]/55 dark:text-white/45 hover:border-[var(--abv-text)]/40"
              }`}
            >
              {s === "" && "All Content"}
              {s === "foundations_lesson" && <><AcademicCapIcon className="w-3.5 h-3.5" /> Foundations Library</>}
              {s === "qa_call" && <><VideoCameraIcon className="w-3.5 h-3.5" /> Q&A Calls</>}
            </button>
          ))}
        </div>
        <PrincipleFilter selected={principle} onChange={setPrinciple} />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-[#1a1a1a] rounded-lg border border-[var(--abv-text)]/10 h-44 animate-pulse" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          message={principle ? `No approved content for "${principle}" yet` : "No content published yet"}
          sub="Check back soon — new lessons and Q&A moments are added regularly"
        />
      ) : (
        <>
          <p className="text-xs text-[var(--abv-text)]/40 dark:text-white/30">{entries.length} item{entries.length !== 1 ? "s" : ""}</p>
          <EntryGrid entries={entries} onSaved={onSaved} onPlay={onPlay} />
        </>
      )}
    </div>
  );
}

function SearchTab({
  onPlay,
  onSaved,
}: {
  onPlay: (e: Entry) => void;
  onSaved: (id: string, saved: boolean) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Entry[]>([]);
  const [transcriptMatches, setTranscriptMatches] = useState<TranscriptMatch[]>([]);
  const [transcriptTotal, setTranscriptTotal] = useState(0);
  const [txLoading, setTxLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchPrinciple, setSearchPrinciple] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didSearch = useRef(false);

  useEffect(() => {
    if (!searchQuery.trim() && !searchPrinciple && !dateFrom && !dateTo) {
      setSearchResults([]);
      setTranscriptMatches([]);
      setTranscriptTotal(0);
      didSearch.current = false;
      return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      if (searchPrinciple) params.set("principle", searchPrinciple);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const res = await fetch(`/api/member/resources?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setSearchResults(data);
          setTranscriptMatches([]);
          setTranscriptTotal(0);
        } else {
          setSearchResults(data.entries ?? []);
          setTranscriptMatches(data.transcriptMatches ?? []);
          setTranscriptTotal(data.transcriptTotal ?? 0);
        }
      }
      didSearch.current = true;
      setSearching(false);
    }, 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQuery, searchPrinciple, dateFrom, dateTo]);

  async function loadMoreTranscripts() {
    if (!searchQuery.trim()) return;
    setTxLoading(true);
    const params = new URLSearchParams();
    params.set("search", searchQuery.trim());
    params.set("txOffset", String(transcriptMatches.length));
    if (searchPrinciple) params.set("principle", searchPrinciple);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    const res = await fetch(`/api/member/resources?${params}`);
    if (res.ok) {
      const data = await res.json();
      const more: TranscriptMatch[] = Array.isArray(data) ? [] : (data.transcriptMatches ?? []);
      setTranscriptMatches((prev) => [...prev, ...more]);
    }
    setTxLoading(false);
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--abv-text)]/30 dark:text-white/30" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search coaching moments, topics, summaries, transcripts..."
            className="w-full pl-10 pr-4 py-3 border border-[var(--abv-text)]/15 dark:border-white/15 rounded-lg text-sm bg-white dark:bg-[#1a1a1a] text-[var(--abv-text)] dark:text-white placeholder-[var(--abv-text)]/30 dark:placeholder-white/25 focus:outline-none focus:border-[var(--abv-azure)] transition-colors"
            autoFocus
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--abv-text)]/30 hover:text-[var(--abv-text)] dark:hover:text-white">
              <XMarkIcon className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <CalendarDaysIcon className="w-4 h-4 text-[var(--abv-text)]/30 dark:text-white/30 flex-shrink-0" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="text-xs border border-[var(--abv-text)]/15 dark:border-white/15 rounded-lg px-2 py-1.5 bg-white dark:bg-[#1a1a1a] text-[var(--abv-text)] dark:text-white focus:outline-none focus:border-[var(--abv-azure)] transition-colors"
              title="From date"
            />
            <span className="text-[var(--abv-text)]/30 dark:text-white/30 text-xs">–</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              min={dateFrom || undefined}
              className="text-xs border border-[var(--abv-text)]/15 dark:border-white/15 rounded-lg px-2 py-1.5 bg-white dark:bg-[#1a1a1a] text-[var(--abv-text)] dark:text-white focus:outline-none focus:border-[var(--abv-azure)] transition-colors"
              title="To date"
            />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(""); setDateTo(""); }}
                className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full bg-[var(--abv-dark)]/15 text-[var(--abv-azure)] hover:bg-[var(--abv-dark)]/25 transition-colors"
              >
                {dateFrom && dateTo
                  ? `${new Date(dateFrom).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(dateTo).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                  : dateFrom
                    ? `From ${new Date(dateFrom).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                    : `To ${new Date(dateTo).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                }
                <XMarkIcon className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
        <PrincipleFilter selected={searchPrinciple} onChange={setSearchPrinciple} />
      </div>

      {searching ? (
        <div className="text-center py-8 text-sm text-[var(--abv-text)]/40 dark:text-white/30">Searching...</div>
      ) : !searchQuery.trim() && !searchPrinciple && !dateFrom && !dateTo ? (
        <div className="text-center py-16 text-[var(--abv-text)]/30 dark:text-white/20">
          <MagnifyingGlassIcon className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">Type to search coaching moments and full transcripts</p>
          <p className="text-xs mt-1">Or filter by date range and principle above</p>
        </div>
      ) : searchResults.length === 0 && transcriptMatches.length === 0 && didSearch.current ? (
        <EmptyState message="No results found" sub="Try different keywords, a wider date range, or browse by principle" />
      ) : (
        <div className="space-y-8">
          {searchResults.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold text-[var(--abv-text)] dark:text-white">Tagged Moments</h3>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300">
                  {searchResults.length} curated result{searchResults.length !== 1 ? "s" : ""}
                </span>
              </div>
              <EntryGrid entries={searchResults} onSaved={onSaved} onPlay={onPlay} highlight={searchQuery} />
            </div>
          )}

          {transcriptMatches.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold text-[var(--abv-text)] dark:text-white">Also mentioned in these recordings</h3>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--abv-dark)]/15 text-[var(--abv-azure)]">
                  {transcriptTotal} occurrence{transcriptTotal !== 1 ? "s" : ""}
                </span>
              </div>
              <p className="text-xs text-[var(--abv-text)]/40 dark:text-white/30 -mt-2">
                Every time this keyword was said on any call or lesson — timestamps are approximate.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {transcriptMatches.map((m) => (
                  <TranscriptMatchCard key={m.id} match={m} highlight={searchQuery} />
                ))}
              </div>
              {transcriptMatches.length < transcriptTotal && (
                <div className="text-center pt-2">
                  <button
                    onClick={loadMoreTranscripts}
                    disabled={txLoading}
                    className="text-sm font-medium text-[var(--abv-azure)] hover:text-[var(--abv-azure)]/80 disabled:opacity-50 transition-colors"
                  >
                    {txLoading ? "Loading…" : `Load more (${transcriptTotal - transcriptMatches.length} remaining)`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MomentsTab({
  onPlay,
  onSaved,
}: {
  onPlay: (e: Entry) => void;
  onSaved: (id: string, saved: boolean) => void;
}) {
  const [moments, setMoments] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/member/resources/my-moments")
      .then((r) => r.ok ? r.json() : [])
      .then(setMoments)
      .catch(() => setMoments([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-5">
      <div className="bg-violet-50 dark:bg-violet-900/10 border border-violet-100 dark:border-violet-900/20 rounded-lg px-4 py-3 text-xs text-violet-700 dark:text-violet-300">
        These are moments from Q&A coaching calls where you were coached directly. They are private to you.
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-[#1a1a1a] rounded-lg border border-[var(--abv-text)]/10 h-44 animate-pulse" />
          ))}
        </div>
      ) : moments.length === 0 ? (
        <EmptyState
          message="No personal coaching moments yet"
          sub="When Jared coaches you directly on a Q&A call, those moments will appear here"
        />
      ) : (
        <>
          <p className="text-xs text-[var(--abv-text)]/40 dark:text-white/30">{moments.length} moment{moments.length !== 1 ? "s" : ""}</p>
          <EntryGrid entries={moments} onSaved={onSaved} onPlay={onPlay} />
        </>
      )}
    </div>
  );
}

function SavedTab({
  onPlay,
  onSaved,
}: {
  onPlay: (e: Entry) => void;
  onSaved: (id: string, saved: boolean) => void;
}) {
  const [savedEntries, setSavedEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/member/resources/saved")
      .then((r) => r.ok ? r.json() : [])
      .then(setSavedEntries)
      .catch(() => setSavedEntries([]))
      .finally(() => setLoading(false));
  }, []);

  function handleSaved(id: string, isSaved: boolean) {
    if (!isSaved) setSavedEntries((prev) => prev.filter((e) => e.id !== id));
    onSaved(id, isSaved);
  }

  return (
    <div className="space-y-5">
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-[#1a1a1a] rounded-lg border border-[var(--abv-text)]/10 h-44 animate-pulse" />
          ))}
        </div>
      ) : savedEntries.length === 0 ? (
        <EmptyState
          message="No saved items yet"
          sub="Bookmark moments from the library by clicking the bookmark icon on any card"
        />
      ) : (
        <>
          <p className="text-xs text-[var(--abv-text)]/40 dark:text-white/30">{savedEntries.length} saved item{savedEntries.length !== 1 ? "s" : ""}</p>
          <EntryGrid entries={savedEntries} onSaved={handleSaved} onPlay={onPlay} />
        </>
      )}
    </div>
  );
}

const TABS: { id: AcademyTab; label: string }[] = [
  { id: "foundations", label: "Foundations Library" },
  { id: "live-calls", label: "Live Calls" },
  { id: "browse", label: "Browse Library" },
  { id: "search", label: "Search" },
  { id: "moments", label: "My Coaching Moments" },
  { id: "saved", label: "My Saved" },
];

function AcademyTabsInner({ routePath }: { routePath: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = (searchParams.get("tab") as AcademyTab) ?? "foundations";
  const [tab, setTab] = useState<AcademyTab>(initialTab);

  const [playerEntry, setPlayerEntry] = useState<Entry | null>(null);

  function setActiveTab(t: AcademyTab) {
    setTab(t);
    router.replace(`${routePath}?tab=${t}`, { scroll: false });
  }

  function handlePlay(entry: Entry) {
    if (!entry.source?.fathomShareUrl) return;
    setPlayerEntry(entry);
  }

  function handleSaved(id: string, isSaved: boolean) {
    void id; void isSaved;
  }

  return (
    <div className="space-y-6 max-w-7xl">
      {playerEntry && (
        <MomentDetailModal
          entry={playerEntry}
          onClose={() => setPlayerEntry(null)}
          onSaved={handleSaved}
        />
      )}

      {routePath === "/member/academy" && (
        <Link
          href="/member/academy"
          className="flex items-center gap-1.5 text-xs text-[var(--abv-text)]/50 dark:text-white/50 hover:text-[var(--abv-azure)] transition-colors mb-3"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          Back to Academy
        </Link>
      )}

      <div className="flex gap-1 bg-[#111]/5 dark:bg-white/5 rounded-lg p-1 w-fit overflow-x-auto scrollbar-hide">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id
                ? "bg-white dark:bg-[#1a1a1a] text-[var(--abv-text)] dark:text-white shadow-sm"
                : "text-[var(--abv-text)]/50 dark:text-white/40 hover:text-[var(--abv-text)] dark:hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "foundations" && <FoundationsTab />}
      {tab === "live-calls" && <LiveCallsTab />}
      {tab === "browse" && <BrowseTab onPlay={handlePlay} onSaved={handleSaved} />}
      {tab === "search" && <SearchTab onPlay={handlePlay} onSaved={handleSaved} />}
      {tab === "moments" && <MomentsTab onPlay={handlePlay} onSaved={handleSaved} />}
      {tab === "saved" && <SavedTab onPlay={handlePlay} onSaved={handleSaved} />}
    </div>
  );
}

export default function AcademyTabs({ routePath }: { routePath: string }) {
  return (
    <Suspense fallback={
      <div className="space-y-6 max-w-7xl">
        <div className="h-12 bg-[#111]/5 rounded-lg animate-pulse w-full max-w-2xl" />
      </div>
    }>
      <AcademyTabsInner routePath={routePath} />
    </Suspense>
  );
}

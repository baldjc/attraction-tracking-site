"use client";

import { useState, useEffect, useRef } from "react";
import {
  MagnifyingGlassIcon,
  BookmarkIcon as BookmarkOutline,
  XMarkIcon,
  PlayCircleIcon,
  AcademicCapIcon,
  VideoCameraIcon,
  ChevronRightIcon,
  ClockIcon,
  CalendarDaysIcon,
} from "@heroicons/react/24/outline";
import { BookmarkIcon as BookmarkSolid } from "@heroicons/react/24/solid";

export const PRINCIPLES = [
  "Avatar Clarity", "Themes Over Topics", "Binge Architecture", "Lead Magnet System",
  "Values Peppering", "Connection Language", "Grade 5 Language", "Consistency",
  "ARC Attention", "ARC Revelation", "ARC Connection", "Curiosity Bridges",
  "Story Proof", "Show Don't Tell", "Title Frameworks", "Approve the Click",
];

export const PRINCIPLE_COLORS: Record<string, string> = {
  "Avatar Clarity": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  "Themes Over Topics": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  "Binge Architecture": "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  "Lead Magnet System": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  "Values Peppering": "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  "Connection Language": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  "Grade 5 Language": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  "Consistency": "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  "ARC Attention": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  "ARC Revelation": "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  "ARC Connection": "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  "Curiosity Bridges": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  "Story Proof": "bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-300",
  "Show Don't Tell": "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
  "Title Frameworks": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  "Approve the Click": "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
};

export interface Source {
  id: string;
  title: string;
  lessonNumber?: string;
  skoolUrl?: string;
  callDate?: string;
  fathomShareUrl?: string;
}

export interface Entry {
  id: string;
  sourceType: string;
  sourceId: string;
  principles: string[];
  subTopic: string;
  summary: string;
  searchableText?: string | null;
  timestampStart?: number | null;
  timestampEnd?: number | null;
  isGeneralTeaching: boolean;
  isSaved: boolean;
  source: Source | null;
}

export interface TranscriptMatch {
  id: string;
  sourceType: "qa_call" | "course_lesson";
  title: string;
  date?: string;
  lessonNumber?: string;
  fathomShareUrl?: string;
  skoolUrl?: string;
  snippet: string;
  estimatedTimestamp: number;
}

export function fmtTime(s?: number | null) {
  if (s == null) return null;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function fmtDate(d?: string) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function EmptyState({ message, sub }: { message: string; sub?: string }) {
  return (
    <div className="text-center py-16">
      <p className="text-[var(--abv-text)]/40 dark:text-white/30 text-sm font-medium">{message}</p>
      {sub && <p className="text-[var(--abv-text)]/30 dark:text-white/20 text-xs mt-1">{sub}</p>}
    </div>
  );
}

export function PrincipleFilter({
  selected,
  onChange,
}: {
  selected: string | null;
  onChange: (p: string | null) => void;
}) {
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!stripRef.current) return;
    const active = stripRef.current.querySelector<HTMLElement>("[data-active='true']");
    if (active) {
      active.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [selected]);

  return (
    <div ref={stripRef} className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      <button
        data-active={selected === null ? "true" : "false"}
        onClick={() => onChange(null)}
        className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
          selected === null
            ? "bg-[#111] text-white border-[var(--abv-text)] dark:bg-white dark:text-[var(--abv-text)]"
            : "border-[var(--abv-text)]/20 dark:border-white/20 text-[var(--abv-text)]/60 dark:text-white/50 hover:border-[var(--abv-text)]/40"
        }`}
      >
        All Principles
      </button>
      {PRINCIPLES.map((p) => (
        <button
          key={p}
          data-active={selected === p ? "true" : "false"}
          onClick={() => onChange(selected === p ? null : p)}
          className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
            selected === p
              ? `${PRINCIPLE_COLORS[p] ?? "bg-gray-100 text-gray-600"} border-transparent`
              : "border-[var(--abv-text)]/15 dark:border-white/15 text-[var(--abv-text)]/55 dark:text-white/45 hover:border-[var(--abv-text)]/30"
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

export function EntryCard({
  entry,
  onToggleSave,
  onPlay,
  highlight,
}: {
  entry: Entry;
  onToggleSave: (id: string, saved: boolean) => void;
  onPlay: (entry: Entry) => void;
  highlight?: string;
}) {
  const [saved, setSaved] = useState(entry.isSaved);
  const [saving, setSaving] = useState(false);

  const isLesson = entry.sourceType === "course_lesson";
  const isFoundations = entry.sourceType === "foundations_lesson";
  const hasVideo = !isLesson && !isFoundations && !!entry.source?.fathomShareUrl;

  async function toggleSave() {
    setSaving(true);
    const optimistic = !saved;
    setSaved(optimistic);
    try {
      const res = await fetch("/api/member/resources/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId: entry.id }),
      });
      if (res.ok) {
        const d = await res.json();
        setSaved(d.saved);
        onToggleSave(entry.id, d.saved);
      } else {
        setSaved(!optimistic);
      }
    } catch {
      setSaved(!optimistic);
    } finally {
      setSaving(false);
    }
  }

  function highlightText(text: string) {
    if (!highlight || !highlight.trim()) return <>{text}</>;
    const word = highlight.trim();
    const idx = text.toLowerCase().indexOf(word.toLowerCase());
    if (idx === -1) return <>{text}</>;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-[var(--abv-dark)]/25 text-inherit rounded px-0.5">{text.slice(idx, idx + word.length)}</mark>
        {text.slice(idx + word.length)}
      </>
    );
  }

  const borderClass = isFoundations ? "border-teal-100" : isLesson ? "border-blue-100" : "border-violet-100";
  const headerClass = isFoundations
    ? "bg-teal-50 dark:bg-teal-900/10 border-teal-100 dark:border-teal-900/20"
    : isLesson
      ? "bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/20"
      : "bg-violet-50 dark:bg-violet-900/10 border-violet-100 dark:border-violet-900/20";

  // Build academy lesson URL for foundations entries
  const academyUrl = isFoundations && (entry as any).sectionSlug && (entry as any).lessonSlug
    ? `/member/academy/foundations/${(entry as any).sectionSlug}/${(entry as any).lessonSlug}`
    : null;

  return (
    <div className={`bg-white dark:bg-[#1a1a1a] rounded-lg border dark:border-white/10 overflow-hidden hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-shadow ${borderClass}`}>
      <div className={`flex items-center justify-between px-4 py-2 border-b ${headerClass}`}>
        <div className="flex items-center gap-2 min-w-0">
          {isFoundations
            ? <AcademicCapIcon className="w-3.5 h-3.5 text-teal-600 flex-shrink-0" />
            : isLesson
              ? <AcademicCapIcon className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
              : <VideoCameraIcon className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
          }
          <span className="text-xs font-medium text-[var(--abv-text)]/60 dark:text-white/50 truncate">
            {isFoundations
              ? (entry as any).sectionTitle ? `Foundations · ${(entry as any).sectionTitle}` : "Foundations Library"
              : isLesson
                ? entry.source ? `Lesson ${entry.source.lessonNumber} — ${entry.source.title}` : "Course Lesson"
                : entry.source ? `Q&A Call · ${fmtDate(entry.source.callDate)}` : "Q&A Call"
            }
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          {isFoundations && academyUrl && (
            <a
              href={academyUrl}
              className="text-[10px] text-teal-600 hover:underline flex items-center gap-0.5"
            >
              View lesson <ChevronRightIcon className="w-3 h-3" />
            </a>
          )}
          {isLesson && entry.source?.skoolUrl && (
            <a
              href={entry.source.skoolUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-blue-500 hover:underline flex items-center gap-0.5"
            >
              Watch lesson <ChevronRightIcon className="w-3 h-3" />
            </a>
          )}
          {hasVideo && entry.timestampStart != null && (
            <span className="text-[10px] text-violet-500 font-medium">@ {fmtTime(entry.timestampStart)}</span>
          )}
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-[var(--abv-text)] dark:text-white text-sm mb-1.5 leading-snug">
              {highlightText(entry.subTopic)}
            </h3>
            <p className="text-xs text-[var(--abv-text)]/65 dark:text-white/55 leading-relaxed mb-3">
              {highlightText(entry.summary)}
            </p>
            <div className="flex flex-wrap gap-1">
              {entry.principles.map((p) => (
                <span key={p} className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${PRINCIPLE_COLORS[p] ?? "bg-gray-100 text-gray-600"}`}>
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--abv-text)]/5 dark:border-white/5">
          {isFoundations && academyUrl && (
            <a
              href={academyUrl}
              className="flex items-center gap-1.5 text-xs font-semibold text-teal-600 dark:text-teal-400 hover:text-teal-700 transition-colors"
            >
              <AcademicCapIcon className="w-4 h-4" />
              Go to lesson
              <ChevronRightIcon className="w-3 h-3" />
            </a>
          )}
          {hasVideo && (
            <button
              onClick={() => onPlay(entry)}
              className="flex items-center gap-1.5 text-xs font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-700 transition-colors"
            >
              <PlayCircleIcon className="w-4 h-4" />
              {entry.timestampStart != null ? (
                <>
                  Watch on Fathom
                  <span className="ml-0.5 px-1.5 py-0.5 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 rounded font-mono text-[10px]">
                    {fmtTime(entry.timestampStart)}
                  </span>
                </>
              ) : "Watch call"}
            </button>
          )}
          <div className="flex-1" />
          {!isFoundations && (
            <button
              onClick={toggleSave}
              disabled={saving}
              title={saved ? "Remove bookmark" : "Bookmark this moment"}
              className="p-1.5 rounded-lg hover:bg-[#111]/5 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              {saved
                ? <BookmarkSolid className="w-4 h-4 text-[var(--abv-azure)]" />
                : <BookmarkOutline className="w-4 h-4 text-[var(--abv-text)]/30 dark:text-white/30" />
              }
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function EntryGrid({
  entries,
  onSaved,
  onPlay,
  highlight,
}: {
  entries: Entry[];
  onSaved: (id: string, saved: boolean) => void;
  onPlay: (entry: Entry) => void;
  highlight?: string;
}) {
  if (!entries.length) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {entries.map((e) => (
        <EntryCard key={e.id} entry={e} onToggleSave={onSaved} onPlay={onPlay} highlight={highlight} />
      ))}
    </div>
  );
}

export function TranscriptMatchCard({
  match,
  highlight,
}: {
  match: TranscriptMatch;
  highlight: string;
}) {
  const [tsCopied, setTsCopied] = useState(false);
  const ts = fmtTime(match.estimatedTimestamp);
  const isCall = match.sourceType === "qa_call";

  function copyTs() {
    if (!ts) return;
    navigator.clipboard.writeText(ts).catch(() => {});
    setTsCopied(true);
    setTimeout(() => setTsCopied(false), 2000);
  }

  function highlightSnippet(text: string) {
    if (!highlight.trim()) return <span>{text}</span>;
    const word = highlight.trim();
    const idx = text.toLowerCase().indexOf(word.toLowerCase());
    if (idx === -1) return <span>{text}</span>;
    return (
      <span>
        {text.slice(0, idx)}
        <mark className="bg-[var(--abv-dark)]/30 text-inherit rounded px-0.5 font-semibold">
          {text.slice(idx, idx + word.length)}
        </mark>
        {text.slice(idx + word.length)}
      </span>
    );
  }

  return (
    <div className={`bg-white dark:bg-[#1a1a1a] rounded-lg border overflow-hidden ${
      isCall ? "border-violet-100 dark:border-violet-900/30" : "border-blue-100 dark:border-blue-900/30"
    }`}>
      <div className={`flex items-center justify-between px-4 py-2 border-b ${
        isCall
          ? "bg-violet-50 dark:bg-violet-900/10 border-violet-100 dark:border-violet-900/20"
          : "bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/20"
      }`}>
        <div className="flex items-center gap-2 min-w-0">
          {isCall
            ? <VideoCameraIcon className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
            : <AcademicCapIcon className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />}
          <span className="text-xs font-medium text-[var(--abv-text)]/60 dark:text-white/50 truncate">
            {isCall
              ? `${match.title}${match.date ? ` · ${fmtDate(match.date)}` : ""}`
              : `Lesson ${match.lessonNumber} — ${match.title}`}
          </span>
        </div>
        {ts && (
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
            <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-[var(--abv-azure)] bg-[var(--abv-dark)]/10 px-2 py-0.5 rounded-full">
              <ClockIcon className="w-3 h-3" />
              ~{ts}
            </span>
            <button
              onClick={copyTs}
              title="Copy timestamp"
              className="text-[10px] text-[var(--abv-text)]/30 dark:text-white/30 hover:text-[var(--abv-azure)] transition-colors px-1.5 py-0.5 rounded hover:bg-[var(--abv-dark)]/10"
            >
              {tsCopied ? "Copied!" : "Copy"}
            </button>
          </div>
        )}
      </div>

      <div className="px-4 py-3">
        <p className="text-xs text-[var(--abv-text)]/70 dark:text-white/55 leading-relaxed font-mono">
          {highlightSnippet(match.snippet)}
        </p>
      </div>

      <div className="flex items-center gap-3 px-4 py-2 border-t border-[var(--abv-text)]/5 dark:border-white/5">
        {isCall && match.fathomShareUrl && (
          <a
            href={match.fathomShareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-700 transition-colors"
          >
            <PlayCircleIcon className="w-4 h-4" />
            Watch in Fathom ↗
          </a>
        )}
        {!isCall && match.skoolUrl && (
          <a
            href={match.skoolUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors"
          >
            <AcademicCapIcon className="w-4 h-4" />
            Watch on Skool ↗
          </a>
        )}
      </div>
    </div>
  );
}

export function MomentDetailModal({
  entry,
  onClose,
  onSaved,
}: {
  entry: Entry;
  onClose: () => void;
  onSaved: (id: string, saved: boolean) => void;
}) {
  const [modalSaved, setModalSaved] = useState(entry.isSaved);
  const [modalSaving, setModalSaving] = useState(false);
  const [tsCopied, setTsCopied] = useState(false);

  const fathomUrl = (entry.source?.fathomShareUrl ?? "").split("#")[0];
  const ts = fmtTime(entry.timestampStart);
  const transcript = entry.searchableText?.trim();

  async function toggleSave() {
    setModalSaving(true);
    const optimistic = !modalSaved;
    setModalSaved(optimistic);
    try {
      const res = await fetch("/api/member/resources/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId: entry.id }),
      });
      if (res.ok) {
        const d = await res.json();
        setModalSaved(d.saved);
        onSaved(entry.id, d.saved);
      } else {
        setModalSaved(!optimistic);
      }
    } catch {
      setModalSaved(!optimistic);
    } finally {
      setModalSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl bg-white dark:bg-[#1a2232] rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-start gap-3 px-6 py-4 border-b border-[var(--abv-border-strong)] dark:border-white/10 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-400/15 px-2 py-0.5 rounded-full">
                <VideoCameraIcon className="w-3 h-3" /> Q&A Call
              </span>
              {ts && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[var(--abv-azure)] bg-[var(--abv-dark)]/10 px-2 py-0.5 rounded-full">
                  @ {ts}
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(ts).catch(() => {});
                      setTsCopied(true);
                      setTimeout(() => setTsCopied(false), 2000);
                    }}
                    title="Copy timestamp to clipboard"
                    className="text-[var(--abv-azure)]/60 hover:text-[var(--abv-azure)] transition-colors"
                  >
                    {tsCopied
                      ? <span className="text-[9px] font-sans font-semibold not-italic">Copied!</span>
                      : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    }
                  </button>
                </span>
              )}
            </div>
            <h2 className="text-base font-bold text-[var(--abv-text)] dark:text-white mt-1.5 leading-snug">{entry.subTopic}</h2>
            {entry.source && (
              <p className="text-xs text-[var(--abv-text)]/50 dark:text-white/40 mt-0.5">
                {entry.source.title ?? "Q&A Call"}
                {entry.source.callDate && <span className="ml-1.5">· {fmtDate(entry.source.callDate)}</span>}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1.5 text-[var(--abv-text)]/30 dark:text-white/30 hover:text-[var(--abv-text)] dark:hover:text-white rounded-lg hover:bg-[#111]/5 dark:hover:bg-white/10 transition-colors mt-0.5"
            aria-label="Close"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {entry.summary && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--abv-text)]/40 dark:text-white/35 mb-1.5">Summary</p>
              <p className="text-sm text-[var(--abv-text)]/80 dark:text-white/80 leading-relaxed">{entry.summary}</p>
            </div>
          )}
          {transcript && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--abv-text)]/40 dark:text-white/35 mb-1.5">Transcript Excerpt</p>
              <div className="bg-[var(--abv-bg)] dark:bg-white/5 border border-[var(--abv-border-strong)] dark:border-white/8 rounded-lg px-4 py-3 max-h-48 overflow-y-auto">
                <p className="text-[13px] text-[var(--abv-text)]/70 dark:text-white/65 leading-relaxed whitespace-pre-wrap">{transcript}</p>
              </div>
            </div>
          )}
          {entry.principles.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--abv-text)]/40 dark:text-white/35 mb-1.5">Principles</p>
              <div className="flex flex-wrap gap-1.5">
                {entry.principles.map((p) => (
                  <span key={p} className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#111]/8 dark:bg-white/10 text-[var(--abv-text)]/60 dark:text-white/70">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[var(--abv-border-strong)] dark:border-white/10 flex-shrink-0 space-y-2.5">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSave}
              disabled={modalSaving}
              className={`flex items-center gap-1.5 text-sm font-medium px-3.5 py-2 rounded-lg border transition-all disabled:opacity-50 ${
                modalSaved
                  ? "border-[var(--abv-azure)]/40 text-[var(--abv-azure)] bg-[var(--abv-dark)]/10"
                  : "bg-white dark:bg-transparent border border-[var(--abv-border-strong)] dark:border-white/15 text-[var(--abv-text)] dark:text-white/50 hover:border-[var(--abv-text)]/30 dark:hover:border-white/30"
              }`}
            >
              {modalSaved ? <BookmarkSolid className="w-4 h-4" /> : <BookmarkOutline className="w-4 h-4" />}
              {modalSaved ? "Saved" : "Save"}
            </button>
            <a
              href={fathomUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 bg-[var(--abv-dark)] hover:bg-[#2a3a4d] text-white font-bold text-sm py-2.5 rounded-lg transition-colors"
            >
              <VideoCameraIcon className="w-4 h-4" />
              Watch in Fathom ↗
            </a>
          </div>
          {ts && (
            <div className="bg-[var(--abv-bg)] dark:bg-white/5 border border-[var(--abv-border-strong)] dark:border-white/10 rounded-lg px-4 py-3 text-center">
              <p className="text-sm text-[var(--abv-text)]/70 dark:text-white/80 leading-relaxed">
                Jump to <span className="font-mono font-semibold text-[var(--abv-azure)]">{ts}</span> in the recording.
              </p>
              <p className="text-xs text-[var(--abv-text)]/50 dark:text-white/50 mt-1 leading-relaxed">
                Tip: Open the <strong className="text-[var(--abv-text)]/70 dark:text-white/70">Transcript</strong> tab in Fathom and search for the excerpt above — timestamps there are clickable.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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

const PRINCIPLES = [
  "Avatar Clarity", "Themes Over Topics", "Binge Architecture", "Lead Magnet System",
  "Values Peppering", "Connection Language", "Grade 5 Language", "Consistency",
  "ARC Attention", "ARC Revelation", "ARC Connection", "Curiosity Bridges",
  "Story Proof", "Show Don't Tell", "Title Frameworks", "Approve the Click",
];

const PRINCIPLE_COLORS: Record<string, string> = {
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

interface Source {
  id: string;
  title: string;
  lessonNumber?: string;
  skoolUrl?: string;
  callDate?: string;
  fathomShareUrl?: string;
}

interface Entry {
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

interface TranscriptMatch {
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

type Tab = "browse" | "search" | "moments" | "saved";

function fmtTime(s?: number | null) {
  if (s == null) return null;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function fmtDate(d?: string) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fathomUrlWithTimestamp(shareUrl: string, ts?: number | null) {
  if (!shareUrl) return shareUrl;
  // Fathom uses fragment-based timestamps: #t=seconds
  if (ts == null) return shareUrl;
  const base = shareUrl.split("#")[0];
  return `${base}#t=${ts}`;
}

// --- Entry Card ---
function EntryCard({
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
  const hasVideo = !isLesson && !!entry.source?.fathomShareUrl;

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
    if (!highlight || !highlight.trim()) return text;
    const word = highlight.trim();
    const idx = text.toLowerCase().indexOf(word.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-[#0d9488]/25 text-inherit rounded px-0.5">{text.slice(idx, idx + word.length)}</mark>
        {text.slice(idx + word.length)}
      </>
    );
  }

  return (
    <div className={`bg-white dark:bg-[#1a1a1a] rounded-lg border dark:border-white/10 overflow-hidden hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-shadow ${
      isLesson ? "border-blue-100" : "border-violet-100"
    }`}>
      {/* Source bar */}
      <div className={`flex items-center justify-between px-4 py-2 border-b ${
        isLesson
          ? "bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/20"
          : "bg-violet-50 dark:bg-violet-900/10 border-violet-100 dark:border-violet-900/20"
      }`}>
        <div className="flex items-center gap-2 min-w-0">
          {isLesson
            ? <AcademicCapIcon className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
            : <VideoCameraIcon className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
          }
          <span className="text-xs font-medium text-[#2f3437]/60 dark:text-white/50 truncate">
            {isLesson
              ? entry.source ? `Lesson ${entry.source.lessonNumber} — ${entry.source.title}` : "Course Lesson"
              : entry.source ? `Q&A Call · ${fmtDate(entry.source.callDate)}` : "Q&A Call"
            }
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
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

      {/* Body */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-[#2f3437] dark:text-white text-sm mb-1.5 leading-snug">
              {typeof highlightText(entry.subTopic) === "string" ? highlightText(entry.subTopic) : highlightText(entry.subTopic)}
            </h3>
            <p className="text-xs text-[#2f3437]/65 dark:text-white/55 leading-relaxed mb-3">
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

        {/* Actions */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#2f3437]/5 dark:border-white/5">
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
          <button
            onClick={toggleSave}
            disabled={saving}
            title={saved ? "Remove bookmark" : "Bookmark this moment"}
            className="p-1.5 rounded-lg hover:bg-[#111]/5 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            {saved
              ? <BookmarkSolid className="w-4 h-4 text-[#0d9488]" />
              : <BookmarkOutline className="w-4 h-4 text-[#2f3437]/30 dark:text-white/30" />
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Principal Filter Bar ---
function PrincipleFilter({
  selected,
  onChange,
}: {
  selected: string | null;
  onChange: (p: string | null) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      <button
        onClick={() => onChange(null)}
        className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
          selected === null
            ? "bg-[#111] text-white border-[#2f3437] dark:bg-white dark:text-[#2f3437]"
            : "border-[#2f3437]/20 dark:border-white/20 text-[#2f3437]/60 dark:text-white/50 hover:border-[#2f3437]/40"
        }`}
      >
        All Principles
      </button>
      {PRINCIPLES.map((p) => (
        <button
          key={p}
          onClick={() => onChange(selected === p ? null : p)}
          className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
            selected === p
              ? `${PRINCIPLE_COLORS[p] ?? "bg-gray-100 text-gray-600"} border-transparent`
              : "border-[#2f3437]/15 dark:border-white/15 text-[#2f3437]/55 dark:text-white/45 hover:border-[#2f3437]/30"
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

// --- Empty States ---
function EmptyState({ message, sub }: { message: string; sub?: string }) {
  return (
    <div className="text-center py-16">
      <p className="text-[#2f3437]/40 dark:text-white/30 text-sm font-medium">{message}</p>
      {sub && <p className="text-[#2f3437]/30 dark:text-white/20 text-xs mt-1">{sub}</p>}
    </div>
  );
}

// --- Grid ---
function EntryGrid({
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

// --- Transcript Match Card ---
function TranscriptMatchCard({
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
        <mark className="bg-[#0d9488]/30 text-inherit rounded px-0.5 font-semibold">
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
      {/* Source header */}
      <div className={`flex items-center justify-between px-4 py-2 border-b ${
        isCall
          ? "bg-violet-50 dark:bg-violet-900/10 border-violet-100 dark:border-violet-900/20"
          : "bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/20"
      }`}>
        <div className="flex items-center gap-2 min-w-0">
          {isCall
            ? <VideoCameraIcon className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
            : <AcademicCapIcon className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />}
          <span className="text-xs font-medium text-[#2f3437]/60 dark:text-white/50 truncate">
            {isCall
              ? `${match.title}${match.date ? ` · ${fmtDate(match.date)}` : ""}`
              : `Lesson ${match.lessonNumber} — ${match.title}`}
          </span>
        </div>
        {ts && (
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
            <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-[#0d9488] bg-[#0d9488]/10 px-2 py-0.5 rounded-full">
              <ClockIcon className="w-3 h-3" />
              ~{ts}
            </span>
            <button
              onClick={copyTs}
              title="Copy timestamp"
              className="text-[10px] text-[#2f3437]/30 dark:text-white/30 hover:text-[#0d9488] transition-colors px-1.5 py-0.5 rounded hover:bg-[#0d9488]/10"
            >
              {tsCopied ? "Copied!" : "Copy"}
            </button>
          </div>
        )}
      </div>

      {/* Snippet */}
      <div className="px-4 py-3">
        <p className="text-xs text-[#2f3437]/70 dark:text-white/55 leading-relaxed font-mono">
          {highlightSnippet(match.snippet)}
        </p>
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-3 px-4 py-2 border-t border-[#2f3437]/5 dark:border-white/5">
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

// ============================================================
//  MAIN PAGE
// ============================================================
export default function MemberResourcesPage() {
  const [tab, setTab] = useState<Tab>("browse");

  // Browse state
  const [browseEntries, setBrowseEntries] = useState<Entry[]>([]);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [principle, setPrinciple] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<"" | "course_lesson" | "qa_call">("");

  // Search state
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

  // My Moments state
  const [moments, setMoments] = useState<Entry[]>([]);
  const [momentsLoading, setMomentsLoading] = useState(true);

  // My Saved state
  const [savedEntries, setSavedEntries] = useState<Entry[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);

  // Q&A moment detail modal
  const [playerEntry, setPlayerEntry] = useState<Entry | null>(null);
  const [modalSaved, setModalSaved] = useState(false);
  const [modalSaving, setModalSaving] = useState(false);
  const [tsCopied, setTsCopied] = useState(false);

  function handlePlay(entry: Entry) {
    if (!entry.source?.fathomShareUrl) return;
    setPlayerEntry(entry);
    setModalSaved(entry.isSaved);
  }

  async function modalToggleSave() {
    if (!playerEntry) return;
    setModalSaving(true);
    const optimistic = !modalSaved;
    setModalSaved(optimistic);
    try {
      const res = await fetch("/api/member/resources/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId: playerEntry.id }),
      });
      if (res.ok) {
        const d = await res.json();
        setModalSaved(d.saved);
        handleSaved(playerEntry.id, d.saved);
      } else {
        setModalSaved(!optimistic);
      }
    } catch {
      setModalSaved(!optimistic);
    } finally {
      setModalSaving(false);
    }
  }

  // Load browse
  const loadBrowse = useCallback(async () => {
    setBrowseLoading(true);
    const params = new URLSearchParams();
    if (principle) params.set("principle", principle);
    if (sourceType) params.set("sourceType", sourceType);
    const res = await fetch(`/api/member/resources?${params}`);
    if (res.ok) setBrowseEntries(await res.json());
    setBrowseLoading(false);
  }, [principle, sourceType]);

  useEffect(() => { loadBrowse(); }, [loadBrowse]);

  // Load moments
  useEffect(() => {
    setMomentsLoading(true);
    fetch("/api/member/resources/my-moments")
      .then((r) => r.ok ? r.json() : [])
      .then(setMoments)
      .catch(() => setMoments([]))
      .finally(() => setMomentsLoading(false));
  }, []);

  // Load saved
  const loadSaved = useCallback(() => {
    setSavedLoading(true);
    fetch("/api/member/resources/saved")
      .then((r) => r.ok ? r.json() : [])
      .then(setSavedEntries)
      .catch(() => setSavedEntries([]))
      .finally(() => setSavedLoading(false));
  }, []);

  useEffect(() => { loadSaved(); }, [loadSaved]);

  // Search with debounce
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

  function handleSaved(id: string, isSaved: boolean) {
    // Update saved state across all entry arrays
    const update = (entries: Entry[]) =>
      entries.map((e) => e.id === id ? { ...e, isSaved } : e);
    setBrowseEntries(update);
    setSearchResults(update);
    setMoments(update);
    // Reload saved tab when on it or next time
    if (tab === "saved") loadSaved();
    else {
      setSavedEntries(isSaved
        ? savedEntries.some((e) => e.id === id)
          ? savedEntries
          : [...savedEntries, ...browseEntries.filter((e) => e.id === id)]
        : savedEntries.filter((e) => e.id !== id)
      );
    }
  }

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: "browse", label: "Browse Library" },
    { id: "search", label: "Search" },
    { id: "moments", label: "My Coaching Moments", count: moments.length || undefined },
    { id: "saved", label: "My Saved", count: savedEntries.length || undefined },
  ];

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Q&A Moment detail modal */}
      {playerEntry && (() => {
        const fathomUrl = (playerEntry.source?.fathomShareUrl ?? "").split("#")[0];
        const ts = fmtTime(playerEntry.timestampStart);
        const transcript = playerEntry.searchableText?.trim();

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setPlayerEntry(null); }}
          >
            <div className="w-full max-w-2xl bg-[#111111] rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

              {/* Header */}
              <div className="flex items-start gap-3 px-6 py-4 border-b border-white/10 flex-shrink-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-violet-400 bg-violet-400/15 px-2 py-0.5 rounded-full">
                      <VideoCameraIcon className="w-3 h-3" /> Q&A Call
                    </span>
                    {ts && (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[#0d9488] bg-[#0d9488]/10 px-2 py-0.5 rounded-full">
                        @ {ts}
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(ts).catch(() => {});
                            setTsCopied(true);
                            setTimeout(() => setTsCopied(false), 2000);
                          }}
                          title="Copy timestamp to clipboard"
                          className="text-[#0d9488]/60 hover:text-[#0d9488] transition-colors"
                        >
                          {tsCopied
                            ? <span className="text-[9px] font-sans font-semibold not-italic">Copied!</span>
                            : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                          }
                        </button>
                      </span>
                    )}
                  </div>
                  <h2 className="text-base font-bold text-white mt-1.5 leading-snug">{playerEntry.subTopic}</h2>
                  {playerEntry.source && (
                    <p className="text-xs text-white/40 mt-0.5">
                      {playerEntry.source.title ?? "Q&A Call"}
                      {playerEntry.source.callDate && <span className="ml-1.5">· {fmtDate(playerEntry.source.callDate)}</span>}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setPlayerEntry(null)}
                  className="flex-shrink-0 p-1.5 text-white/30 hover:text-white rounded-lg hover:bg-white/10 transition-colors mt-0.5"
                  aria-label="Close"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Body — scrollable */}
              <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

                {/* Summary */}
                {playerEntry.summary && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-white/35 mb-1.5">Summary</p>
                    <p className="text-sm text-white/80 leading-relaxed">{playerEntry.summary}</p>
                  </div>
                )}

                {/* Transcript excerpt */}
                {transcript && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-white/35 mb-1.5">Transcript Excerpt</p>
                    <div className="bg-white/5 border border-white/8 rounded-lg px-4 py-3 max-h-48 overflow-y-auto">
                      <p className="text-[13px] text-white/65 leading-relaxed whitespace-pre-wrap">{transcript}</p>
                    </div>
                  </div>
                )}

                {/* Principles */}
                {playerEntry.principles.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-white/35 mb-1.5">Principles</p>
                    <div className="flex flex-wrap gap-1.5">
                      {playerEntry.principles.map((p) => (
                        <span key={p} className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/10 text-white/70">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer actions */}
              <div className="px-6 py-4 border-t border-white/10 flex-shrink-0 space-y-2.5">
                <div className="flex items-center gap-3">
                  <button
                    onClick={modalToggleSave}
                    disabled={modalSaving}
                    title={modalSaved ? "Remove bookmark" : "Bookmark this moment"}
                    className={`flex items-center gap-1.5 text-sm font-medium px-3.5 py-2 rounded-lg border transition-all disabled:opacity-50 ${
                      modalSaved
                        ? "border-[#0d9488]/40 text-[#0d9488] bg-[#0d9488]/10"
                        : "border-white/15 text-white/50 hover:text-white hover:border-white/30 bg-white/5"
                    }`}
                  >
                    {modalSaved ? <BookmarkSolid className="w-4 h-4" /> : <BookmarkOutline className="w-4 h-4" />}
                    {modalSaved ? "Saved" : "Save"}
                  </button>

                  <a
                    href={fathomUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 bg-[#0d9488] hover:bg-[#5cceff] text-[#0f1620] font-bold text-sm py-2.5 rounded-lg transition-colors"
                  >
                    <VideoCameraIcon className="w-4 h-4" />
                    Watch in Fathom ↗
                  </a>
                </div>

                {ts && (
                  <div className="bg-white/8 border border-white/15 rounded-lg px-4 py-3 text-center">
                    <p className="text-sm text-white/80 leading-relaxed">
                      Jump to <span className="font-mono font-semibold text-[#0d9488]">{ts}</span> in the recording.
                    </p>
                    <p className="text-xs text-white/50 mt-1 leading-relaxed">
                      Tip: Open the <strong className="text-white/70">Transcript</strong> tab in Fathom and search for the excerpt above — timestamps there are clickable and will seek the player.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#2f3437] dark:text-white">Resources & Knowledge Base</h1>
        <p className="text-sm text-[#2f3437]/50 dark:text-white/40 mt-1">
          Coaching wisdom from Q&A calls and course lessons, organised by Attraction principle
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-[#111]/5 dark:bg-white/5 rounded-lg p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id
                ? "bg-white dark:bg-[#1a1a1a] text-[#2f3437] dark:text-white"
                : "text-[#2f3437]/50 dark:text-white/40 hover:text-[#2f3437] dark:hover:text-white"
            }`}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold leading-none ${
                tab === t.id ? "bg-[#0d9488] text-white" : "bg-[#111]/10 dark:bg-white/10 text-[#2f3437]/60 dark:text-white/40"
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── BROWSE TAB ── */}
      {tab === "browse" && (
        <div className="space-y-5">
          {/* Filters */}
          <div className="space-y-3">
            {/* Source type pills */}
            <div className="flex gap-2">
              {(["", "course_lesson", "qa_call"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSourceType(s)}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
                    sourceType === s
                      ? "bg-[#111] text-white border-[#2f3437] dark:bg-white dark:text-[#2f3437]"
                      : "border-[#2f3437]/20 dark:border-white/20 text-[#2f3437]/55 dark:text-white/45 hover:border-[#2f3437]/40"
                  }`}
                >
                  {s === "" && "All Content"}
                  {s === "course_lesson" && <><AcademicCapIcon className="w-3.5 h-3.5" /> Course Lessons</>}
                  {s === "qa_call" && <><VideoCameraIcon className="w-3.5 h-3.5" /> Q&A Calls</>}
                </button>
              ))}
            </div>
            <PrincipleFilter selected={principle} onChange={setPrinciple} />
          </div>

          {browseLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-white dark:bg-[#1a1a1a] rounded-lg border border-[#2f3437]/10 h-44 animate-pulse" />
              ))}
            </div>
          ) : browseEntries.length === 0 ? (
            <EmptyState
              message={principle ? `No approved content for "${principle}" yet` : "No content published yet"}
              sub="Check back soon — new lessons and Q&A moments are added regularly"
            />
          ) : (
            <>
              <p className="text-xs text-[#2f3437]/40 dark:text-white/30">{browseEntries.length} item{browseEntries.length !== 1 ? "s" : ""}</p>
              <EntryGrid entries={browseEntries} onSaved={handleSaved} onPlay={handlePlay} />
            </>
          )}
        </div>
      )}

      {/* ── SEARCH TAB ── */}
      {tab === "search" && (
        <div className="space-y-5">
          <div className="space-y-3">
            {/* Search input */}
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2f3437]/30 dark:text-white/30" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search coaching moments, topics, summaries, transcripts..."
                className="w-full pl-10 pr-4 py-3 border border-[#2f3437]/15 dark:border-white/15 rounded-lg text-sm bg-white dark:bg-[#1a1a1a] text-[#2f3437] dark:text-white placeholder-[#2f3437]/30 dark:placeholder-white/25 focus:outline-none focus:border-[#0d9488] transition-colors"
                autoFocus
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#2f3437]/30 hover:text-[#2f3437] dark:hover:text-white">
                  <XMarkIcon className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Date range + principle filter row */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <CalendarDaysIcon className="w-4 h-4 text-[#2f3437]/30 dark:text-white/30 flex-shrink-0" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="text-xs border border-[#2f3437]/15 dark:border-white/15 rounded-lg px-2 py-1.5 bg-white dark:bg-[#1a1a1a] text-[#2f3437] dark:text-white focus:outline-none focus:border-[#0d9488] transition-colors"
                  title="From date"
                />
                <span className="text-[#2f3437]/30 dark:text-white/30 text-xs">–</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  min={dateFrom || undefined}
                  className="text-xs border border-[#2f3437]/15 dark:border-white/15 rounded-lg px-2 py-1.5 bg-white dark:bg-[#1a1a1a] text-[#2f3437] dark:text-white focus:outline-none focus:border-[#0d9488] transition-colors"
                  title="To date"
                />
                {(dateFrom || dateTo) && (
                  <button
                    onClick={() => { setDateFrom(""); setDateTo(""); }}
                    className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full bg-[#0d9488]/15 text-[#0d9488] hover:bg-[#0d9488]/25 transition-colors"
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
            <div className="text-center py-8 text-sm text-[#2f3437]/40 dark:text-white/30">Searching...</div>
          ) : !searchQuery.trim() && !searchPrinciple && !dateFrom && !dateTo ? (
            <div className="text-center py-16 text-[#2f3437]/30 dark:text-white/20">
              <MagnifyingGlassIcon className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">Type to search coaching moments and full transcripts</p>
              <p className="text-xs mt-1">Or filter by date range and principle above</p>
            </div>
          ) : searchResults.length === 0 && transcriptMatches.length === 0 && didSearch.current ? (
            <EmptyState message="No results found" sub="Try different keywords, a wider date range, or browse by principle" />
          ) : (
            <div className="space-y-8">
              {/* Section 1: Tagged moments */}
              {searchResults.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-[#2f3437] dark:text-white">Tagged Moments</h3>
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300">
                      {searchResults.length} curated result{searchResults.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <EntryGrid entries={searchResults} onSaved={handleSaved} onPlay={handlePlay} highlight={searchQuery} />
                </div>
              )}

              {/* Section 2: Raw transcript matches */}
              {transcriptMatches.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-[#2f3437] dark:text-white">Also mentioned in these recordings</h3>
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#0d9488]/15 text-[#0d9488]">
                      {transcriptTotal} occurrence{transcriptTotal !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <p className="text-xs text-[#2f3437]/40 dark:text-white/30 -mt-2">
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
                        className="text-sm font-medium text-[#0d9488] hover:text-[#0d9488]/80 disabled:opacity-50 transition-colors"
                      >
                        {txLoading ? "Loading…" : `Load more (${transcriptTotal - transcriptMatches.length} remaining)`}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Nothing at all after search */}
              {searchResults.length === 0 && transcriptMatches.length === 0 && didSearch.current && (
                <EmptyState message="No results found" sub="Try different keywords, a wider date range, or browse by principle" />
              )}
            </div>
          )}
        </div>
      )}

      {/* ── MY COACHING MOMENTS TAB ── */}
      {tab === "moments" && (
        <div className="space-y-5">
          <div className="bg-violet-50 dark:bg-violet-900/10 border border-violet-100 dark:border-violet-900/20 rounded-lg px-4 py-3 text-xs text-violet-700 dark:text-violet-300">
            These are moments from Q&A coaching calls where you were coached directly. They are private to you.
          </div>

          {momentsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => <div key={i} className="bg-white dark:bg-[#1a1a1a] rounded-lg border border-[#2f3437]/10 h-44 animate-pulse" />)}
            </div>
          ) : moments.length === 0 ? (
            <EmptyState
              message="No personal coaching moments yet"
              sub="When Jared coaches you directly on a Q&A call, those moments will appear here"
            />
          ) : (
            <>
              <p className="text-xs text-[#2f3437]/40 dark:text-white/30">{moments.length} moment{moments.length !== 1 ? "s" : ""}</p>
              <EntryGrid entries={moments} onSaved={handleSaved} onPlay={handlePlay} />
            </>
          )}
        </div>
      )}

      {/* ── MY SAVED TAB ── */}
      {tab === "saved" && (
        <div className="space-y-5">
          {savedLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => <div key={i} className="bg-white dark:bg-[#1a1a1a] rounded-lg border border-[#2f3437]/10 h-44 animate-pulse" />)}
            </div>
          ) : savedEntries.length === 0 ? (
            <EmptyState
              message="No saved items yet"
              sub="Bookmark moments from the library by clicking the bookmark icon on any card"
            />
          ) : (
            <>
              <p className="text-xs text-[#2f3437]/40 dark:text-white/30">{savedEntries.length} saved item{savedEntries.length !== 1 ? "s" : ""}</p>
              <EntryGrid entries={savedEntries} onSaved={(id, isSaved) => {
                if (!isSaved) setSavedEntries((prev) => prev.filter((e) => e.id !== id));
                handleSaved(id, isSaved);
              }} onPlay={handlePlay} />
            </>
          )}
        </div>
      )}

    </div>
  );
}

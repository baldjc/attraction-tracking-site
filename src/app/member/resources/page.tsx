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
  timestampStart?: number | null;
  timestampEnd?: number | null;
  isGeneralTeaching: boolean;
  isSaved: boolean;
  source: Source | null;
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
  if (ts == null) return shareUrl;
  const sep = shareUrl.includes("?") ? "&" : "?";
  return `${shareUrl}${sep}t=${ts}`;
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
        <mark className="bg-[#3dc3ff]/25 text-inherit rounded px-0.5">{text.slice(idx, idx + word.length)}</mark>
        {text.slice(idx + word.length)}
      </>
    );
  }

  return (
    <div className={`bg-white dark:bg-[#242b3d] rounded-2xl border dark:border-white/10 shadow-sm overflow-hidden hover:shadow-md transition-shadow ${
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
          <span className="text-xs font-medium text-[#1e2a38]/60 dark:text-white/50 truncate">
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
            <h3 className="font-semibold text-[#1e2a38] dark:text-white text-sm mb-1.5 leading-snug">
              {typeof highlightText(entry.subTopic) === "string" ? highlightText(entry.subTopic) : highlightText(entry.subTopic)}
            </h3>
            <p className="text-xs text-[#1e2a38]/65 dark:text-white/55 leading-relaxed mb-3">
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
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#1e2a38]/5 dark:border-white/5">
          {hasVideo && (
            <button
              onClick={() => onPlay(entry)}
              className="flex items-center gap-1.5 text-xs font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-700 transition-colors"
            >
              <PlayCircleIcon className="w-4 h-4" />
              {entry.timestampStart != null ? `Watch moment (${fmtTime(entry.timestampStart)})` : "Watch call"}
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={toggleSave}
            disabled={saving}
            title={saved ? "Remove bookmark" : "Bookmark this moment"}
            className="p-1.5 rounded-lg hover:bg-[#1e2a38]/5 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            {saved
              ? <BookmarkSolid className="w-4 h-4 text-[#3dc3ff]" />
              : <BookmarkOutline className="w-4 h-4 text-[#1e2a38]/30 dark:text-white/30" />
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
            ? "bg-[#1e2a38] text-white border-[#1e2a38] dark:bg-white dark:text-[#1e2a38]"
            : "border-[#1e2a38]/20 dark:border-white/20 text-[#1e2a38]/60 dark:text-white/50 hover:border-[#1e2a38]/40"
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
              : "border-[#1e2a38]/15 dark:border-white/15 text-[#1e2a38]/55 dark:text-white/45 hover:border-[#1e2a38]/30"
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

// --- Fathom Player Modal ---
function FathomModal({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const shareUrl = entry.source?.fathomShareUrl ?? "";
  const embedUrl = fathomUrlWithTimestamp(shareUrl, entry.timestampStart);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#242b3d] rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-[#1e2a38]/10 dark:border-white/10">
          <div className="flex-1 min-w-0 pr-4">
            <p className="text-xs text-[#1e2a38]/40 dark:text-white/40 mb-0.5">
              {entry.source?.title ?? "Q&A Call"} {entry.timestampStart != null && `· @ ${fmtTime(entry.timestampStart)}`}
            </p>
            <h3 className="font-bold text-[#1e2a38] dark:text-white text-sm leading-snug">{entry.subTopic}</h3>
          </div>
          <button onClick={onClose} className="text-[#1e2a38]/40 dark:text-white/40 hover:text-[#1e2a38] dark:hover:text-white flex-shrink-0 mt-0.5">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        {shareUrl ? (
          <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
            <iframe
              src={embedUrl}
              className="absolute inset-0 w-full h-full"
              allowFullScreen
              allow="fullscreen"
              title={entry.subTopic}
            />
          </div>
        ) : (
          <div className="px-5 py-12 text-center text-sm text-[#1e2a38]/40 dark:text-white/30">
            Recording not available for this call.
          </div>
        )}
        <div className="px-5 py-3 border-t border-[#1e2a38]/10 dark:border-white/10">
          <p className="text-xs text-[#1e2a38]/60 dark:text-white/50 leading-relaxed">{entry.summary}</p>
        </div>
      </div>
    </div>
  );
}

// --- Empty States ---
function EmptyState({ message, sub }: { message: string; sub?: string }) {
  return (
    <div className="text-center py-16">
      <p className="text-[#1e2a38]/40 dark:text-white/30 text-sm font-medium">{message}</p>
      {sub && <p className="text-[#1e2a38]/30 dark:text-white/20 text-xs mt-1">{sub}</p>}
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
  const [searching, setSearching] = useState(false);
  const [searchPrinciple, setSearchPrinciple] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didSearch = useRef(false);

  // My Moments state
  const [moments, setMoments] = useState<Entry[]>([]);
  const [momentsLoading, setMomentsLoading] = useState(true);

  // My Saved state
  const [savedEntries, setSavedEntries] = useState<Entry[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);

  // Fathom player
  const [playing, setPlaying] = useState<Entry | null>(null);

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
    if (!searchQuery.trim() && !searchPrinciple) {
      setSearchResults([]);
      didSearch.current = false;
      return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      if (searchPrinciple) params.set("principle", searchPrinciple);
      const res = await fetch(`/api/member/resources?${params}`);
      if (res.ok) setSearchResults(await res.json());
      didSearch.current = true;
      setSearching(false);
    }, 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQuery, searchPrinciple]);

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
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#1e2a38] dark:text-white">Resources & Knowledge Base</h1>
        <p className="text-sm text-[#1e2a38]/50 dark:text-white/40 mt-1">
          Coaching wisdom from Q&A calls and course lessons, organised by Attraction principle
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-[#1e2a38]/5 dark:bg-white/5 rounded-xl p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id
                ? "bg-white dark:bg-[#242b3d] text-[#1e2a38] dark:text-white shadow-sm"
                : "text-[#1e2a38]/50 dark:text-white/40 hover:text-[#1e2a38] dark:hover:text-white"
            }`}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold leading-none ${
                tab === t.id ? "bg-[#3dc3ff] text-white" : "bg-[#1e2a38]/10 dark:bg-white/10 text-[#1e2a38]/60 dark:text-white/40"
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
                      ? "bg-[#1e2a38] text-white border-[#1e2a38] dark:bg-white dark:text-[#1e2a38]"
                      : "border-[#1e2a38]/20 dark:border-white/20 text-[#1e2a38]/55 dark:text-white/45 hover:border-[#1e2a38]/40"
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
                <div key={i} className="bg-white dark:bg-[#242b3d] rounded-2xl border border-[#1e2a38]/10 h-44 animate-pulse" />
              ))}
            </div>
          ) : browseEntries.length === 0 ? (
            <EmptyState
              message={principle ? `No approved content for "${principle}" yet` : "No content published yet"}
              sub="Check back soon — new lessons and Q&A moments are added regularly"
            />
          ) : (
            <>
              <p className="text-xs text-[#1e2a38]/40 dark:text-white/30">{browseEntries.length} item{browseEntries.length !== 1 ? "s" : ""}</p>
              <EntryGrid entries={browseEntries} onSaved={handleSaved} onPlay={setPlaying} />
            </>
          )}
        </div>
      )}

      {/* ── SEARCH TAB ── */}
      {tab === "search" && (
        <div className="space-y-5">
          <div className="space-y-3">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#1e2a38]/30 dark:text-white/30" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search coaching moments, topics, summaries..."
                className="w-full pl-10 pr-4 py-3 border border-[#1e2a38]/15 dark:border-white/15 rounded-xl text-sm bg-white dark:bg-[#242b3d] text-[#1e2a38] dark:text-white placeholder-[#1e2a38]/30 dark:placeholder-white/25 focus:outline-none focus:border-[#3dc3ff] transition-colors"
                autoFocus
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#1e2a38]/30 hover:text-[#1e2a38] dark:hover:text-white">
                  <XMarkIcon className="w-4 h-4" />
                </button>
              )}
            </div>
            <PrincipleFilter selected={searchPrinciple} onChange={setSearchPrinciple} />
          </div>

          {searching ? (
            <div className="text-center py-8 text-sm text-[#1e2a38]/40 dark:text-white/30">Searching...</div>
          ) : !searchQuery.trim() && !searchPrinciple ? (
            <div className="text-center py-16 text-[#1e2a38]/30 dark:text-white/20">
              <MagnifyingGlassIcon className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">Type to search the knowledge base</p>
              <p className="text-xs mt-1">Or filter by principle above</p>
            </div>
          ) : searchResults.length === 0 && didSearch.current ? (
            <EmptyState message="No results found" sub="Try different keywords or browse by principle" />
          ) : (
            <>
              {searchResults.length > 0 && (
                <p className="text-xs text-[#1e2a38]/40 dark:text-white/30">{searchResults.length} result{searchResults.length !== 1 ? "s" : ""}</p>
              )}
              <EntryGrid entries={searchResults} onSaved={handleSaved} onPlay={setPlaying} highlight={searchQuery} />
            </>
          )}
        </div>
      )}

      {/* ── MY COACHING MOMENTS TAB ── */}
      {tab === "moments" && (
        <div className="space-y-5">
          <div className="bg-violet-50 dark:bg-violet-900/10 border border-violet-100 dark:border-violet-900/20 rounded-xl px-4 py-3 text-xs text-violet-700 dark:text-violet-300">
            These are moments from Q&A coaching calls where you were coached directly. They are private to you.
          </div>

          {momentsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => <div key={i} className="bg-white dark:bg-[#242b3d] rounded-2xl border border-[#1e2a38]/10 h-44 animate-pulse" />)}
            </div>
          ) : moments.length === 0 ? (
            <EmptyState
              message="No personal coaching moments yet"
              sub="When Jared coaches you directly on a Q&A call, those moments will appear here"
            />
          ) : (
            <>
              <p className="text-xs text-[#1e2a38]/40 dark:text-white/30">{moments.length} moment{moments.length !== 1 ? "s" : ""}</p>
              <EntryGrid entries={moments} onSaved={handleSaved} onPlay={setPlaying} />
            </>
          )}
        </div>
      )}

      {/* ── MY SAVED TAB ── */}
      {tab === "saved" && (
        <div className="space-y-5">
          {savedLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => <div key={i} className="bg-white dark:bg-[#242b3d] rounded-2xl border border-[#1e2a38]/10 h-44 animate-pulse" />)}
            </div>
          ) : savedEntries.length === 0 ? (
            <EmptyState
              message="No saved items yet"
              sub="Bookmark moments from the library by clicking the bookmark icon on any card"
            />
          ) : (
            <>
              <p className="text-xs text-[#1e2a38]/40 dark:text-white/30">{savedEntries.length} saved item{savedEntries.length !== 1 ? "s" : ""}</p>
              <EntryGrid entries={savedEntries} onSaved={(id, isSaved) => {
                if (!isSaved) setSavedEntries((prev) => prev.filter((e) => e.id !== id));
                handleSaved(id, isSaved);
              }} onPlay={setPlaying} />
            </>
          )}
        </div>
      )}

      {/* Fathom Player Modal */}
      {playing && <FathomModal entry={playing} onClose={() => setPlaying(null)} />}
    </div>
  );
}

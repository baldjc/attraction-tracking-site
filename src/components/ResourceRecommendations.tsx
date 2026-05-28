"use client";

import { useState, useEffect } from "react";
import { AcademicCapIcon, VideoCameraIcon, PlayCircleIcon, ChevronRightIcon, BookOpenIcon } from "@heroicons/react/24/outline";

interface Source {
  id: string;
  title: string;
  lessonNumber?: string;
  skoolUrl?: string;
  callDate?: string;
  fathomShareUrl?: string;
}

export interface Recommendation {
  id: string;
  sourceType: string;
  principles: string[];
  subTopic: string;
  summary: string;
  timestampStart?: number | null;
  primaryPrinciple: string;
  source: Source | null;
}

const PRINCIPLE_COLORS: Record<string, string> = {
  "Avatar Clarity": "bg-purple-100 text-purple-700",
  "Themes Over Topics": "bg-[var(--abv-azure-tint)] text-[var(--abv-ink)]",
  "Binge Architecture": "bg-[var(--abv-azure-tint-strong)] text-[var(--abv-ink)]",
  "Lead Magnet System": "bg-green-100 text-green-700",
  "Values Peppering": "bg-pink-100 text-pink-700",
  "Connection Language": "bg-yellow-100 text-yellow-700",
  "Grade 5 Language": "bg-orange-100 text-orange-700",
  "Consistency": "bg-teal-100 text-teal-700",
  "ARC Attention": "bg-red-100 text-red-700",
  "ARC Revelation": "bg-violet-100 text-violet-700",
  "ARC Connection": "bg-sky-100 text-sky-700",
  "Curiosity Bridges": "bg-amber-100 text-amber-700",
  "Story Proof": "bg-lime-100 text-lime-700",
  "Show Don't Tell": "bg-cyan-100 text-cyan-700",
  "Title Frameworks": "bg-emerald-100 text-emerald-700",
  "Approve the Click": "bg-rose-100 text-rose-700",
};

function fmtTime(s?: number | null) {
  if (s == null) return null;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function fmtDate(d?: string) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function RecommendationCard({ rec }: { rec: Recommendation }) {
  const isLesson = rec.sourceType === "course_lesson";
  const fathomUrl = rec.source?.fathomShareUrl
    ? rec.source.fathomShareUrl.split("#")[0]
    : null;

  return (
    <div className={`flex-shrink-0 w-64 rounded-lg border overflow-hidden bg-white dark:bg-[#0f1419] ${
      isLesson ? "border-blue-100 dark:border-blue-900/30" : "border-violet-100 dark:border-violet-900/30"
    }`}>
      {/* Source bar */}
      <div className={`flex items-center gap-1.5 px-3 py-1.5 ${
        isLesson ? "bg-[var(--abv-azure-tint)]" : "bg-violet-50 dark:bg-violet-900/15"
      }`}>
        {isLesson
          ? <AcademicCapIcon className="w-3 h-3 text-blue-500 flex-shrink-0" />
          : <VideoCameraIcon className="w-3 h-3 text-violet-500 flex-shrink-0" />}
        <span className="text-[10px] font-semibold text-[var(--abv-text)]/55 dark:text-white/45 truncate">
          {isLesson
            ? rec.source ? `Lesson ${rec.source.lessonNumber}` : "Course Lesson"
            : rec.source ? fmtDate(rec.source.callDate) : "Q&A Call"
          }
        </span>
        {!isLesson && rec.timestampStart != null && (
          <span className="text-[10px] text-violet-500 font-medium flex-shrink-0 ml-auto">@{fmtTime(rec.timestampStart)}</span>
        )}
      </div>

      {/* Body */}
      <div className="p-3 space-y-2">
        <p className="text-xs font-semibold text-[var(--abv-text)] dark:text-white leading-snug line-clamp-2">{rec.subTopic}</p>
        <p className="text-[11px] text-[var(--abv-text)]/55 dark:text-white/45 leading-relaxed line-clamp-2">{rec.summary}</p>
        <div className="flex flex-wrap gap-1">
          {rec.principles.slice(0, 2).map((p) => (
            <span key={p} className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${PRINCIPLE_COLORS[p] ?? "bg-gray-100 text-gray-600"}`}>
              {p}
            </span>
          ))}
        </div>
        <div className="pt-1">
          {isLesson && rec.source?.skoolUrl && (
            <a
              href={rec.source.skoolUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 transition-colors"
            >
              Watch lesson <ChevronRightIcon className="w-3 h-3" />
            </a>
          )}
          {isLesson && !rec.source?.skoolUrl && (
            <span className="text-[11px] text-[var(--abv-text)]/30 dark:text-white/25">Find in your course</span>
          )}
          {!isLesson && fathomUrl && (
            <a
              href={fathomUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] font-semibold text-violet-600 hover:text-violet-700 transition-colors"
            >
              <PlayCircleIcon className="w-3.5 h-3.5" />
              Watch in Fathom ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

interface Props {
  /** Comma-separated principle display names OR snake_case audit keys */
  principles: string;
  /** Number of entries per principle (max 5) */
  limitPerPrinciple?: number;
  /** Heading shown above the panel */
  heading?: string;
  /** Compact mode: smaller padding, no heading border */
  compact?: boolean;
  className?: string;
}

export default function ResourceRecommendations({
  principles,
  limitPerPrinciple = 2,
  heading = "📚 Related Resources",
  compact = false,
  className = "",
}: Props) {
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!principles.trim()) { setLoading(false); return; }
    const params = new URLSearchParams({ principles, limit: String(limitPerPrinciple) });
    fetch(`/api/member/resources/recommendations?${params}`)
      .then((r) => r.ok ? r.json() : [])
      .then(setRecs)
      .catch(() => setRecs([]))
      .finally(() => setLoading(false));
  }, [principles, limitPerPrinciple]);

  if (!loading && recs.length === 0) return null;

  return (
    <div className={`${className}`}>
      <div className={`flex items-center gap-2 mb-3 ${compact ? "" : ""}`}>
        <BookOpenIcon className="w-4 h-4 text-[var(--abv-azure)] flex-shrink-0" />
        <h3 className="text-sm font-semibold text-[var(--abv-text)] dark:text-white">{heading}</h3>
        {!loading && recs.length > 0 && (
          <span className="text-[10px] text-[var(--abv-text)]/40 dark:text-white/30">{recs.length} item{recs.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      {loading ? (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex-shrink-0 w-64 h-28 bg-[#111]/5 dark:bg-white/5 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
          {recs.map((rec) => <RecommendationCard key={rec.id} rec={rec} />)}
        </div>
      )}
    </div>
  );
}

// ---- Inline version for use inside non-scrollable layouts (audit report) ----
export function ResourceRecommendationsInline({
  principles,
  limitPerPrinciple = 2,
  heading = "📚 Related Resources",
  className = "",
}: Props) {
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!principles.trim()) { setLoading(false); return; }
    const params = new URLSearchParams({ principles, limit: String(limitPerPrinciple) });
    fetch(`/api/member/resources/recommendations?${params}`)
      .then((r) => r.ok ? r.json() : [])
      .then(setRecs)
      .catch(() => setRecs([]))
      .finally(() => setLoading(false));
  }, [principles, limitPerPrinciple]);

  if (!loading && recs.length === 0) return null;

  return (
    <div className={`rounded-lg border border-[var(--abv-azure)]/25 bg-[var(--abv-dark)]/5 p-5 ${className}`}>
      <div className="flex items-center gap-2 mb-4">
        <BookOpenIcon className="w-4 h-4 text-[var(--abv-azure)]" />
        <h3 className="text-sm font-semibold text-[var(--abv-text)]">{heading}</h3>
        {!loading && recs.length > 0 && (
          <span className="text-[10px] text-[var(--abv-text)]/40">{recs.length} item{recs.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-16 bg-[#111]/5 rounded-lg animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {recs.map((rec) => <InlineRecommendationRow key={rec.id} rec={rec} />)}
        </div>
      )}
    </div>
  );
}

function InlineRecommendationRow({ rec }: { rec: Recommendation }) {
  const isLesson = rec.sourceType === "course_lesson";
  const fathomUrl = rec.source?.fathomShareUrl
    ? rec.source.fathomShareUrl.split("#")[0]
    : null;

  return (
    <div className="flex items-start gap-3 bg-white rounded-lg border border-[var(--abv-text)]/8 px-4 py-3">
      <div className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5 ${
        isLesson ? "bg-[var(--abv-azure-tint-strong)]" : "bg-violet-100"
      }`}>
        {isLesson
          ? <AcademicCapIcon className="w-3.5 h-3.5 text-blue-600" />
          : <VideoCameraIcon className="w-3.5 h-3.5 text-violet-600" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[10px] text-[var(--abv-text)]/40 font-medium">
            {isLesson
              ? rec.source ? `Lesson ${rec.source.lessonNumber} — ${rec.source.title}` : "Course Lesson"
              : rec.source ? `Q&A Call · ${fmtDate(rec.source.callDate)}` : "Q&A Call"
            }
          </span>
          {!isLesson && rec.timestampStart != null && (
            <span className="text-[10px] text-violet-500">@ {fmtTime(rec.timestampStart)}</span>
          )}
        </div>
        <p className="text-xs font-semibold text-[var(--abv-text)] mb-0.5 leading-snug">{rec.subTopic}</p>
        <p className="text-[11px] text-[var(--abv-text)]/55 leading-relaxed line-clamp-2">{rec.summary}</p>
      </div>
      <div className="flex-shrink-0 ml-2 mt-0.5">
        {isLesson && rec.source?.skoolUrl && (
          <a href={rec.source.skoolUrl} target="_blank" rel="noopener noreferrer"
            className="text-[11px] font-semibold text-blue-600 hover:underline whitespace-nowrap">
            Watch ↗
          </a>
        )}
        {!isLesson && fathomUrl && (
          <a href={fathomUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-0.5 text-[11px] font-semibold text-violet-600 hover:underline whitespace-nowrap">
            <PlayCircleIcon className="w-3 h-3" /> Watch in Fathom ↗
          </a>
        )}
      </div>
    </div>
  );
}

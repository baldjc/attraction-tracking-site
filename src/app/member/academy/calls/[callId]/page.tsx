"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { use } from "react";
import {
  ArrowLeftIcon,
  PlayCircleIcon,
  AcademicCapIcon,
} from "@heroicons/react/24/outline";
import { PRINCIPLE_COLORS, fmtDuration } from "@/components/resources-shared";

interface CallDetail {
  id: string;
  title: string;
  callDate: string;
  duration: number | null;
  fathomShareUrl: string;
  principles: string[];
}

interface Moment {
  id: string;
  subTopic: string;
  summary: string;
  principles: string[];
  timestampStart: number | null;
  timestampEnd: number | null;
  isGeneralTeaching: boolean;
  isMine: boolean;
}

interface RelatedLesson {
  id: string;
  title: string;
  slug: string;
  sectionTitle: string;
  sectionSlug: string;
  principleTags: string[];
}

function fmtLongDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function fmtTimestamp(s: number | null) {
  if (s == null) return null;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function fmtDurationLong(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function LiveCallDetailPage({ params }: { params: Promise<{ callId: string }> }) {
  const { callId } = use(params);
  const [call, setCall] = useState<CallDetail | null>(null);
  const [moments, setMoments] = useState<Moment[]>([]);
  const [relatedLessons, setRelatedLessons] = useState<RelatedLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/member/academy/live-calls/${callId}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        setCall(d.call);
        setMoments(d.moments);
        setRelatedLessons(d.relatedLessons);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [callId]);

  if (loading) {
    return (
      <div className="max-w-3xl space-y-4">
        <div className="h-6 w-32 bg-[#111]/5 rounded animate-pulse" />
        <div className="h-10 w-3/4 bg-[#111]/5 rounded animate-pulse" />
        <div className="h-48 bg-[#111]/5 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (notFound || !call) {
    return (
      <div className="max-w-3xl">
        <Link
          href="/member/academy?tab=live-calls"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--abv-text)]/50 dark:text-white/40 hover:text-[var(--abv-text)] dark:hover:text-white mb-6 transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back to Live Calls
        </Link>
        <p className="text-[var(--abv-text)]/50 dark:text-white/40 text-sm">Call not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/member/academy?tab=live-calls"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--abv-text)]/50 dark:text-white/40 hover:text-[var(--abv-text)] dark:hover:text-white transition-colors"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        Back to Live Calls
      </Link>

      <div className="bg-white dark:bg-[#1a2433] rounded-lg border border-[var(--abv-border-strong)] dark:border-white/10 p-6">
        <h1 className="text-2xl font-bold text-[var(--abv-text)] dark:text-white mb-2 leading-tight">
          {call.title}
        </h1>

        <div className="flex flex-wrap items-center gap-3 mb-4 text-sm text-[var(--abv-text)]/50 dark:text-white/40">
          <span>{fmtLongDate(call.callDate)}</span>
          {call.duration != null && (
            <>
              <span>·</span>
              <span>{fmtDurationLong(call.duration)}</span>
            </>
          )}
        </div>

        {call.principles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-5">
            {call.principles.map((p) => (
              <span key={p} className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full ${PRINCIPLE_COLORS[p] ?? "bg-gray-100 text-gray-600"}`}>
                {p}
              </span>
            ))}
          </div>
        )}

        <a
          href={call.fathomShareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-[var(--abv-dark)] hover:bg-black/85 text-white font-bold text-sm px-6 py-3 rounded-lg transition-colors"
        >
          <PlayCircleIcon className="w-5 h-5" />
          Watch on Fathom
        </a>
      </div>

      {moments.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-[var(--abv-text)] dark:text-white mb-3">Key Talking Points</h2>
          <div className="space-y-3">
            {moments.map((moment) => (
              <div
                key={moment.id}
                className="bg-white dark:bg-[#1a2433] rounded-lg border border-[var(--abv-border-strong)] dark:border-white/10 p-4"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="font-semibold text-[var(--abv-text)] dark:text-white text-sm leading-snug flex-1">
                    {moment.subTopic}
                  </h3>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {moment.isMine && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--abv-dark)]/15 text-[var(--abv-azure)]">
                        Your moment
                      </span>
                    )}
                    {moment.timestampStart != null && (
                      <span className="text-[10px] font-mono font-semibold text-[var(--abv-text)]/40 dark:text-white/30">
                        @ {fmtTimestamp(moment.timestampStart)}
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-xs text-[var(--abv-text)]/65 dark:text-white/55 leading-relaxed mb-3">
                  {moment.summary}
                </p>

                {moment.principles.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {moment.principles.map((p) => (
                      <span key={p} className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${PRINCIPLE_COLORS[p] ?? "bg-gray-100 text-gray-600"}`}>
                        {p}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {relatedLessons.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-[var(--abv-text)] dark:text-white mb-3">Related Lessons</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {relatedLessons.map((lesson) => (
              <Link
                key={lesson.id}
                href={`/member/academy/foundations/${lesson.sectionSlug}/${lesson.slug}`}
                className="bg-white dark:bg-[#1a2433] rounded-lg border border-blue-100 dark:border-blue-900/30 p-4 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-shadow"
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <AcademicCapIcon className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                  <span className="text-[11px] font-medium text-[var(--abv-text)]/50 dark:text-white/40 truncate">
                    {lesson.sectionTitle}
                  </span>
                </div>
                <p className="text-sm font-semibold text-[var(--abv-text)] dark:text-white leading-snug mb-2">
                  {lesson.title}
                </p>
                {lesson.principleTags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {lesson.principleTags.slice(0, 3).map((p) => (
                      <span key={p} className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${PRINCIPLE_COLORS[p] ?? "bg-gray-100 text-gray-600"}`}>
                        {p}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

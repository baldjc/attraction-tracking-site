"use client";

import { useEffect, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";

interface Call {
  id: string;
  fathomUrl: string | null;
  loomUrl: string | null;
  callDate: string;
  topic: string | null;
  notes: string | null;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function callTitle(call: Call) {
  if (call.topic) return call.topic;
  return `Strategy Call — ${formatDate(call.callDate)}`;
}

function loomEmbedUrl(url: string): string {
  const match = url.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/);
  if (match) return `https://www.loom.com/embed/${match[1]}`;
  return url;
}

function CallCard({ call }: { call: Call }) {
  const hasLoom = !!call.loomUrl;
  const hasFathom = !!call.fathomUrl;
  const [loomOpen, setLoomOpen] = useState(false);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Main row */}
      <div className="flex items-center gap-4 px-5 py-4">
        {/* Date badge */}
        <div className="shrink-0 text-center bg-[var(--abv-bg)] rounded-lg px-3 py-2 min-w-[56px]">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--abv-azure)]">
            {new Date(call.callDate).toLocaleDateString("en-CA", { month: "short", timeZone: "UTC" })}
          </p>
          <p className="text-lg font-bold text-[var(--abv-text)] leading-none">
            {new Date(call.callDate).toLocaleDateString("en-CA", { day: "numeric", timeZone: "UTC" })}
          </p>
          <p className="text-[10px] text-[var(--abv-text)]/40">
            {new Date(call.callDate).getUTCFullYear()}
          </p>
        </div>

        {/* Title + notes preview */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--abv-text)] truncate">{callTitle(call)}</p>
          {call.notes && (
            <p className="text-xs text-[var(--abv-text)]/40 truncate mt-0.5">{call.notes}</p>
          )}
        </div>

        {/* Video buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {hasFathom && (
            <a
              href={call.fathomUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-[var(--abv-text)] text-white rounded-lg hover:bg-[#1a1f22] transition-colors"
            >
              <span>🎥</span> Watch
            </a>
          )}
          {hasLoom && (
            <button
              onClick={() => setLoomOpen((o) => !o)}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 border border-gray-200 text-[var(--abv-text)] rounded-lg hover:border-[var(--abv-azure)]/40 hover:text-[var(--abv-azure)] transition-colors"
            >
              {loomOpen ? <ChevronUpIcon className="w-3.5 h-3.5" /> : <ChevronDownIcon className="w-3.5 h-3.5" />}
              Loom
            </button>
          )}
        </div>
      </div>

      {/* Loom embed — collapsible */}
      {hasLoom && loomOpen && (
        <div className="px-5 pb-4 border-t border-gray-100 pt-3">
          <iframe
            src={loomEmbedUrl(call.loomUrl!)}
            width="100%"
            height="340"
            frameBorder="0"
            allowFullScreen
            className="rounded-lg border border-gray-100 block"
          />
        </div>
      )}

      {/* Full notes — if no truncation was enough */}
      {call.notes && call.notes.length > 60 && (
        <div className="px-5 pb-4 border-t border-gray-100 pt-3">
          <p className="text-xs text-[var(--abv-text)]/60 whitespace-pre-line">{call.notes}</p>
        </div>
      )}
    </div>
  );
}

export default function MyCallsClient() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/member/calls")
      .then((r) => r.json())
      .then((d) => setCalls(d.calls ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse flex items-center gap-4">
            <div className="w-14 h-14 bg-gray-100 rounded-lg shrink-0" />
            <div className="flex-1">
              <div className="h-4 bg-gray-100 rounded w-48 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-32" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (calls.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
        <div className="text-4xl mb-3">📹</div>
        <p className="text-[var(--abv-text)]/50 text-sm">
          No call recordings yet. After your next 1-on-1 call, the recording will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {calls.map((call) => (
        <CallCard key={call.id} call={call} />
      ))}
    </div>
  );
}

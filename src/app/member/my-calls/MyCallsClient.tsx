"use client";

import { useEffect, useState } from "react";

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
    month: "long",
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
  const hasBoth = hasLoom && hasFathom;
  const [activeTab, setActiveTab] = useState<"loom" | "fathom">(hasLoom ? "loom" : "fathom");

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-6 pt-6 pb-4">
        <p className="text-xs font-medium text-[#6ba3c7] mb-1 uppercase tracking-wide">
          {formatDate(call.callDate)}
        </p>
        <h2 className="text-base font-semibold text-[#2f3437]">{callTitle(call)}</h2>
      </div>

      {hasBoth && (
        <div className="px-6 pb-3 flex gap-2">
          <button
            onClick={() => setActiveTab("loom")}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              activeTab === "loom"
                ? "bg-[#2f3437] text-white border-[#2f3437]"
                : "text-[#2f3437]/50 border-gray-200 hover:border-[#2f3437]/30"
            }`}
          >
            Loom
          </button>
          <button
            onClick={() => setActiveTab("fathom")}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              activeTab === "fathom"
                ? "bg-[#2f3437] text-white border-[#2f3437]"
                : "text-[#2f3437]/50 border-gray-200 hover:border-[#2f3437]/30"
            }`}
          >
            Call Recording
          </button>
        </div>
      )}

      <div className="px-6">
        {activeTab === "loom" && call.loomUrl && (
          <iframe
            src={loomEmbedUrl(call.loomUrl)}
            width="100%"
            height="400"
            frameBorder="0"
            allowFullScreen
            className="rounded-lg border border-gray-100"
          />
        )}
        {activeTab === "fathom" && call.fathomUrl && (
          <iframe
            src={call.fathomUrl}
            width="100%"
            height="400"
            frameBorder="0"
            allowFullScreen
            className="rounded-lg border border-gray-100"
          />
        )}
      </div>

      {call.notes && (
        <div className="px-6 py-4">
          <p className="text-sm text-[#2f3437]/60 whitespace-pre-line">{call.notes}</p>
        </div>
      )}
      {!call.notes && <div className="pb-4" />}
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
      <div className="space-y-4">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-6 animate-pulse">
            <div className="h-4 bg-gray-100 rounded w-32 mb-3" />
            <div className="h-5 bg-gray-100 rounded w-64 mb-4" />
            <div className="h-48 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (calls.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
        <div className="text-4xl mb-3">📹</div>
        <p className="text-[#2f3437]/50 text-sm">
          No call recordings yet. After your next 1-on-1 call, the recording will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {calls.map((call) => (
        <CallCard key={call.id} call={call} />
      ))}
    </div>
  );
}

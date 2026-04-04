"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DocumentTextIcon,
  ClockIcon,
  XMarkIcon,
  ClipboardDocumentIcon,
  ClipboardDocumentCheckIcon,
  ChevronRightIcon,
  CalendarDaysIcon,
} from "@heroicons/react/24/outline";

interface ContentPlan {
  id: string;
  title: string;
  status: string;
}

interface ScriptSummary {
  id: string;
  videoTitle: string;
  createdAt: string;
}

interface ScriptDetail {
  id: string;
  videoTitle: string;
  createdAt: string;
  fullScript: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function ScriptViewModal({
  scriptId,
  onClose,
}: {
  scriptId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<ScriptDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [plans, setPlans] = useState<ContentPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedToPlan, setSavedToPlan] = useState(false);

  useEffect(() => {
    fetch(`/api/ai-tools/saved-scripts/${scriptId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setDetail(d);
      })
      .catch(() => setError("Failed to load script."))
      .finally(() => setLoading(false));
  }, [scriptId]);

  useEffect(() => {
    fetch("/api/member/content-plans")
      .then((r) => r.json())
      .then((d) => setPlans(d.plans ?? []))
      .catch(() => {});
  }, []);

  const handleCopy = useCallback(() => {
    if (!detail?.fullScript) return;
    navigator.clipboard.writeText(detail.fullScript).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [detail]);

  async function handleSaveToPlan() {
    if (!selectedPlanId || !detail?.fullScript || saving || savedToPlan) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/member/content-plans/${selectedPlanId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: detail.fullScript }),
      });
      if (!res.ok) throw new Error("failed");
      setSavedToPlan(true);
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl w-full max-w-2xl my-6">
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-[#2f3437]/10 dark:border-white/10">
          <div className="min-w-0">
            {loading ? (
              <div className="h-5 w-48 bg-[#2f3437]/10 rounded animate-pulse" />
            ) : (
              <>
                <h2 className="text-base font-bold text-[#2f3437] dark:text-white leading-snug">
                  {detail?.videoTitle ?? "Script"}
                </h2>
                {detail?.createdAt && (
                  <p className="text-xs text-[#2f3437]/45 dark:text-white/40 mt-0.5 flex items-center gap-1">
                    <ClockIcon className="w-3 h-3" />
                    {formatDate(detail.createdAt)}
                  </p>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {detail?.fullScript && (
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#6ba3c7] hover:bg-[#5490b5] text-white text-xs font-semibold transition-colors"
              >
                {copied ? (
                  <>
                    <ClipboardDocumentCheckIcon className="w-3.5 h-3.5" />
                    Copied!
                  </>
                ) : (
                  <>
                    <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                    Copy to clipboard
                  </>
                )}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#2f3437]/40 dark:text-white/40 hover:text-[#2f3437] dark:hover:text-white hover:bg-[#2f3437]/5 dark:hover:bg-white/5 transition-colors"
              aria-label="Close"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5">
          {loading && (
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-4 bg-[#2f3437]/8 rounded animate-pulse" style={{ width: `${70 + (i % 3) * 10}%` }} />
              ))}
            </div>
          )}
          {!loading && error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          {!loading && !error && detail?.fullScript && (
            <pre className="text-sm text-[#2f3437]/80 dark:text-white/75 whitespace-pre-wrap font-sans leading-relaxed">
              {detail.fullScript}
            </pre>
          )}
          {!loading && !error && !detail?.fullScript && (
            <p className="text-sm text-[#2f3437]/45">No script text found for this entry.</p>
          )}
        </div>

        {/* Save to content plan */}
        {!loading && !error && detail?.fullScript && plans.length > 0 && (
          <div className="px-6 pb-5 pt-0 border-t border-[#2f3437]/8 mt-0">
            <p className="text-xs font-medium text-[#2f3437]/50 mb-2 mt-4">Save script to a content plan</p>
            <div className="flex gap-2 items-center">
              <select
                value={selectedPlanId}
                onChange={(e) => { setSelectedPlanId(e.target.value); setSavedToPlan(false); }}
                className="flex-1 text-sm border border-[#2f3437]/15 rounded-lg px-3 py-1.5 text-[#2f3437] focus:outline-none focus:border-[#6ba3c7] bg-white"
              >
                <option value="">Select a video…</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
              <button
                onClick={handleSaveToPlan}
                disabled={!selectedPlanId || saving || savedToPlan}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  savedToPlan
                    ? "bg-green-50 border border-green-200 text-green-600 cursor-default"
                    : "bg-[#6ba3c7] hover:bg-[#5490b5] text-white disabled:opacity-40 disabled:cursor-not-allowed"
                }`}
              >
                <CalendarDaysIcon className="w-3.5 h-3.5" />
                {saving ? "Saving…" : savedToPlan ? "Saved!" : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ScriptHistoryPanel() {
  const [scripts, setScripts] = useState<ScriptSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingId, setViewingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ai-tools/saved-scripts")
      .then((r) => r.json())
      .then((d) => setScripts(d.scripts ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || scripts.length === 0) return null;

  return (
    <>
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-[#2f3437] dark:text-white/80 uppercase tracking-wider mb-3">
          My Scripts
        </h2>
        <div className="space-y-2">
          {scripts.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-3 bg-white dark:bg-white/5 border border-[#2f3437]/10 dark:border-white/10 rounded-xl px-4 py-3 hover:border-[#6ba3c7]/40 hover:shadow-sm transition-all"
            >
              <div className="w-8 h-8 rounded-lg bg-[#6ba3c7]/10 flex items-center justify-center shrink-0">
                <DocumentTextIcon className="w-4 h-4 text-[#6ba3c7]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#2f3437] dark:text-white truncate leading-snug">
                  {s.videoTitle}
                </p>
                <p className="text-xs text-[#2f3437]/45 dark:text-white/35 mt-0.5 flex items-center gap-1">
                  <ClockIcon className="w-3 h-3 shrink-0" />
                  {formatDate(s.createdAt)}
                </p>
              </div>
              <button
                onClick={() => setViewingId(s.id)}
                className="shrink-0 flex items-center gap-1 text-xs font-semibold text-[#6ba3c7] hover:text-[#5490b5] transition-colors"
              >
                View script
                <ChevronRightIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {viewingId && (
        <ScriptViewModal
          scriptId={viewingId}
          onClose={() => setViewingId(null)}
        />
      )}
    </>
  );
}

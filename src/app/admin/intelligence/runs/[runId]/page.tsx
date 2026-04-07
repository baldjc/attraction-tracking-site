"use client";
import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";

interface IntelRun {
  id: string;
  inputChannelUrl: string;
  resolvedChannelId: string | null;
  status: string;
  startedAt: string;
  completedAt: string | null;
  failedReason: string | null;
  reportMarkdown: string | null;
  reportJson: any;
  client: { name: string; city: string } | null;
  createdBy: string;
}

const STATUS = {
  PENDING: { label: "Pending", cls: "bg-yellow-100 text-yellow-700" },
  RUNNING: { label: "Running…", cls: "bg-blue-100 text-blue-700 animate-pulse" },
  COMPLETED: { label: "Completed", cls: "bg-green-100 text-green-700" },
  FAILED: { label: "Failed", cls: "bg-red-100 text-red-700" },
};

export default function RunReportPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  const [run, setRun] = useState<IntelRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [swipedIds, setSwipedIds] = useState<Set<string>>(new Set());
  const [savingSwipe, setSavingSwipe] = useState<string | null>(null);
  const [tab, setTab] = useState<"report" | "outliers">("report");

  const load = useCallback(async () => {
    const res = await fetch(`/api/intelligence/runs/${runId}`);
    if (res.ok) setRun(await res.json());
    setLoading(false);
  }, [runId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!run || run.status === "COMPLETED" || run.status === "FAILED") return;
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [run, load]);

  async function saveOutlierToSwipe(outlier: any) {
    setSavingSwipe(outlier.ytVideoId);
    await fetch("/api/intelligence/swipe-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoId: outlier.ytVideoId,
        title: outlier.title,
        thumbnailUrl: outlier.thumbnailUrl ?? null,
        notes: `${outlier.multiplier.toFixed(1)}× median — from channel intelligence run`,
        tags: [],
      }),
    });
    setSwipedIds((prev) => new Set([...prev, outlier.ytVideoId]));
    setSavingSwipe(null);
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse mb-6" />
        <div className="h-64 bg-white border border-[#2f3437]/10 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="max-w-4xl mx-auto">
        <Link href="/admin/intelligence/runs" className="text-sm text-[#2f3437]/50 hover:text-[#2f3437]">← Runs</Link>
        <p className="mt-6 text-[#2f3437]/50">Run not found.</p>
      </div>
    );
  }

  const { label, cls } = STATUS[run.status as keyof typeof STATUS] ?? { label: run.status, cls: "bg-gray-100 text-gray-600" };
  const reportJson = run.reportJson as any;
  const outliers: any[] = reportJson?.outliers ?? [];
  const analyses: any[] = reportJson?.analyses ?? [];

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Link href="/admin/intelligence/runs" className="text-sm text-[#2f3437]/50 hover:text-[#2f3437]">← All Runs</Link>
          <h1 className="text-xl font-bold text-[#2f3437] mt-1 break-all">{run.inputChannelUrl}</h1>
          {run.client && (
            <p className="text-sm text-[#2f3437]/60 mt-0.5">{run.client.name} · {run.client.city}</p>
          )}
          <p className="text-xs text-[#2f3437]/30 mt-0.5">
            Started {new Date(run.startedAt).toLocaleString("en-CA")}
            {run.completedAt && ` · Completed ${new Date(run.completedAt).toLocaleString("en-CA")}`}
          </p>
        </div>
        <span className={`px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 ${cls}`}>{label}</span>
      </div>

      {run.status === "RUNNING" || run.status === "PENDING" ? (
        <div className="bg-white border border-[#2f3437]/10 rounded-xl p-10 text-center">
          <div className="w-12 h-12 rounded-full border-4 border-[#6ba3c7] border-t-transparent animate-spin mx-auto mb-4" />
          <p className="font-semibold text-[#2f3437]">
            {run.status === "RUNNING" ? "Analysis in progress…" : "Run queued — starting soon"}
          </p>
          <p className="text-sm text-[#2f3437]/50 mt-1">
            This page auto-refreshes. Syncing videos, detecting outliers, and analysing with Claude.
          </p>
        </div>
      ) : run.status === "FAILED" ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <p className="font-semibold text-red-700 mb-1">Run failed</p>
          <p className="text-sm text-red-600 font-mono">{run.failedReason ?? "Unknown error"}</p>
          <p className="text-xs text-red-400 mt-2">Check YOUTUBE_API_KEY is set and the channel handle/URL is valid.</p>
        </div>
      ) : (
        <>
          {reportJson && (
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-white border border-[#2f3437]/10 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-[#2f3437]">{reportJson.videoCount ?? "—"}</p>
                <p className="text-xs text-[#2f3437]/50 mt-0.5">Videos Analysed</p>
              </div>
              <div className="bg-white border border-[#2f3437]/10 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{reportJson.outlierCount ?? outliers.length}</p>
                <p className="text-xs text-[#2f3437]/50 mt-0.5">Outliers Found</p>
              </div>
              <div className="bg-white border border-[#2f3437]/10 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-[#6ba3c7]">{analyses.length}</p>
                <p className="text-xs text-[#2f3437]/50 mt-0.5">Deep Analyses</p>
              </div>
            </div>
          )}

          <div className="flex gap-2 mb-4">
            <button onClick={() => setTab("report")} className={`px-4 py-2 text-sm font-semibold rounded-lg border transition-colors ${tab === "report" ? "bg-[#2f3437] text-white border-[#2f3437]" : "bg-white text-[#2f3437]/60 border-[#2f3437]/15 hover:border-[#2f3437]/30"}`}>
              📄 Full Report
            </button>
            {outliers.length > 0 && (
              <button onClick={() => setTab("outliers")} className={`px-4 py-2 text-sm font-semibold rounded-lg border transition-colors ${tab === "outliers" ? "bg-[#2f3437] text-white border-[#2f3437]" : "bg-white text-[#2f3437]/60 border-[#2f3437]/15 hover:border-[#2f3437]/30"}`}>
                🚀 Outliers ({outliers.length})
              </button>
            )}
          </div>

          {tab === "report" && run.reportMarkdown && (
            <div className="bg-white border border-[#2f3437]/10 rounded-xl p-6">
              <pre className="whitespace-pre-wrap text-sm text-[#2f3437] font-sans leading-relaxed">{run.reportMarkdown}</pre>
            </div>
          )}

          {tab === "outliers" && outliers.length > 0 && (
            <div className="bg-white border border-[#2f3437]/10 rounded-xl divide-y divide-[#2f3437]/6">
              {outliers.map((ov: any) => {
                const analysis = analyses.find((a: any) => a.video?.ytVideoId === ov.ytVideoId);
                const isSwiped = swipedIds.has(ov.ytVideoId);
                return (
                  <div key={ov.ytVideoId} className="p-4">
                    <div className="flex items-start gap-4">
                      {ov.thumbnailUrl && (
                        <img src={ov.thumbnailUrl} alt={ov.title} className="w-28 h-16 object-cover rounded-md shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <a href={`https://youtube.com/watch?v=${ov.ytVideoId}`} target="_blank" rel="noreferrer"
                          className="text-sm font-semibold text-[#2f3437] hover:text-[#6ba3c7] line-clamp-2">
                          {ov.title}
                        </a>
                        <p className="text-xs text-[#2f3437]/50 mt-1">
                          {ov.views?.toLocaleString()} views
                          <span className="ml-2 text-green-600 font-semibold">{ov.multiplier?.toFixed(1)}× median</span>
                        </p>
                        {analysis && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {analysis.analysis?.hookType && <span className="px-2 py-0.5 bg-[#6ba3c7]/10 text-[#6ba3c7] text-xs rounded-full">{analysis.analysis.hookType}</span>}
                            {analysis.analysis?.titleFramework && <span className="px-2 py-0.5 bg-purple-50 text-purple-700 text-xs rounded-full">{analysis.analysis.titleFramework}</span>}
                            {analysis.analysis?.stressThemes?.map((t: string) => (
                              <span key={t} className="px-2 py-0.5 bg-amber-50 text-amber-700 text-xs rounded-full">{t}</span>
                            ))}
                          </div>
                        )}
                        {analysis?.analysis?.whyItWorked && (
                          <p className="text-xs text-[#2f3437]/50 mt-1.5 italic line-clamp-2">{analysis.analysis.whyItWorked}</p>
                        )}
                      </div>
                      <button
                        onClick={() => saveOutlierToSwipe(ov)}
                        disabled={savingSwipe === ov.ytVideoId || isSwiped}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg border shrink-0 transition-colors ${isSwiped ? "bg-green-50 text-green-700 border-green-200" : "bg-[#f7f6f3] text-[#2f3437]/60 border-[#2f3437]/10 hover:text-[#2f3437]"} disabled:opacity-50`}
                      >
                        {isSwiped ? "✓ Saved" : savingSwipe === ov.ytVideoId ? "…" : "💾 Save"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

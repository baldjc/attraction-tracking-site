"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

interface OutlierVideo {
  id: string;
  ytVideoId: string;
  title: string;
  thumbnailUrl: string | null;
  views: string;
  outlierMultiple: number | null;
  publishedAt: string;
  channel: { title: string; handle: string | null };
  analysis?: {
    hookType: string | null;
    titleFramework: string | null;
    whyItWorked: string | null;
    stressThemes: string[];
  } | null;
}

export default function OutlierFeedPage() {
  const [outliers, setOutliers] = useState<OutlierVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  async function load() {
    const res = await fetch("/api/intelligence/global/outliers");
    if (res.ok) setOutliers(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function saveToSwipeFile(video: OutlierVideo) {
    setSavingId(video.id);
    const res = await fetch("/api/intelligence/swipe-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoId: video.ytVideoId,
        title: video.title,
        thumbnailUrl: video.thumbnailUrl,
        tags: video.analysis?.stressThemes ?? [],
        theme: video.analysis?.stressThemes?.[0] ?? null,
        angle: video.analysis?.hookType ?? null,
      }),
    });
    if (res.ok) setSavedIds((prev) => new Set([...prev, video.id]));
    setSavingId(null);
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/admin/intelligence" className="text-sm text-[var(--abv-text)]/50 hover:text-[var(--abv-text)]">← Intelligence</Link>
          <h1 className="text-xl font-bold text-[var(--abv-text)] mt-1">Global Outlier Feed</h1>
          <p className="text-sm text-[var(--abv-text)]/60 mt-1">Top-performing videos (≥2.5× channel median) across all tracked channels</p>
        </div>
        <Link href="/admin/intelligence/global/swipe-file" className="px-4 py-2 bg-[var(--abv-bg)] text-[var(--abv-text)]/70 text-sm font-semibold rounded-lg border border-[var(--abv-text)]/10 hover:bg-[#eee] transition-colors">
          View Swipe File →
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-white border border-[var(--abv-text)]/10 rounded-xl animate-pulse" />)}
        </div>
      ) : outliers.length === 0 ? (
        <div className="bg-white border border-[var(--abv-text)]/10 rounded-xl p-10 text-center">
          <p className="text-3xl mb-3">🚀</p>
          <p className="font-semibold text-[var(--abv-text)]">No outliers yet</p>
          <p className="text-sm text-[var(--abv-text)]/50 mt-1">
            Outliers are identified after running channel intelligence on synced channels.
          </p>
          <Link href="/admin/intelligence/new-run" className="mt-4 inline-block px-4 py-2 bg-[var(--abv-dark)] text-white text-sm font-semibold rounded-lg hover:bg-black/85">
            Start a Run →
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-[var(--abv-text)]/10 rounded-xl divide-y divide-[var(--abv-text)]/6">
          {outliers.map((v) => {
            const isExpanded = expanded.has(v.id);
            const isSaved = savedIds.has(v.id);
            const isSaving = savingId === v.id;
            return (
              <div key={v.id} className="p-4 hover:bg-[var(--abv-bg)]/30 transition-colors">
                <div className="flex items-start gap-4">
                  {v.thumbnailUrl && (
                    <img src={v.thumbnailUrl} alt={v.title} className="w-28 h-16 object-cover rounded-md shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <a
                      href={`https://youtube.com/watch?v=${v.ytVideoId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-semibold text-[var(--abv-text)] hover:text-[var(--abv-azure)] line-clamp-2"
                    >
                      {v.title}
                    </a>
                    <p className="text-xs text-[var(--abv-text)]/50 mt-1">
                      {v.channel.handle ?? v.channel.title}
                      {" · "}
                      {parseInt(v.views).toLocaleString()} views
                      {v.outlierMultiple != null && (
                        <span className="ml-2 text-green-600 font-semibold">{v.outlierMultiple.toFixed(1)}× median</span>
                      )}
                    </p>
                    {v.analysis && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {v.analysis.hookType && <span className="px-2 py-0.5 bg-[var(--abv-dark)]/10 text-[var(--abv-azure)] text-xs rounded-full">{v.analysis.hookType}</span>}
                        {v.analysis.titleFramework && <span className="px-2 py-0.5 bg-purple-50 text-purple-700 text-xs rounded-full">{v.analysis.titleFramework}</span>}
                        {v.analysis.stressThemes?.map((t) => (
                          <span key={t} className="px-2 py-0.5 bg-amber-50 text-amber-700 text-xs rounded-full">{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      onClick={() => saveToSwipeFile(v)}
                      disabled={isSaving || isSaved}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${isSaved ? "bg-green-50 text-green-700 border-green-200" : "bg-[var(--abv-bg)] text-[var(--abv-text)]/60 border-[var(--abv-text)]/10 hover:text-[var(--abv-text)]"} disabled:opacity-50`}
                    >
                      {isSaved ? "✓ Saved" : isSaving ? "Saving…" : "💾 Save"}
                    </button>
                    {v.analysis && (
                      <button onClick={() => toggleExpand(v.id)} className="px-3 py-1.5 text-xs font-semibold bg-[var(--abv-bg)] text-[var(--abv-text)]/60 border border-[var(--abv-text)]/10 hover:text-[var(--abv-text)] rounded-lg">
                        {isExpanded ? "Less" : "Analysis"}
                      </button>
                    )}
                  </div>
                </div>
                {isExpanded && v.analysis?.whyItWorked && (
                  <div className="mt-3 ml-32 bg-[var(--abv-bg)] rounded-lg px-4 py-3 text-xs text-[var(--abv-text)]/70 leading-relaxed border border-[var(--abv-text)]/8">
                    <p className="font-semibold text-[var(--abv-text)] mb-1">Why it worked:</p>
                    <p>{v.analysis.whyItWorked}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

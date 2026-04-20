"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ClipboardDocumentIcon, CheckIcon } from "@heroicons/react/24/outline";

interface Winner {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  url: string;
  avgWatchTimeMinutes: number;
  avgViewPercentage: number;
  isBridgeCandidate: boolean;
}

function formatMinutes(min: number): string {
  const total = Math.round(min * 60);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function SuggestedWinners({ channelRef }: { channelRef: string }) {
  const [videos, setVideos] = useState<Winner[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(
      `/api/admin/reviewer/channels/${encodeURIComponent(channelRef)}/suggested-winners`,
    )
      .then((r) => (r.ok ? r.json() : { videos: [] }))
      .then((d) => {
        if (alive) setVideos(d.videos ?? []);
      })
      .catch(() => alive && setVideos([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [channelRef]);

  async function copyUrl(v: Winner) {
    try {
      await navigator.clipboard.writeText(v.url);
      setCopied(v.videoId);
      setTimeout(() => setCopied((c) => (c === v.videoId ? null : c)), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <section
      className="rounded-xl border border-[#eaeaea] bg-white p-6 dark:border-[#2a2a2a] dark:bg-[#1a1a1a]"
      style={{
        borderRadius: "var(--atbv-radius-lg)",
        boxShadow: "var(--atbv-shadow-sm)",
      }}
    >
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#2f3437] dark:text-white">
          Suggested Winners
        </h2>
        <p className="eyebrow text-[#787774]">Watch-time magnets · trailing 90d</p>
      </div>
      <p className="mb-5 text-sm text-[#787774]">
        These are your watch-time magnets. When you end-card a Drama video,
        point to one of these — high AVD signals to YouTube that the Drama is a
        valuable traffic source.
      </p>

      {loading ? (
        <p className="text-sm text-[#787774]">Loading…</p>
      ) : videos.length === 0 ? (
        <p className="text-sm text-[#787774]">
          No analytics yet. Run a sync to populate this list.
        </p>
      ) : (
        <ul className="divide-y divide-[#eaeaea] dark:divide-[#2a2a2a]">
          {videos.map((v) => (
            <li key={v.videoId} className="flex items-center gap-4 py-3">
              <div className="relative h-[54px] w-24 shrink-0 overflow-hidden rounded-md bg-[#f3f3f3]">
                {v.thumbnailUrl ? (
                  <Image
                    src={v.thumbnailUrl}
                    alt=""
                    fill
                    sizes="96px"
                    className="object-cover"
                    unoptimized
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[#2f3437] dark:text-white">
                  {v.title}
                </p>
                <p className="mt-0.5 text-xs text-[#787774]">
                  {formatMinutes(v.avgWatchTimeMinutes)} avg watch ·{" "}
                  {v.avgViewPercentage.toFixed(1)}% AVD
                </p>
              </div>
              {v.isBridgeCandidate && (
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--atbv-success) 12%, transparent)",
                    color: "var(--atbv-success)",
                  }}
                >
                  Bridge Candidate
                </span>
              )}
              <button
                onClick={() => copyUrl(v)}
                title="Copy URL"
                className="shrink-0 rounded-md border border-[#eaeaea] px-2 py-1.5 text-xs text-[#2f3437] transition-colors hover:bg-[#f7f6f3] dark:border-[#2a2a2a] dark:text-white dark:hover:bg-[#222]"
              >
                {copied === v.videoId ? (
                  <span className="flex items-center gap-1">
                    <CheckIcon className="h-3.5 w-3.5" /> Copied
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <ClipboardDocumentIcon className="h-3.5 w-3.5" /> Copy URL
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import DramaMagnet from "@/components/icons/DramaMagnet";

type Verdict =
  | "overperforming"
  | "on-pace"
  | "underperforming"
  | "insufficient-data";

interface Pulse {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: string;
  hoursSincePublish: number;
  views: number;
  impressions: number;
  ctr: number;
  performanceRatio: number;
  verdict: Verdict;
  dramaMode: boolean;
}

const VERDICT_STYLE: Record<Verdict, { bg: string; fg: string; label: string }> = {
  overperforming: { bg: "#10b981", fg: "#ffffff", label: "Overperforming" },
  "on-pace": { bg: "#787774", fg: "#ffffff", label: "On pace" },
  underperforming: { bg: "#e63946", fg: "#ffffff", label: "Underperforming" },
  "insufficient-data": {
    bg: "#eaeaea",
    fg: "#2f3437",
    label: "Insufficient data",
  },
};

function VerdictPill({ verdict }: { verdict: Verdict }) {
  const s = VERDICT_STYLE[verdict];
  const tooltip =
    verdict === "insufficient-data"
      ? "Need 3+ prior videos for baseline"
      : undefined;
  return (
    <span
      title={tooltip}
      className="inline-block rounded-md px-2 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: s.bg,
        color: s.fg,
        borderRadius: "var(--atbv-radius-sm)",
      }}
    >
      {s.label}
    </span>
  );
}

export default function FortyEightHourPulse({
  channelRef,
}: {
  channelRef: string;
}) {
  const [pulses, setPulses] = useState<Pulse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPulses(null);
    setError(null);
    fetch(
      `/api/admin/reviewer/channels/${encodeURIComponent(channelRef)}/pulse`,
    )
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      })
      .then((j: { active: Pulse[] }) => {
        if (!cancelled) setPulses(j.active);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [channelRef]);

  if (error)
    return (
      <div className="rounded-xl border border-[#e63946]/30 bg-[#e63946]/5 p-4 text-sm text-[#2f3437]">
        Could not load 48-Hour Pulse: {error}
      </div>
    );
  if (!pulses)
    return (
      <div className="h-40 animate-pulse rounded-xl border border-[#eaeaea] bg-white" />
    );

  return (
    <div
      className="rounded-xl border border-[#eaeaea] bg-white p-5"
      style={{
        borderRadius: "var(--atbv-radius-lg)",
        boxShadow: "var(--atbv-shadow-sm)",
      }}
    >
      <h2 className="mb-3 text-base font-semibold text-[#2f3437]">
        48-Hour Pulse
      </h2>

      {pulses.length === 0 ? (
        <p className="text-sm text-[#787774]">
          No videos in the 48-hour window. Next video → check back within 2
          days of publish.
        </p>
      ) : (
        <ul className="space-y-3">
          {pulses.map((p) => (
            <li
              key={p.videoId}
              className="flex gap-3 rounded-md border border-[#eaeaea] bg-[#f7f6f3] p-3"
              style={{ borderRadius: "var(--atbv-radius-md)" }}
            >
              {p.thumbnailUrl ? (
                <div className="relative h-16 w-28 flex-shrink-0 overflow-hidden rounded-sm bg-[#eaeaea]">
                  <Image
                    src={p.thumbnailUrl}
                    alt=""
                    fill
                    sizes="112px"
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="h-16 w-28 flex-shrink-0 rounded-sm bg-[#eaeaea]" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-2 text-sm font-medium text-[#2f3437]">
                    {p.title}
                  </h3>
                  {p.dramaMode && (
                    <DramaMagnet
                      size={16}
                      className="flex-shrink-0 text-[#8b5cf6]"
                    />
                  )}
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-[#787774]">
                  <span>{p.hoursSincePublish}h ago</span>
                  <span className="font-data tabular-nums">
                    {p.views.toLocaleString("en-CA")} views
                  </span>
                  <span className="font-data tabular-nums">
                    {p.impressions.toLocaleString("en-CA")} impr
                  </span>
                  <span className="font-data tabular-nums">
                    {(p.ctr * 100).toFixed(1)}% CTR
                  </span>
                </div>
                <div className="mt-2">
                  <VerdictPill verdict={p.verdict} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

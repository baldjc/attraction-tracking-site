"use client";

import { useEffect, useState } from "react";
import {
  ExclamationTriangleIcon,
  CheckCircleIcon,
  MinusCircleIcon,
} from "@heroicons/react/24/outline";
import { DonutChart } from "@/components/charts/DonutChart";

interface BalanceData {
  month: string;
  counts: {
    marketUpdates: number;
    drama: number;
    directStress: number;
    other: number;
  };
  target: { marketUpdates: number; drama: number; directStress: number };
  gaps: string[];
  themeBreakdown: Record<string, number>;
  pastMidMonth: boolean;
  total: number;
}

const SLICE_COLORS = ["#f59e0b", "#8b5cf6", "#6ba3c7", "#787774"];

function targetState(
  count: number,
  target: number,
  pastMid: boolean,
): "met" | "warn" | "miss" {
  if (count >= target) return "met";
  if (count === 0 && pastMid) return "miss";
  return "warn";
}

function StatusIcon({ state }: { state: "met" | "warn" | "miss" }) {
  if (state === "met")
    return (
      <CheckCircleIcon className="h-4 w-4" style={{ color: "var(--atbv-success)" }} />
    );
  if (state === "miss")
    return (
      <ExclamationTriangleIcon className="h-4 w-4" style={{ color: "var(--atbv-danger)" }} />
    );
  return (
    <MinusCircleIcon className="h-4 w-4" style={{ color: "var(--atbv-warning)" }} />
  );
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-CA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function PortfolioBalance({
  channelRef,
}: {
  channelRef: string;
}) {
  const [data, setData] = useState<BalanceData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    fetch(
      `/api/admin/reviewer/channels/${encodeURIComponent(channelRef)}/portfolio-balance`,
    )
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      })
      .then((j: BalanceData) => {
        if (!cancelled) setData(j);
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
        Could not load Portfolio Balance: {error}
      </div>
    );
  if (!data)
    return (
      <div className="h-64 animate-pulse rounded-xl border border-[#eaeaea] bg-white" />
    );

  const slices = [
    { name: "Market Update", value: data.counts.marketUpdates },
    { name: "Drama", value: data.counts.drama },
    { name: "Direct", value: data.counts.directStress },
    { name: "Other", value: data.counts.other },
  ];

  const targets: Array<{
    label: string;
    count: number;
    target: number;
  }> = [
    {
      label: "Market Update",
      count: data.counts.marketUpdates,
      target: data.target.marketUpdates,
    },
    {
      label: "Drama",
      count: data.counts.drama,
      target: data.target.drama,
    },
    {
      label: "Direct",
      count: data.counts.directStress,
      target: data.target.directStress,
    },
  ];

  return (
    <div
      className="rounded-xl border border-[#eaeaea] bg-white p-5"
      style={{
        borderRadius: "var(--atbv-radius-lg)",
        boxShadow: "var(--atbv-shadow-sm)",
      }}
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-[#2f3437]">
          Portfolio Balance
        </h2>
        <span className="text-xs text-[#787774]">
          {monthLabel(data.month)} · {data.total} planned
        </span>
      </div>

      <DonutChart data={slices} colors={SLICE_COLORS} />

      <div className="mt-4 grid grid-cols-3 gap-2">
        {targets.map((t) => {
          const state = targetState(t.count, t.target, data.pastMidMonth);
          return (
            <div
              key={t.label}
              className="rounded-md border border-[#eaeaea] bg-[#f7f6f3] px-3 py-2"
              style={{ borderRadius: "var(--atbv-radius-md)" }}
            >
              <div className="flex items-center gap-1.5">
                <StatusIcon state={state} />
                <span className="text-xs font-medium text-[#787774]">
                  {t.label}
                </span>
              </div>
              <div className="mt-1 font-data text-lg text-[#2f3437] tabular-nums">
                {t.count}
                <span className="text-sm text-[#787774]">/{t.target}</span>
              </div>
            </div>
          );
        })}
      </div>

      {data.gaps.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-[#eaeaea] pt-3">
          {data.gaps.map((g, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-xs text-[#2f3437]"
            >
              <ExclamationTriangleIcon
                className="mt-0.5 h-3.5 w-3.5 flex-shrink-0"
                style={{ color: "var(--atbv-warning)" }}
              />
              <span>{g}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

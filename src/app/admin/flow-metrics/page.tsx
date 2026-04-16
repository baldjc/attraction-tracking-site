"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

interface MemberFunnelRow {
  userId: string;
  name: string;
  email: string;
  planCount: number;
  scriptedCount: number;
  publishedCount: number;
  repurposedCount: number;
}

interface WeeklyPoint {
  weekStart: string;
  plansCreated: number;
  plansPublished: number;
  repurposesGenerated: number;
}

interface FlowMetrics {
  startDate: string;
  endDate: string;
  scriptingVelocityHours: number | null;
  productionVelocityHours: number | null;
  plansByStatus: Array<{ status: string; count: number }>;
  reviewStickinessPct: number;
  repurposeCompletionPct: number;
  campaignAttachmentPct: number;
  totalPlans: number;
  memberFunnel: MemberFunnelRow[];
  weekly: WeeklyPoint[];
  generatedAt: string;
}

type SortKey = keyof Pick<MemberFunnelRow, "planCount" | "scriptedCount" | "publishedCount" | "repurposedCount">;

function formatHours(h: number | null): string {
  if (h === null) return "—";
  if (h < 24) return `${h.toFixed(1)}h`;
  const days = h / 24;
  return `${days.toFixed(1)}d`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoISO(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function csvEscape(value: string | number): string {
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export default function FlowMetricsPage() {
  const [startDate, setStartDate] = useState(daysAgoISO(30));
  const [endDate, setEndDate] = useState(todayISO());
  const [data, setData] = useState<FlowMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("planCount");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/admin/flow-metrics?startDate=${startDate}&endDate=${endDate}`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      setData(await res.json());
    } catch (err: any) {
      setError(err?.message || "Failed to load metrics");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    load();
  }, [load]);

  const sortedFunnel = useMemo(() => {
    if (!data) return [];
    const rows = [...data.memberFunnel];
    rows.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return rows;
  }, [data, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function downloadCsv() {
    if (!data) return;
    const header = ["Name", "Email", "Plans", "Scripted", "Published", "Repurposes"];
    const rows = sortedFunnel.map((r) => [
      r.name,
      r.email,
      r.planCount,
      r.scriptedCount,
      r.publishedCount,
      r.repurposedCount,
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flow-metrics_${startDate}_to_${endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-[#2f3437] dark:text-[#e2e8f0]">Content Flow Metrics</h1>
          <p className="text-sm text-[#2f3437]/50 dark:text-white/40 mt-0.5">
            Production, Growth & DWY tiers · cached 15 min
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="text-xs text-[#2f3437]/60 dark:text-white/50">
            <span className="block mb-1">Start</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2 py-1.5 rounded border border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#1a1a1a] text-sm"
            />
          </label>
          <label className="text-xs text-[#2f3437]/60 dark:text-white/50">
            <span className="block mb-1">End</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2 py-1.5 rounded border border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#1a1a1a] text-sm"
            />
          </label>
          <button
            onClick={downloadCsv}
            disabled={!data}
            className="px-3 py-1.5 rounded bg-[#6ba3c7] text-white text-sm font-medium hover:bg-[#5a92b6] disabled:opacity-50"
          >
            Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl p-4 text-sm">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-gray-100 dark:bg-white/5 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Kpi label="Scripting velocity" value={formatHours(data.scriptingVelocityHours)} subtitle="Median: created → first script" />
            <Kpi label="Production velocity" value={formatHours(data.productionVelocityHours)} subtitle="Median: scripted → published" />
            <Kpi label="Review stickiness" value={`${data.reviewStickinessPct}%`} subtitle={`${data.totalPlans} plans in range`} />
            <Kpi label="Repurpose completion" value={`${data.repurposeCompletionPct}%`} subtitle={`Campaigns linked: ${data.campaignAttachmentPct}%`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-gray-200 dark:border-[#2a2a2a] p-4">
              <h2 className="text-sm font-semibold text-[#2f3437] dark:text-[#e2e8f0] mb-3">Plans by status</h2>
              {data.plansByStatus.length === 0 ? (
                <p className="text-sm text-[#2f3437]/40 dark:text-white/30">No plans in range</p>
              ) : (
                <div style={{ width: "100%", height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart data={data.plansByStatus} margin={{ top: 10, right: 10, left: 0, bottom: 40 }}>
                      <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                      <XAxis dataKey="status" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#6ba3c7" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-gray-200 dark:border-[#2a2a2a] p-4">
              <h2 className="text-sm font-semibold text-[#2f3437] dark:text-[#e2e8f0] mb-3">Weekly activity</h2>
              {data.weekly.length === 0 ? (
                <p className="text-sm text-[#2f3437]/40 dark:text-white/30">No activity in range</p>
              ) : (
                <div style={{ width: "100%", height: 260 }}>
                  <ResponsiveContainer>
                    <LineChart data={data.weekly} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                      <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                      <XAxis dataKey="weekStart" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="plansCreated" stroke="#6ba3c7" strokeWidth={2} dot={false} name="Created" />
                      <Line type="monotone" dataKey="plansPublished" stroke="#10B981" strokeWidth={2} dot={false} name="Published" />
                      <Line type="monotone" dataKey="repurposesGenerated" stroke="#f59e0b" strokeWidth={2} dot={false} name="Repurposes" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-gray-200 dark:border-[#2a2a2a] overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-[#2a2a2a]">
              <h2 className="text-sm font-semibold text-[#2f3437] dark:text-[#e2e8f0]">Top members (per-funnel)</h2>
            </div>
            {sortedFunnel.length === 0 ? (
              <p className="px-4 py-6 text-sm text-[#2f3437]/40 dark:text-white/30">No member activity in range</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-[#0f0f0f] text-xs uppercase tracking-wider text-[#2f3437]/50 dark:text-white/40">
                    <tr>
                      <th className="text-left px-4 py-2">Member</th>
                      <SortHeader label="Plans"     active={sortKey === "planCount"}      dir={sortDir} onClick={() => toggleSort("planCount")} />
                      <SortHeader label="Scripted"  active={sortKey === "scriptedCount"}  dir={sortDir} onClick={() => toggleSort("scriptedCount")} />
                      <SortHeader label="Published" active={sortKey === "publishedCount"} dir={sortDir} onClick={() => toggleSort("publishedCount")} />
                      <SortHeader label="Repurposes" active={sortKey === "repurposedCount"} dir={sortDir} onClick={() => toggleSort("repurposedCount")} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-[#2a2a2a]">
                    {sortedFunnel.map((row) => (
                      <tr key={row.userId} className="hover:bg-gray-50 dark:hover:bg-white/5">
                        <td className="px-4 py-2">
                          <div className="font-medium text-[#2f3437] dark:text-[#e2e8f0]">{row.name}</div>
                          <div className="text-xs text-[#2f3437]/40 dark:text-white/30">{row.email}</div>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{row.planCount}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{row.scriptedCount}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{row.publishedCount}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{row.repurposedCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="text-[10px] text-[#2f3437]/30 dark:text-white/20">
            Generated {new Date(data.generatedAt).toLocaleString("en-CA")}. Foundations members excluded.
          </p>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  return (
    <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-gray-200 dark:border-[#2a2a2a] p-4">
      <p className="text-xs text-[#2f3437]/50 dark:text-white/40 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold text-[#6ba3c7] mt-1">{value}</p>
      {subtitle && <p className="text-[10px] text-[#2f3437]/30 dark:text-white/20 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <th className="text-right px-4 py-2">
      <button onClick={onClick} className="inline-flex items-center gap-1 hover:text-[#6ba3c7]">
        {label}
        {active && <span>{dir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}

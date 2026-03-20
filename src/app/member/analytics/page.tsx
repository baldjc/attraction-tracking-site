"use client";

import React, { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { MiniSparkline } from "@/components/charts/MiniSparkline";
import { ArrowTrendingUpIcon, ArrowTrendingDownIcon, ArrowUpIcon, ArrowDownIcon } from "@heroicons/react/24/outline";

// ── Types ──────────────────────────────────────────────────────────────────
interface OverviewData {
  totalViews: number; totalClicks: number; totalLeads: number; convRate: number;
  clicksDelta: number; leadsDelta: number; convRateDelta: number;
  sparkline: { date: string; clicks: number }[];
  leadsSparkline: { date: string; leads: number }[];
}
interface LeadMagnet {
  id: string; name: string; destinationUrl: string; sourceType: string;
  totalViews: number; totalClicks: number; totalLeads: number; conversionRate: number;
  bestVideo: { name: string; leads: number; thumbnail: string | null } | null;
}
interface VideoRow {
  id: string; name: string; youtubeVideoUrl: string | null;
  youtubeThumbnailUrl: string | null; youtubeViewCount: number;
  campaignId: string; campaignName: string;
  totalClicks: number; totalLeads: number; conversionRate: number; clickThroughRate: number;
}
interface TimeseriesPoint { date: string; clicks: number; leads: number; }
interface FunnelData { views: number; clicks: number; leads: number; viewToClickRate: number; clickToLeadRate: number; }
interface GeoRow { city: string | null; province: string | null; country: string | null; countryCode: string | null; flag: string; leads: number; }

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtDate(d: string) { const [, m, day] = d.split("-"); return `${parseInt(m)}/${parseInt(day)}`; }
function fmtNum(n: number) { return n.toLocaleString(); }
function convColor(rate: number) {
  if (rate >= 5) return "text-green-600 bg-green-50";
  if (rate >= 2) return "text-amber-600 bg-amber-50";
  return "text-red-600 bg-red-50";
}
function DeltaBadge({ d, suffix = "%" }: { d: number; suffix?: string }) {
  if (d === 0) return null;
  const pos = d > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${pos ? "text-green-600" : "text-red-500"}`}>
      {pos ? <ArrowTrendingUpIcon className="w-3.5 h-3.5" /> : <ArrowTrendingDownIcon className="w-3.5 h-3.5" />}
      {pos ? "+" : ""}{d}{suffix}
    </span>
  );
}

// ── Sortable table helpers ─────────────────────────────────────────────────
type SortDir = "asc" | "desc";
function useSortTable<T>(rows: T[], defaultKey: keyof T) {
  const [key, setKey] = useState<keyof T>(defaultKey);
  const [dir, setDir] = useState<SortDir>("desc");
  function toggle(k: keyof T) {
    if (k === key) setDir((d) => d === "asc" ? "desc" : "asc");
    else { setKey(k); setDir("desc"); }
  }
  const sorted = [...rows].sort((a, b) => {
    const av = a[key]; const bv = b[key];
    if (typeof av === "number" && typeof bv === "number") return dir === "asc" ? av - bv : bv - av;
    return dir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });
  function SortIcon({ col }: { col: keyof T }) {
    if (col !== key) return <span className="text-[#1e2a38]/20 ml-1">↕</span>;
    return dir === "asc" ? <ArrowUpIcon className="w-3 h-3 inline ml-1" /> : <ArrowDownIcon className="w-3 h-3 inline ml-1" />;
  }
  return { sorted, toggle, SortIcon, sortKey: key };
}

// ── Campaign colour mapping ────────────────────────────────────────────────
const CAMPAIGN_COLOURS = ["#3dc3ff", "#ff0033", "#22c55e", "#f59e0b", "#a855f7", "#0ea5e9", "#ec4899"];
function useCampaignColours(ids: string[]) {
  const map = new Map<string, string>();
  ids.forEach((id, i) => map.set(id, CAMPAIGN_COLOURS[i % CAMPAIGN_COLOURS.length]));
  return map;
}

// ── Main page (inner, reads searchParams) ──────────────────────────────────
function AnalyticsPageInner() {
  const searchParams = useSearchParams();
  const initialSection = searchParams.get("section") ?? "";

  const [period, setPeriod] = useState("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [campaignId, setCampaignId] = useState("all");
  const [sourceType, setSourceType] = useState("all");
  const [granularity, setGranularity] = useState<"daily" | "weekly">("daily");
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [leadMagnets, setLeadMagnets] = useState<LeadMagnet[]>([]);
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([]);
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [geo, setGeo] = useState<GeoRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Section refs for deep-linking from cards
  const sectionRefs: Record<string, React.RefObject<HTMLDivElement | null>> = {
    timeseries: useRef<HTMLDivElement>(null),
    "lead-magnets": useRef<HTMLDivElement>(null),
    videos: useRef<HTMLDivElement>(null),
    geo: useRef<HTMLDivElement>(null),
  };

  // Fetch campaigns list once
  useEffect(() => {
    fetch("/api/campaigns").then((r) => r.ok ? r.json() : []).then(setCampaigns).catch(() => {});
  }, []);

  // Scroll to section on load
  useEffect(() => {
    if (initialSection && sectionRefs[initialSection]?.current) {
      setTimeout(() => sectionRefs[initialSection].current?.scrollIntoView({ behavior: "smooth", block: "start" }), 400);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSection, loading]);

  const buildQS = useCallback(() => {
    const p = new URLSearchParams({ period, campaignId, sourceType });
    if (period === "custom" && customFrom && customTo) { p.set("from", customFrom); p.set("to", customTo); }
    return p.toString();
  }, [period, campaignId, sourceType, customFrom, customTo]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const qs = buildQS();
    const tsQs = new URLSearchParams(qs); tsQs.set("granularity", granularity);
    try {
      const [ov, lm, vids, ts, fn, g] = await Promise.all([
        fetch(`/api/analytics/overview?${qs}`).then((r) => r.json()),
        fetch(`/api/analytics/lead-magnets?${qs}`).then((r) => r.json()),
        fetch(`/api/analytics/videos?${qs}`).then((r) => r.json()),
        fetch(`/api/analytics/timeseries?${tsQs}`).then((r) => r.json()),
        fetch(`/api/analytics/funnel?${qs}`).then((r) => r.json()),
        fetch(`/api/analytics/geo?${qs}`).then((r) => r.json()),
      ]);
      setOverview(ov);
      setLeadMagnets(Array.isArray(lm) ? lm : []);
      setVideos(Array.isArray(vids) ? vids : []);
      setTimeseries(Array.isArray(ts?.daily) ? ts.daily : []);
      setFunnel(fn);
      setGeo(Array.isArray(g) ? g : []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [buildQS, granularity]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const lmSort = useSortTable<LeadMagnet>(leadMagnets, "totalLeads");
  const vidSort = useSortTable<VideoRow>(videos, "totalLeads");
  const geoSort = useSortTable<GeoRow>(geo, "leads");

  const campaignIds = [...new Set(videos.map((v) => v.campaignId))];
  const campColours = useCampaignColours(campaignIds);

  const topVideos = [...videos].sort((a, b) => b.totalLeads - a.totalLeads).slice(0, 10);

  const showFunnel = !!funnel && (funnel.views > 0 || funnel.clicks > 0 || funnel.leads > 0);
  const funnelMax = showFunnel ? Math.max(funnel!.views, funnel!.clicks, funnel!.leads, 1) : 1;

  const periodLabel = period === "7d" ? "7 days" : period === "90d" ? "90 days" : period === "custom" ? "custom range" : "30 days";

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-bold text-[#1e2a38]">Analytics</h1>
        <p className="text-sm text-[#1e2a38]/50 mt-0.5">Performance across all your campaigns and videos</p>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#1e2a38]/10 rounded-2xl px-5 py-4 flex flex-wrap items-center gap-3 sticky top-0 z-10">
        {/* Period presets */}
        <div className="flex gap-1 bg-[#f1f1ef] rounded-xl p-1">
          {["7d", "30d", "90d"].map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${period === p ? "bg-white shadow-sm text-[#1e2a38]" : "text-[#1e2a38]/50 hover:text-[#1e2a38]"}`}>
              {p === "7d" ? "7d" : p === "30d" ? "30d" : "90d"}
            </button>
          ))}
          <button onClick={() => setPeriod("custom")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${period === "custom" ? "bg-white shadow-sm text-[#1e2a38]" : "text-[#1e2a38]/50 hover:text-[#1e2a38]"}`}>
            Custom
          </button>
        </div>

        {period === "custom" && (
          <div className="flex items-center gap-2">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
              className="text-xs border border-[#1e2a38]/20 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#3dc3ff]" />
            <span className="text-[#1e2a38]/30 text-xs">to</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
              className="text-xs border border-[#1e2a38]/20 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#3dc3ff]" />
          </div>
        )}

        <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}
          className="text-xs border border-[#1e2a38]/20 rounded-xl px-3 py-2 bg-white text-[#1e2a38] focus:outline-none focus:border-[#3dc3ff]">
          <option value="all">All Campaigns</option>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <select value={sourceType} onChange={(e) => setSourceType(e.target.value)}
          className="text-xs border border-[#1e2a38]/20 rounded-xl px-3 py-2 bg-white text-[#1e2a38] focus:outline-none focus:border-[#3dc3ff]">
          <option value="all">All Sources</option>
          <option value="YOUTUBE">YouTube</option>
          <option value="GOOGLE_ADS">Google Ads</option>
          <option value="EMAIL">Email</option>
          <option value="OTHER">Other</option>
        </select>

        {loading && <span className="text-xs text-[#1e2a38]/30 animate-pulse ml-auto">Loading…</span>}
      </div>

      {/* ── Overview cards ───────────────────────────────────────────────── */}
      {overview && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* YouTube Views */}
          <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-4">
            <p className="text-xs text-[#1e2a38]/50 font-medium mb-1">YouTube Views</p>
            <p className="text-2xl font-bold text-[#1e2a38]">{fmtNum(overview.totalViews)}</p>
            <p className="text-xs text-[#1e2a38]/30 mt-1">Total across all links</p>
          </div>
          {/* Clicks */}
          <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-4">
            <p className="text-xs text-[#1e2a38]/50 font-medium mb-1">Clicks ({periodLabel})</p>
            <p className="text-2xl font-bold text-[#1e2a38]">{fmtNum(overview.totalClicks)}</p>
            <div className="flex items-center justify-between mt-1">
              <DeltaBadge d={overview.clicksDelta} />
            </div>
            <div className="mt-2"><MiniSparkline data={overview.sparkline.map((s) => ({ value: s.clicks }))} color="#3dc3ff" /></div>
          </div>
          {/* Leads */}
          <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-4">
            <p className="text-xs text-[#1e2a38]/50 font-medium mb-1">Leads ({periodLabel})</p>
            <p className="text-2xl font-bold text-[#1e2a38]">{fmtNum(overview.totalLeads)}</p>
            <div className="flex items-center justify-between mt-1">
              <DeltaBadge d={overview.leadsDelta} />
            </div>
            <div className="mt-2"><MiniSparkline data={overview.leadsSparkline.map((s) => ({ value: s.leads }))} color="#1e2a38" /></div>
          </div>
          {/* Conv Rate */}
          <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-4">
            <p className="text-xs text-[#1e2a38]/50 font-medium mb-1">Conv. Rate ({periodLabel})</p>
            <p className="text-2xl font-bold text-[#3dc3ff]">{overview.convRate}%</p>
            <div className="flex items-center gap-1 mt-1">
              <DeltaBadge d={overview.convRateDelta} suffix="pp" />
            </div>
          </div>
        </div>
      )}

      {/* ── Clicks & Leads Over Time ─────────────────────────────────────── */}
      <div ref={sectionRefs.timeseries} className="bg-white border border-[#1e2a38]/10 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-[#1e2a38]">Clicks &amp; Leads Over Time</h2>
          <div className="flex gap-1 bg-[#f1f1ef] rounded-xl p-1">
            {(["daily", "weekly"] as const).map((g) => (
              <button key={g} onClick={() => setGranularity(g)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${granularity === g ? "bg-white shadow-sm text-[#1e2a38]" : "text-[#1e2a38]/40 hover:text-[#1e2a38]"}`}>
                {g === "daily" ? "Daily" : "Weekly"}
              </button>
            ))}
          </div>
        </div>
        {timeseries.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-[#1e2a38]/20 text-sm">No data for this period</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={timeseries} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3808" vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 10, fill: "#1e2a3860" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: "#1e2a3860" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid #1e2a3815", borderRadius: 10, fontSize: 12 }} labelFormatter={(l) => fmtDate(String(l ?? ""))} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="clicks" stroke="#3dc3ff" strokeWidth={2} dot={false} name="Clicks" />
              <Line type="monotone" dataKey="leads" stroke="#1e2a38" strokeWidth={2} dot={false} name="Leads" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Conversion Funnel ────────────────────────────────────────────── */}
      {showFunnel && (
        <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-5">
          <h2 className="font-semibold text-[#1e2a38] mb-4">Conversion Funnel</h2>
          <div className="space-y-3">
            {[
              { label: "YouTube Views", value: funnel!.views, color: "#3dc3ff", pct: null },
              { label: "Clicks", value: funnel!.clicks, color: "#1e2a38", pct: funnel!.views > 0 ? `${funnel!.viewToClickRate}% clicked` : null },
              { label: "Leads", value: funnel!.leads, color: "#22c55e", pct: funnel!.clicks > 0 ? `${funnel!.clickToLeadRate}% converted` : null },
            ].map((stage) => (
              <div key={stage.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-[#1e2a38]/70">{stage.label}</span>
                  <div className="flex items-center gap-3">
                    {stage.pct && <span className="text-xs text-[#1e2a38]/40">{stage.pct}</span>}
                    <span className="text-sm font-bold text-[#1e2a38]">{fmtNum(stage.value)}</span>
                  </div>
                </div>
                <div className="h-7 bg-[#f1f1ef] rounded-lg overflow-hidden">
                  <div className="h-full rounded-lg transition-all duration-500"
                    style={{ width: `${Math.max(2, (stage.value / funnelMax) * 100)}%`, backgroundColor: stage.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Lead Magnet Performance Table ────────────────────────────────── */}
      <div ref={sectionRefs["lead-magnets"]} className="bg-white border border-[#1e2a38]/10 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1e2a38]/5">
          <h2 className="font-semibold text-[#1e2a38]">Lead Magnet Performance</h2>
          <p className="text-xs text-[#1e2a38]/40 mt-0.5">Which lead magnets convert best</p>
        </div>
        {lmSort.sorted.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#1e2a38]/30">No campaign data for this period</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e2a38]/5 text-xs text-[#1e2a38]/40 font-medium">
                  {[
                    { key: "name" as const, label: "Campaign" },
                    { key: "totalViews" as const, label: "YT Views" },
                    { key: "totalClicks" as const, label: "Clicks" },
                    { key: "totalLeads" as const, label: "Leads" },
                    { key: "conversionRate" as const, label: "Conv. Rate" },
                  ].map(({ key, label }) => (
                    <th key={key} onClick={() => lmSort.toggle(key)} className="px-5 py-3 text-left cursor-pointer hover:text-[#1e2a38] select-none whitespace-nowrap">
                      {label}<lmSort.SortIcon col={key} />
                    </th>
                  ))}
                  <th className="px-5 py-3 text-left">Best Video</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2a38]/5">
                {lmSort.sorted.map((row) => (
                  <tr key={row.id} className="hover:bg-[#f8f9fa] transition-colors cursor-pointer" onClick={() => window.location.href = `/member/campaigns/${row.id}`}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-[#1e2a38]">{row.name}</p>
                      <p className="text-xs text-[#1e2a38]/30 truncate max-w-[180px]">{row.destinationUrl}</p>
                    </td>
                    <td className="px-5 py-3 text-[#1e2a38]/70">{fmtNum(row.totalViews)}</td>
                    <td className="px-5 py-3 text-[#1e2a38]">{fmtNum(row.totalClicks)}</td>
                    <td className="px-5 py-3 font-medium text-[#1e2a38]">{fmtNum(row.totalLeads)}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${convColor(row.conversionRate)}`}>
                        {row.conversionRate}%
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {row.bestVideo ? (
                        <div className="flex items-center gap-2">
                          {row.bestVideo.thumbnail && <img src={row.bestVideo.thumbnail} alt="" className="w-10 h-7 object-cover rounded flex-shrink-0" />}
                          <div>
                            <p className="text-xs text-[#1e2a38] truncate max-w-[140px]">{row.bestVideo.name}</p>
                            <p className="text-xs text-[#3dc3ff]">{row.bestVideo.leads} lead{row.bestVideo.leads !== 1 ? "s" : ""}</p>
                          </div>
                        </div>
                      ) : <span className="text-xs text-[#1e2a38]/20">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Video vs Lead Magnet Matrix ──────────────────────────────────── */}
      <div ref={sectionRefs.videos} className="bg-white border border-[#1e2a38]/10 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1e2a38]/5">
          <h2 className="font-semibold text-[#1e2a38]">Video Performance Matrix</h2>
          <p className="text-xs text-[#1e2a38]/40 mt-0.5">Which videos drive the most leads</p>
        </div>
        {vidSort.sorted.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#1e2a38]/30">No video tracking links yet. Link YouTube videos to your tracking links to see data here.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e2a38]/5 text-xs text-[#1e2a38]/40 font-medium">
                  <th className="px-5 py-3 text-left">Video</th>
                  {[
                    { key: "youtubeViewCount" as const, label: "YT Views" },
                    { key: "totalClicks" as const, label: "Clicks" },
                    { key: "clickThroughRate" as const, label: "CTR" },
                    { key: "totalLeads" as const, label: "Leads" },
                    { key: "conversionRate" as const, label: "Conv. Rate" },
                  ].map(({ key, label }) => (
                    <th key={key} onClick={() => vidSort.toggle(key)} className="px-5 py-3 text-left cursor-pointer hover:text-[#1e2a38] select-none whitespace-nowrap">
                      {label}<vidSort.SortIcon col={key} />
                    </th>
                  ))}
                  <th className="px-5 py-3 text-left">Campaign</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2a38]/5">
                {vidSort.sorted.map((row) => (
                  <tr key={row.id} className="hover:bg-[#f8f9fa] transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        {row.youtubeThumbnailUrl
                          ? <img src={row.youtubeThumbnailUrl} alt="" className="w-12 h-8 object-cover rounded flex-shrink-0" />
                          : <div className="w-12 h-8 bg-[#f1f1ef] rounded flex-shrink-0" />}
                        <div>
                          <p className="font-medium text-[#1e2a38] text-xs truncate max-w-[180px]">{row.name}</p>
                          {row.youtubeVideoUrl && (
                            <a href={row.youtubeVideoUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-[#3dc3ff] hover:underline">Watch ↗</a>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-[#1e2a38]/70">{fmtNum(row.youtubeViewCount)}</td>
                    <td className="px-5 py-3 text-[#1e2a38]">{fmtNum(row.totalClicks)}</td>
                    <td className="px-5 py-3 text-[#1e2a38]/70">{row.clickThroughRate}%</td>
                    <td className="px-5 py-3 font-medium text-[#1e2a38]">{fmtNum(row.totalLeads)}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${convColor(row.conversionRate)}`}>
                        {row.conversionRate}%
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <Link href={`/member/campaigns/${row.campaignId}`} className="text-xs text-[#1e2a38]/60 hover:text-[#3dc3ff] transition-colors">
                        {row.campaignName}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Top Performing Videos ────────────────────────────────────────── */}
      {topVideos.length > 0 && (
        <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-5">
          <h2 className="font-semibold text-[#1e2a38] mb-4">Top Videos by Leads</h2>
          <ResponsiveContainer width="100%" height={Math.max(200, topVideos.length * 40)}>
            <BarChart data={topVideos} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3808" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "#1e2a3860" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#1e2a3870" }} axisLine={false} tickLine={false} width={140} />
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid #1e2a3815", borderRadius: 10, fontSize: 12 }}
                formatter={(v, n) => [v, n === "totalLeads" ? "Leads" : n]} />
              <Bar dataKey="totalLeads" name="Leads" radius={[0, 4, 4, 0]}
                fill="#1e2a38"
                label={{ position: "right", fontSize: 10, fill: "#1e2a3870" }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Geographic Breakdown ─────────────────────────────────────────── */}
      <div ref={sectionRefs.geo} className="bg-white border border-[#1e2a38]/10 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1e2a38]/5">
          <h2 className="font-semibold text-[#1e2a38]">Geographic Breakdown</h2>
          <p className="text-xs text-[#1e2a38]/40 mt-0.5">Where your leads are coming from</p>
        </div>
        {geoSort.sorted.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#1e2a38]/30">No location data for this period</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e2a38]/5 text-xs text-[#1e2a38]/40 font-medium">
                  <th className="px-5 py-3 text-left">Location</th>
                  <th onClick={() => geoSort.toggle("leads")} className="px-5 py-3 text-left cursor-pointer hover:text-[#1e2a38] select-none">
                    Leads<geoSort.SortIcon col="leads" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2a38]/5">
                {geoSort.sorted.map((row, i) => {
                  const parts = [row.city, row.province, row.country].filter(Boolean).join(", ");
                  return (
                    <tr key={i} className="hover:bg-[#f8f9fa] transition-colors">
                      <td className="px-5 py-3">
                        <span className="text-base mr-2">{row.flag}</span>
                        <span className="text-[#1e2a38]">{parts || "Unknown"}</span>
                      </td>
                      <td className="px-5 py-3 font-medium text-[#1e2a38]">{row.leads}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-[#1e2a38]/40">Loading…</div>}>
      <AnalyticsPageInner />
    </Suspense>
  );
}

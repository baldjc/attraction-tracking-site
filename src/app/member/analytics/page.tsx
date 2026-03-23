"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { MiniSparkline } from "@/components/charts/MiniSparkline";
import { DonutChart } from "@/components/charts/DonutChart";
import {
  ArrowTrendingUpIcon, ArrowTrendingDownIcon,
  ArrowUpIcon, ArrowDownIcon,
} from "@heroicons/react/24/outline";

// ── Types ────────────────────────────────────────────────────────────────────
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
interface PageViewData { pageUrl: string; timestamp: string; }
interface LeadData {
  id: string; timestamp: string;
  click: {
    id: string; refCode: string;
    city: string | null; province: string | null; country: string | null; countryCode: string | null;
    timestamp: string; pageViews: PageViewData[];
    link: { id: string; name: string; youtubeVideoUrl: string | null; youtubeThumbnailUrl: string | null; campaign: { id: string; name: string; sourceType: string; }; };
  };
}

// ── Tabs ────────────────────────────────────────────────────────────────────
const TABS = [
  { id: "overview", label: "Overview" },
  { id: "conversions", label: "Conversions" },
  { id: "lead-magnets", label: "Lead Magnets" },
  { id: "videos", label: "Videos" },
  { id: "geography", label: "Geography" },
] as const;
type TabId = (typeof TABS)[number]["id"];

// ── Dark mode class helpers ─────────────────────────────────────────────────
const card = "bg-white dark:bg-[#242b3d] border border-[#1e2a38]/10 dark:border-[#2d3748]";
const txt = "text-[#1e2a38] dark:text-[#e2e8f0]";
const muted = "text-[#1e2a38]/50 dark:text-[#94a3b8]";
const dim = "text-[#1e2a38]/30 dark:text-[#64748b]";
const rowHover = "hover:bg-[#f8f9fa] dark:hover:bg-[#2d3748] transition-colors";
const divider = "divide-y divide-[#1e2a38]/5 dark:divide-[#2d3748]";
const inputCls = "text-xs border border-[#1e2a38]/20 dark:border-[#2d3748] rounded-xl px-3 py-2 focus:outline-none focus:border-[#3dc3ff] bg-white dark:bg-[#2d3748] text-[#1e2a38] dark:text-[#e2e8f0]";
const selectCls = inputCls + " w-full appearance-none cursor-pointer";
const periodBg = "bg-[#f1f1ef] dark:bg-[#1a1f2e]";

// ── Generic helpers ─────────────────────────────────────────────────────────
function fmtDate(d: string) { const [, m, day] = d.split("-"); return `${parseInt(m)}/${parseInt(day)}`; }
function fmtHour(str: string) {
  const [datePart, hourStr] = str.split("T");
  if (!datePart || hourStr === undefined) return fmtDate(str);
  const [, m, d] = datePart.split("-");
  const h = parseInt(hourStr ?? "0");
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return `${parseInt(m)}/${parseInt(d)} ${h12}${ampm}`;
}
function fmtNum(n: number) { return n.toLocaleString(); }
function toDateStr(d: Date) { return d.toISOString().slice(0, 10); }

function convColor(rate: number) {
  if (rate >= 5) return "text-green-600 bg-green-50 dark:bg-green-900/30 dark:text-green-400";
  if (rate >= 2) return "text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400";
  return "text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400";
}

function countryFlag(code: string | null): string {
  if (!code || code.length !== 2) return "";
  const offset = 0x1f1e6 - "A".charCodeAt(0);
  return String.fromCodePoint(code.toUpperCase().charCodeAt(0) + offset, code.toUpperCase().charCodeAt(1) + offset);
}
function formatLocation(city: string | null, province: string | null, country: string | null): string {
  return [city, province, country].filter(Boolean).join(", ") || "—";
}
function timeBetween(a: string, b: string): string {
  const diff = Math.abs(new Date(b).getTime() - new Date(a).getTime());
  const mins = Math.floor(diff / 60000); const secs = Math.floor((diff % 60000) / 1000);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}
function sessionDuration(views: PageViewData[]): string {
  if (views.length < 2) return "—";
  return timeBetween(views[0].timestamp, views[views.length - 1].timestamp);
}

const SOURCE_LABELS: Record<string, string> = {
  YOUTUBE: "YouTube",
  GOOGLE_ADS: "Google Ads",
  EMAIL: "Email",
  EMAIL_NEWSLETTER: "Email Newsletter",
  META_ADS: "Meta Ads",
  DIRECT_MAIL: "Direct Mail",
  BLOG_POSTS: "Blog Posts",
  OTHER: "Other",
};

// ── Delta badge ─────────────────────────────────────────────────────────────
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

// ── Sortable table hook ─────────────────────────────────────────────────────
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
    if (col !== key) return <span className={`${dim} ml-1`}>↕</span>;
    return dir === "asc" ? <ArrowUpIcon className="w-3 h-3 inline ml-1" /> : <ArrowDownIcon className="w-3 h-3 inline ml-1" />;
  }
  return { sorted, toggle, SortIcon, sortKey: key };
}

// ── Main analytics inner component ──────────────────────────────────────────
function AnalyticsPageInner() {
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const t = searchParams.get("tab") as TabId;
    return TABS.find((tab) => tab.id === t) ? t : "overview";
  });

  // Global filters
  const [period, setPeriod] = useState("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [campaignId, setCampaignId] = useState("all");
  const [sourceType, setSourceType] = useState("all");
  const [granularity, setGranularity] = useState<"hourly" | "daily" | "weekly">("daily");
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [linkId, setLinkId] = useState("all");
  const [campaignLinks, setCampaignLinks] = useState<{ id: string; name: string }[]>([]);
  const [tzOffset] = useState(() => new Date().getTimezoneOffset());

  // Analytics data
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([]);
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [leadMagnets, setLeadMagnets] = useState<LeadMagnet[]>([]);
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [geo, setGeo] = useState<GeoRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Conversions tab data
  const [leads, setLeads] = useState<LeadData[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Fetch campaigns + leads once on mount
  useEffect(() => {
    fetch("/api/campaigns").then((r) => r.ok ? r.json() : []).then(setCampaigns).catch(() => {});
    fetch("/api/member/leads")
      .then((r) => r.ok ? r.json() : [])
      .then((d) => { setLeads(Array.isArray(d) ? d : []); setLeadsLoading(false); })
      .catch(() => setLeadsLoading(false));
  }, []);

  // Auto-switch to hourly granularity when Today is selected (gives a better hourly view)
  useEffect(() => {
    if (period === "1d") setGranularity("hourly");
  }, [period]);

  // When a specific campaign is chosen, load its links for the link filter dropdown
  useEffect(() => {
    setLinkId("all");
    if (campaignId === "all") { setCampaignLinks([]); return; }
    fetch(`/api/campaigns/${campaignId}/links`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: { id: string; name: string }[]) => setCampaignLinks(Array.isArray(data) ? data : []))
      .catch(() => setCampaignLinks([]));
  }, [campaignId]);

  const buildQS = useCallback(() => {
    const p = new URLSearchParams({ period, campaignId, sourceType, tzOffset: String(tzOffset), linkId });
    if (period === "custom" && customFrom && customTo) { p.set("from", customFrom); p.set("to", customTo); }
    return p.toString();
  }, [period, campaignId, sourceType, customFrom, customTo, tzOffset, linkId]);

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

  function switchTab(id: TabId) {
    setActiveTab(id);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    window.history.replaceState({}, "", url.toString());
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Filter leads client-side using global period/campaign/source
  const filteredLeads = useMemo(() => {
    if (!leads.length) return [];
    const now = new Date();
    let from: Date;
    let to: Date = now;
    if (period === "custom" && customFrom && customTo) {
      from = new Date(customFrom);
      to = new Date(customTo); to.setHours(23, 59, 59, 999);
    } else if (period === "1d") {
      from = new Date(now.getTime() - 86400000);
    } else if (period === "7d") {
      from = new Date(now.getTime() - 7 * 86400000);
    } else if (period === "90d") {
      from = new Date(now.getTime() - 90 * 86400000);
    } else {
      from = new Date(now.getTime() - 30 * 86400000);
    }
    return leads.filter((l) => {
      const ts = new Date(l.timestamp);
      if (ts < from || ts > to) return false;
      if (campaignId !== "all" && l.click.link.campaign.id !== campaignId) return false;
      if (sourceType !== "all" && l.click.link.campaign.sourceType !== sourceType) return false;
      if (linkId !== "all" && l.click.link.id !== linkId) return false;
      return true;
    });
  }, [leads, period, customFrom, customTo, campaignId, sourceType, linkId, tzOffset]);

  // Conversions tab charts data
  const { dailyLeads, byCampaign, bySource } = useMemo(() => {
    if (!filteredLeads.length) return { dailyLeads: [], byCampaign: [], bySource: [] };
    const now = new Date();
    let start: Date;
    let end = now;
    if (period === "custom" && customFrom && customTo) {
      start = new Date(customFrom); end = new Date(customTo);
    } else if (period === "7d") {
      start = new Date(now.getTime() - 7 * 86400000);
    } else if (period === "90d") {
      start = new Date(now.getTime() - 90 * 86400000);
    } else {
      start = new Date(now.getTime() - 30 * 86400000);
    }
    const dayMap = new Map<string, number>();
    const cur = new Date(start); cur.setHours(0, 0, 0, 0);
    while (cur <= end) { dayMap.set(toDateStr(cur), 0); cur.setDate(cur.getDate() + 1); }
    for (const l of filteredLeads) {
      const d = toDateStr(new Date(l.timestamp));
      if (dayMap.has(d)) dayMap.set(d, (dayMap.get(d) ?? 0) + 1);
    }
    const dailyLeads = Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, leads]) => ({ date, leads }));
    const campMap = new Map<string, number>();
    const srcMap = new Map<string, number>();
    for (const l of filteredLeads) {
      const name = l.click.link.campaign.name;
      campMap.set(name, (campMap.get(name) ?? 0) + 1);
      const src = SOURCE_LABELS[l.click.link.campaign.sourceType] ?? "Other";
      srcMap.set(src, (srcMap.get(src) ?? 0) + 1);
    }
    return {
      dailyLeads,
      byCampaign: Array.from(campMap.entries()).sort(([, a], [, b]) => b - a).map(([name, value]) => ({ name, value })),
      bySource: Array.from(srcMap.entries()).sort(([, a], [, b]) => b - a).map(([name, value]) => ({ name, value })),
    };
  }, [filteredLeads, period, customFrom, customTo]);

  // Sortable tables
  const lmSort = useSortTable<LeadMagnet>(leadMagnets, "totalLeads");
  const vidSort = useSortTable<VideoRow>(videos, "totalLeads");
  const geoSort = useSortTable<GeoRow>(geo, "leads");

  const topVideos = [...videos].sort((a, b) => b.totalLeads - a.totalLeads).slice(0, 10);
  const showFunnel = !!funnel && (funnel.views > 0 || funnel.clicks > 0 || funnel.leads > 0);
  const funnelMax = showFunnel ? Math.max(funnel!.views, funnel!.clicks, funnel!.leads, 1) : 1;
  const periodLabel = period === "1d" ? "today" : period === "7d" ? "7 days" : period === "90d" ? "90 days" : period === "custom" ? "custom" : "30 days";

  return (
    <div className="space-y-4 pb-10">
      <div>
        <h1 className={`text-2xl font-bold ${txt}`}>Lead Analytics</h1>
        <p className={`text-sm ${muted} mt-0.5`}>Performance across all your campaigns and videos</p>
      </div>

      {/* ── Global filters (above tabs) ───────────────────────────────────── */}
      <div className={`${card} rounded-2xl px-5 py-3.5 flex flex-col gap-3 sticky top-0 z-10`}>
        {/* Period + loading row */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className={`flex gap-1 ${periodBg} rounded-xl p-1`}>
            {(["1d", "7d", "30d", "90d"] as const).map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${period === p ? `bg-white dark:bg-[#2d3748] shadow-sm ${txt}` : `${muted} hover:${txt}`}`}>
                {p === "1d" ? "Today" : p}
              </button>
            ))}
            <button onClick={() => setPeriod("custom")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${period === "custom" ? `bg-white dark:bg-[#2d3748] shadow-sm ${txt}` : `${muted} hover:${txt}`}`}>
              Custom
            </button>
          </div>
          {loading && <span className={`text-xs ${dim} animate-pulse ml-auto`}>Loading…</span>}
        </div>

        {period === "custom" && (
          <div className="flex items-center gap-2">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className={inputCls + " flex-1"} />
            <span className={`${dim} text-xs`}>to</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className={inputCls + " flex-1"} />
          </div>
        )}

        {/* Dropdowns — each on its own full-width row on mobile */}
        <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className={selectCls}>
          <option value="all">All Campaigns</option>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        {campaignId !== "all" && campaignLinks.length > 0 && (
          <select value={linkId} onChange={(e) => setLinkId(e.target.value)} className={selectCls}>
            <option value="all">All Links</option>
            {campaignLinks.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}

        <select value={sourceType} onChange={(e) => setSourceType(e.target.value)} className={selectCls}>
          <option value="all">All Sources</option>
          <option value="YOUTUBE">YouTube</option>
          <option value="GOOGLE_ADS">Google Ads</option>
          <option value="EMAIL">Email</option>
          <option value="EMAIL_NEWSLETTER">Email Newsletter</option>
          <option value="META_ADS">Meta Ads</option>
          <option value="DIRECT_MAIL">Direct Mail</option>
          <option value="BLOG_POSTS">Blog Posts</option>
          <option value="OTHER">Other</option>
        </select>
      </div>

      {/* ── Tab navigation ────────────────────────────────────────────────── */}
      <div className={`${card} rounded-2xl overflow-hidden`}>
        <div className={`flex border-b border-[#1e2a38]/10 dark:border-[#2d3748] overflow-x-auto`}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              className={`px-5 py-3.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-[#3dc3ff] text-[#3dc3ff]"
                  : `border-transparent ${muted} hover:text-[#1e2a38] dark:hover:text-[#e2e8f0]`
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── TAB 1: OVERVIEW ─────────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <div className="p-5 space-y-6">
            {/* KPI Cards */}
            {overview && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className={`${card} rounded-xl p-4`}>
                  <p className={`text-xs ${muted} font-medium mb-1`}>YouTube Views</p>
                  <p className={`text-2xl font-bold ${txt}`}>{fmtNum(overview.totalViews)}</p>
                  <p className={`text-xs ${dim} mt-1`}>Updated 4×/day, 6am–6pm</p>
                </div>
                <div className={`${card} rounded-xl p-4`}>
                  <p className={`text-xs ${muted} font-medium mb-1`}>Clicks ({periodLabel})</p>
                  <p className={`text-2xl font-bold ${txt}`}>{fmtNum(overview.totalClicks)}</p>
                  <div className="mt-1"><DeltaBadge d={overview.clicksDelta} /></div>
                  <div className="mt-2"><MiniSparkline data={overview.sparkline.map((s) => ({ value: s.clicks }))} color="#3dc3ff" /></div>
                </div>
                <div className={`${card} rounded-xl p-4`}>
                  <p className={`text-xs ${muted} font-medium mb-1`}>Leads ({periodLabel})</p>
                  <p className={`text-2xl font-bold ${txt}`}>{fmtNum(overview.totalLeads)}</p>
                  <div className="mt-1"><DeltaBadge d={overview.leadsDelta} /></div>
                  <div className="mt-2"><MiniSparkline data={overview.leadsSparkline.map((s) => ({ value: s.leads }))} color="#3dc3ff" /></div>
                </div>
                <div className={`${card} rounded-xl p-4`}>
                  <p className={`text-xs ${muted} font-medium mb-1`}>Conv. Rate ({periodLabel})</p>
                  <p className="text-2xl font-bold text-[#3dc3ff]">{overview.convRate}%</p>
                  <div className="mt-1"><DeltaBadge d={overview.convRateDelta} suffix="pp" /></div>
                </div>
                <div className={`${card} rounded-xl p-4`}>
                  <p className={`text-xs ${muted} font-medium mb-1`}>Leads / Views</p>
                  <p className={`text-2xl font-bold ${txt}`}>
                    {overview.totalViews > 0
                      ? `${((overview.totalLeads / overview.totalViews) * 100).toFixed(2)}%`
                      : "—"}
                  </p>
                  <p className={`text-xs ${dim} mt-1`}>Leads per YouTube view</p>
                </div>
              </div>
            )}

            {/* Timeseries chart */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className={`font-semibold ${txt}`}>Clicks &amp; Leads Over Time</h2>
                <div className={`flex gap-1 ${periodBg} rounded-xl p-1`}>
                  {(["hourly", "daily", "weekly"] as const).map((g) => (
                    <button key={g} onClick={() => setGranularity(g)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${granularity === g ? `bg-white dark:bg-[#2d3748] shadow-sm ${txt}` : `${dim} hover:${txt}`}`}>
                      {g === "hourly" ? "Hourly" : g === "daily" ? "Daily" : "Weekly"}
                    </button>
                  ))}
                </div>
              </div>
              {timeseries.length === 0 ? (
                <div className={`h-40 flex items-center justify-center ${dim} text-sm`}>No data for this period</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={timeseries} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3808" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={granularity === "hourly" ? fmtHour : fmtDate} tick={{ fontSize: 10, fill: "#1e2a3860" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: "#1e2a3860" }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "#1e2a38", border: "none", borderRadius: 10, fontSize: 12, color: "#e2e8f0" }} labelFormatter={(l) => granularity === "hourly" ? fmtHour(String(l ?? "")) : fmtDate(String(l ?? ""))} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="clicks" stroke="#3dc3ff" strokeWidth={2} dot={false} name="Clicks" />
                    <Line type="monotone" dataKey="leads" stroke="#22c55e" strokeWidth={2} dot={false} name="Leads" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Funnel */}
            {showFunnel && (
              <div>
                <h2 className={`font-semibold ${txt} mb-4`}>Conversion Funnel</h2>
                <div className="space-y-3">
                  {[
                    { label: "YouTube Views", value: funnel!.views, color: "#3dc3ff", pct: null },
                    { label: "Clicks", value: funnel!.clicks, color: "#1e2a38", pct: funnel!.views > 0 ? `${funnel!.viewToClickRate}% clicked` : null },
                    { label: "Leads", value: funnel!.leads, color: "#22c55e", pct: funnel!.clicks > 0 ? `${funnel!.clickToLeadRate}% converted` : null },
                  ].map((stage) => (
                    <div key={stage.label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-medium ${muted}`}>{stage.label}</span>
                        <div className="flex items-center gap-3">
                          {stage.pct && <span className={`text-xs ${dim}`}>{stage.pct}</span>}
                          <span className={`text-sm font-bold ${txt}`}>{fmtNum(stage.value)}</span>
                        </div>
                      </div>
                      <div className={`h-7 ${periodBg} rounded-lg overflow-hidden`}>
                        <div className="h-full rounded-lg transition-all duration-500"
                          style={{ width: `${Math.max(2, (stage.value / funnelMax) * 100)}%`, backgroundColor: stage.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!loading && !overview && (
              <div className={`text-center py-12 ${dim} text-sm`}>No data available for this period.</div>
            )}
          </div>
        )}

        {/* ── TAB 2: CONVERSIONS ──────────────────────────────────────────── */}
        {activeTab === "conversions" && (
          <div className="p-5 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className={`font-semibold ${txt}`}>Conversions</h2>
                <p className={`text-xs ${muted} mt-0.5`}>Every lead captured across all your campaigns</p>
              </div>
              {!leadsLoading && (
                <span className={`text-xs ${dim}`}>
                  {filteredLeads.length} conversion{filteredLeads.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {/* Charts */}
            {!leadsLoading && filteredLeads.length > 0 && (
              <div className={`${card} rounded-xl p-5`}>
                <h3 className={`font-semibold ${txt} mb-5`}>Analytics</h3>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-1">
                    <p className={`text-xs font-medium ${muted} mb-3`}>Leads Per Day</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={dailyLeads} margin={{ top: 0, right: 5, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3808" vertical={false} />
                        <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 10, fill: "#1e2a3860" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 10, fill: "#1e2a3860" }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip contentStyle={{ background: "#1e2a38", border: "none", borderRadius: 10, fontSize: 12, color: "#e2e8f0" }} labelFormatter={(l) => fmtDate(String(l ?? ""))} />
                        <Bar dataKey="leads" fill="#3dc3ff" radius={[3, 3, 0, 0]} name="Leads" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div>
                    <p className={`text-xs font-medium ${muted} mb-3`}>By Campaign</p>
                    {byCampaign.length > 0
                      ? <DonutChart data={byCampaign} />
                      : <div className={`h-[180px] flex items-center justify-center ${dim} text-xs`}>No data</div>}
                  </div>
                  <div>
                    <p className={`text-xs font-medium ${muted} mb-3`}>By Source</p>
                    {bySource.length > 0
                      ? <DonutChart data={bySource} colors={["#ff0033", "#3dc3ff", "#22c55e", "#f59e0b"]} />
                      : <div className={`h-[180px] flex items-center justify-center ${dim} text-xs`}>No data</div>}
                  </div>
                </div>
              </div>
            )}

            {/* Leads table */}
            {leadsLoading ? (
              <div className={`text-center py-16 ${dim}`}>Loading…</div>
            ) : filteredLeads.length === 0 ? (
              <div className={`${card} rounded-xl p-12 text-center`}>
                <div className="text-4xl mb-3">📬</div>
                <h3 className={`font-semibold ${txt} mb-2`}>No conversions for this period</h3>
                <p className={`text-sm ${muted}`}>Try adjusting the date range or campaign filter above.</p>
              </div>
            ) : (
              <div className={`${card} rounded-xl overflow-hidden`}>
                <div className={divider}>
                  {filteredLeads.map((lead) => {
                    const isOpen = expanded.has(lead.id);
                    const views = lead.click.pageViews;
                    const { city, province, country, countryCode } = lead.click;
                    const flag = countryFlag(countryCode);
                    const location = formatLocation(city, province, country);
                    const hasThumbnail = !!lead.click.link.youtubeThumbnailUrl;
                    return (
                      <div key={lead.id}>
                        <button onClick={() => toggleExpand(lead.id)} className={`w-full text-left px-5 py-4 ${rowHover}`}>
                          <div className="flex items-center justify-between gap-4">
                            <div className="grid grid-cols-4 flex-1 gap-4 text-sm">
                              <div>
                                <div className={`${txt} font-medium`}>{new Date(lead.timestamp).toLocaleDateString()}</div>
                                <div className={`text-xs ${dim}`}>{new Date(lead.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                              </div>
                              <div>
                                <div className={`${txt} font-medium truncate`}>{lead.click.link.campaign.name}</div>
                                <div className={`text-xs ${dim}`}>Campaign</div>
                              </div>
                              <div className="flex items-center gap-2 min-w-0">
                                {hasThumbnail && (
                                  <img src={lead.click.link.youtubeThumbnailUrl!} alt="" className="w-[60px] h-[40px] object-cover rounded flex-shrink-0" />
                                )}
                                <div className="min-w-0">
                                  <div className={`${txt} truncate`}>{lead.click.link.name}</div>
                                  <div className={`text-xs ${dim}`}>Source</div>
                                </div>
                              </div>
                              <div>
                                <div className={`${txt} flex items-center gap-1`}>
                                  {flag && <span className="text-base leading-none">{flag}</span>}
                                  <span className="truncate">{location}</span>
                                </div>
                                <div className={`text-xs ${dim}`}>Location</div>
                              </div>
                            </div>
                            <span className={`${dim} text-sm flex-shrink-0`}>{isOpen ? "▲" : "▼"}</span>
                          </div>
                        </button>
                        {isOpen && (
                          <div className={`px-5 pb-4 bg-[#f8f9fa] dark:bg-[#1a1f2e] border-t border-[#1e2a38]/5 dark:border-[#2d3748]`}>
                            <div className="mt-3">
                              <div className="flex items-center justify-between mb-2">
                                <p className={`text-xs font-semibold ${muted} uppercase tracking-wide`}>
                                  Browsing Journey ({views.length} page{views.length !== 1 ? "s" : ""})
                                </p>
                                <p className={`text-xs ${dim}`}>Session: {sessionDuration(views)}</p>
                              </div>
                              {views.length === 0 ? (
                                <p className={`text-xs ${dim}`}>No page views recorded.</p>
                              ) : (
                                <div className="space-y-1.5">
                                  {views.map((v, i) => (
                                    <div key={i} className="flex items-start gap-3 text-xs">
                                      <div className={`${dim} w-12 flex-shrink-0 text-right`}>
                                        {i < views.length - 1 ? timeBetween(v.timestamp, views[i + 1].timestamp) : "—"}
                                      </div>
                                      <div className="w-px bg-[#1e2a38]/10 dark:bg-[#2d3748] self-stretch flex-shrink-0" />
                                      <div>
                                        <p className={`${muted} break-all`}>{v.pageUrl}</p>
                                        <p className={dim}>{new Date(v.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 3: LEAD MAGNETS ─────────────────────────────────────────── */}
        {activeTab === "lead-magnets" && (
          <div>
            <div className="px-5 py-4 border-b border-[#1e2a38]/5 dark:border-[#2d3748]">
              <h2 className={`font-semibold ${txt}`}>Lead Magnet Performance</h2>
              <p className={`text-xs ${muted} mt-0.5`}>Which lead magnets convert best</p>
            </div>
            {lmSort.sorted.length === 0 ? (
              <div className={`p-8 text-center text-sm ${dim}`}>No campaign data for this period</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={`border-b border-[#1e2a38]/5 dark:border-[#2d3748] text-xs ${dim} font-medium`}>
                      {[
                        { key: "name" as const, label: "Campaign" },
                        { key: "totalViews" as const, label: "YT Views" },
                        { key: "totalClicks" as const, label: "Clicks" },
                        { key: "totalLeads" as const, label: "Leads" },
                        { key: "conversionRate" as const, label: "Conv. Rate" },
                      ].map(({ key, label }) => (
                        <th key={key} onClick={() => lmSort.toggle(key)}
                          className={`px-5 py-3 text-left cursor-pointer hover:${txt} select-none whitespace-nowrap`}>
                          {label}<lmSort.SortIcon col={key} />
                        </th>
                      ))}
                      <th className="px-5 py-3 text-left">Best Video</th>
                    </tr>
                  </thead>
                  <tbody className={divider}>
                    {lmSort.sorted.map((row) => (
                      <tr key={row.id} className={`${rowHover} cursor-pointer`} onClick={() => window.location.href = `/member/campaigns/${row.id}`}>
                        <td className="px-5 py-3">
                          <p className={`font-medium ${txt}`}>{row.name}</p>
                          <p className={`text-xs ${dim} truncate max-w-[180px]`}>{row.destinationUrl}</p>
                        </td>
                        <td className={`px-5 py-3 ${muted}`}>{fmtNum(row.totalViews)}</td>
                        <td className={`px-5 py-3 ${txt}`}>{fmtNum(row.totalClicks)}</td>
                        <td className={`px-5 py-3 font-medium ${txt}`}>{fmtNum(row.totalLeads)}</td>
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
                                <p className={`text-xs ${txt} truncate max-w-[140px]`}>{row.bestVideo.name}</p>
                                <p className="text-xs text-[#3dc3ff]">{row.bestVideo.leads} lead{row.bestVideo.leads !== 1 ? "s" : ""}</p>
                              </div>
                            </div>
                          ) : <span className={`text-xs ${dim}`}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 4: VIDEOS ───────────────────────────────────────────────── */}
        {activeTab === "videos" && (
          <div>
            <div className="px-5 py-4 border-b border-[#1e2a38]/5 dark:border-[#2d3748]">
              <h2 className={`font-semibold ${txt}`}>Video Performance Matrix</h2>
              <p className={`text-xs ${muted} mt-0.5`}>Which videos drive the most leads and clicks</p>
            </div>
            {vidSort.sorted.length === 0 ? (
              <div className={`p-8 text-center text-sm ${dim}`}>No video tracking links yet. Link YouTube videos to your tracking links to see data here.</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={`border-b border-[#1e2a38]/5 dark:border-[#2d3748] text-xs ${dim} font-medium`}>
                        <th className="px-5 py-3 text-left">Video</th>
                        {[
                          { key: "youtubeViewCount" as const, label: "YT Views" },
                          { key: "totalClicks" as const, label: "Clicks" },
                          { key: "clickThroughRate" as const, label: "CTR" },
                          { key: "totalLeads" as const, label: "Leads" },
                          { key: "conversionRate" as const, label: "Conv. Rate" },
                        ].map(({ key, label }) => (
                          <th key={key} onClick={() => vidSort.toggle(key)}
                            className={`px-5 py-3 text-left cursor-pointer hover:${txt} select-none whitespace-nowrap`}>
                            {label}<vidSort.SortIcon col={key} />
                          </th>
                        ))}
                        <th className="px-5 py-3 text-left">Campaign</th>
                      </tr>
                    </thead>
                    <tbody className={divider}>
                      {vidSort.sorted.map((row) => (
                        <tr key={row.id} className={rowHover}>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2.5">
                              {row.youtubeThumbnailUrl
                                ? <img src={row.youtubeThumbnailUrl} alt="" className="w-12 h-8 object-cover rounded flex-shrink-0" />
                                : <div className={`w-12 h-8 ${periodBg} rounded flex-shrink-0`} />}
                              <div>
                                <p className={`font-medium ${txt} text-xs truncate max-w-[180px]`}>{row.name}</p>
                                {row.youtubeVideoUrl && (
                                  <a href={row.youtubeVideoUrl} target="_blank" rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-xs text-[#3dc3ff] hover:underline">Watch ↗</a>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className={`px-5 py-3 ${muted}`}>{fmtNum(row.youtubeViewCount)}</td>
                          <td className={`px-5 py-3 ${txt}`}>{fmtNum(row.totalClicks)}</td>
                          <td className={`px-5 py-3 ${muted}`}>{row.clickThroughRate}%</td>
                          <td className={`px-5 py-3 font-medium ${txt}`}>{fmtNum(row.totalLeads)}</td>
                          <td className="px-5 py-3">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${convColor(row.conversionRate)}`}>
                              {row.conversionRate}%
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <Link href={`/member/campaigns/${row.campaignId}`}
                              onClick={(e) => e.stopPropagation()}
                              className={`text-xs ${muted} hover:text-[#3dc3ff] truncate max-w-[120px] block`}>
                              {row.campaignName}
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Top Videos Bar Chart */}
                {topVideos.length > 1 && (
                  <div className="px-5 py-5 border-t border-[#1e2a38]/5 dark:border-[#2d3748]">
                    <h3 className={`text-sm font-semibold ${txt} mb-4`}>Top Videos by Leads</h3>
                    <ResponsiveContainer width="100%" height={Math.max(200, topVideos.length * 36)}>
                      <BarChart data={topVideos} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3808" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10, fill: "#1e2a3860" }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#1e2a3860" }} axisLine={false} tickLine={false} width={120}
                          tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 18) + "…" : v} />
                        <Tooltip contentStyle={{ background: "#1e2a38", border: "none", borderRadius: 10, fontSize: 12, color: "#e2e8f0" }} />
                        <Bar dataKey="totalLeads" fill="#3dc3ff" radius={[0, 4, 4, 0]} name="Leads" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── TAB 5: GEOGRAPHY ────────────────────────────────────────────── */}
        {activeTab === "geography" && (
          <div>
            <div className="px-5 py-4 border-b border-[#1e2a38]/5 dark:border-[#2d3748]">
              <h2 className={`font-semibold ${txt}`}>Geography</h2>
              <p className={`text-xs ${muted} mt-0.5`}>Where your leads are coming from</p>
            </div>
            {geoSort.sorted.length === 0 ? (
              <div className={`p-8 text-center text-sm ${dim}`}>No geographic data for this period</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={`border-b border-[#1e2a38]/5 dark:border-[#2d3748] text-xs ${dim} font-medium`}>
                      <th className="px-5 py-3 text-left">Country</th>
                      <th className="px-5 py-3 text-left">Province / State</th>
                      <th className="px-5 py-3 text-left">City</th>
                      <th onClick={() => geoSort.toggle("leads")}
                        className={`px-5 py-3 text-left cursor-pointer hover:${txt} select-none`}>
                        Leads<geoSort.SortIcon col="leads" />
                      </th>
                    </tr>
                  </thead>
                  <tbody className={divider}>
                    {geoSort.sorted.map((row, i) => (
                      <tr key={i} className={rowHover}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            {row.flag && <span className="text-lg leading-none">{row.flag}</span>}
                            <span className={txt}>{row.country ?? "—"}</span>
                          </div>
                        </td>
                        <td className={`px-5 py-3 ${muted}`}>{row.province ?? "—"}</td>
                        <td className={`px-5 py-3 ${muted}`}>{row.city ?? "—"}</td>
                        <td className={`px-5 py-3 font-semibold ${txt}`}>{row.leads}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Export with Suspense boundary ────────────────────────────────────────────
export default function AnalyticsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-[#1e2a38]/40 dark:text-[#94a3b8]">Loading analytics…</div>}>
      <AnalyticsPageInner />
    </Suspense>
  );
}

"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { DonutChart } from "@/components/charts/DonutChart";

interface PageViewData {
  pageUrl: string;
  timestamp: string;
}

interface LeadData {
  id: string;
  timestamp: string;
  click: {
    id: string;
    refCode: string;
    city: string | null;
    province: string | null;
    country: string | null;
    timestamp: string;
    pageViews: PageViewData[];
    link: {
      name: string;
      youtubeVideoUrl: string | null;
      campaign: {
        id: string;
        name: string;
        sourceType: string;
      };
    };
  };
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtDate(d: string) {
  const [, m, day] = d.split("-");
  return `${parseInt(m)}/${parseInt(day)}`;
}

const SOURCE_LABELS: Record<string, string> = {
  YOUTUBE: "YouTube",
  GOOGLE_ADS: "Google Ads",
  EMAIL: "Email",
  OTHER: "Other",
};

export default function ConversionsPage() {
  const [leads, setLeads] = useState<LeadData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [campaignFilter, setCampaignFilter] = useState("");
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/member/leads").then((r) => r.json()),
      fetch("/api/campaigns").then((r) => r.json()),
    ]).then(([leadsData, campaignsData]) => {
      setLeads(Array.isArray(leadsData) ? leadsData : []);
      setCampaigns(Array.isArray(campaignsData) ? campaignsData : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function timeBetween(a: string, b: string): string {
    const diff = Math.abs(new Date(b).getTime() - new Date(a).getTime());
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  }

  function sessionDuration(views: PageViewData[]): string {
    if (views.length < 2) return "—";
    return timeBetween(views[0].timestamp, views[views.length - 1].timestamp);
  }

  const filtered = leads.filter((l) => {
    if (campaignFilter && l.click.link.campaign.id !== campaignFilter) return false;
    const ts = new Date(l.timestamp);
    if (dateFrom && ts < new Date(dateFrom)) return false;
    if (dateTo) {
      const endOfDay = new Date(dateTo);
      endOfDay.setHours(23, 59, 59, 999);
      if (ts > endOfDay) return false;
    }
    return true;
  });

  const hasFilters = campaignFilter || dateFrom || dateTo;

  // Chart data derived from filtered leads
  const { dailyLeads, byCampaign, bySource } = useMemo(() => {
    if (!filtered.length) return { dailyLeads: [], byCampaign: [], bySource: [] };

    // Daily leads (last 30 days or date range)
    const dayMap = new Map<string, number>();
    const start = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 86400000);
    const end = dateTo ? new Date(dateTo) : new Date();
    const cur = new Date(start); cur.setHours(0, 0, 0, 0);
    while (cur <= end) { dayMap.set(toDateStr(cur), 0); cur.setDate(cur.getDate() + 1); }
    for (const l of filtered) {
      const d = toDateStr(new Date(l.timestamp));
      if (dayMap.has(d)) dayMap.set(d, (dayMap.get(d) ?? 0) + 1);
    }
    const dailyLeads = Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, leads]) => ({ date, leads }));

    // By campaign
    const campMap = new Map<string, number>();
    for (const l of filtered) {
      const name = l.click.link.campaign.name;
      campMap.set(name, (campMap.get(name) ?? 0) + 1);
    }
    const byCampaign = Array.from(campMap.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([name, value]) => ({ name, value }));

    // By source type
    const srcMap = new Map<string, number>();
    for (const l of filtered) {
      const src = SOURCE_LABELS[l.click.link.campaign.sourceType] ?? "Other";
      srcMap.set(src, (srcMap.get(src) ?? 0) + 1);
    }
    const bySource = Array.from(srcMap.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([name, value]) => ({ name, value }));

    return { dailyLeads, byCampaign, bySource };
  }, [filtered, dateFrom, dateTo]);

  const hasChartData = filtered.length > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1e2a38]">Conversions</h1>
          <p className="text-sm text-[#1e2a38]/50 mt-0.5">Every lead captured across all your campaigns</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <select
          value={campaignFilter}
          onChange={(e) => setCampaignFilter(e.target.value)}
          className="text-sm border border-[#1e2a38]/20 rounded-xl px-3 py-2 focus:outline-none focus:border-[#3dc3ff] bg-white text-[#1e2a38]"
        >
          <option value="">All Campaigns</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="text-sm border border-[#1e2a38]/20 rounded-xl px-3 py-2 focus:outline-none focus:border-[#3dc3ff] bg-white text-[#1e2a38]"
          />
          <span className="text-[#1e2a38]/30 text-sm">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="text-sm border border-[#1e2a38]/20 rounded-xl px-3 py-2 focus:outline-none focus:border-[#3dc3ff] bg-white text-[#1e2a38]"
          />
        </div>
        {hasFilters && (
          <button
            onClick={() => { setCampaignFilter(""); setDateFrom(""); setDateTo(""); }}
            className="text-xs text-[#1e2a38]/40 hover:text-[#1e2a38] underline"
          >
            Clear filters
          </button>
        )}
        {!loading && (
          <span className="text-xs text-[#1e2a38]/40 ml-auto">
            {filtered.length} conversion{filtered.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Analytics Charts */}
      {!loading && hasChartData && (
        <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-5 mb-5">
          <h2 className="font-semibold text-[#1e2a38] mb-5">Analytics</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Leads per day bar chart */}
            <div className="lg:col-span-1">
              <p className="text-xs font-medium text-[#1e2a38]/50 mb-3">Leads Per Day</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={dailyLeads} margin={{ top: 0, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3808" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={fmtDate}
                    tick={{ fontSize: 10, fill: "#1e2a3860" }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 10, fill: "#1e2a3860" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "#fff", border: "1px solid #1e2a3815", borderRadius: 10, fontSize: 12 }}
                    labelFormatter={(label) => fmtDate(String(label ?? ""))}
                  />
                  <Bar dataKey="leads" fill="#1e2a38" radius={[3, 3, 0, 0]} name="Leads" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Leads by campaign donut */}
            <div>
              <p className="text-xs font-medium text-[#1e2a38]/50 mb-3">By Campaign</p>
              {byCampaign.length > 0
                ? <DonutChart data={byCampaign} />
                : <div className="h-[180px] flex items-center justify-center text-[#1e2a38]/20 text-xs">No data</div>
              }
            </div>

            {/* Leads by source donut */}
            <div>
              <p className="text-xs font-medium text-[#1e2a38]/50 mb-3">By Source</p>
              {bySource.length > 0
                ? <DonutChart data={bySource} colors={["#ff0033", "#3dc3ff", "#22c55e", "#f59e0b"]} />
                : <div className="h-[180px] flex items-center justify-center text-[#1e2a38]/20 text-xs">No data</div>
              }
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-[#1e2a38]/40">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-12 text-center">
          <div className="text-4xl mb-3">📬</div>
          <h2 className="font-semibold text-[#1e2a38] mb-2">
            {hasFilters ? "No conversions match your filters" : "No conversions yet"}
          </h2>
          <p className="text-sm text-[#1e2a38]/50">
            {hasFilters
              ? "Try adjusting your date range or campaign filter."
              : "When someone clicks a tracked link and reaches your thank you page, they'll appear here."}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-[#1e2a38]/10 rounded-2xl overflow-hidden">
          <div className="divide-y divide-[#1e2a38]/5">
            {filtered.map((lead) => {
              const isOpen = expanded.has(lead.id);
              const views = lead.click.pageViews;
              const location = [lead.click.city, lead.click.province, lead.click.country]
                .filter(Boolean)
                .join(", ");

              return (
                <div key={lead.id}>
                  <button
                    onClick={() => toggleExpand(lead.id)}
                    className="w-full text-left px-5 py-4 hover:bg-[#f8f9fa] transition-colors"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="grid grid-cols-4 flex-1 gap-4 text-sm">
                        <div>
                          <div className="text-[#1e2a38] font-medium">
                            {new Date(lead.timestamp).toLocaleDateString()}
                          </div>
                          <div className="text-xs text-[#1e2a38]/40">
                            {new Date(lead.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                        <div>
                          <div className="text-[#1e2a38] font-medium truncate">{lead.click.link.campaign.name}</div>
                          <div className="text-xs text-[#1e2a38]/40">Campaign</div>
                        </div>
                        <div>
                          <div className="text-[#1e2a38] truncate">{lead.click.link.name}</div>
                          <div className="text-xs text-[#1e2a38]/40">Source</div>
                        </div>
                        <div>
                          <div className="text-[#1e2a38]">{location || "—"}</div>
                          <div className="text-xs text-[#1e2a38]/40">Location</div>
                        </div>
                      </div>
                      <span className="text-[#1e2a38]/30 text-sm flex-shrink-0">{isOpen ? "▲" : "▼"}</span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-4 bg-[#f8f9fa] border-t border-[#1e2a38]/5">
                      <div className="mt-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-semibold text-[#1e2a38]/60 uppercase tracking-wide">
                            Browsing Journey ({views.length} page{views.length !== 1 ? "s" : ""})
                          </p>
                          <p className="text-xs text-[#1e2a38]/40">
                            Session: {sessionDuration(views)}
                          </p>
                        </div>
                        {views.length === 0 ? (
                          <p className="text-xs text-[#1e2a38]/40">No page views recorded.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {views.map((v, i) => (
                              <div key={i} className="flex items-start gap-3 text-xs">
                                <div className="text-[#1e2a38]/30 w-12 flex-shrink-0 text-right">
                                  {i < views.length - 1 ? timeBetween(v.timestamp, views[i + 1].timestamp) : "—"}
                                </div>
                                <div className="w-px bg-[#1e2a38]/10 self-stretch flex-shrink-0" />
                                <div>
                                  <p className="text-[#1e2a38]/70 break-all">{v.pageUrl}</p>
                                  <p className="text-[#1e2a38]/30">
                                    {new Date(v.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                                  </p>
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
  );
}

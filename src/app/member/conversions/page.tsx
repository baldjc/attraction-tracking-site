"use client";

import { useState, useEffect } from "react";

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
      };
    };
  };
}

export default function ConversionsPage() {
  const [leads, setLeads] = useState<LeadData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [campaignFilter, setCampaignFilter] = useState("");
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);

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

  const filtered = leads.filter((l) =>
    campaignFilter ? l.click.link.campaign.id === campaignFilter : true
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1e2a38]">Conversions</h1>
          <p className="text-sm text-[#1e2a38]/50 mt-0.5">Every lead captured across all your campaigns</p>
        </div>
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
      </div>

      {loading ? (
        <div className="text-center py-16 text-[#1e2a38]/40">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-12 text-center">
          <div className="text-4xl mb-3">📬</div>
          <h2 className="font-semibold text-[#1e2a38] mb-2">No conversions yet</h2>
          <p className="text-sm text-[#1e2a38]/50">
            When someone clicks a tracked link and reaches your thank you page, they'll appear here.
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

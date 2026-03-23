"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Campaign {
  id: string;
  name: string;
  destinationUrl: string;
  sourceType: string;
  createdAt: string;
  totalClicks: number;
  totalLeads: number;
  conversionRate: number;
  linkCount: number;
  member?: { fullName: string | null; email: string };
}

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  YOUTUBE:          { label: "YouTube",          color: "bg-red-100 text-red-700" },
  GOOGLE_ADS:       { label: "Google Ads",       color: "bg-blue-100 text-blue-700" },
  EMAIL:            { label: "Email",            color: "bg-green-100 text-green-700" },
  EMAIL_NEWSLETTER: { label: "Email Newsletter", color: "bg-amber-100 text-amber-700" },
  META_ADS:         { label: "Meta Ads",         color: "bg-indigo-100 text-indigo-700" },
  DIRECT_MAIL:      { label: "Direct Mail",      color: "bg-purple-100 text-purple-700" },
  BLOG_POSTS:       { label: "Blog Posts",       color: "bg-emerald-100 text-emerald-700" },
  OTHER:            { label: "Other",            color: "bg-gray-100 text-gray-600" },
};

export default function AdminCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((d) => { setCampaigns(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const totals = {
    campaigns: campaigns.length,
    clicks: campaigns.reduce((s, c) => s + c.totalClicks, 0),
    leads: campaigns.reduce((s, c) => s + c.totalLeads, 0),
  };

  const filtered = campaigns.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.member?.fullName ?? "").toLowerCase().includes(q) ||
      (c.member?.email ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1e2a38]">Campaigns</h1>
          <p className="text-sm text-[#1e2a38]/50 mt-0.5">Tracking campaigns across all members</p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total Campaigns", value: totals.campaigns },
          { label: "Total Clicks", value: totals.clicks },
          { label: "Total Leads", value: totals.leads },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-[#1e2a38]/10 rounded-2xl p-4 text-center">
            <div className="text-2xl font-bold text-[#1e2a38]">{s.value}</div>
            <div className="text-xs text-[#1e2a38]/40 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-[#1e2a38]/10 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1e2a38]/10">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by campaign name or member…"
            className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-[#3dc3ff]"
          />
        </div>

        {loading ? (
          <div className="p-10 text-center text-[#1e2a38]/40">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-[#1e2a38]/40">No campaigns found.</div>
        ) : (
          <div className="divide-y divide-[#1e2a38]/5">
            {filtered.map((c) => {
              const src = SOURCE_LABELS[c.sourceType] ?? SOURCE_LABELS.OTHER;
              const memberName = c.member?.fullName ?? c.member?.email ?? "—";
              return (
                <Link
                  key={c.id}
                  href={`/admin/campaigns/${c.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-[#f8f9fa] transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-medium text-[#1e2a38] truncate">{c.name}</p>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${src.color}`}>
                        {src.label}
                      </span>
                    </div>
                    <p className="text-xs text-[#1e2a38]/40">{memberName} · {c.linkCount} link{c.linkCount !== 1 ? "s" : ""}</p>
                  </div>
                  <div className="text-right text-sm flex-shrink-0">
                    <div className="text-[#1e2a38] font-semibold">{c.totalClicks} clicks</div>
                    <div className="text-[#3dc3ff] text-xs">{c.totalLeads} leads · {c.conversionRate}% conv</div>
                  </div>
                  <span className="text-[#1e2a38]/30 text-sm">›</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

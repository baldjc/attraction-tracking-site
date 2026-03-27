"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Campaign {
  id: string;
  name: string;
  destinationUrl: string;
  sourceType: string;
  createdAt: string;
  totalClicks: number;
  totalLeads: number;
  totalUniqueClicks: number;
  totalViews: number | null;
  conversionRate: number;
  linkCount: number;
  member?: { fullName: string | null; email: string };
  isOwn: boolean;
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
  const { data: session } = useSession();
  const router = useRouter();
  const pageRole = (session?.user as any)?.role;

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [memberFilter, setMemberFilter] = useState<"all" | "mine">("all");

  useEffect(() => {
    if (session && pageRole === "editor") router.replace("/admin");
  }, [session, pageRole, router]);

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

  const memberFiltered = memberFilter === "mine" ? campaigns.filter((c) => c.isOwn) : campaigns;
  const availableTypes = Array.from(new Set(memberFiltered.map((c) => c.sourceType)));

  const filtered = memberFiltered.filter((c) => {
    if (typeFilter !== "all" && c.sourceType !== typeFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.member?.fullName ?? "").toLowerCase().includes(q) ||
      (c.member?.email ?? "").toLowerCase().includes(q)
    );
  });

  if (pageRole === "editor") return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#2f3437]">Campaigns</h1>
          <p className="text-sm text-[#2f3437]/50 mt-0.5">Tracking campaigns across all members</p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total Campaigns", value: totals.campaigns },
          { label: "Total Clicks", value: totals.clicks },
          { label: "Total Leads", value: totals.leads },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-[#2f3437]/10 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-[#2f3437]">{s.value}</div>
            <div className="text-xs text-[#2f3437]/40 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-[#2f3437]/10 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-[#2f3437]/10 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setTypeFilter("all")}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${typeFilter === "all" ? "bg-[#111] text-white" : "bg-white border border-[#2f3437]/15 text-[#2f3437]/60 hover:text-[#2f3437]"}`}
              >
                All
              </button>
              {availableTypes.map((type) => {
                const src = SOURCE_LABELS[type] ?? SOURCE_LABELS.OTHER;
                return (
                  <button
                    key={type}
                    onClick={() => setTypeFilter(type)}
                    className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${typeFilter === type ? "bg-[#111] text-white" : "bg-white border border-[#2f3437]/15 text-[#2f3437]/60 hover:text-[#2f3437]"}`}
                  >
                    {src.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1 bg-[#111]/5 rounded-full p-0.5 flex-shrink-0">
              <button
                onClick={() => setMemberFilter("all")}
                className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${memberFilter === "all" ? "bg-white text-[#2f3437]" : "text-[#2f3437]/50 hover:text-[#2f3437]"}`}
              >
                All Members
              </button>
              <button
                onClick={() => setMemberFilter("mine")}
                className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${memberFilter === "mine" ? "bg-white text-[#2f3437]" : "text-[#2f3437]/50 hover:text-[#2f3437]"}`}
              >
                Mine
              </button>
            </div>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by campaign name or member…"
            className="w-full border border-[#2f3437]/20 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#0d9488]"
          />
        </div>

        {loading ? (
          <div className="p-10 text-center text-[#2f3437]/40">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-[#2f3437]/40">No campaigns found.</div>
        ) : (
          <div className="divide-y divide-[#2f3437]/5">
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
                      <p className="font-medium text-[#2f3437] truncate">{c.name}</p>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${src.color}`}>
                        {src.label}
                      </span>
                    </div>
                    <p className="text-xs text-[#2f3437]/40">{memberName} · {c.linkCount} link{c.linkCount !== 1 ? "s" : ""}</p>
                  </div>
                  <div className="text-right text-sm flex-shrink-0">
                    {c.sourceType === "EMAIL_NEWSLETTER" ? (
                      <>
                        <div className="text-[#2f3437] font-semibold">{c.totalClicks} clicks</div>
                        <div className="text-[#0d9488] text-xs">{c.totalUniqueClicks} unique</div>
                      </>
                    ) : c.sourceType === "YOUTUBE" ? (
                      <>
                        {c.totalViews !== null && (
                          <div className="text-[#2f3437] text-xs font-medium">{c.totalViews.toLocaleString()} views</div>
                        )}
                        <div className="text-[#2f3437] font-semibold">{c.totalClicks} clicks</div>
                        <div className="text-[#0d9488] text-xs">{c.totalLeads} leads · {c.conversionRate}% conv</div>
                      </>
                    ) : (
                      <>
                        <div className="text-[#2f3437] font-semibold">{c.totalClicks} clicks</div>
                        <div className="text-[#0d9488] text-xs">{c.totalLeads} leads · {c.conversionRate}% conv</div>
                      </>
                    )}
                  </div>
                  <span className="text-[#2f3437]/30 text-sm">›</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

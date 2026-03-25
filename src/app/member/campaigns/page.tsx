"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { TrashIcon, ArrowTrendingUpIcon, ArrowTrendingDownIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { MiniSparkline } from "@/components/charts/MiniSparkline";

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

interface AnalyticsSummary {
  totalClicks: number;
  totalLeads: number;
  conversionRate: number;
  previousConversionRate: number;
  sparkline: { date: string; clicks: number }[];
  leadsSparkline: { date: string; leads: number }[];
  topLink: { name: string; campaignName: string; leads: number } | null;
}

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  YOUTUBE:          { label: "YouTube",          color: "bg-red-100 text-red-700" },
  EMAIL_NEWSLETTER: { label: "Email Newsletter", color: "bg-amber-100 text-amber-700" },
  GOOGLE_ADS:       { label: "Google Ads",       color: "bg-blue-100 text-blue-700" },
  META_ADS:         { label: "Meta Ads",          color: "bg-indigo-100 text-indigo-700" },
  DIRECT_MAIL:      { label: "Direct Mail",       color: "bg-purple-100 text-purple-700" },
  BLOG_POSTS:       { label: "Blog Posts",        color: "bg-emerald-100 text-emerald-700" },
  OTHER:            { label: "Other",             color: "bg-gray-100 text-gray-600" },
};

const INPUT_CLS = "w-full border border-[#1e2a38]/20 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#3dc3ff]";

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", destinationUrl: "", sourceType: "YOUTUBE" });
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [memberFilter, setMemberFilter] = useState<"all" | "mine">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [hasTyUrl, setHasTyUrl] = useState<boolean | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    loadCampaigns();
    fetch("/api/campaigns/analytics?period=30d").then((r) => r.ok ? r.json() : null).then((d) => d && setAnalytics(d)).catch(() => {});
    fetch("/api/auth/session").then((r) => r.json()).then((s) => {
      if ((s?.user as { role?: string })?.role === "admin") setIsAdmin(true);
    }).catch(() => {});
    fetch("/api/member/profile").then((r) => r.ok ? r.json() : null).then((d) => {
      if (d) setHasTyUrl(!!d.thankYouPageUrl);
    }).catch(() => {});
  }, []);

  async function loadCampaigns() {
    setLoading(true);
    const res = await fetch("/api/campaigns");
    if (res.ok) setCampaigns(await res.json());
    setLoading(false);
  }

  async function createCampaign() {
    if (!form.name || !form.destinationUrl) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const campaign = await res.json();
        setShowModal(false);
        setForm({ name: "", destinationUrl: "", sourceType: "YOUTUBE" });
        window.location.href = `/member/campaigns/${campaign.id}`;
      } else {
        const data = await res.json().catch(() => ({}));
        setCreateError(data.error ?? `Server error (${res.status}) — please try again.`);
      }
    } catch {
      setCreateError("Network error — please check your connection and try again.");
    }
    setCreating(false);
  }

  async function deleteCampaign(id: string) {
    setDeletingId(id);
    await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    setCampaigns((prev) => prev.filter((c) => c.id !== id));
    setConfirmDeleteId(null);
    setDeletingId(null);
  }

  const confirmingName = campaigns.find((c) => c.id === confirmDeleteId)?.name ?? "";

  const memberFiltered = isAdmin && memberFilter === "mine" ? campaigns.filter((c) => c.isOwn) : campaigns;
  const availableTypes = Array.from(new Set(memberFiltered.map((c) => c.sourceType)));
  const visibleCampaigns = typeFilter === "all" ? memberFiltered : memberFiltered.filter((c) => c.sourceType === typeFilter);

  const convRateDelta = analytics ? analytics.conversionRate - analytics.previousConversionRate : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1e2a38]">Campaigns</h1>
          <p className="text-sm text-[#1e2a38]/50 mt-0.5">Track clicks and leads from your content</p>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-[#3dc3ff] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#3dc3ff]/90 transition-colors">
          + New Campaign
        </button>
      </div>

      {/* Thank You Page Warning */}
      {hasTyUrl === false && (
        <div className="mb-5 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">Link tracking isn&apos;t fully set up</p>
            <p className="text-xs text-amber-700 mt-0.5">Clicks are tracked but leads won&apos;t be recorded until you save your Thank You Page Path. <Link href="/member/link-tracking" className="underline font-medium">Go to Link Tracking Settings →</Link></p>
          </div>
        </div>
      )}

      {/* Summary Dashboard */}
      {analytics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {/* Total Clicks */}
          <Link href="/member/analytics?tab=overview" className="bg-white border border-[#1e2a38]/10 rounded-2xl p-4 hover:border-[#3dc3ff]/40 hover:shadow-sm transition-all block">
            <p className="text-xs text-[#1e2a38]/50 font-medium mb-1">Clicks (30d)</p>
            <p className="text-2xl font-bold text-[#1e2a38]">{analytics.totalClicks.toLocaleString()}</p>
            <div className="mt-2">
              <MiniSparkline data={analytics.sparkline.map((s) => ({ value: s.clicks }))} color="#3dc3ff" />
            </div>
          </Link>
          {/* Total Leads */}
          <Link href="/member/analytics?tab=conversions" className="bg-white border border-[#1e2a38]/10 rounded-2xl p-4 hover:border-[#3dc3ff]/40 hover:shadow-sm transition-all block">
            <p className="text-xs text-[#1e2a38]/50 font-medium mb-1">Leads (30d)</p>
            <p className="text-2xl font-bold text-[#1e2a38]">{analytics.totalLeads.toLocaleString()}</p>
            <div className="mt-2">
              <MiniSparkline data={(analytics.leadsSparkline ?? []).map((s) => ({ value: s.leads }))} color="#1e2a38" />
            </div>
          </Link>
          {/* Conversion Rate */}
          <Link href="/member/analytics?tab=overview" className="bg-white border border-[#1e2a38]/10 rounded-2xl p-4 hover:border-[#3dc3ff]/40 hover:shadow-sm transition-all block">
            <p className="text-xs text-[#1e2a38]/50 font-medium mb-1">Conv. Rate (30d)</p>
            <p className="text-2xl font-bold text-[#3dc3ff]">{analytics.conversionRate}%</p>
            {analytics.previousConversionRate > 0 && (
              <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${convRateDelta >= 0 ? "text-green-600" : "text-red-500"}`}>
                {convRateDelta >= 0
                  ? <ArrowTrendingUpIcon className="w-3.5 h-3.5" />
                  : <ArrowTrendingDownIcon className="w-3.5 h-3.5" />}
                {convRateDelta >= 0 ? "+" : ""}{convRateDelta}% vs prev period
              </div>
            )}
          </Link>
          {/* Top Performing Link */}
          <Link href="/member/analytics?tab=videos" className="bg-white border border-[#1e2a38]/10 rounded-2xl p-4 hover:border-[#3dc3ff]/40 hover:shadow-sm transition-all block">
            <p className="text-xs text-[#1e2a38]/50 font-medium mb-1">Top Link (30d)</p>
            {analytics.topLink ? (
              <>
                <p className="text-sm font-semibold text-[#1e2a38] leading-tight">{analytics.topLink.name}</p>
                <p className="text-xs text-[#1e2a38]/40 mt-0.5 truncate">{analytics.topLink.campaignName}</p>
                <p className="text-xs text-[#3dc3ff] font-semibold mt-1">{analytics.topLink.leads} lead{analytics.topLink.leads !== 1 ? "s" : ""}</p>
              </>
            ) : (
              <p className="text-sm text-[#1e2a38]/30 mt-1">No leads yet</p>
            )}
          </Link>
        </div>
      )}

      {/* Type filter + admin toggle row */}
      {campaigns.length > 0 && (
        <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setTypeFilter("all")}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${typeFilter === "all" ? "bg-[#1e2a38] text-white dark:bg-white dark:text-[#1e2a38]" : "bg-white dark:bg-white/10 border border-[#1e2a38]/15 dark:border-white/15 text-[#1e2a38]/60 dark:text-white/60 hover:text-[#1e2a38] dark:hover:text-white"}`}
            >
              All
            </button>
            {availableTypes.map((type) => {
              const src = SOURCE_LABELS[type] ?? SOURCE_LABELS.OTHER;
              return (
                <button
                  key={type}
                  onClick={() => setTypeFilter(type)}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${typeFilter === type ? "bg-[#1e2a38] text-white dark:bg-white dark:text-[#1e2a38]" : "bg-white dark:bg-white/10 border border-[#1e2a38]/15 dark:border-white/15 text-[#1e2a38]/60 dark:text-white/60 hover:text-[#1e2a38] dark:hover:text-white"}`}
                >
                  {src.label}
                </button>
              );
            })}
          </div>
          {isAdmin && (
            <div className="flex items-center gap-1 bg-[#1e2a38]/5 dark:bg-white/5 rounded-full p-0.5">
              <button
                onClick={() => setMemberFilter("all")}
                className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${memberFilter === "all" ? "bg-white dark:bg-[#242b3d] text-[#1e2a38] dark:text-white shadow-sm" : "text-[#1e2a38]/50 dark:text-white/50 hover:text-[#1e2a38] dark:hover:text-white"}`}
              >
                All Members
              </button>
              <button
                onClick={() => setMemberFilter("mine")}
                className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${memberFilter === "mine" ? "bg-white dark:bg-[#242b3d] text-[#1e2a38] dark:text-white shadow-sm" : "text-[#1e2a38]/50 dark:text-white/50 hover:text-[#1e2a38] dark:hover:text-white"}`}
              >
                Mine
              </button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-[#1e2a38]/40">Loading...</div>
      ) : campaigns.length === 0 ? (
        <div className="bg-white dark:bg-[#242b3d] border border-[#1e2a38]/10 dark:border-white/10 rounded-2xl p-12 text-center">
          <div className="text-4xl mb-3">🔗</div>
          <h2 className="font-semibold text-[#1e2a38] dark:text-white mb-2">No campaigns yet</h2>
          <p className="text-sm text-[#1e2a38]/50 dark:text-white/50 mb-5">Create a campaign for each lead magnet you want to track.</p>
          <button onClick={() => setShowModal(true)} className="bg-[#3dc3ff] text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#3dc3ff]/90 transition-colors">
            Create your first campaign
          </button>
        </div>
      ) : visibleCampaigns.length === 0 ? (
        <div className="bg-white dark:bg-[#242b3d] border border-[#1e2a38]/10 dark:border-white/10 rounded-2xl p-8 text-center">
          <p className="text-sm text-[#1e2a38]/50 dark:text-white/50">No {SOURCE_LABELS[typeFilter]?.label ?? ""} campaigns found.</p>
          <button onClick={() => setTypeFilter("all")} className="mt-3 text-xs text-[#3dc3ff] hover:underline">Clear filter</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleCampaigns.map((c) => {
            const src = SOURCE_LABELS[c.sourceType] ?? SOURCE_LABELS.OTHER;
            const memberName = c.member?.fullName || c.member?.email;
            return (
              <div key={c.id} className="relative group bg-white border border-[#1e2a38]/10 rounded-2xl hover:border-[#3dc3ff]/40 hover:shadow-sm transition-all">
                <Link href={`/member/campaigns/${c.id}`} className="block p-5">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <h3 className="font-semibold text-[#1e2a38]">{c.name}</h3>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${src.color}`}>{src.label}</span>
                  </div>
                  {isAdmin && memberName && <p className="text-xs text-[#3dc3ff]/80 mb-1 truncate">{memberName}</p>}
                  <p className="text-xs text-[#1e2a38]/40 truncate mb-4">{c.destinationUrl}</p>
                  {c.sourceType === "EMAIL_NEWSLETTER" ? (
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div>
                        <div className="text-lg font-bold text-[#1e2a38]">{c.totalClicks}</div>
                        <div className="text-xs text-[#1e2a38]/40">Clicks</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-[#3dc3ff]">{c.totalUniqueClicks}</div>
                        <div className="text-xs text-[#1e2a38]/40">Unique Clicks</div>
                      </div>
                    </div>
                  ) : c.sourceType === "YOUTUBE" ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
                      {c.totalViews !== null && (
                        <div>
                          <div className="text-lg font-bold text-[#1e2a38]">{c.totalViews.toLocaleString()}</div>
                          <div className="text-xs text-[#1e2a38]/40">Views</div>
                        </div>
                      )}
                      <div>
                        <div className="text-lg font-bold text-[#1e2a38]">{c.totalClicks}</div>
                        <div className="text-xs text-[#1e2a38]/40">Clicks</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-[#1e2a38]">{c.totalLeads}</div>
                        <div className="text-xs text-[#1e2a38]/40">Leads</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-[#3dc3ff]">{c.conversionRate}%</div>
                        <div className="text-xs text-[#1e2a38]/40">Conv. Rate</div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-lg font-bold text-[#1e2a38]">{c.totalClicks}</div>
                        <div className="text-xs text-[#1e2a38]/40">Clicks</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-[#1e2a38]">{c.totalLeads}</div>
                        <div className="text-xs text-[#1e2a38]/40">Leads</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-[#3dc3ff]">{c.conversionRate}%</div>
                        <div className="text-xs text-[#1e2a38]/40">Conv. Rate</div>
                      </div>
                    </div>
                  )}
                  <div className="mt-3 pt-3 border-t border-[#1e2a38]/5 text-xs text-[#1e2a38]/40">
                    {c.linkCount} tracking link{c.linkCount !== 1 ? "s" : ""}
                  </div>
                </Link>
                <button
                  onClick={(e) => { e.preventDefault(); setConfirmDeleteId(c.id); }}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-[#1e2a38]/20 hover:text-[#ff0033] p-1.5 rounded-lg hover:bg-[#ff0033]/5"
                  title="Delete campaign"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* New Campaign Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-[#1e2a38]/10 shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-[#1e2a38]">New Campaign</h2>
              <button onClick={() => { setShowModal(false); setCreateError(null); }} className="text-[#1e2a38]/40 hover:text-[#1e2a38] text-xl">✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[#1e2a38] mb-1.5">Campaign Name</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Free Home Valuation Guide" className={INPUT_CLS} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#1e2a38] mb-1.5">Destination URL</label>
                <input type="text" value={form.destinationUrl} onChange={(e) => setForm({ ...form, destinationUrl: e.target.value })} placeholder="https://yoursite.com/free-guide" className={INPUT_CLS} />
                <p className="text-xs text-[#1e2a38]/40 mt-1">The lead magnet or landing page URL</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#1e2a38] mb-1.5">Traffic Source</label>
                <select value={form.sourceType} onChange={(e) => setForm({ ...form, sourceType: e.target.value })} className={`${INPUT_CLS} bg-white`}>
                  <option value="YOUTUBE">YouTube</option>
                  <option value="EMAIL_NEWSLETTER">Email Newsletter</option>
                  <option value="GOOGLE_ADS">Google Ads</option>
                  <option value="META_ADS">Meta Ads</option>
                  <option value="DIRECT_MAIL">Direct Mail</option>
                  <option value="BLOG_POSTS">Blog Posts</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              {hasTyUrl === false && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                  <ExclamationTriangleIcon className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">Before this campaign can track leads, save your <Link href="/member/link-tracking" className="underline font-medium">Thank You Page Path</Link> in Link Tracking Settings.</p>
                </div>
              )}
              {createError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{createError}</p>
              )}
              <button onClick={createCampaign} disabled={creating || !form.name || !form.destinationUrl} className="w-full bg-[#3dc3ff] text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-[#3dc3ff]/90 disabled:opacity-50 transition-colors">
                {creating ? "Creating..." : "Create Campaign"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-[#1e2a38]/10 shadow-xl w-full max-w-sm p-6">
            <h2 className="font-bold text-[#1e2a38] mb-2">Delete Campaign?</h2>
            <p className="text-sm text-[#1e2a38]/60 mb-1">Delete <span className="font-semibold text-[#1e2a38]">{confirmingName}</span>?</p>
            <p className="text-xs text-[#1e2a38]/40 mb-5">Historical click and lead data will be preserved.</p>
            <div className="flex gap-3">
              <button onClick={() => deleteCampaign(confirmDeleteId)} disabled={!!deletingId} className="flex-1 bg-[#ff0033] text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-[#ff0033]/80 disabled:opacity-50 transition-colors">
                {deletingId ? "Deleting..." : "Delete"}
              </button>
              <button onClick={() => setConfirmDeleteId(null)} className="flex-1 border border-[#1e2a38]/20 text-[#1e2a38]/60 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

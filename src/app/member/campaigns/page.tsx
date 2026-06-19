"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { TrashIcon, ArrowTrendingUpIcon, ArrowTrendingDownIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { MiniSparkline } from "@/components/charts/MiniSparkline";
import { Button } from "@/components/ui/Button";
import Notice from "@/components/ui/Notice";

interface Campaign {
  id: string;
  name: string;
  destinationUrl: string;
  sourceType: string;
  linkSources: string[];
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

const LINK_SOURCE_STYLES: Record<string, { label: string; color: string }> = {
  youtube:    { label: "YouTube",    color: "bg-red-100 text-red-700" },
  linkedin:   { label: "LinkedIn",   color: "bg-[var(--abv-azure-tint)] text-[var(--abv-ink)]" },
  instagram:  { label: "Instagram",  color: "bg-pink-100 text-pink-700" },
  email:      { label: "Email",      color: "bg-teal-100 text-teal-700" },
  facebook:   { label: "Facebook",   color: "bg-[var(--abv-azure-tint-strong)] text-[var(--abv-ink)]" },
  google_ads: { label: "Google Ads", color: "bg-green-100 text-green-700" },
  blog:       { label: "Blog",       color: "bg-amber-100 text-amber-700" },
  other:      { label: "Other",      color: "bg-gray-100 text-gray-600" },
};

const INPUT_CLS = "w-full border border-[var(--abv-text)]/20 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[var(--abv-azure)]";

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", destinationUrl: "", leadMagnetUrl: "" });
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [hasTyUrl, setHasTyUrl] = useState<boolean | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    loadCampaigns();
    fetch("/api/campaigns/analytics?period=30d").then((r) => r.ok ? r.json() : null).then((d) => d && setAnalytics(d)).catch(() => {});
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
        setForm({ name: "", destinationUrl: "", leadMagnetUrl: "" });
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
  const convRateDelta = analytics ? analytics.conversionRate - analytics.previousConversionRate : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--abv-text)]">Campaigns</h1>
          <p className="text-sm text-[var(--abv-text)]/50 mt-0.5">Track clicks and leads from your content</p>
        </div>
        <Button onClick={() => setShowModal(true)}>+ New Campaign</Button>
      </div>

      {/* Thank You Page Warning */}
      {hasTyUrl === false && (
        <Notice
          variant="warning"
          className="mb-5"
          icon={<ExclamationTriangleIcon className="w-5 h-5" />}
          title="Link tracking isn't fully set up"
        >
          Clicks are tracked but leads won&apos;t be recorded until you save your Thank You Page Path. <Link href="/member/link-tracking" className="underline font-medium">Go to Link Tracking Settings →</Link>
        </Notice>
      )}

      {/* Summary Dashboard */}
      {analytics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <Link href="/member/analytics?tab=overview" className="bg-white border border-[var(--abv-text)]/10 rounded-lg p-4 hover:border-[var(--abv-azure)]/40 hover:shadow-sm transition-all block">
            <p className="text-xs text-[var(--abv-text)]/50 font-medium mb-1">Clicks (30d)</p>
            <p className="text-2xl font-bold text-[var(--abv-text)]">{analytics.totalClicks.toLocaleString()}</p>
            <div className="mt-2">
              <MiniSparkline data={analytics.sparkline.map((s) => ({ value: s.clicks }))} color="var(--abv-azure)" />
            </div>
          </Link>
          <Link href="/member/analytics?tab=conversions" className="bg-white border border-[var(--abv-text)]/10 rounded-lg p-4 hover:border-[var(--abv-azure)]/40 hover:shadow-sm transition-all block">
            <p className="text-xs text-[var(--abv-text)]/50 font-medium mb-1">Leads (30d)</p>
            <p className="text-2xl font-bold text-[var(--abv-text)]">{analytics.totalLeads.toLocaleString()}</p>
            <div className="mt-2">
              <MiniSparkline data={(analytics.leadsSparkline ?? []).map((s) => ({ value: s.leads }))} color="var(--abv-text)" />
            </div>
          </Link>
          <Link href="/member/analytics?tab=overview" className="bg-white border border-[var(--abv-text)]/10 rounded-lg p-4 hover:border-[var(--abv-azure)]/40 hover:shadow-sm transition-all block">
            <p className="text-xs text-[var(--abv-text)]/50 font-medium mb-1">Conv. Rate (30d)</p>
            <p className="text-2xl font-bold text-[var(--abv-azure)]">{analytics.conversionRate}%</p>
            {analytics.previousConversionRate > 0 && (
              <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${convRateDelta >= 0 ? "text-green-600" : "text-red-500"}`}>
                {convRateDelta >= 0
                  ? <ArrowTrendingUpIcon className="w-3.5 h-3.5" />
                  : <ArrowTrendingDownIcon className="w-3.5 h-3.5" />}
                {convRateDelta >= 0 ? "+" : ""}{convRateDelta}% vs prev period
              </div>
            )}
          </Link>
          <Link href="/member/analytics?tab=videos" className="bg-white border border-[var(--abv-text)]/10 rounded-lg p-4 hover:border-[var(--abv-azure)]/40 hover:shadow-sm transition-all block">
            <p className="text-xs text-[var(--abv-text)]/50 font-medium mb-1">Top Link (30d)</p>
            {analytics.topLink ? (
              <>
                <p className="text-sm font-semibold text-[var(--abv-text)] leading-tight">{analytics.topLink.name}</p>
                <p className="text-xs text-[var(--abv-text)]/40 mt-0.5 truncate">{analytics.topLink.campaignName}</p>
                <p className="text-xs text-[var(--abv-azure)] font-semibold mt-1">{analytics.topLink.leads} lead{analytics.topLink.leads !== 1 ? "s" : ""}</p>
              </>
            ) : (
              <p className="text-sm text-[var(--abv-text)]/30 mt-1">No leads yet</p>
            )}
          </Link>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-[var(--abv-text)]/40">Loading...</div>
      ) : campaigns.length === 0 ? (
        <div className="bg-white dark:bg-[#1a1a1a] border border-[var(--abv-text)]/10 dark:border-white/10 rounded-lg p-12 text-center">
          <div className="text-4xl mb-3">🔗</div>
          <h2 className="font-semibold text-[var(--abv-text)] dark:text-white mb-2">No campaigns yet</h2>
          <p className="text-sm text-[var(--abv-text)]/50 dark:text-white/50 mb-5">Create a campaign for each lead magnet you want to track.</p>
          <Button onClick={() => setShowModal(true)}>Create your first campaign</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {campaigns.map((c) => {
            const memberName = c.member?.fullName || c.member?.email;
            const sources = Array.from(new Set(c.linkSources ?? []));
            return (
              <div key={c.id} className="relative group bg-white border border-[var(--abv-text)]/10 rounded-lg hover:border-[var(--abv-azure)]/40 hover:shadow-sm transition-all">
                <Link href={`/member/campaigns/${c.id}`} className="block p-5">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <h3 className="font-semibold text-[var(--abv-text)]">{c.name}</h3>
                    {sources.length > 0 && (
                      <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
                        {sources.map((s) => {
                          const style = LINK_SOURCE_STYLES[s] ?? LINK_SOURCE_STYLES.other;
                          return <span key={s} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${style.color}`}>{style.label}</span>;
                        })}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-[var(--abv-text)]/40 truncate mb-4">{c.destinationUrl}</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
                    {c.totalViews !== null && (
                      <div>
                        <div className="text-lg font-bold text-[var(--abv-text)]">{c.totalViews.toLocaleString()}</div>
                        <div className="text-xs text-[var(--abv-text)]/40">Views</div>
                      </div>
                    )}
                    <div>
                      <div className="text-lg font-bold text-[var(--abv-text)]">{c.totalClicks}</div>
                      <div className="text-xs text-[var(--abv-text)]/40">Clicks</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-[var(--abv-text)]">{c.totalLeads}</div>
                      <div className="text-xs text-[var(--abv-text)]/40">Leads</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-[var(--abv-azure)]">{c.conversionRate}%</div>
                      <div className="text-xs text-[var(--abv-text)]/40">Conv. Rate</div>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-[var(--abv-text)]/5 flex items-center justify-between text-xs text-[var(--abv-text)]/40">
                    <span>{c.linkCount} tracking link{c.linkCount !== 1 ? "s" : ""}</span>
                    {memberName && <span className="truncate ml-2">{memberName}</span>}
                  </div>
                </Link>
                <button
                  onClick={(e) => { e.preventDefault(); setConfirmDeleteId(c.id); }}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-[var(--abv-text)]/20 hover:text-[var(--abv-crimson)] p-1.5 rounded-lg hover:bg-[var(--abv-crimson)]/5"
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-[var(--abv-text)]/10 shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-[var(--abv-text)]">New Campaign</h2>
              <button onClick={() => { setShowModal(false); setCreateError(null); }} className="text-[var(--abv-text)]/40 hover:text-[var(--abv-text)] text-xl">✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[var(--abv-text)] mb-1.5">Campaign Name</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Free Home Valuation Guide" className={INPUT_CLS} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[var(--abv-text)] mb-1.5">Destination URL</label>
                <input type="text" value={form.destinationUrl} onChange={(e) => setForm({ ...form, destinationUrl: e.target.value })} placeholder="https://yoursite.com/free-guide" className={INPUT_CLS} />
                <p className="text-xs text-[var(--abv-text)]/40 mt-1">The lead magnet or landing page URL</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[var(--abv-text)] mb-1.5">Lead Magnet URL <span className="font-normal text-[var(--abv-text)]/40">(optional)</span></label>
                <input type="url" value={form.leadMagnetUrl} onChange={(e) => setForm({ ...form, leadMagnetUrl: e.target.value })} placeholder="e.g., Google Drive link to your guide" className={INPUT_CLS} />
              </div>
              {hasTyUrl === false && (
                <Notice variant="warning" icon={<ExclamationTriangleIcon className="w-4 h-4" />}>
                  Before this campaign can track leads, save your <Link href="/member/link-tracking" className="underline font-medium">Thank You Page Path</Link> in Link Tracking Settings.
                </Notice>
              )}
              {createError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{createError}</p>
              )}
              <Button onClick={createCampaign} disabled={creating || !form.name || !form.destinationUrl} fullWidth>
                {creating ? "Creating..." : "Create Campaign"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-[var(--abv-text)]/10 shadow-xl w-full max-w-sm p-6">
            <h2 className="font-bold text-[var(--abv-text)] mb-2">Delete Campaign?</h2>
            <p className="text-sm text-[var(--abv-text)]/60 mb-1">Delete <span className="font-semibold text-[var(--abv-text)]">{confirmingName}</span>?</p>
            <p className="text-xs text-[var(--abv-text)]/40 mb-5">Historical click and lead data will be preserved.</p>
            <div className="flex gap-3">
              <Button variant="danger" onClick={() => deleteCampaign(confirmDeleteId)} disabled={!!deletingId} className="flex-1">
                {deletingId ? "Deleting..." : "Delete"}
              </Button>
              <Button variant="outline" onClick={() => setConfirmDeleteId(null)} className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

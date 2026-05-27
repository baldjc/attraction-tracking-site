"use client";

import { useState, useEffect, use, useCallback } from "react";
import Link from "next/link";
import { DailyLineChart, ChartEmpty } from "@/components/charts/DailyLineChart";
import ClickMap from "@/components/campaigns/ClickMap";
import LocationTable from "@/components/campaigns/LocationTable";

interface TrackingLinkData {
  id: string;
  name: string;
  refCode: string;
  trackedUrl: string;
  youtubeVideoUrl: string | null;
  youtubeVideoId: string | null;
  youtubeThumbnailUrl: string | null;
  youtubeViewCount: number;
  createdAt: string;
  clicks: number;
  leads: number;
  conversionRate: number;
}

interface CampaignData {
  id: string;
  name: string;
  destinationUrl: string;
  sourceType: string;
  createdAt: string;
  description: string | null;
  pitchOneLiner: string | null;
  audience: string | null;
  member?: { fullName: string | null; email: string };
  links: TrackingLinkData[];
  totalViews: number | null;
  totalClicks: number;
  totalLeads: number;
  totalUniqueClicks: number;
  hasYoutube: boolean;
}

interface GeoLocation {
  city: string;
  province: string | null;
  country: string | null;
  neighbourhood: string | null;
  count: number;
}

interface GeoMarker {
  city: string;
  province: string | null;
  country: string | null;
  count: number;
}

interface GeoClickData {
  locations: GeoLocation[];
  markers: GeoMarker[];
  isEmail: boolean;
  links: { id: string; name: string }[];
}

interface AnalyticsData {
  daily: { date: string; clicks: number; leads: number }[];
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

const PERIODS = [
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" },
  { label: "All", value: "all" },
];

export default function AdminCampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [campaign, setCampaign] = useState<CampaignData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  const [editForm, setEditForm] = useState({ description: "", pitchOneLiner: "", audience: "" });
  const [editDirty, setEditDirty] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editSavedAt, setEditSavedAt] = useState<number | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const [period, setPeriod] = useState("30d");
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  const [geoData, setGeoData] = useState<GeoClickData | null>(null);
  const [geoLinkFilter, setGeoLinkFilter] = useState<string>("all");

  const loadGeoData = useCallback(async (linkId?: string) => {
    const qs = linkId && linkId !== "all" ? `?linkId=${linkId}` : "";
    const res = await fetch(`/api/campaigns/${id}/geo-clicks${qs}`);
    if (res.ok) setGeoData(await res.json());
  }, [id]);

  const loadAnalytics = useCallback(async (p: string) => {
    setAnalyticsLoading(true);
    const res = await fetch(`/api/campaigns/${id}/analytics?period=${p}`);
    if (res.ok) setAnalytics(await res.json());
    setAnalyticsLoading(false);
  }, [id]);

  useEffect(() => {
    fetch(`/api/campaigns/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setCampaign(d);
        setEditForm({
          description: d.description ?? "",
          pitchOneLiner: d.pitchOneLiner ?? "",
          audience: d.audience ?? "",
        });
        setEditDirty(false);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    loadGeoData();
  }, [id, loadGeoData]);

  async function saveLeadMagnetEdits() {
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Save failed" }));
        throw new Error(body.error || "Save failed");
      }
      setEditDirty(false);
      setEditSavedAt(Date.now());
      setCampaign((c) => (c ? { ...c, ...editForm } : c));
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setEditSaving(false);
    }
  }

  useEffect(() => { loadAnalytics(period); }, [period, loadAnalytics]);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  if (loading) return <div className="text-center py-16 text-[var(--abv-text)]/40">Loading...</div>;
  if (!campaign) return <div className="text-center py-16 text-[var(--abv-text)]/40">Campaign not found.</div>;

  const src = SOURCE_LABELS[campaign.sourceType] ?? SOURCE_LABELS.OTHER;
  const memberName = campaign.member?.fullName ?? campaign.member?.email ?? "—";
  const isEmailNewsletter = campaign.sourceType === "EMAIL_NEWSLETTER";
  const isYoutube = campaign.sourceType === "YOUTUBE";
  const convRate = campaign.totalClicks > 0
    ? Math.round((campaign.totalLeads / campaign.totalClicks) * 100)
    : 0;

  const hasAnalyticsData = analytics && analytics.daily.some((d) => d.clicks > 0 || d.leads > 0);
  const filteredMarkers = geoData?.markers ?? [];
  const filteredLocations = geoData?.locations ?? [];

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <Link href="/admin/campaigns" className="text-sm text-[var(--abv-text)]/40 hover:text-[var(--abv-text)] transition-colors">
          ← Campaigns
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-[var(--abv-text)]">{campaign.name}</h1>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${src.color}`}>{src.label}</span>
          </div>
          <p className="text-sm text-[var(--abv-text)]/50">
            Member: <span className="text-[var(--abv-text)]/80">{memberName}</span>
            {campaign.member?.email && campaign.member.fullName && (
              <> · <span className="text-[var(--abv-text)]/40">{campaign.member.email}</span></>
            )}
          </p>
          <a
            href={campaign.destinationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[var(--abv-azure)] hover:underline"
          >
            {campaign.destinationUrl}
          </a>
        </div>
      </div>

      {/* Lead-magnet detail — feeds the Script Builder so it can write
          an on-brand pitch instead of inventing generic language from
          the campaign name alone. */}
      <div className="bg-white border border-[var(--abv-text)]/10 rounded-lg p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-[var(--abv-text)]">Lead-magnet detail</h2>
            <p className="text-xs text-[var(--abv-text)]/50 mt-0.5">
              Fed verbatim to the Script Builder. Leave blank only if the campaign isn't a lead magnet.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {editSavedAt && !editDirty && !editSaving && (
              <span className="text-xs text-emerald-600">Saved</span>
            )}
            {editError && (
              <span className="text-xs text-red-600">{editError}</span>
            )}
            <button
              type="button"
              onClick={saveLeadMagnetEdits}
              disabled={!editDirty || editSaving}
              className="text-xs font-medium px-3 py-1.5 rounded-full bg-[#111] text-white disabled:bg-[var(--abv-text)]/20 disabled:cursor-not-allowed"
            >
              {editSaving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wider font-semibold text-[var(--abv-text)]/55">
            What it is
          </label>
          <textarea
            value={editForm.description}
            onChange={(e) => {
              setEditForm((f) => ({ ...f, description: e.target.value }));
              setEditDirty(true);
            }}
            rows={2}
            placeholder='e.g. "Monthly Calgary real estate market stats report covering detached / condo / townhome MOI, days on market, sale-to-list ratios, broken down by zone."'
            className="mt-1 w-full text-sm border border-[var(--abv-text)]/15 rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--abv-azure)]"
          />
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wider font-semibold text-[var(--abv-text)]/55">
            One-line pitch <span className="text-[var(--abv-text)]/40 normal-case font-normal">(used verbatim in [LEAD MAGNET] placements)</span>
          </label>
          <textarea
            value={editForm.pitchOneLiner}
            onChange={(e) => {
              setEditForm((f) => ({ ...f, pitchOneLiner: e.target.value }));
              setEditDirty(true);
            }}
            rows={2}
            placeholder='e.g. "Get the same monthly market data agents use to advise their clients — including which zones are tightening and which have buyer leverage."'
            className="mt-1 w-full text-sm border border-[var(--abv-text)]/15 rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--abv-azure)]"
          />
          {!editForm.pitchOneLiner.trim() && (
            <p className="mt-1 text-[11px] italic text-amber-700">
              Without a one-line pitch, the Script Builder falls back to writing from the description (or invents a generic pitch from the name). Highly recommended for any lead magnet you want pitched on-brand.
            </p>
          )}
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wider font-semibold text-[var(--abv-text)]/55">
            Audience
          </label>
          <input
            value={editForm.audience}
            onChange={(e) => {
              setEditForm((f) => ({ ...f, audience: e.target.value }));
              setEditDirty(true);
            }}
            placeholder='e.g. "Calgary families considering when to buy or sell"'
            className="mt-1 w-full text-sm border border-[var(--abv-text)]/15 rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--abv-azure)]"
          />
        </div>
      </div>

      {/* Stats Bar — source-type-aware */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {isEmailNewsletter ? (
          <>
            <div className="bg-white border border-[var(--abv-text)]/10 rounded-lg p-4 text-center">
              <div className="text-xl font-bold text-[var(--abv-text)]">{campaign.totalClicks.toLocaleString()}</div>
              <div className="text-xs text-[var(--abv-text)]/40 mt-0.5">Clicks</div>
            </div>
            <div className="bg-white border border-[var(--abv-text)]/10 rounded-lg p-4 text-center">
              <div className="text-xl font-bold text-[var(--abv-azure)]">{campaign.totalUniqueClicks.toLocaleString()}</div>
              <div className="text-xs text-[var(--abv-text)]/40 mt-0.5">Unique Clicks</div>
            </div>
          </>
        ) : isYoutube ? (
          <>
            {campaign.totalViews !== null && (
              <div className="bg-white border border-[var(--abv-text)]/10 rounded-lg p-4 text-center">
                <div className="text-xl font-bold text-[var(--abv-text)]">{campaign.totalViews.toLocaleString()}</div>
                <div className="text-xs text-[var(--abv-text)]/40 mt-0.5">Views</div>
              </div>
            )}
            <div className="bg-white border border-[var(--abv-text)]/10 rounded-lg p-4 text-center">
              <div className="text-xl font-bold text-[var(--abv-text)]">{campaign.totalClicks.toLocaleString()}</div>
              <div className="text-xs text-[var(--abv-text)]/40 mt-0.5">Clicks</div>
            </div>
            <div className="bg-white border border-[var(--abv-text)]/10 rounded-lg p-4 text-center">
              <div className="text-xl font-bold text-[var(--abv-text)]">{campaign.totalLeads.toLocaleString()}</div>
              <div className="text-xs text-[var(--abv-text)]/40 mt-0.5">Leads</div>
            </div>
            <div className="bg-white border border-[var(--abv-text)]/10 rounded-lg p-4 text-center">
              <div className="text-xl font-bold text-[var(--abv-azure)]">{convRate}%</div>
              <div className="text-xs text-[var(--abv-text)]/40 mt-0.5">Conversion Rate</div>
            </div>
          </>
        ) : (
          <>
            <div className="bg-white border border-[var(--abv-text)]/10 rounded-lg p-4 text-center">
              <div className="text-xl font-bold text-[var(--abv-text)]">{campaign.totalClicks.toLocaleString()}</div>
              <div className="text-xs text-[var(--abv-text)]/40 mt-0.5">Clicks</div>
            </div>
            <div className="bg-white border border-[var(--abv-text)]/10 rounded-lg p-4 text-center">
              <div className="text-xl font-bold text-[var(--abv-text)]">{campaign.totalLeads.toLocaleString()}</div>
              <div className="text-xs text-[var(--abv-text)]/40 mt-0.5">Leads</div>
            </div>
            <div className="bg-white border border-[var(--abv-text)]/10 rounded-lg p-4 text-center">
              <div className="text-xl font-bold text-[var(--abv-azure)]">{convRate}%</div>
              <div className="text-xs text-[var(--abv-text)]/40 mt-0.5">Conversion Rate</div>
            </div>
          </>
        )}
      </div>

      {/* Analytics Chart */}
      <div className="bg-white border border-[var(--abv-text)]/10 rounded-lg p-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-[var(--abv-text)]">Analytics</h2>
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${period === p.value ? "bg-[#111] text-white" : "text-[var(--abv-text)]/50 hover:text-[var(--abv-text)]"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {analyticsLoading ? (
          <div className="h-[220px] bg-[#111]/5 rounded-lg animate-pulse" />
        ) : !hasAnalyticsData ? (
          <ChartEmpty />
        ) : (
          <div>
            <p className="text-xs font-medium text-[var(--abv-text)]/50 mb-3">
              {isEmailNewsletter ? "Clicks Per Day" : "Clicks & Leads Per Day"}
            </p>
            <DailyLineChart data={analytics!.daily} hideLeads={isEmailNewsletter} />
          </div>
        )}
      </div>

      {/* Click Map + Location Table */}
      <div className="relative z-0 bg-white border border-[var(--abv-text)]/10 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-[var(--abv-text)]">Click Map</h2>
          {geoData && geoData.links.length > 1 && (
            <select
              value={geoLinkFilter}
              onChange={(e) => {
                const val = e.target.value;
                setGeoLinkFilter(val);
                loadGeoData(val === "all" ? undefined : val);
              }}
              className="text-xs border border-[var(--abv-text)]/20 rounded-lg px-2 py-1.5 text-[var(--abv-text)]/60 focus:outline-none"
            >
              <option value="all">All Links</option>
              {geoData.links.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          )}
        </div>
        <ClickMap markers={filteredMarkers} height={400} />
        <div className="mt-5 border-t border-[var(--abv-text)]/10 pt-4">
          <h3 className="text-sm font-semibold text-[var(--abv-text)] mb-3">Location Breakdown</h3>
          <LocationTable locations={filteredLocations} isEmail={isEmailNewsletter} />
        </div>
      </div>

      {/* Tracking Links */}
      <div className="bg-white border border-[var(--abv-text)]/10 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--abv-text)]/10">
          <h2 className="font-semibold text-[var(--abv-text)]">Tracking Links ({campaign.links.length})</h2>
        </div>
        {campaign.links.length === 0 ? (
          <div className="p-10 text-center text-[var(--abv-text)]/40 text-sm">No tracking links yet.</div>
        ) : (
          <div className="divide-y divide-[var(--abv-text)]/5">
            {campaign.links.map((link) => (
              <div key={link.id} className="p-5">
                <div className="flex items-start gap-3">
                  {link.youtubeThumbnailUrl && (
                    <img
                      src={link.youtubeThumbnailUrl}
                      alt={link.name}
                      className="w-20 h-14 object-cover rounded-lg flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[var(--abv-text)] text-sm">{link.name}</p>
                    <div className="mt-2 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold text-[var(--abv-text)]/40 uppercase tracking-wide w-16 flex-shrink-0">Direct</span>
                        <p className="text-xs text-[var(--abv-text)]/50 truncate flex-1 font-mono">{link.trackedUrl}</p>
                        <button onClick={() => copy(link.trackedUrl, `${link.id}-direct`)} className="text-xs text-[var(--abv-azure)] hover:text-[#2bb0ec] flex-shrink-0 font-medium">
                          {copied === `${link.id}-direct` ? "Copied!" : "Copy"}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold text-[var(--abv-text)]/40 uppercase tracking-wide w-16 flex-shrink-0">Short</span>
                        <p className="text-xs text-[var(--abv-text)]/50 truncate flex-1 font-mono">https://members.attractionbyvideo.com/r/{link.refCode}</p>
                        <button onClick={() => copy(`https://members.attractionbyvideo.com/r/${link.refCode}`, `${link.id}-short`)} className="text-xs text-[var(--abv-azure)] hover:text-[#2bb0ec] flex-shrink-0 font-medium">
                          {copied === `${link.id}-short` ? "Copied!" : "Copy"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-3 text-center">
                  {link.youtubeVideoId && (
                    <div>
                      <div className="text-sm font-semibold text-[var(--abv-text)]">{link.youtubeViewCount.toLocaleString()}</div>
                      <div className="text-xs text-[var(--abv-text)]/40">Views</div>
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-semibold text-[var(--abv-text)]">{link.clicks}</div>
                    <div className="text-xs text-[var(--abv-text)]/40">Clicks</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[var(--abv-text)]">{link.leads}</div>
                    <div className="text-xs text-[var(--abv-text)]/40">Leads</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[var(--abv-azure)]">{link.conversionRate}%</div>
                    <div className="text-xs text-[var(--abv-text)]/40">Conv. Rate</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

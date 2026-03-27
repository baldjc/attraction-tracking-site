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
      .then((d) => { setCampaign(d); setLoading(false); })
      .catch(() => setLoading(false));
    loadGeoData();
  }, [id, loadGeoData]);

  useEffect(() => { loadAnalytics(period); }, [period, loadAnalytics]);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  if (loading) return <div className="text-center py-16 text-[#2f3437]/40">Loading...</div>;
  if (!campaign) return <div className="text-center py-16 text-[#2f3437]/40">Campaign not found.</div>;

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
        <Link href="/admin/campaigns" className="text-sm text-[#2f3437]/40 hover:text-[#2f3437] transition-colors">
          ← Campaigns
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-[#2f3437]">{campaign.name}</h1>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${src.color}`}>{src.label}</span>
          </div>
          <p className="text-sm text-[#2f3437]/50">
            Member: <span className="text-[#2f3437]/80">{memberName}</span>
            {campaign.member?.email && campaign.member.fullName && (
              <> · <span className="text-[#2f3437]/40">{campaign.member.email}</span></>
            )}
          </p>
          <a
            href={campaign.destinationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[#6ba3c7] hover:underline"
          >
            {campaign.destinationUrl}
          </a>
        </div>
      </div>

      {/* Stats Bar — source-type-aware */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {isEmailNewsletter ? (
          <>
            <div className="bg-white border border-[#2f3437]/10 rounded-lg p-4 text-center">
              <div className="text-xl font-bold text-[#2f3437]">{campaign.totalClicks.toLocaleString()}</div>
              <div className="text-xs text-[#2f3437]/40 mt-0.5">Clicks</div>
            </div>
            <div className="bg-white border border-[#2f3437]/10 rounded-lg p-4 text-center">
              <div className="text-xl font-bold text-[#6ba3c7]">{campaign.totalUniqueClicks.toLocaleString()}</div>
              <div className="text-xs text-[#2f3437]/40 mt-0.5">Unique Clicks</div>
            </div>
          </>
        ) : isYoutube ? (
          <>
            {campaign.totalViews !== null && (
              <div className="bg-white border border-[#2f3437]/10 rounded-lg p-4 text-center">
                <div className="text-xl font-bold text-[#2f3437]">{campaign.totalViews.toLocaleString()}</div>
                <div className="text-xs text-[#2f3437]/40 mt-0.5">Views</div>
              </div>
            )}
            <div className="bg-white border border-[#2f3437]/10 rounded-lg p-4 text-center">
              <div className="text-xl font-bold text-[#2f3437]">{campaign.totalClicks.toLocaleString()}</div>
              <div className="text-xs text-[#2f3437]/40 mt-0.5">Clicks</div>
            </div>
            <div className="bg-white border border-[#2f3437]/10 rounded-lg p-4 text-center">
              <div className="text-xl font-bold text-[#2f3437]">{campaign.totalLeads.toLocaleString()}</div>
              <div className="text-xs text-[#2f3437]/40 mt-0.5">Leads</div>
            </div>
            <div className="bg-white border border-[#2f3437]/10 rounded-lg p-4 text-center">
              <div className="text-xl font-bold text-[#6ba3c7]">{convRate}%</div>
              <div className="text-xs text-[#2f3437]/40 mt-0.5">Conversion Rate</div>
            </div>
          </>
        ) : (
          <>
            <div className="bg-white border border-[#2f3437]/10 rounded-lg p-4 text-center">
              <div className="text-xl font-bold text-[#2f3437]">{campaign.totalClicks.toLocaleString()}</div>
              <div className="text-xs text-[#2f3437]/40 mt-0.5">Clicks</div>
            </div>
            <div className="bg-white border border-[#2f3437]/10 rounded-lg p-4 text-center">
              <div className="text-xl font-bold text-[#2f3437]">{campaign.totalLeads.toLocaleString()}</div>
              <div className="text-xs text-[#2f3437]/40 mt-0.5">Leads</div>
            </div>
            <div className="bg-white border border-[#2f3437]/10 rounded-lg p-4 text-center">
              <div className="text-xl font-bold text-[#6ba3c7]">{convRate}%</div>
              <div className="text-xs text-[#2f3437]/40 mt-0.5">Conversion Rate</div>
            </div>
          </>
        )}
      </div>

      {/* Analytics Chart */}
      <div className="bg-white border border-[#2f3437]/10 rounded-lg p-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-[#2f3437]">Analytics</h2>
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${period === p.value ? "bg-[#111] text-white" : "text-[#2f3437]/50 hover:text-[#2f3437]"}`}
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
            <p className="text-xs font-medium text-[#2f3437]/50 mb-3">
              {isEmailNewsletter ? "Clicks Per Day" : "Clicks & Leads Per Day"}
            </p>
            <DailyLineChart data={analytics!.daily} hideLeads={isEmailNewsletter} />
          </div>
        )}
      </div>

      {/* Click Map + Location Table */}
      <div className="bg-white border border-[#2f3437]/10 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-[#2f3437]">Click Map</h2>
          {geoData && geoData.links.length > 1 && (
            <select
              value={geoLinkFilter}
              onChange={(e) => {
                const val = e.target.value;
                setGeoLinkFilter(val);
                loadGeoData(val === "all" ? undefined : val);
              }}
              className="text-xs border border-[#2f3437]/20 rounded-lg px-2 py-1.5 text-[#2f3437]/60 focus:outline-none"
            >
              <option value="all">All Links</option>
              {geoData.links.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          )}
        </div>
        <ClickMap markers={filteredMarkers} height={400} />
        <div className="mt-5 border-t border-[#2f3437]/10 pt-4">
          <h3 className="text-sm font-semibold text-[#2f3437] mb-3">Location Breakdown</h3>
          <LocationTable locations={filteredLocations} isEmail={isEmailNewsletter} />
        </div>
      </div>

      {/* Tracking Links */}
      <div className="bg-white border border-[#2f3437]/10 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-[#2f3437]/10">
          <h2 className="font-semibold text-[#2f3437]">Tracking Links ({campaign.links.length})</h2>
        </div>
        {campaign.links.length === 0 ? (
          <div className="p-10 text-center text-[#2f3437]/40 text-sm">No tracking links yet.</div>
        ) : (
          <div className="divide-y divide-[#2f3437]/5">
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
                    <p className="font-medium text-[#2f3437] text-sm">{link.name}</p>
                    <div className="mt-2 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold text-[#2f3437]/40 uppercase tracking-wide w-16 flex-shrink-0">Direct</span>
                        <p className="text-xs text-[#2f3437]/50 truncate flex-1 font-mono">{link.trackedUrl}</p>
                        <button onClick={() => copy(link.trackedUrl, `${link.id}-direct`)} className="text-xs text-[#6ba3c7] hover:text-[#2bb0ec] flex-shrink-0 font-medium">
                          {copied === `${link.id}-direct` ? "Copied!" : "Copy"}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold text-[#2f3437]/40 uppercase tracking-wide w-16 flex-shrink-0">Short</span>
                        <p className="text-xs text-[#2f3437]/50 truncate flex-1 font-mono">https://members.attractionbyvideo.com/r/{link.refCode}</p>
                        <button onClick={() => copy(`https://members.attractionbyvideo.com/r/${link.refCode}`, `${link.id}-short`)} className="text-xs text-[#6ba3c7] hover:text-[#2bb0ec] flex-shrink-0 font-medium">
                          {copied === `${link.id}-short` ? "Copied!" : "Copy"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-3 text-center">
                  {link.youtubeVideoId && (
                    <div>
                      <div className="text-sm font-semibold text-[#2f3437]">{link.youtubeViewCount.toLocaleString()}</div>
                      <div className="text-xs text-[#2f3437]/40">Views</div>
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-semibold text-[#2f3437]">{link.clicks}</div>
                    <div className="text-xs text-[#2f3437]/40">Clicks</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[#2f3437]">{link.leads}</div>
                    <div className="text-xs text-[#2f3437]/40">Leads</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[#6ba3c7]">{link.conversionRate}%</div>
                    <div className="text-xs text-[#2f3437]/40">Conv. Rate</div>
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

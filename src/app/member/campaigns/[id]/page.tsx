"use client";

import { useState, useEffect, use, useCallback } from "react";
import Link from "next/link";
import { PencilIcon, ArrowPathIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { DailyLineChart, ChartEmpty } from "@/components/charts/DailyLineChart";
import { LinkBarChart } from "@/components/charts/LinkBarChart";
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
  youtubeViewsUpdatedAt: string | null;
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
  links: TrackingLinkData[];
  totalViews: number | null;
  totalClicks: number;
  totalLeads: number;
  totalUniqueClicks: number;
  hasYoutube: boolean;
  lastViewsUpdate: string | null;
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
  byLink: { linkId: string; name: string; clicks: number; leads: number; youtubeViews: number | null }[];
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

const PERIODS = [
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" },
  { label: "All", value: "all" },
];

const INPUT_CLS = "w-full border border-[#2f3437]/20 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#6ba3c7]";

function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname === "youtu.be") return u.pathname.slice(1).split("?")[0] || null;
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v");
  } catch { /* empty */ }
  const m = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function ChartSkeleton() {
  return <div className="h-[220px] bg-[#111]/5 rounded-lg animate-pulse" />;
}

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [campaign, setCampaign] = useState<CampaignData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasTyUrl, setHasTyUrl] = useState<boolean | null>(null);

  // Analytics
  const [period, setPeriod] = useState("30d");
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  // New link modal
  const [showNewLink, setShowNewLink] = useState(false);
  const [linkForm, setLinkForm] = useState({ name: "", youtubeVideoUrl: "" });
  const [creating, setCreating] = useState(false);
  const [fetchingYtInfo, setFetchingYtInfo] = useState(false);
  const [previewThumb, setPreviewThumb] = useState<string | null>(null);
  const [nameTouchedNew, setNameTouchedNew] = useState(false);

  // Edit link modal
  const [editingLink, setEditingLink] = useState<TrackingLinkData | null>(null);
  const [editForm, setEditForm] = useState({ name: "", youtubeVideoUrl: "" });
  const [saving, setSaving] = useState(false);
  const [fetchingYtEdit, setFetchingYtEdit] = useState(false);
  const [editPreviewThumb, setEditPreviewThumb] = useState<string | null>(null);
  const [nameTouchedEdit, setNameTouchedEdit] = useState(false);

  // Geo clicks
  const [geoData, setGeoData] = useState<GeoClickData | null>(null);
  const [geoLinkFilter, setGeoLinkFilter] = useState<string>("all");

  const [copied, setCopied] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState("newest");
  const [refreshing, setRefreshing] = useState(false);
  const [resetConfirmLink, setResetConfirmLink] = useState<TrackingLinkData | null>(null);
  const [resetting, setResetting] = useState(false);

  // Edit campaign
  const [showEditCampaign, setShowEditCampaign] = useState(false);
  const [campaignEditForm, setCampaignEditForm] = useState({ name: "", destinationUrl: "", sourceType: "" });
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [campaignEditError, setCampaignEditError] = useState<string | null>(null);

  const loadCampaign = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/campaigns/${id}`);
    if (res.ok) setCampaign(await res.json());
    setLoading(false);
  }, [id]);

  const loadAnalytics = useCallback(async (p: string) => {
    setAnalyticsLoading(true);
    const res = await fetch(`/api/campaigns/${id}/analytics?period=${p}`);
    if (res.ok) setAnalytics(await res.json());
    setAnalyticsLoading(false);
  }, [id]);

  const loadGeoData = useCallback(async (linkId?: string) => {
    const qs = linkId && linkId !== "all" ? `?linkId=${linkId}` : "";
    const res = await fetch(`/api/campaigns/${id}/geo-clicks${qs}`);
    if (res.ok) setGeoData(await res.json());
  }, [id]);

  useEffect(() => {
    loadCampaign();
    loadGeoData();
    fetch("/api/auth/session").then((r) => r.json()).then((s) => {
      if ((s?.user as { role?: string })?.role === "admin") setIsAdmin(true);
    }).catch(() => {});
    fetch("/api/member/profile").then((r) => r.ok ? r.json() : null).then((d) => {
      if (d) setHasTyUrl(!!d.thankYouPageUrl);
    }).catch(() => {});
  }, [loadCampaign, loadGeoData]);

  useEffect(() => { loadAnalytics(period); }, [period, loadAnalytics]);

  async function fetchYtInfoForUrl(url: string, { isEdit = false } = {}) {
    const videoId = extractVideoId(url);
    if (!videoId) return;
    isEdit ? setFetchingYtEdit(true) : setFetchingYtInfo(true);
    try {
      const res = await fetch(`/api/youtube/video-info?videoId=${videoId}`);
      if (!res.ok) return;
      const info = await res.json() as { title?: string; thumbnailUrl?: string };
      if (isEdit) {
        setEditPreviewThumb(info.thumbnailUrl ?? null);
        if (!nameTouchedEdit && info.title) setEditForm((f) => ({ ...f, name: info.title! }));
      } else {
        setPreviewThumb(info.thumbnailUrl ?? null);
        if (!nameTouchedNew && info.title) setLinkForm((f) => ({ ...f, name: info.title! }));
      }
    } catch { /* skip */ } finally {
      isEdit ? setFetchingYtEdit(false) : setFetchingYtInfo(false);
    }
  }

  async function createLink() {
    if (!linkForm.name) return;
    setCreating(true);
    const res = await fetch(`/api/campaigns/${id}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: linkForm.name,
        youtubeVideoUrl: linkForm.youtubeVideoUrl || undefined,
      }),
    });
    if (res.ok) {
      setShowNewLink(false);
      setLinkForm({ name: "", youtubeVideoUrl: "" });
      setPreviewThumb(null);
      setNameTouchedNew(false);
      loadCampaign();
      loadAnalytics(period);
    }
    setCreating(false);
  }

  function openEdit(link: TrackingLinkData) {
    setEditingLink(link);
    setEditForm({ name: link.name, youtubeVideoUrl: link.youtubeVideoUrl ?? "" });
    setEditPreviewThumb(link.youtubeThumbnailUrl ?? null);
    setNameTouchedEdit(false);
  }

  async function saveEdit() {
    if (!editingLink || !editForm.name) return;
    setSaving(true);
    const res = await fetch(`/api/campaigns/${id}/links/${editingLink.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editForm.name, youtubeVideoUrl: editForm.youtubeVideoUrl || null }),
    });
    setSaving(false);
    if (res.ok) { setEditingLink(null); loadCampaign(); }
  }

  async function deleteLink(linkId: string) {
    if (!confirm("Delete this tracking link? Click data is preserved.")) return;
    await fetch(`/api/campaigns/${id}/links/${linkId}`, { method: "DELETE" });
    loadCampaign();
    loadAnalytics(period);
  }

  function resetStats(link: TrackingLinkData) {
    setResetConfirmLink(link);
  }

  async function confirmReset() {
    if (!resetConfirmLink) return;
    setResetting(true);
    await fetch(`/api/campaigns/${id}/links/${resetConfirmLink.id}/reset-stats`, { method: "POST" });
    setResetting(false);
    setResetConfirmLink(null);
    loadCampaign();
    loadAnalytics(period);
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  async function refreshViews() {
    setRefreshing(true);
    await fetch(`/api/campaigns/${id}/refresh-views`, { method: "POST" });
    await loadCampaign();
    setRefreshing(false);
  }

  function openEditCampaign() {
    if (!campaign) return;
    setCampaignEditForm({ name: campaign.name, destinationUrl: campaign.destinationUrl, sourceType: campaign.sourceType });
    setCampaignEditError(null);
    setShowEditCampaign(true);
  }

  async function saveCampaign() {
    if (!campaignEditForm.name || !campaignEditForm.destinationUrl) return;
    setSavingCampaign(true);
    setCampaignEditError(null);
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(campaignEditForm),
      });
      if (res.ok) {
        setShowEditCampaign(false);
        await loadCampaign();
      } else {
        const data = await res.json().catch(() => ({}));
        setCampaignEditError(data.error ?? `Error saving — please try again.`);
      }
    } catch {
      setCampaignEditError("Network error — please try again.");
    }
    setSavingCampaign(false);
  }

  if (loading) return <div className="text-center py-16 text-[#2f3437]/40">Loading...</div>;
  if (!campaign) return <div className="text-center py-16 text-[#2f3437]/40">Campaign not found.</div>;

  const isYoutube = campaign.sourceType === "YOUTUBE";
  const isEmailNewsletter = campaign.sourceType === "EMAIL_NEWSLETTER";
  const linkLabel = isYoutube ? "Video Name" : "Link Name";
  const linkPlaceholder = isYoutube ? "e.g. Buyers Guide Video — March" : "e.g. Email Newsletter — April";

  const src = SOURCE_LABELS[campaign.sourceType] ?? SOURCE_LABELS.OTHER;
  const ctr = campaign.totalViews && campaign.totalViews > 0
    ? Math.round((campaign.totalClicks / campaign.totalViews) * 100)
    : null;

  const convRate = campaign.totalClicks > 0
    ? Math.round((campaign.totalLeads / campaign.totalClicks) * 100)
    : 0;

  // filtered geo data based on link filter
  const filteredMarkers = geoData?.markers ?? [];
  const filteredLocations = geoData?.locations ?? [];

  const sortedLinks = [...campaign.links].sort((a, b) => {
    if (sortBy === "most_clicks") return b.clicks - a.clicks;
    if (sortBy === "most_leads") return b.leads - a.leads;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const hasAnalyticsData = analytics && (analytics.daily.some((d) => d.clicks > 0) || analytics.daily.some((d) => d.leads > 0));

  return (
    <div className="space-y-6">
      {/* Thank You Page Warning */}
      {hasTyUrl === false && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">Lead tracking isn&apos;t set up yet</p>
            <p className="text-xs text-amber-700 mt-0.5">Clicks will be recorded but leads won&apos;t count until you save your Thank You Page Path. <Link href="/member/link-tracking" className="underline font-medium">Go to Link Tracking Settings →</Link></p>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <div className="mb-2">
          <Link href="/member/campaigns" className="text-sm text-[#2f3437]/40 hover:text-[#2f3437] transition-colors">
            ← Campaigns
          </Link>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-[#2f3437]">{campaign.name}</h1>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${src.color}`}>{src.label}</span>
              <button onClick={openEditCampaign} title="Edit campaign" className="text-[#2f3437]/30 hover:text-[#6ba3c7] transition-colors">
                <PencilIcon className="w-4 h-4" />
              </button>
            </div>
            <a href={campaign.destinationUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-[#6ba3c7] hover:underline">
              {campaign.destinationUrl}
            </a>
          </div>
          <button
            onClick={() => setShowNewLink(true)}
            className="flex-shrink-0 bg-[#6ba3c7] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#6ba3c7]/90 transition-colors"
          >
            + New Link
          </button>
        </div>
      </div>

      {/* Destination URL */}
      <div className="bg-white border border-[#2f3437]/10 rounded-lg px-4 py-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-[#2f3437]/40 uppercase tracking-wide mb-0.5">Lead Magnet URL</p>
          <p className="text-sm text-[#2f3437] font-mono truncate">{campaign.destinationUrl}</p>
        </div>
        <button
          onClick={() => copy(campaign.destinationUrl, "destination-url")}
          className="text-xs text-[#6ba3c7] hover:text-[#5490b5] font-medium flex-shrink-0 transition-colors"
        >
          {copied === "destination-url" ? "Copied!" : "Copy"}
        </button>
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

      {/* Analytics Charts */}
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
          <div className="space-y-6">
            <ChartSkeleton />
            <ChartSkeleton />
          </div>
        ) : !hasAnalyticsData ? (
          <ChartEmpty />
        ) : (
          <div className="space-y-6">
            <div>
              <p className="text-xs font-medium text-[#2f3437]/50 mb-3">
                {isEmailNewsletter ? "Clicks Per Day" : "Clicks & Leads Per Day"}
              </p>
              <DailyLineChart data={analytics!.daily} hideLeads={isEmailNewsletter} />
            </div>

            {analytics!.byLink.length > 1 && (
              <div>
                <p className="text-xs font-medium text-[#2f3437]/50 mb-3">Performance by Tracking Link</p>
                <LinkBarChart data={analytics!.byLink} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tracking Links */}
      <div className="bg-white border border-[#2f3437]/10 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-[#2f3437]/10 flex items-center justify-between">
          <h2 className="font-semibold text-[#2f3437]">Tracking Links ({campaign.links.length})</h2>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="text-xs border border-[#2f3437]/20 rounded-lg px-2 py-1.5 text-[#2f3437]/60 focus:outline-none"
          >
            <option value="newest">Newest</option>
            <option value="most_clicks">Most Clicks</option>
            <option value="most_leads">Most Leads</option>
          </select>
        </div>

        {sortedLinks.length === 0 ? (
          <div className="p-10 text-center text-[#2f3437]/40 text-sm">No tracking links yet. Create one to start tracking.</div>
        ) : (
          <div className="divide-y divide-[#2f3437]/5">
            {sortedLinks.map((link) => (
              <div key={link.id} className="p-5">
                <div className="flex items-start gap-3">
                  {link.youtubeThumbnailUrl && (
                    <img src={link.youtubeThumbnailUrl} alt={link.name} className="w-20 h-14 object-cover rounded-lg flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-[#2f3437] text-sm truncate">{link.name}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => openEdit(link)} className="text-[#2f3437]/30 hover:text-[#6ba3c7] transition-colors" title="Edit link">
                          <PencilIcon className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => resetStats(link)} className="text-xs text-[#2f3437]/30 hover:text-amber-500 transition-colors" title="Reset clicks &amp; leads for testing">Reset</button>
                        <button onClick={() => deleteLink(link.id)} className="text-xs text-[#2f3437]/30 hover:text-red-500 transition-colors">Delete</button>
                      </div>
                    </div>
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
                    {isYoutube && !link.youtubeVideoId && (
                      <button onClick={() => openEdit(link)} className="mt-1.5 text-xs text-amber-500 hover:text-amber-600 font-medium">
                        + Attach YouTube URL
                      </button>
                    )}
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

      {/* Click Map — bottom of page, collapsed when no data */}
      {(filteredMarkers.length > 0 || filteredLocations.length > 0) && (
        <div className="relative z-0 bg-white border border-[#2f3437]/10 rounded-lg p-5">
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
          <div className="flex flex-col md:flex-row gap-5">
            {/* Left: Top Locations list */}
            <div className="md:w-3/5">
              <p className="text-xs font-semibold text-[#2f3437]/50 uppercase tracking-wide mb-3">Top Locations</p>
              {filteredLocations.length === 0 ? (
                <p className="text-sm text-[#2f3437]/40">No location data yet.</p>
              ) : (
                <div className="space-y-1">
                  {filteredLocations.slice(0, 15).map((loc, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-[#2f3437]/5 last:border-0">
                      <span className="text-sm text-[#2f3437]">
                        {loc.city}
                        {(loc.province || loc.country) && (
                          <span className="text-[#2f3437]/50 ml-1 text-xs">
                            {[loc.province, loc.country].filter(Boolean).join(", ")}
                          </span>
                        )}
                      </span>
                      <span className="text-sm font-semibold text-[#2f3437] ml-4 shrink-0">{loc.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Right: compact map */}
            <div className="md:w-2/5">
              <ClickMap markers={filteredMarkers} height={260} />
            </div>
          </div>
        </div>
      )}

      {campaign.hasYoutube && (
        <div className="flex items-center justify-center gap-2">
          {campaign.lastViewsUpdate && (
            <p className="text-xs text-[#2f3437]/30">YouTube views last updated {new Date(campaign.lastViewsUpdate).toLocaleString()}</p>
          )}
          {isAdmin && (
            <button onClick={refreshViews} disabled={refreshing} title="Refresh YouTube view counts now" className="text-[#2f3437]/30 hover:text-[#6ba3c7] disabled:opacity-40 transition-colors">
              <ArrowPathIcon className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          )}
        </div>
      )}

      {/* New Link Modal */}
      {showNewLink && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-[#2f3437]/10 shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-bold text-[#2f3437]">New Tracking Link</h2>
                <p className="text-xs text-[#2f3437]/40 mt-0.5">Add a unique link to track within this campaign</p>
              </div>
              <button
                onClick={() => { setShowNewLink(false); setPreviewThumb(null); setNameTouchedNew(false); setLinkForm({ name: "", youtubeVideoUrl: "" }); }}
                className="text-[#2f3437]/40 hover:text-[#2f3437] text-xl"
              >✕</button>
            </div>

            <div className="space-y-5">
              {/* Link name */}
              <div>
                <label className="block text-sm font-semibold text-[#2f3437] mb-1.5">
                  Link Name <span className="font-normal text-[#2f3437]/40 text-xs">— what is this link for?</span>
                </label>
                <input
                  type="text"
                  value={linkForm.name}
                  onChange={(e) => { setLinkForm({ ...linkForm, name: e.target.value }); setNameTouchedNew(true); }}
                  placeholder={isYoutube ? "e.g. Buyers Guide Video — March" : "e.g. Spring Newsletter — March 2026"}
                  className={INPUT_CLS}
                />
              </div>

              {/* YouTube URL */}
              <div>
                <label className="block text-sm font-semibold text-[#2f3437] mb-1.5">
                  YouTube Video URL <span className="font-normal text-[#2f3437]/40">(optional)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={linkForm.youtubeVideoUrl}
                    onChange={(e) => setLinkForm({ ...linkForm, youtubeVideoUrl: e.target.value })}
                    onBlur={(e) => { if (e.target.value) fetchYtInfoForUrl(e.target.value); }}
                    placeholder="https://youtube.com/watch?v=..."
                    className={INPUT_CLS}
                  />
                  {fetchingYtInfo && <span className="w-5 h-5 mt-2.5 border-2 border-[#6ba3c7] border-t-transparent rounded-full animate-spin flex-shrink-0" />}
                </div>
                {previewThumb && <img src={previewThumb} alt="thumbnail" className="mt-2 w-full h-28 object-cover rounded-lg" />}
                <p className="text-xs text-[#2f3437]/40 mt-1">Links view count and thumbnail to this tracking link.</p>
              </div>

              {/* URL preview */}
              <div className="bg-[#f8f9fa] rounded-lg p-3 text-xs text-[#2f3437]/50">
                <p className="font-medium text-[#2f3437]/70 mb-1">Tracked URL preview</p>
                <p className="break-all font-mono">{campaign.destinationUrl}{campaign.destinationUrl.includes("?") ? "&" : "?"}ref=<span className="text-[#6ba3c7]">xxxxxxxx</span></p>
              </div>

              <button
                onClick={createLink}
                disabled={creating || !linkForm.name}
                className="w-full bg-[#6ba3c7] text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-[#6ba3c7]/90 disabled:opacity-50 transition-colors"
              >
                {creating ? "Creating..." : "Create Link"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Link Modal */}
      {editingLink && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-[#2f3437]/10 shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-[#2f3437]">Edit Link</h2>
              <button onClick={() => setEditingLink(null)} className="text-[#2f3437]/40 hover:text-[#2f3437] text-xl">✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[#2f3437] mb-1.5">YouTube Video URL <span className="font-normal text-[#2f3437]/40">(optional)</span></label>
                <div className="flex gap-2">
                  <input type="url" value={editForm.youtubeVideoUrl} onChange={(e) => setEditForm({ ...editForm, youtubeVideoUrl: e.target.value })} onBlur={(e) => { if (e.target.value) fetchYtInfoForUrl(e.target.value, { isEdit: true }); }} placeholder="https://youtube.com/watch?v=..." className={INPUT_CLS} />
                  {fetchingYtEdit && <span className="w-5 h-5 mt-2.5 border-2 border-[#6ba3c7] border-t-transparent rounded-full animate-spin flex-shrink-0" />}
                </div>
                {editPreviewThumb && <img src={editPreviewThumb} alt="thumbnail" className="mt-2 w-full h-28 object-cover rounded-lg" />}
                <p className="text-xs text-[#2f3437]/40 mt-1">Adding a URL links views data and the video thumbnail to this tracking link.</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#2f3437] mb-1.5">{linkLabel}</label>
                <input type="text" value={editForm.name} onChange={(e) => { setEditForm({ ...editForm, name: e.target.value }); setNameTouchedEdit(true); }} placeholder={linkPlaceholder} className={INPUT_CLS} />
              </div>
              <div className="flex gap-3">
                <button onClick={saveEdit} disabled={saving || !editForm.name} className="flex-1 bg-[#6ba3c7] text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-[#6ba3c7]/90 disabled:opacity-50 transition-colors">
                  {saving ? "Saving..." : "Save Changes"}
                </button>
                <button onClick={() => setEditingLink(null)} className="px-5 py-2.5 border border-[#2f3437]/20 rounded-lg text-sm text-[#2f3437]/60 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Campaign Modal */}
      {showEditCampaign && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-[#2f3437]/10 shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-[#2f3437]">Edit Campaign</h2>
              <button onClick={() => setShowEditCampaign(false)} className="text-[#2f3437]/40 hover:text-[#2f3437] text-xl">✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[#2f3437] mb-1.5">Campaign Name</label>
                <input type="text" value={campaignEditForm.name} onChange={(e) => setCampaignEditForm({ ...campaignEditForm, name: e.target.value })} className={INPUT_CLS} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#2f3437] mb-1.5">Destination URL</label>
                <input type="text" value={campaignEditForm.destinationUrl} onChange={(e) => setCampaignEditForm({ ...campaignEditForm, destinationUrl: e.target.value })} placeholder="https://yoursite.com/free-guide" className={INPUT_CLS} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#2f3437] mb-1.5">Traffic Source</label>
                <select value={campaignEditForm.sourceType} onChange={(e) => setCampaignEditForm({ ...campaignEditForm, sourceType: e.target.value })} className={`${INPUT_CLS} bg-white`}>
                  <option value="YOUTUBE">YouTube</option>
                  <option value="EMAIL_NEWSLETTER">Email Newsletter</option>
                  <option value="GOOGLE_ADS">Google Ads</option>
                  <option value="META_ADS">Meta Ads</option>
                  <option value="DIRECT_MAIL">Direct Mail</option>
                  <option value="BLOG_POSTS">Blog Posts</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              {campaignEditError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{campaignEditError}</p>
              )}
              <div className="flex gap-3">
                <button onClick={saveCampaign} disabled={savingCampaign || !campaignEditForm.name || !campaignEditForm.destinationUrl} className="flex-1 bg-[#6ba3c7] text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-[#6ba3c7]/90 disabled:opacity-50 transition-colors">
                  {savingCampaign ? "Saving..." : "Save Changes"}
                </button>
                <button onClick={() => setShowEditCampaign(false)} className="px-5 py-2.5 border border-[#2f3437]/20 rounded-lg text-sm text-[#2f3437]/60 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reset Stats Confirmation Modal */}
      {resetConfirmLink && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-[#2f3437]/10 shadow-xl w-full max-w-sm p-6">
            <h2 className="font-bold text-[#2f3437] text-lg mb-2">Reset Stats?</h2>
            <p className="text-sm text-[#2f3437]/60 mb-1">
              This will clear all clicks and leads recorded for:
            </p>
            <p className="text-sm font-semibold text-[#2f3437] mb-4">{resetConfirmLink.name}</p>
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-5">
              Use this to wipe test data before sharing your link publicly. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={confirmReset}
                disabled={resetting}
                className="flex-1 bg-amber-500 text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-amber-600 disabled:opacity-50 transition-colors"
              >
                {resetting ? "Resetting..." : "Yes, Reset Stats"}
              </button>
              <button
                onClick={() => setResetConfirmLink(null)}
                disabled={resetting}
                className="px-5 py-2.5 border border-[#2f3437]/20 rounded-lg text-sm text-[#2f3437]/60 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

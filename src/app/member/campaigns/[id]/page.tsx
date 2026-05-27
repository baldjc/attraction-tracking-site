"use client";

import { useState, useEffect, use, useCallback } from "react";
import Link from "next/link";
import { PencilIcon, ArrowPathIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import Breadcrumb from "@/components/Breadcrumb";
import { DailyLineChart, ChartEmpty } from "@/components/charts/DailyLineChart";
import { LinkBarChart } from "@/components/charts/LinkBarChart";
import ClickMap from "@/components/campaigns/ClickMap";
import LocationTable from "@/components/campaigns/LocationTable";

interface TrackingLinkData {
  id: string;
  name: string;
  source: string;
  destinationOverride: string;
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
  leadMagnetUrl: string | null;
  // Pitch language — feeds the Script Builder. Owner-editable from
  // this page; admins can also edit cross-account at
  // /admin/campaigns/[id]. Stored on the Campaign row itself
  // (model is per-user — Campaign.userId is the owner).
  description: string | null;
  pitchOneLiner: string | null;
  audience: string | null;
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

const LINK_SOURCE_STYLES: Record<string, { label: string; color: string }> = {
  youtube:    { label: "YouTube",    color: "bg-red-100 text-red-700" },
  linkedin:   { label: "LinkedIn",   color: "bg-blue-100 text-blue-700" },
  instagram:  { label: "Instagram",  color: "bg-pink-100 text-pink-700" },
  email:      { label: "Email",      color: "bg-teal-100 text-teal-700" },
  facebook:   { label: "Facebook",   color: "bg-indigo-100 text-indigo-700" },
  google_ads: { label: "Google Ads", color: "bg-green-100 text-green-700" },
  blog:       { label: "Blog",       color: "bg-amber-100 text-amber-700" },
  other:      { label: "Other",      color: "bg-gray-100 text-gray-600" },
};

const LINK_SOURCES = [
  { value: "youtube",    label: "YouTube" },
  { value: "linkedin",   label: "LinkedIn" },
  { value: "instagram",  label: "Instagram" },
  { value: "email",      label: "Email" },
  { value: "facebook",   label: "Facebook" },
  { value: "google_ads", label: "Google Ads" },
  { value: "blog",       label: "Blog" },
  { value: "other",      label: "Other" },
];

const PERIODS = [
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" },
  { label: "All", value: "all" },
];

const INPUT_CLS = "w-full border border-[var(--abv-text)]/20 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[var(--abv-azure)]";

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
  const [linkSource, setLinkSource] = useState("youtube");
  const [linkDestination, setLinkDestination] = useState("landing_page");
  const [creating, setCreating] = useState(false);
  const [fetchingYtInfo, setFetchingYtInfo] = useState(false);
  const [previewThumb, setPreviewThumb] = useState<string | null>(null);
  const [nameTouchedNew, setNameTouchedNew] = useState(false);

  // Edit link modal
  const [editingLink, setEditingLink] = useState<TrackingLinkData | null>(null);
  const [editForm, setEditForm] = useState({ name: "", youtubeVideoUrl: "" });
  const [editLinkSource, setEditLinkSource] = useState("youtube");
  const [editLinkDestination, setEditLinkDestination] = useState("landing_page");
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
  const [campaignEditForm, setCampaignEditForm] = useState({
    name: "",
    destinationUrl: "",
    leadMagnetUrl: "",
    description: "",
    pitchOneLiner: "",
    audience: "",
  });
  const [analyticsSourceFilter, setAnalyticsSourceFilter] = useState("all");
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [campaignEditError, setCampaignEditError] = useState<string | null>(null);

  const loadCampaign = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/campaigns/${id}`);
    if (res.ok) setCampaign(await res.json());
    setLoading(false);
  }, [id]);

  const loadAnalytics = useCallback(async (p: string, src = "all") => {
    setAnalyticsLoading(true);
    const qs = src !== "all" ? `&source=${src}` : "";
    const res = await fetch(`/api/campaigns/${id}/analytics?period=${p}${qs}`);
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

  useEffect(() => { loadAnalytics(period, analyticsSourceFilter); }, [period, analyticsSourceFilter, loadAnalytics]);

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
        source: linkSource,
        destinationOverride: linkDestination,
        youtubeVideoUrl: linkSource === "youtube" ? (linkForm.youtubeVideoUrl || undefined) : undefined,
      }),
    });
    if (res.ok) {
      setShowNewLink(false);
      setLinkForm({ name: "", youtubeVideoUrl: "" });
      setLinkSource("youtube");
      setLinkDestination("landing_page");
      setPreviewThumb(null);
      setNameTouchedNew(false);
      loadCampaign();
      loadAnalytics(period, analyticsSourceFilter);
    }
    setCreating(false);
  }

  function openEdit(link: TrackingLinkData) {
    setEditingLink(link);
    setEditLinkSource(link.source ?? "youtube");
    setEditLinkDestination(link.destinationOverride ?? "landing_page");
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
      body: JSON.stringify({
        name: editForm.name,
        source: editLinkSource,
        destinationOverride: editLinkDestination,
        youtubeVideoUrl: editLinkSource === "youtube" ? (editForm.youtubeVideoUrl || null) : null,
      }),
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
    setCampaignEditForm({
      name: campaign.name,
      destinationUrl: campaign.destinationUrl,
      leadMagnetUrl: campaign.leadMagnetUrl ?? "",
      description: campaign.description ?? "",
      pitchOneLiner: campaign.pitchOneLiner ?? "",
      audience: campaign.audience ?? "",
    });
    setCampaignEditError(null);
    setShowEditCampaign(true);
  }

  async function saveCampaign() {
    if (!campaignEditForm.name || !campaignEditForm.destinationUrl) return;
    setSavingCampaign(true);
    setCampaignEditError(null);
    try {
      // The PATCH endpoint already ownership-scopes via
      // getCampaignForUser, so this 200s only when the current user
      // owns the campaign. Empty strings → null so clearing a field
      // actually unsets it instead of writing "".
      const res = await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: campaignEditForm.name,
          destinationUrl: campaignEditForm.destinationUrl,
          leadMagnetUrl: campaignEditForm.leadMagnetUrl || null,
          description: campaignEditForm.description.trim() || null,
          pitchOneLiner: campaignEditForm.pitchOneLiner.trim() || null,
          audience: campaignEditForm.audience.trim() || null,
        }),
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

  if (loading) return <div className="text-center py-16 text-[var(--abv-text)]/40">Loading...</div>;
  if (!campaign) return <div className="text-center py-16 text-[var(--abv-text)]/40">Campaign not found.</div>;

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
        <Breadcrumb items={[
          { label: "Generate Leads", href: "/member/generate-leads?section=campaigns" },
          { label: campaign?.name || "Campaign" },
        ]} />
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-[var(--abv-text)]">{campaign.name}</h1>
              <button onClick={openEditCampaign} title="Edit campaign" className="text-[var(--abv-text)]/30 hover:text-[var(--abv-azure)] transition-colors">
                <PencilIcon className="w-4 h-4" />
              </button>
            </div>
            <a href={campaign.destinationUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--abv-azure)] hover:underline">
              {campaign.destinationUrl}
            </a>
          </div>
          <button
            onClick={() => setShowNewLink(true)}
            className="flex-shrink-0 bg-[var(--abv-dark)] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[var(--abv-dark)]/90 transition-colors"
          >
            + New Link
          </button>
        </div>
      </div>

      {/* Destination URL */}
      <div className="bg-white border border-[var(--abv-text)]/10 rounded-lg px-4 py-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-[var(--abv-text)]/40 uppercase tracking-wide mb-0.5">Landing Page URL</p>
          <p className="text-sm text-[var(--abv-text)] font-mono truncate">{campaign.destinationUrl}</p>
        </div>
        <button
          onClick={() => copy(campaign.destinationUrl, "destination-url")}
          className="text-xs text-[var(--abv-azure)] hover:text-[var(--abv-azure)] font-medium flex-shrink-0 transition-colors"
        >
          {copied === "destination-url" ? "Copied!" : "Copy"}
        </button>
      </div>

      {/* Lead Magnet URL — only shown when set */}
      {campaign.leadMagnetUrl && (
        <div className="bg-white border border-[var(--abv-text)]/10 rounded-lg px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-[var(--abv-text)]/40 uppercase tracking-wide mb-0.5">Lead Magnet URL</p>
            <p className="text-sm text-[var(--abv-text)] font-mono truncate">{campaign.leadMagnetUrl}</p>
          </div>
          <button
            onClick={() => copy(campaign.leadMagnetUrl!, "lead-magnet-url")}
            className="text-xs text-[var(--abv-azure)] hover:text-[var(--abv-azure)] font-medium flex-shrink-0 transition-colors"
          >
            {copied === "lead-magnet-url" ? "Copied!" : "Copy"}
          </button>
        </div>
      )}

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
      </div>

      {/* Tracking Links */}
      <div className="bg-white border border-[var(--abv-text)]/10 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--abv-text)]/10 flex items-center justify-between">
          <h2 className="font-semibold text-[var(--abv-text)]">Tracking Links ({campaign.links.length})</h2>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="text-xs border border-[var(--abv-text)]/20 rounded-lg px-2 py-1.5 text-[var(--abv-text)]/60 focus:outline-none"
          >
            <option value="newest">Newest</option>
            <option value="most_clicks">Most Clicks</option>
            <option value="most_leads">Most Leads</option>
          </select>
        </div>

        {sortedLinks.length === 0 ? (
          <div className="p-10 text-center text-[var(--abv-text)]/40 text-sm">No tracking links yet. Create one to start tracking.</div>
        ) : (
          <div className="divide-y divide-[var(--abv-text)]/5">
            {sortedLinks.map((link) => (
              <div key={link.id} className="p-5">
                <div className="flex items-start gap-3">
                  {link.source === "youtube" && link.youtubeThumbnailUrl && (
                    <img src={link.youtubeThumbnailUrl} alt={link.name} className="w-20 h-14 object-cover rounded-lg flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="font-medium text-[var(--abv-text)] text-sm truncate">{link.name}</p>
                        {(() => { const s = LINK_SOURCE_STYLES[link.source] ?? LINK_SOURCE_STYLES.other; return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${s.color}`}>{s.label}</span>; })()}
                        {campaign.leadMagnetUrl && link.destinationOverride === "lead_magnet" && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 bg-violet-100 text-violet-700">Lead Magnet</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => openEdit(link)} className="text-[var(--abv-text)]/30 hover:text-[var(--abv-azure)] transition-colors" title="Edit link">
                          <PencilIcon className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => resetStats(link)} className="text-xs text-[var(--abv-text)]/30 hover:text-amber-500 transition-colors" title="Reset clicks &amp; leads for testing">Reset</button>
                        <button onClick={() => deleteLink(link.id)} className="text-xs text-[var(--abv-text)]/30 hover:text-red-500 transition-colors">Delete</button>
                      </div>
                    </div>
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
                    {link.source === "youtube" && !link.youtubeVideoId && (
                      <button onClick={() => openEdit(link)} className="mt-1.5 text-xs text-amber-500 hover:text-amber-600 font-medium">
                        + Attach YouTube URL
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-3 text-center">
                  {link.source === "youtube" && link.youtubeVideoId && (
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

      {/* Analytics Charts */}
      <div className="bg-white border border-[var(--abv-text)]/10 rounded-lg p-5">
        <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
          <h2 className="font-semibold text-[var(--abv-text)]">Analytics</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={analyticsSourceFilter}
              onChange={(e) => setAnalyticsSourceFilter(e.target.value)}
              className="text-xs border border-[var(--abv-text)]/20 rounded-lg px-2 py-1.5 text-[var(--abv-text)]/60 focus:outline-none"
            >
              <option value="all">All Sources</option>
              {LINK_SOURCES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
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
              <p className="text-xs font-medium text-[var(--abv-text)]/50 mb-3">Clicks &amp; Leads Per Day</p>
              <DailyLineChart data={analytics!.daily} />
            </div>

            {analytics!.byLink.length > 1 && (
              <div>
                <p className="text-xs font-medium text-[var(--abv-text)]/50 mb-3">Performance by Tracking Link</p>
                <LinkBarChart data={analytics!.byLink} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Click Map — bottom of page, collapsed when no data */}
      {(filteredMarkers.length > 0 || filteredLocations.length > 0) && (
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
          <div className="flex flex-col md:flex-row gap-5">
            {/* Left: Top Locations list */}
            <div className="md:w-3/5">
              <p className="text-xs font-semibold text-[var(--abv-text)]/50 uppercase tracking-wide mb-3">Top Locations</p>
              {filteredLocations.length === 0 ? (
                <p className="text-sm text-[var(--abv-text)]/40">No location data yet.</p>
              ) : (
                <div className="space-y-1">
                  {filteredLocations.slice(0, 15).map((loc, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-[var(--abv-text)]/5 last:border-0">
                      <span className="text-sm text-[var(--abv-text)]">
                        {loc.city}
                        {(loc.province || loc.country) && (
                          <span className="text-[var(--abv-text)]/50 ml-1 text-xs">
                            {[loc.province, loc.country].filter(Boolean).join(", ")}
                          </span>
                        )}
                      </span>
                      <span className="text-sm font-semibold text-[var(--abv-text)] ml-4 shrink-0">{loc.count.toLocaleString()}</span>
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
            <p className="text-xs text-[var(--abv-text)]/30">YouTube views last updated {new Date(campaign.lastViewsUpdate).toLocaleString()}</p>
          )}
          {isAdmin && (
            <button onClick={refreshViews} disabled={refreshing} title="Refresh YouTube view counts now" className="text-[var(--abv-text)]/30 hover:text-[var(--abv-azure)] disabled:opacity-40 transition-colors">
              <ArrowPathIcon className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          )}
        </div>
      )}

      {/* New Link Modal */}
      {showNewLink && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-[var(--abv-text)]/10 shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-bold text-[var(--abv-text)]">New Tracking Link</h2>
                <p className="text-xs text-[var(--abv-text)]/40 mt-0.5">Add a unique link to track within this campaign</p>
              </div>
              <button
                onClick={() => { setShowNewLink(false); setPreviewThumb(null); setNameTouchedNew(false); setLinkForm({ name: "", youtubeVideoUrl: "" }); setLinkSource("youtube"); setLinkDestination("landing_page"); }}
                className="text-[var(--abv-text)]/40 hover:text-[var(--abv-text)] text-xl"
              >✕</button>
            </div>

            <div className="space-y-5">
              {/* Source picker */}
              <div>
                <label className="block text-sm font-semibold text-[var(--abv-text)] mb-2">Source Platform</label>
                <div className="flex flex-wrap gap-2">
                  {LINK_SOURCES.map((s) => {
                    const style = LINK_SOURCE_STYLES[s.value];
                    return (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => { setLinkSource(s.value); if (s.value !== "youtube") setPreviewThumb(null); }}
                        className={`text-xs px-3 py-1.5 rounded-full font-semibold border transition-colors ${linkSource === s.value ? `${style.color} border-transparent` : "border-[var(--abv-text)]/15 text-[var(--abv-text)]/50 hover:text-[var(--abv-text)]"}`}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Destination picker — only when lead magnet URL exists */}
              {campaign.leadMagnetUrl && (
                <div>
                  <label className="block text-sm font-semibold text-[var(--abv-text)] mb-2">Destination</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setLinkDestination("landing_page")}
                      className={`text-left px-3 py-2.5 rounded-lg border text-xs transition-colors ${linkDestination === "landing_page" ? "border-[var(--abv-azure)] bg-[var(--abv-dark)]/5 text-[var(--abv-text)]" : "border-[var(--abv-text)]/15 text-[var(--abv-text)]/50 hover:text-[var(--abv-text)]"}`}
                    >
                      <div className="font-semibold mb-0.5">Landing Page</div>
                      <div className="text-[var(--abv-text)]/40 truncate">{campaign.destinationUrl}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setLinkDestination("lead_magnet")}
                      className={`text-left px-3 py-2.5 rounded-lg border text-xs transition-colors ${linkDestination === "lead_magnet" ? "border-[var(--abv-azure)] bg-[var(--abv-dark)]/5 text-[var(--abv-text)]" : "border-[var(--abv-text)]/15 text-[var(--abv-text)]/50 hover:text-[var(--abv-text)]"}`}
                    >
                      <div className="font-semibold mb-0.5">Lead Magnet</div>
                      <div className="text-[var(--abv-text)]/40 truncate">{campaign.leadMagnetUrl}</div>
                    </button>
                  </div>
                </div>
              )}

              {/* Link name */}
              <div>
                <label className="block text-sm font-semibold text-[var(--abv-text)] mb-1.5">
                  {linkSource === "youtube" ? "Video Name" : "Link Name"} <span className="font-normal text-[var(--abv-text)]/40 text-xs">— what is this link for?</span>
                </label>
                <input
                  type="text"
                  value={linkForm.name}
                  onChange={(e) => { setLinkForm({ ...linkForm, name: e.target.value }); setNameTouchedNew(true); }}
                  placeholder={linkSource === "youtube" ? "e.g. Buyers Guide Video — March" : "e.g. Spring Newsletter — March 2026"}
                  className={INPUT_CLS}
                />
              </div>

              {/* YouTube URL — only when source is youtube */}
              {linkSource === "youtube" && (
                <div>
                  <label className="block text-sm font-semibold text-[var(--abv-text)] mb-1.5">
                    YouTube Video URL <span className="font-normal text-[var(--abv-text)]/40">(optional)</span>
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
                    {fetchingYtInfo && <span className="w-5 h-5 mt-2.5 border-2 border-[var(--abv-azure)] border-t-transparent rounded-full animate-spin flex-shrink-0" />}
                  </div>
                  {previewThumb && <img src={previewThumb} alt="thumbnail" className="mt-2 w-full h-28 object-cover rounded-lg" />}
                  <p className="text-xs text-[var(--abv-text)]/40 mt-1">Links view count and thumbnail to this tracking link.</p>
                </div>
              )}

              {/* URL preview */}
              <div className="bg-[#f8f9fa] rounded-lg p-3 text-xs text-[var(--abv-text)]/50">
                <p className="font-medium text-[var(--abv-text)]/70 mb-1">Tracked URL preview</p>
                {(() => {
                  const dest = (linkDestination === "lead_magnet" && campaign.leadMagnetUrl) ? campaign.leadMagnetUrl : campaign.destinationUrl;
                  return <p className="break-all font-mono">{dest}{dest.includes("?") ? "&" : "?"}ref=<span className="text-[var(--abv-azure)]">xxxxxxxx</span></p>;
                })()}
              </div>

              <button
                onClick={createLink}
                disabled={creating || !linkForm.name}
                className="w-full bg-[var(--abv-dark)] text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-[var(--abv-dark)]/90 disabled:opacity-50 transition-colors"
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
          <div className="bg-white rounded-lg border border-[var(--abv-text)]/10 shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-bold text-[var(--abv-text)]">Edit Tracking Link</h2>
                <p className="text-xs text-[var(--abv-text)]/40 mt-0.5">Update the name, source, or attached YouTube video</p>
              </div>
              <button onClick={() => setEditingLink(null)} className="text-[var(--abv-text)]/40 hover:text-[var(--abv-text)] text-xl">✕</button>
            </div>
            <div className="space-y-5">
              {/* Source picker */}
              <div>
                <label className="block text-sm font-semibold text-[var(--abv-text)] mb-2">Source Platform</label>
                <div className="flex flex-wrap gap-2">
                  {LINK_SOURCES.map((s) => {
                    const style = LINK_SOURCE_STYLES[s.value];
                    return (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => { setEditLinkSource(s.value); if (s.value !== "youtube") setEditPreviewThumb(null); }}
                        className={`text-xs px-3 py-1.5 rounded-full font-semibold border transition-colors ${editLinkSource === s.value ? `${style.color} border-transparent` : "border-[var(--abv-text)]/15 text-[var(--abv-text)]/50 hover:text-[var(--abv-text)]"}`}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Destination picker — only when lead magnet URL exists */}
              {campaign.leadMagnetUrl && (
                <div>
                  <label className="block text-sm font-semibold text-[var(--abv-text)] mb-2">Destination</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setEditLinkDestination("landing_page")}
                      className={`text-left px-3 py-2.5 rounded-lg border text-xs transition-colors ${editLinkDestination === "landing_page" ? "border-[var(--abv-azure)] bg-[var(--abv-dark)]/5 text-[var(--abv-text)]" : "border-[var(--abv-text)]/15 text-[var(--abv-text)]/50 hover:text-[var(--abv-text)]"}`}
                    >
                      <div className="font-semibold mb-0.5">Landing Page</div>
                      <div className="text-[var(--abv-text)]/40 truncate">{campaign.destinationUrl}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditLinkDestination("lead_magnet")}
                      className={`text-left px-3 py-2.5 rounded-lg border text-xs transition-colors ${editLinkDestination === "lead_magnet" ? "border-[var(--abv-azure)] bg-[var(--abv-dark)]/5 text-[var(--abv-text)]" : "border-[var(--abv-text)]/15 text-[var(--abv-text)]/50 hover:text-[var(--abv-text)]"}`}
                    >
                      <div className="font-semibold mb-0.5">Lead Magnet</div>
                      <div className="text-[var(--abv-text)]/40 truncate">{campaign.leadMagnetUrl}</div>
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-[var(--abv-text)] mb-1.5">
                  {editLinkSource === "youtube" ? "Video Name" : "Link Name"} <span className="font-normal text-[var(--abv-text)]/40 text-xs">— what is this link for?</span>
                </label>
                <input type="text" value={editForm.name} onChange={(e) => { setEditForm({ ...editForm, name: e.target.value }); setNameTouchedEdit(true); }} placeholder={editLinkSource === "youtube" ? "e.g. Buyers Guide Video — March" : "e.g. Spring Newsletter — March 2026"} className={INPUT_CLS} />
              </div>
              {editLinkSource === "youtube" && (
                <div>
                  <label className="block text-sm font-semibold text-[var(--abv-text)] mb-1.5">YouTube Video URL <span className="font-normal text-[var(--abv-text)]/40">(optional)</span></label>
                  <div className="flex gap-2">
                    <input type="url" value={editForm.youtubeVideoUrl} onChange={(e) => setEditForm({ ...editForm, youtubeVideoUrl: e.target.value })} onBlur={(e) => { if (e.target.value) fetchYtInfoForUrl(e.target.value, { isEdit: true }); }} placeholder="https://youtube.com/watch?v=..." className={INPUT_CLS} />
                    {fetchingYtEdit && <span className="w-5 h-5 mt-2.5 border-2 border-[var(--abv-azure)] border-t-transparent rounded-full animate-spin flex-shrink-0" />}
                  </div>
                  {editPreviewThumb && <img src={editPreviewThumb} alt="thumbnail" className="mt-2 w-full h-28 object-cover rounded-lg" />}
                  <p className="text-xs text-[var(--abv-text)]/40 mt-1">Adding a URL links views data and the video thumbnail to this tracking link.</p>
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={saveEdit} disabled={saving || !editForm.name} className="flex-1 bg-[var(--abv-dark)] text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-[var(--abv-dark)]/90 disabled:opacity-50 transition-colors">
                  {saving ? "Saving..." : "Save Changes"}
                </button>
                <button onClick={() => setEditingLink(null)} className="px-5 py-2.5 border border-[var(--abv-text)]/20 rounded-lg text-sm text-[var(--abv-text)]/60 hover:bg-gray-50 transition-colors">
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
          <div className="bg-white rounded-lg border border-[var(--abv-text)]/10 shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-[var(--abv-text)]">Edit Campaign</h2>
              <button onClick={() => setShowEditCampaign(false)} className="text-[var(--abv-text)]/40 hover:text-[var(--abv-text)] text-xl">✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[var(--abv-text)] mb-1.5">Campaign Name</label>
                <input type="text" value={campaignEditForm.name} onChange={(e) => setCampaignEditForm({ ...campaignEditForm, name: e.target.value })} className={INPUT_CLS} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[var(--abv-text)] mb-1.5">Destination URL</label>
                <input type="text" value={campaignEditForm.destinationUrl} onChange={(e) => setCampaignEditForm({ ...campaignEditForm, destinationUrl: e.target.value })} placeholder="https://yoursite.com/free-guide" className={INPUT_CLS} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[var(--abv-text)] mb-1.5">Lead Magnet URL <span className="font-normal text-[var(--abv-text)]/40">(optional)</span></label>
                <input type="url" value={campaignEditForm.leadMagnetUrl} onChange={(e) => setCampaignEditForm({ ...campaignEditForm, leadMagnetUrl: e.target.value })} placeholder="e.g., Google Drive link to your guide" className={INPUT_CLS} />
              </div>

              {/* ── Pitch language for the Script Builder ─────────────
                  These three fields feed the script writer so it
                  doesn't invent generic pitch language from the
                  campaign name alone. See the ASSIGNED ASSETS block
                  in src/app/api/ai-tools/script-builder-v2/route.ts. */}
              <div className="pt-2 border-t border-[var(--abv-text)]/10">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--abv-text)]/40 mb-3">
                  Pitch language (used by the Script Builder)
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-[var(--abv-text)] mb-1.5">
                      One-liner pitch <span className="font-normal text-[var(--abv-text)]/40">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={campaignEditForm.pitchOneLiner}
                      onChange={(e) => setCampaignEditForm({ ...campaignEditForm, pitchOneLiner: e.target.value })}
                      placeholder="e.g., A free 10-page neighbourhood relocation guide for Oakville buyers"
                      maxLength={240}
                      className={INPUT_CLS}
                    />
                    <p className="text-[11px] text-[var(--abv-text)]/40 mt-1">
                      How you&apos;d describe it in one sentence on camera. {campaignEditForm.pitchOneLiner.length}/240
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[var(--abv-text)] mb-1.5">
                      Description <span className="font-normal text-[var(--abv-text)]/40">(optional)</span>
                    </label>
                    <textarea
                      value={campaignEditForm.description}
                      onChange={(e) => setCampaignEditForm({ ...campaignEditForm, description: e.target.value })}
                      placeholder="What's inside the lead magnet / landing page? Specific sections, numbers, or promises that the script can reference."
                      maxLength={1000}
                      rows={4}
                      className={INPUT_CLS}
                    />
                    <p className="text-[11px] text-[var(--abv-text)]/40 mt-1">
                      {campaignEditForm.description.length}/1000
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[var(--abv-text)] mb-1.5">
                      Audience <span className="font-normal text-[var(--abv-text)]/40">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={campaignEditForm.audience}
                      onChange={(e) => setCampaignEditForm({ ...campaignEditForm, audience: e.target.value })}
                      placeholder="e.g., First-time buyers relocating from Toronto"
                      maxLength={240}
                      className={INPUT_CLS}
                    />
                    <p className="text-[11px] text-[var(--abv-text)]/40 mt-1">
                      Who the lead magnet is for. {campaignEditForm.audience.length}/240
                    </p>
                  </div>
                </div>
              </div>

              {campaignEditError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{campaignEditError}</p>
              )}
              <div className="flex gap-3">
                <button onClick={saveCampaign} disabled={savingCampaign || !campaignEditForm.name || !campaignEditForm.destinationUrl} className="flex-1 bg-[var(--abv-dark)] text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-[var(--abv-dark)]/90 disabled:opacity-50 transition-colors">
                  {savingCampaign ? "Saving..." : "Save Changes"}
                </button>
                <button onClick={() => setShowEditCampaign(false)} className="px-5 py-2.5 border border-[var(--abv-text)]/20 rounded-lg text-sm text-[var(--abv-text)]/60 hover:bg-gray-50 transition-colors">
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
          <div className="bg-white rounded-lg border border-[var(--abv-text)]/10 shadow-xl w-full max-w-sm p-6">
            <h2 className="font-bold text-[var(--abv-text)] text-lg mb-2">Reset Stats?</h2>
            <p className="text-sm text-[var(--abv-text)]/60 mb-1">
              This will clear all clicks and leads recorded for:
            </p>
            <p className="text-sm font-semibold text-[var(--abv-text)] mb-4">{resetConfirmLink.name}</p>
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
                className="px-5 py-2.5 border border-[var(--abv-text)]/20 rounded-lg text-sm text-[var(--abv-text)]/60 hover:bg-gray-50 transition-colors"
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

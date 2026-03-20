"use client";

import { useState, useEffect, use, useCallback } from "react";
import Link from "next/link";
import { PencilIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { DailyLineChart, ChartEmpty } from "@/components/charts/DailyLineChart";
import { LinkBarChart } from "@/components/charts/LinkBarChart";

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
  hasYoutube: boolean;
  lastViewsUpdate: string | null;
}

interface AnalyticsData {
  daily: { date: string; clicks: number; leads: number }[];
  byLink: { linkId: string; name: string; clicks: number; leads: number; youtubeViews: number | null }[];
}

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  YOUTUBE: { label: "YouTube", color: "bg-red-100 text-red-700" },
  GOOGLE_ADS: { label: "Google Ads", color: "bg-blue-100 text-blue-700" },
  EMAIL: { label: "Email", color: "bg-green-100 text-green-700" },
  OTHER: { label: "Other", color: "bg-gray-100 text-gray-600" },
};

const PERIODS = [
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" },
  { label: "All", value: "all" },
];

const INPUT_CLS = "w-full border border-[#1e2a38]/20 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#3dc3ff]";

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
  return <div className="h-[220px] bg-[#1e2a38]/5 rounded-xl animate-pulse" />;
}

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [campaign, setCampaign] = useState<CampaignData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

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

  const [copied, setCopied] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState("newest");
  const [refreshing, setRefreshing] = useState(false);

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

  useEffect(() => {
    loadCampaign();
    fetch("/api/auth/session").then((r) => r.json()).then((s) => {
      if ((s?.user as { role?: string })?.role === "admin") setIsAdmin(true);
    }).catch(() => {});
  }, [loadCampaign]);

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
      body: JSON.stringify({ name: linkForm.name, youtubeVideoUrl: linkForm.youtubeVideoUrl || undefined }),
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

  if (loading) return <div className="text-center py-16 text-[#1e2a38]/40">Loading...</div>;
  if (!campaign) return <div className="text-center py-16 text-[#1e2a38]/40">Campaign not found.</div>;

  const isYoutube = campaign.sourceType === "YOUTUBE";
  const linkLabel = isYoutube ? "Video Name" : "Link Name";
  const linkPlaceholder = isYoutube ? "e.g. Buyers Guide Video — March" : "e.g. Email Newsletter — April";

  const src = SOURCE_LABELS[campaign.sourceType] ?? SOURCE_LABELS.OTHER;
  const ctr = campaign.totalViews && campaign.totalViews > 0
    ? Math.round((campaign.totalClicks / campaign.totalViews) * 100)
    : null;

  const sortedLinks = [...campaign.links].sort((a, b) => {
    if (sortBy === "most_clicks") return b.clicks - a.clicks;
    if (sortBy === "most_leads") return b.leads - a.leads;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const hasAnalyticsData = analytics && (analytics.daily.some((d) => d.clicks > 0) || analytics.daily.some((d) => d.leads > 0));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="mb-2">
          <Link href="/member/campaigns" className="text-sm text-[#1e2a38]/40 hover:text-[#1e2a38] transition-colors">
            ← Campaigns
          </Link>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-[#1e2a38]">{campaign.name}</h1>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${src.color}`}>{src.label}</span>
            </div>
            <a href={campaign.destinationUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-[#3dc3ff] hover:underline">
              {campaign.destinationUrl}
            </a>
          </div>
          <button
            onClick={() => setShowNewLink(true)}
            className="flex-shrink-0 bg-[#3dc3ff] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#3dc3ff]/90 transition-colors"
          >
            + New Link
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {campaign.hasYoutube && campaign.totalViews !== null && (
          <div className="bg-white border border-[#1e2a38]/10 rounded-xl p-4 text-center">
            <div className="text-xl font-bold text-[#1e2a38]">{campaign.totalViews.toLocaleString()}</div>
            <div className="text-xs text-[#1e2a38]/40 mt-0.5">Total Views</div>
          </div>
        )}
        <div className="bg-white border border-[#1e2a38]/10 rounded-xl p-4 text-center">
          <div className="text-xl font-bold text-[#1e2a38]">{campaign.totalClicks}</div>
          <div className="text-xs text-[#1e2a38]/40 mt-0.5">Clicks</div>
        </div>
        <div className="bg-white border border-[#1e2a38]/10 rounded-xl p-4 text-center">
          <div className="text-xl font-bold text-[#1e2a38]">{campaign.totalLeads}</div>
          <div className="text-xs text-[#1e2a38]/40 mt-0.5">Leads</div>
        </div>
        {campaign.hasYoutube && ctr !== null && (
          <div className="bg-white border border-[#1e2a38]/10 rounded-xl p-4 text-center">
            <div className="text-xl font-bold text-[#3dc3ff]">{ctr}%</div>
            <div className="text-xs text-[#1e2a38]/40 mt-0.5">Click-Through Rate</div>
          </div>
        )}
        <div className="bg-white border border-[#1e2a38]/10 rounded-xl p-4 text-center">
          <div className="text-xl font-bold text-[#3dc3ff]">
            {campaign.totalClicks > 0 ? Math.round((campaign.totalLeads / campaign.totalClicks) * 100) : 0}%
          </div>
          <div className="text-xs text-[#1e2a38]/40 mt-0.5">Conversion Rate</div>
        </div>
      </div>

      {/* Analytics Charts */}
      <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-[#1e2a38]">Analytics</h2>
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${period === p.value ? "bg-[#1e2a38] text-white" : "text-[#1e2a38]/50 hover:text-[#1e2a38]"}`}
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
              <p className="text-xs font-medium text-[#1e2a38]/50 mb-3">Clicks &amp; Leads Per Day</p>
              <DailyLineChart data={analytics!.daily} />
            </div>

            {analytics!.byLink.length > 1 && (
              <div>
                <p className="text-xs font-medium text-[#1e2a38]/50 mb-3">Performance by Tracking Link</p>
                <LinkBarChart data={analytics!.byLink} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tracking Links */}
      <div className="bg-white border border-[#1e2a38]/10 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1e2a38]/10 flex items-center justify-between">
          <h2 className="font-semibold text-[#1e2a38]">Tracking Links ({campaign.links.length})</h2>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="text-xs border border-[#1e2a38]/20 rounded-lg px-2 py-1.5 text-[#1e2a38]/60 focus:outline-none"
          >
            <option value="newest">Newest</option>
            <option value="most_clicks">Most Clicks</option>
            <option value="most_leads">Most Leads</option>
          </select>
        </div>

        {sortedLinks.length === 0 ? (
          <div className="p-10 text-center text-[#1e2a38]/40 text-sm">No tracking links yet. Create one to start tracking.</div>
        ) : (
          <div className="divide-y divide-[#1e2a38]/5">
            {sortedLinks.map((link) => (
              <div key={link.id} className="p-5">
                <div className="flex items-start gap-3">
                  {link.youtubeThumbnailUrl && (
                    <img src={link.youtubeThumbnailUrl} alt={link.name} className="w-20 h-14 object-cover rounded-lg flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-[#1e2a38] text-sm truncate">{link.name}</p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => openEdit(link)} className="text-[#1e2a38]/30 hover:text-[#3dc3ff] transition-colors" title="Edit link">
                          <PencilIcon className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => deleteLink(link.id)} className="text-xs text-[#1e2a38]/30 hover:text-red-500 transition-colors">Delete</button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs text-[#1e2a38]/40 truncate flex-1">{link.trackedUrl}</p>
                      <button onClick={() => copy(link.trackedUrl, link.id)} className="text-xs text-[#3dc3ff] hover:text-[#2bb0ec] flex-shrink-0 font-medium">
                        {copied === link.id ? "Copied!" : "Copy"}
                      </button>
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
                      <div className="text-sm font-semibold text-[#1e2a38]">{link.youtubeViewCount.toLocaleString()}</div>
                      <div className="text-xs text-[#1e2a38]/40">Views</div>
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-semibold text-[#1e2a38]">{link.clicks}</div>
                    <div className="text-xs text-[#1e2a38]/40">Clicks</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[#1e2a38]">{link.leads}</div>
                    <div className="text-xs text-[#1e2a38]/40">Leads</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[#3dc3ff]">{link.conversionRate}%</div>
                    <div className="text-xs text-[#1e2a38]/40">Conv. Rate</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {campaign.hasYoutube && (
        <div className="flex items-center justify-center gap-2">
          {campaign.lastViewsUpdate && (
            <p className="text-xs text-[#1e2a38]/30">YouTube views last updated {new Date(campaign.lastViewsUpdate).toLocaleString()}</p>
          )}
          {isAdmin && (
            <button onClick={refreshViews} disabled={refreshing} title="Refresh YouTube view counts now" className="text-[#1e2a38]/30 hover:text-[#3dc3ff] disabled:opacity-40 transition-colors">
              <ArrowPathIcon className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          )}
        </div>
      )}

      {/* New Link Modal */}
      {showNewLink && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-[#1e2a38]/10 shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-[#1e2a38]">New Tracking Link</h2>
              <button onClick={() => { setShowNewLink(false); setPreviewThumb(null); setNameTouchedNew(false); }} className="text-[#1e2a38]/40 hover:text-[#1e2a38] text-xl">✕</button>
            </div>
            <div className="space-y-4">
              {isYoutube && (
                <div>
                  <label className="block text-sm font-semibold text-[#1e2a38] mb-1.5">YouTube Video URL <span className="font-normal text-[#1e2a38]/40">(optional)</span></label>
                  <div className="flex gap-2">
                    <input type="url" value={linkForm.youtubeVideoUrl} onChange={(e) => setLinkForm({ ...linkForm, youtubeVideoUrl: e.target.value })} onBlur={(e) => { if (e.target.value) fetchYtInfoForUrl(e.target.value); }} placeholder="https://youtube.com/watch?v=..." className={INPUT_CLS} />
                    {fetchingYtInfo && <span className="w-5 h-5 mt-2.5 border-2 border-[#3dc3ff] border-t-transparent rounded-full animate-spin flex-shrink-0" />}
                  </div>
                  {previewThumb && <img src={previewThumb} alt="thumbnail" className="mt-2 w-full h-28 object-cover rounded-lg" />}
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-[#1e2a38] mb-1.5">{linkLabel}</label>
                <input type="text" value={linkForm.name} onChange={(e) => { setLinkForm({ ...linkForm, name: e.target.value }); setNameTouchedNew(true); }} placeholder={linkPlaceholder} className={INPUT_CLS} />
              </div>
              {!isYoutube && (
                <div>
                  <label className="block text-sm font-semibold text-[#1e2a38] mb-1.5">YouTube Video URL <span className="font-normal text-[#1e2a38]/40">(optional)</span></label>
                  <input type="url" value={linkForm.youtubeVideoUrl} onChange={(e) => setLinkForm({ ...linkForm, youtubeVideoUrl: e.target.value })} placeholder="https://youtube.com/watch?v=..." className={INPUT_CLS} />
                </div>
              )}
              <div className="bg-[#f8f9fa] rounded-xl p-3 text-xs text-[#1e2a38]/50">
                <p className="font-medium text-[#1e2a38]/70 mb-1">Tracked URL preview</p>
                <p className="break-all font-mono">{campaign.destinationUrl}{campaign.destinationUrl.includes("?") ? "&" : "?"}ref=<span className="text-[#3dc3ff]">xxxxxxxx</span></p>
              </div>
              <button onClick={createLink} disabled={creating || !linkForm.name} className="w-full bg-[#3dc3ff] text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-[#3dc3ff]/90 disabled:opacity-50 transition-colors">
                {creating ? "Creating..." : "Create Link"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Link Modal */}
      {editingLink && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-[#1e2a38]/10 shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-[#1e2a38]">Edit Link</h2>
              <button onClick={() => setEditingLink(null)} className="text-[#1e2a38]/40 hover:text-[#1e2a38] text-xl">✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[#1e2a38] mb-1.5">YouTube Video URL <span className="font-normal text-[#1e2a38]/40">(optional)</span></label>
                <div className="flex gap-2">
                  <input type="url" value={editForm.youtubeVideoUrl} onChange={(e) => setEditForm({ ...editForm, youtubeVideoUrl: e.target.value })} onBlur={(e) => { if (e.target.value) fetchYtInfoForUrl(e.target.value, { isEdit: true }); }} placeholder="https://youtube.com/watch?v=..." className={INPUT_CLS} />
                  {fetchingYtEdit && <span className="w-5 h-5 mt-2.5 border-2 border-[#3dc3ff] border-t-transparent rounded-full animate-spin flex-shrink-0" />}
                </div>
                {editPreviewThumb && <img src={editPreviewThumb} alt="thumbnail" className="mt-2 w-full h-28 object-cover rounded-lg" />}
                <p className="text-xs text-[#1e2a38]/40 mt-1">Adding a URL links views data and the video thumbnail to this tracking link.</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#1e2a38] mb-1.5">{linkLabel}</label>
                <input type="text" value={editForm.name} onChange={(e) => { setEditForm({ ...editForm, name: e.target.value }); setNameTouchedEdit(true); }} placeholder={linkPlaceholder} className={INPUT_CLS} />
              </div>
              <div className="flex gap-3">
                <button onClick={saveEdit} disabled={saving || !editForm.name} className="flex-1 bg-[#3dc3ff] text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-[#3dc3ff]/90 disabled:opacity-50 transition-colors">
                  {saving ? "Saving..." : "Save Changes"}
                </button>
                <button onClick={() => setEditingLink(null)} className="px-5 py-2.5 border border-[#1e2a38]/20 rounded-xl text-sm text-[#1e2a38]/60 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

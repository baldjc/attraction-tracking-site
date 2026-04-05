"use client";

import { useState, useEffect, useCallback } from "react";
import {
  SignalIcon,
  PlusIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlayIcon,
  EyeIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

// ── Types ────────────────────────────────────────────────────────────────────

interface Channel {
  id: string;
  channelId: string;
  name: string;
  handle: string | null;
  subscriberCount: number;
  avgViews90d: number;
  isActive: boolean;
  lastSyncedAt: string | null;
  _count: { videos: number };
}

interface OutlierVideo {
  id: string;
  videoId: string;
  title: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  durationSeconds: number;
  thumbnailUrl: string | null;
  outlierMultiplier: number | null;
  outlierTier: string | null;
  publishDate: string;
  transcriptText: string | null;
  channel: {
    id: string;
    name: string;
    handle: string | null;
    subscriberCount: number;
  };
  analysis: {
    hookType: string | null;
    videoType: string | null;
    dataPointCount: number | null;
    arcScore: number | null;
    outlierHypothesis: string | null;
  } | null;
}

interface Stats {
  totalChannels: number;
  totalVideos: number;
  totalOutliers: number;
  newOutliersThisWeek: number;
  lastPipelineRun: {
    status: string;
    startedAt: string;
    completedAt: string | null;
    channelsProcessed: number;
    outliersFound: number;
  } | null;
  topHookTypes: Array<{ hookType: string; _count: number }>;
  topVideoTypes: Array<{ videoType: string; _count: number }>;
}

interface AuditResult {
  channel: {
    channelId: string;
    name: string;
    handle: string;
    subscriberCount: number;
    totalVideoCount: number;
    thumbnailUrl: string | null;
  };
  avgViews: number;
  topVideos: Array<{
    videoId: string;
    title: string;
    viewCount: number;
    thumbnailUrl: string | null;
    outlierMultiplier: number;
  }>;
  isTracked: boolean;
  trackedId: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  performing: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  strong: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  viral: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  extreme: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  legendary: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

function tierBadge(tier: string | null) {
  if (!tier) return null;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TIER_COLORS[tier] ?? "bg-gray-100 text-gray-600"}`}>
      {tier.charAt(0).toUpperCase() + tier.slice(1)}
    </span>
  );
}

function formatNumber(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "outliers", label: "Outlier Feed" },
  { key: "channels", label: "Channels" },
  { key: "audit", label: "Channel Audit" },
  { key: "pipeline", label: "Pipeline" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// ── Main Component ───────────────────────────────────────────────────────────

export default function RadarPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
          <SignalIcon className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Radar</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            YouTube Intelligence System
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex gap-4 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && <OverviewTab />}
      {activeTab === "outliers" && <OutlierFeedTab />}
      {activeTab === "channels" && <ChannelsTab />}
      {activeTab === "audit" && <ChannelAuditTab />}
      {activeTab === "pipeline" && <PipelineTab />}
    </div>
  );
}

// ── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/radar/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;
  if (!stats) return <p className="text-gray-500">Failed to load stats.</p>;

  const statCards = [
    { label: "Channels Tracked", value: stats.totalChannels },
    { label: "Total Videos", value: formatNumber(stats.totalVideos) },
    { label: "Total Outliers", value: formatNumber(stats.totalOutliers) },
    { label: "New This Week", value: stats.newOutliersThisWeek },
  ];

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-[#1a2332]"
          >
            <p className="text-sm text-gray-500 dark:text-gray-400">{card.label}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Top Hook Types & Video Types */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-[#1a2332]">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Top Hook Types (30d)
          </h3>
          {stats.topHookTypes.length === 0 ? (
            <p className="text-sm text-gray-400">No data yet</p>
          ) : (
            <div className="space-y-2">
              {stats.topHookTypes.map((h) => (
                <div key={h.hookType} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {h.hookType?.replace(/_/g, " ")}
                  </span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    {h._count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-[#1a2332]">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Top Video Types (30d)
          </h3>
          {stats.topVideoTypes.length === 0 ? (
            <p className="text-sm text-gray-400">No data yet</p>
          ) : (
            <div className="space-y-2">
              {stats.topVideoTypes.map((v) => (
                <div key={v.videoType} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {v.videoType}
                  </span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    {v._count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Last Pipeline Run */}
      {stats.lastPipelineRun && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-[#1a2332]">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Last Pipeline Run
          </h3>
          <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
            <span>
              Status:{" "}
              <span className={stats.lastPipelineRun.status === "completed" ? "text-green-600" : "text-yellow-600"}>
                {stats.lastPipelineRun.status}
              </span>
            </span>
            <span>{timeAgo(stats.lastPipelineRun.startedAt)}</span>
            <span>{stats.lastPipelineRun.channelsProcessed} channels</span>
            <span>{stats.lastPipelineRun.outliersFound} outliers</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Outlier Feed Tab ─────────────────────────────────────────────────────────

function OutlierFeedTab() {
  const [videos, setVideos] = useState<OutlierVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [minMultiplier, setMinMultiplier] = useState("1.5");
  const [tierFilter, setTierFilter] = useState("");
  const [expandedVideo, setExpandedVideo] = useState<string | null>(null);

  const fetchOutliers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        perPage: "20",
        minMultiplier,
      });
      if (tierFilter) params.set("tier", tierFilter);

      const res = await fetch(`/api/admin/radar/outliers?${params}`);
      const data = await res.json();
      setVideos(data.videos ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, minMultiplier, tierFilter]);

  useEffect(() => {
    fetchOutliers();
  }, [fetchOutliers]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <FunnelIcon className="h-4 w-4 text-gray-400" />
          <label className="text-sm text-gray-600 dark:text-gray-400">Min Multiplier</label>
          <select
            value={minMultiplier}
            onChange={(e) => { setMinMultiplier(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-[#1a2332] dark:text-white"
          >
            <option value="1.5">1.5x+ (All)</option>
            <option value="3">3x+ (Strong)</option>
            <option value="10">10x+ (Viral)</option>
            <option value="50">50x+ (Extreme)</option>
            <option value="100">100x+ (Legendary)</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 dark:text-gray-400">Tier</label>
          <select
            value={tierFilter}
            onChange={(e) => { setTierFilter(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-[#1a2332] dark:text-white"
          >
            <option value="">All Tiers</option>
            <option value="performing">Performing</option>
            <option value="strong">Strong</option>
            <option value="viral">Viral</option>
            <option value="extreme">Extreme</option>
            <option value="legendary">Legendary</option>
          </select>
        </div>
        <span className="ml-auto text-sm text-gray-500 dark:text-gray-400">
          {total} outlier{total !== 1 ? "s" : ""}
        </span>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : videos.length === 0 ? (
        <EmptyState message="No outlier videos found. Add channels and run the pipeline to discover outliers." />
      ) : (
        <div className="space-y-3">
          {videos.map((video) => (
            <div
              key={video.id}
              className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-[#1a2332] overflow-hidden"
            >
              <div
                className="flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                onClick={() => setExpandedVideo(expandedVideo === video.id ? null : video.id)}
              >
                {/* Thumbnail */}
                {video.thumbnailUrl && (
                  <img
                    src={video.thumbnailUrl}
                    alt=""
                    className="h-16 w-28 rounded-lg object-cover flex-shrink-0"
                  />
                )}
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <a
                      href={`https://youtube.com/watch?v=${video.videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-gray-900 dark:text-white hover:text-emerald-600 truncate"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {video.title}
                    </a>
                    {tierBadge(video.outlierTier)}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {video.channel.name} · {formatNumber(video.viewCount)} views · {formatDuration(video.durationSeconds)} · {timeAgo(video.publishDate)}
                  </p>
                </div>
                {/* Multiplier */}
                <div className="text-right flex-shrink-0">
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    {video.outlierMultiplier?.toFixed(1)}x
                  </p>
                </div>
              </div>

              {/* Expanded Analysis */}
              {expandedVideo === video.id && (
                <div className="border-t border-gray-100 dark:border-gray-700 p-4 bg-gray-50/50 dark:bg-gray-800/30">
                  {video.analysis ? (
                    <div className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Hook Type</span>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {video.analysis.hookType?.replace(/_/g, " ") ?? "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Video Type</span>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {video.analysis.videoType ?? "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Data Points</span>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {video.analysis.dataPointCount ?? "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">ARC Score</span>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {video.analysis.arcScore != null ? `${video.analysis.arcScore}/100` : "—"}
                        </p>
                      </div>
                      {video.analysis.outlierHypothesis && (
                        <div className="col-span-full">
                          <span className="text-gray-500 dark:text-gray-400">Why It's an Outlier</span>
                          <p className="mt-1 text-gray-700 dark:text-gray-300">
                            {video.analysis.outlierHypothesis}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <p className="text-sm text-gray-500">No analysis yet.</p>
                      <AnalyzeButton videoId={video.id} hasTranscript={!!video.transcriptText} />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:border-gray-600 dark:hover:bg-gray-800"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:border-gray-600 dark:hover:bg-gray-800"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Channels Tab ─────────────────────────────────────────────────────────────

function ChannelsTab() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [addHandle, setAddHandle] = useState("");
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [error, setError] = useState("");

  const fetchChannels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/radar/channels");
      const data = await res.json();
      setChannels(data.channels ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  async function handleAdd() {
    if (!addHandle.trim()) return;
    setAdding(true);
    setError("");
    try {
      const res = await fetch("/api/admin/radar/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: addHandle.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to add channel");
      } else {
        setAddHandle("");
        fetchChannels();
      }
    } catch {
      setError("Network error");
    } finally {
      setAdding(false);
    }
  }

  async function handleSync(channelId: string) {
    setSyncing(channelId);
    try {
      await fetch(`/api/admin/radar/channels/${channelId}`, { method: "POST" });
      fetchChannels();
    } catch (err) {
      console.error(err);
    } finally {
      setSyncing(null);
    }
  }

  async function handleDelete(channelId: string) {
    if (!confirm("Remove this channel and all its data from Radar?")) return;
    try {
      await fetch(`/api/admin/radar/channels/${channelId}`, { method: "DELETE" });
      fetchChannels();
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="space-y-4">
      {/* Add Channel */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="YouTube handle, URL, or channel ID..."
          value={addHandle}
          onChange={(e) => setAddHandle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm dark:border-gray-600 dark:bg-[#1a2332] dark:text-white placeholder:text-gray-400"
        />
        <button
          onClick={handleAdd}
          disabled={adding || !addHandle.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          <PlusIcon className="h-4 w-4" />
          {adding ? "Adding..." : "Add Channel"}
        </button>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}

      {loading ? (
        <LoadingSpinner />
      ) : channels.length === 0 ? (
        <EmptyState message="No channels tracked yet. Add a YouTube channel above to start monitoring." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Channel</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">Subscribers</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">Avg Views (90d)</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">Videos</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">Last Synced</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {channels.map((ch) => (
                <tr key={ch.id} className="bg-white dark:bg-[#1a2332]">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{ch.name}</p>
                      {ch.handle && (
                        <a
                          href={`https://youtube.com/${ch.handle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-gray-500 hover:text-emerald-600"
                        >
                          {ch.handle}
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                    {formatNumber(ch.subscriberCount)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                    {formatNumber(Math.round(ch.avgViews90d))}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                    {ch._count.videos}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400 text-xs">
                    {ch.lastSyncedAt ? timeAgo(ch.lastSyncedAt) : "Never"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleSync(ch.id)}
                        disabled={syncing === ch.id}
                        title="Sync videos"
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-emerald-600 dark:hover:bg-gray-700 transition-colors"
                      >
                        <ArrowPathIcon className={`h-4 w-4 ${syncing === ch.id ? "animate-spin" : ""}`} />
                      </button>
                      <button
                        onClick={() => handleDelete(ch.id)}
                        title="Remove channel"
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30 transition-colors"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Channel Audit Tab ────────────────────────────────────────────────────────

function ChannelAuditTab() {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState("");
  const [tracking, setTracking] = useState(false);

  async function handleAudit() {
    if (!handle.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/admin/radar/channel-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: handle.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Audit failed");
      } else {
        setResult(data);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleTrack() {
    if (!handle.trim()) return;
    setTracking(true);
    try {
      const res = await fetch("/api/admin/radar/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: handle.trim() }),
      });
      if (res.ok) {
        setResult((prev) => prev ? { ...prev, isTracked: true } : prev);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTracking(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-[#1a2332]">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Quick Channel Audit
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Paste any YouTube channel URL or handle to instantly see their top performing videos and outlier data.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="@handle or youtube.com/... URL"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAudit()}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm dark:border-gray-600 dark:bg-[#0f1419] dark:text-white placeholder:text-gray-400"
          />
          <button
            onClick={handleAudit}
            disabled={loading || !handle.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            <MagnifyingGlassIcon className="h-4 w-4" />
            {loading ? "Analyzing..." : "Audit Channel"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Channel Header */}
          <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-[#1a2332]">
            {result.channel.thumbnailUrl && (
              <img
                src={result.channel.thumbnailUrl}
                alt=""
                className="h-14 w-14 rounded-full"
              />
            )}
            <div className="flex-1">
              <h4 className="text-lg font-bold text-gray-900 dark:text-white">
                {result.channel.name}
              </h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {result.channel.handle} · {formatNumber(result.channel.subscriberCount)} subscribers · {result.channel.totalVideoCount} videos · Avg {formatNumber(result.avgViews)} views
              </p>
            </div>
            {!result.isTracked && (
              <button
                onClick={handleTrack}
                disabled={tracking}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                <PlusIcon className="h-4 w-4" />
                {tracking ? "Adding..." : "Track in Radar"}
              </button>
            )}
            {result.isTracked && (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                Tracked
              </span>
            )}
          </div>

          {/* Top Videos */}
          <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-[#1a2332] overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Top Videos by Views
              </h4>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {result.topVideos.map((v, i) => (
                <div key={v.videoId} className="flex items-center gap-4 px-5 py-3">
                  <span className="text-sm font-medium text-gray-400 w-6">{i + 1}</span>
                  {v.thumbnailUrl && (
                    <img src={v.thumbnailUrl} alt="" className="h-12 w-20 rounded object-cover" />
                  )}
                  <div className="flex-1 min-w-0">
                    <a
                      href={`https://youtube.com/watch?v=${v.videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-gray-900 dark:text-white hover:text-emerald-600 line-clamp-1"
                    >
                      {v.title}
                    </a>
                    <p className="text-xs text-gray-500">{formatNumber(v.viewCount)} views</p>
                  </div>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    {v.outlierMultiplier.toFixed(1)}x
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Pipeline Tab ─────────────────────────────────────────────────────────────

function PipelineTab() {
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/radar/pipeline");
      const data = await res.json();
      setRuns(data.runs ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  async function handleRun() {
    if (!confirm("Run the full Radar pipeline? This may take several minutes.")) return;
    setRunning(true);
    try {
      const res = await fetch("/api/admin/radar/pipeline", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "Failed to start pipeline");
      } else {
        // Refresh runs list after a delay
        setTimeout(fetchRuns, 2000);
      }
    } catch {
      alert("Network error");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Pipeline Runs
        </h3>
        <button
          onClick={handleRun}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          <PlayIcon className="h-4 w-4" />
          {running ? "Starting..." : "Run Pipeline"}
        </button>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : runs.length === 0 ? (
        <EmptyState message="No pipeline runs yet. Add channels first, then run the pipeline." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Started</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">Channels</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">Videos</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">Outliers</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">Transcripts</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">Analyses</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {runs.map((run: any) => (
                <tr key={run.id} className="bg-white dark:bg-[#1a2332]">
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        run.status === "completed"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                          : run.status === "failed"
                          ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                          : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300"
                      }`}
                    >
                      {run.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {new Date(run.startedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                    {run.channelsProcessed}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                    {run.videosDiscovered}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                    {run.outliersFound}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                    {run.transcriptsPulled}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                    {run.analysesRun}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Shared Components ────────────────────────────────────────────────────────

function AnalyzeButton({ videoId, hasTranscript }: { videoId: string; hasTranscript: boolean }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  async function handle() {
    setLoading(true);
    try {
      if (!hasTranscript) {
        setStatus("Pulling transcript...");
        const tRes = await fetch(`/api/admin/radar/videos/${videoId}/transcript`, { method: "POST" });
        if (!tRes.ok) {
          const d = await tRes.json();
          setStatus(d.error ?? "Transcript unavailable");
          return;
        }
      }
      setStatus("Running AI analysis...");
      const aRes = await fetch(`/api/admin/radar/videos/${videoId}/analyze`, { method: "POST" });
      if (!aRes.ok) {
        const d = await aRes.json();
        setStatus(d.error ?? "Analysis failed");
      } else {
        setStatus("Done! Refresh to see results.");
      }
    } catch {
      setStatus("Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handle}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
      >
        <EyeIcon className="h-3.5 w-3.5" />
        {loading ? "Working..." : "Analyze"}
      </button>
      {status && <span className="text-xs text-gray-500">{status}</span>}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <ArrowPathIcon className="h-6 w-6 animate-spin text-gray-400" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-12 text-center dark:border-gray-600">
      <SignalIcon className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">{message}</p>
    </div>
  );
}

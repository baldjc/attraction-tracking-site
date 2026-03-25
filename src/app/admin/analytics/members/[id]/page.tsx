"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface MemberData {
  user: {
    id: string;
    fullName: string | null;
    youtubeHandle: string | null;
    youtubeChannelUrl: string | null;
    serviceTier: string;
    createdAt: string;
    lastYoutubeSyncAt: string | null;
  };
  currentScore: number | null;
  channelStats: {
    subscriberCount: number;
    subscriberChange30d: number | null;
    totalViewCount: number;
    viewChange30d: number | null;
    videosPerWeek30d: number | null;
  } | null;
  videos: {
    id: string;
    videoId: string;
    title: string;
    thumbnailUrl: string | null;
    publishedAt: string;
    viewCount: number;
    audits: { id: string; overallScore: number | null }[];
  }[];
  toolUsage: { tool: string; uses7d: number; usesAllTime: number; lastUsed: string | null }[];
  campaigns: {
    id: string;
    name: string;
    links: { id: string; name: string; destinationUrl: string; clicks7d: number; clicksAllTime: number; conversions7d: number; conversionsAllTime: number }[];
  }[];
  clickTrend30d: { date: string; clicks: number }[];
  scoreHistory: { date: string; overallScore: number | null }[];
  dimensions: {
    channelStrategy: number | null;
    contentImpact: number | null;
    viewerConnection: number | null;
    leadGeneration: number | null;
  } | null;
}

const TIER_LABELS: Record<string, string> = {
  foundations: "Foundations",
  editing_2: "Editing 2",
  editing_4: "Editing 4",
  mastery_2: "Mastery 2",
  mastery_4: "Mastery 4",
};

const TIER_COLORS: Record<string, string> = {
  foundations: "bg-cyan-600/20 text-cyan-400 border-cyan-600/30",
  editing_2: "bg-amber-600/20 text-amber-400 border-amber-600/30",
  editing_4: "bg-amber-600/20 text-amber-400 border-amber-600/30",
  mastery_2: "bg-purple-600/20 text-purple-400 border-purple-600/30",
  mastery_4: "bg-purple-600/20 text-purple-400 border-purple-600/30",
};

function scoreColor(score: number | null) {
  if (score === null) return "text-gray-500";
  if (score >= 7) return "text-emerald-400";
  if (score >= 5) return "text-yellow-400";
  return "text-red-400";
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function Delta({ val }: { val: number | null }) {
  if (val === null) return <span className="text-gray-500 text-xs">—</span>;
  const color = val > 0 ? "text-emerald-400" : val < 0 ? "text-red-400" : "text-gray-400";
  return <span className={`text-xs font-medium ${color}`}>{val > 0 ? "+" : ""}{val.toLocaleString()}</span>;
}

const tooltipStyle = { backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 12 };

export default function MemberAnalyticsDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<MemberData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [runningAudit, setRunningAudit] = useState<Record<string, boolean>>({});
  const [auditDone, setAuditDone] = useState<Record<string, string>>({});

  async function load() {
    const res = await fetch(`/api/admin/analytics/members/${id}`);
    const d = await res.json();
    setData(d);
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [id]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await fetch("/api/admin/youtube/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id }),
      });
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleRunAudit(video: MemberData["videos"][0]) {
    if (!data) return;
    setRunningAudit((p) => ({ ...p, [video.id]: true }));
    try {
      const res = await fetch("/api/audits/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: data.user.id, auditType: "single_video", videoId: video.videoId }),
      });
      const d = await res.json();
      if (d.jobId) setAuditDone((p) => ({ ...p, [video.id]: d.jobId }));
    } finally {
      setRunningAudit((p) => ({ ...p, [video.id]: false }));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <ArrowPathIcon className="w-6 h-6 animate-spin mr-2" />
        Loading…
      </div>
    );
  }

  if (!data || (data as any).error) {
    return <div className="text-red-400 p-8">Member not found.</div>;
  }

  const { user, currentScore, channelStats, videos, toolUsage, campaigns, clickTrend30d, scoreHistory, dimensions } = data;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Link href="/admin/analytics" className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200 mb-4 transition">
          <ArrowLeftIcon className="w-4 h-4" />
          Back to Analytics
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-white">{user.fullName || "Unknown Member"}</h1>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${TIER_COLORS[user.serviceTier] || "bg-gray-700 text-gray-300 border-gray-600"}`}>
                {TIER_LABELS[user.serviceTier] || user.serviceTier}
              </span>
            </div>
            {(user.youtubeHandle || user.youtubeChannelUrl) && (
              <a
                href={user.youtubeChannelUrl || `https://youtube.com/${user.youtubeHandle}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-cyan-400 hover:underline mt-1 block"
              >
                {user.youtubeHandle || user.youtubeChannelUrl}
              </a>
            )}
            <p className="text-xs text-gray-500 mt-1">Member since {fmtDate(user.createdAt)}</p>
          </div>
          <div className="flex items-center gap-4">
            {currentScore !== null && (
              <div className="text-right">
                <div className={`text-4xl font-bold ${scoreColor(currentScore)}`}>{currentScore.toFixed(1)}</div>
                <div className="text-xs text-gray-500">Current Score</div>
              </div>
            )}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-60 text-white text-sm px-4 py-2 rounded-lg transition"
            >
              <ArrowPathIcon className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing…" : "Refresh Channel"}
            </button>
          </div>
        </div>
      </div>

      {/* YouTube Activity */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">YouTube Activity</h2>

        {channelStats ? (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Subscribers</div>
              <div className="text-2xl font-bold text-white">{channelStats.subscriberCount.toLocaleString()}</div>
              <div className="mt-1"><Delta val={channelStats.subscriberChange30d} /> <span className="text-xs text-gray-500">30d</span></div>
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Views</div>
              <div className="text-2xl font-bold text-white">{channelStats.totalViewCount.toLocaleString()}</div>
              <div className="mt-1"><Delta val={channelStats.viewChange30d} /> <span className="text-xs text-gray-500">30d</span></div>
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Videos/Week</div>
              <div className="text-2xl font-bold text-white">{channelStats.videosPerWeek30d ?? "—"}</div>
              <div className="text-xs text-gray-500 mt-1">30d avg</div>
            </div>
          </div>
        ) : (
          <p className="text-gray-500 text-sm mb-4">No channel snapshot yet. Click Refresh Channel to sync.</p>
        )}

        {/* Video list */}
        <div className="space-y-3">
          {videos.slice(0, 10).map((video) => {
            const latestAudit = video.audits[0];
            const started = auditDone[video.id];
            return (
              <div key={video.id} className="flex items-center gap-4 bg-gray-800 border border-gray-700 rounded-xl p-3">
                {video.thumbnailUrl ? (
                  <img src={video.thumbnailUrl} alt={video.title} className="w-24 h-14 object-cover rounded-lg flex-shrink-0" />
                ) : (
                  <div className="w-24 h-14 bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0">
                    <VideoCameraIcon className="w-6 h-6 text-gray-500" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white font-medium truncate">{video.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{fmtDate(video.publishedAt)} · {video.viewCount.toLocaleString()} views</div>
                </div>
                <div className="flex-shrink-0">
                  {latestAudit ? (
                    <Link
                      href={`/admin/members/${user.id}/audits/${latestAudit.id}`}
                      className="text-xs bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 rounded-lg px-3 py-1.5 hover:bg-emerald-600/30 transition whitespace-nowrap"
                    >
                      View Audit {latestAudit.overallScore !== null ? `(${latestAudit.overallScore.toFixed(1)})` : ""}
                    </Link>
                  ) : started ? (
                    <span className="text-xs text-gray-400">Queued…</span>
                  ) : (
                    <button
                      onClick={() => handleRunAudit(video)}
                      disabled={runningAudit[video.id]}
                      className="text-xs bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 text-white rounded-lg px-3 py-1.5 transition whitespace-nowrap"
                    >
                      {runningAudit[video.id] ? "Starting…" : "Run Audit"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {videos.length === 0 && (
            <p className="text-gray-500 text-sm">No videos stored yet. Refresh channel to sync.</p>
          )}
        </div>
      </section>

      {/* Tool Usage */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">Tool Usage</h2>
        <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase tracking-wide">Tool</th>
                <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase tracking-wide">Uses (7d)</th>
                <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase tracking-wide">All Time</th>
                <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase tracking-wide">Last Used</th>
              </tr>
            </thead>
            <tbody>
              {toolUsage.map((t) => (
                <tr key={t.tool} className="border-b border-gray-700/50">
                  <td className="px-4 py-3 text-white font-medium">{t.tool}</td>
                  <td className="px-4 py-3 text-gray-300">{t.uses7d}</td>
                  <td className="px-4 py-3 text-gray-300">{t.usesAllTime}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(t.lastUsed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Campaigns & Leads */}
      {campaigns.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">Campaigns &amp; Leads</h2>
          <div className="space-y-4 mb-6">
            {campaigns.map((campaign) => (
              <div key={campaign.id} className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-700 text-sm font-semibold text-white">{campaign.name}</div>
                {campaign.links.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-700/50">
                        <th className="px-4 py-2 text-left text-xs text-gray-400">Link</th>
                        <th className="px-4 py-2 text-left text-xs text-gray-400">Clicks (7d)</th>
                        <th className="px-4 py-2 text-left text-xs text-gray-400">Clicks (All)</th>
                        <th className="px-4 py-2 text-left text-xs text-gray-400">Conv. (7d)</th>
                        <th className="px-4 py-2 text-left text-xs text-gray-400">Conv. (All)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaign.links.map((link) => (
                        <tr key={link.id} className="border-b border-gray-700/30">
                          <td className="px-4 py-2 text-gray-300">{link.name}</td>
                          <td className="px-4 py-2 text-gray-300">{link.clicks7d}</td>
                          <td className="px-4 py-2 text-gray-300">{link.clicksAllTime}</td>
                          <td className="px-4 py-2 text-gray-300">{link.conversions7d}</td>
                          <td className="px-4 py-2 text-gray-300">{link.conversionsAllTime}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="px-4 py-3 text-gray-500 text-sm">No links yet.</div>
                )}
              </div>
            ))}
          </div>

          {/* Click trend chart */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <div className="text-sm font-semibold text-white mb-3">Click Trend (30 days)</div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={clickTrend30d} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b7280" }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "#d1d5db" }} itemStyle={{ color: "#3dc3ff" }} />
                <Bar dataKey="clicks" fill="#3dc3ff" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Score History */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">Score History</h2>
        {scoreHistory.length > 1 ? (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 mb-6">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={scoreHistory} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b7280" }} tickFormatter={(v) => v.slice(5)} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 10, fill: "#6b7280" }} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "#d1d5db" }} itemStyle={{ color: "#3dc3ff" }} />
                <Line type="monotone" dataKey="overallScore" stroke="#3dc3ff" strokeWidth={2.5} dot={{ r: 3, fill: "#3dc3ff" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-gray-500 text-sm mb-4">
            {scoreHistory.length === 0 ? "No audits yet." : "Need at least 2 audits to show a trend."}
          </p>
        )}

        {/* Dimension scores */}
        {dimensions && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Channel Strategy", val: dimensions.channelStrategy },
              { label: "Content Impact", val: dimensions.contentImpact },
              { label: "Viewer Connection", val: dimensions.viewerConnection },
              { label: "Lead Generation", val: dimensions.leadGeneration },
            ].map(({ label, val }) => (
              <div key={label} className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
                <div className="text-xs text-gray-400 mb-2">{label}</div>
                <div className={`text-3xl font-bold ${scoreColor(val)}`}>{val !== null ? val.toFixed(1) : "—"}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

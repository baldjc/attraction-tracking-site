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
import { useTheme } from "@/components/ThemeProvider";

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
  foundations: "bg-[#3dc3ff]/10 text-[#3dc3ff] border-[#3dc3ff]/30",
  editing_2:   "bg-amber-100 dark:bg-amber-600/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-600/30",
  editing_4:   "bg-amber-100 dark:bg-amber-600/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-600/30",
  mastery_2:   "bg-purple-100 dark:bg-purple-600/20 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-600/30",
  mastery_4:   "bg-purple-100 dark:bg-purple-600/20 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-600/30",
};

// ── Design system class helpers ──────────────────────────────────────────────
const txt   = "text-[#1e2a38] dark:text-[#e2e8f0]";
const muted = "text-[#1e2a38]/60 dark:text-[#94a3b8]";
const dim   = "text-[#1e2a38]/30 dark:text-[#64748b]";
const card  = "bg-white dark:bg-[#242b3d] rounded-xl border border-gray-200 dark:border-[#2d3748] shadow-sm";
const thCls = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#1e2a38]/50 dark:text-[#94a3b8] bg-gray-50 dark:bg-[#1e2530]";
const rowCls = "border-b border-gray-100 dark:border-[#2d3748]/60 hover:bg-gray-50 dark:hover:bg-[#1a1f2e] transition-colors";

function scoreColor(score: number | null) {
  if (score === null) return "text-[#1e2a38]/30 dark:text-[#64748b]";
  if (score >= 7) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 5) return "text-yellow-600 dark:text-yellow-400";
  return "text-[#ff0033] dark:text-red-400";
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function Delta({ val }: { val: number | null }) {
  if (val === null) return <span className={`text-xs ${dim}`}>—</span>;
  const color = val > 0 ? "text-emerald-600 dark:text-emerald-400" : val < 0 ? "text-[#ff0033] dark:text-red-400" : muted;
  return <span className={`text-xs font-medium ${color}`}>{val > 0 ? "+" : ""}{val.toLocaleString()}</span>;
}

export default function MemberAnalyticsDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const chartGrid    = isDark ? "rgba(45,55,72,0.5)"   : "rgba(30,42,56,0.06)";
  const chartTick    = isDark ? "#64748b"               : "rgba(30,42,56,0.45)";
  const chartTooltip = {
    background:   isDark ? "#242b3d" : "#fff",
    border:       `1px solid ${isDark ? "#2d3748" : "#e5e7eb"}`,
    borderRadius: 8,
    fontSize:     12,
    color:        isDark ? "#e2e8f0" : "#1e2a38",
  };

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
      <div className={`flex items-center justify-center h-64 ${muted}`}>
        <ArrowPathIcon className="w-6 h-6 animate-spin mr-2" />
        Loading…
      </div>
    );
  }

  if (!data || (data as any).error) {
    return <div className="text-[#ff0033] dark:text-red-400 p-8">Member not found.</div>;
  }

  const { user, currentScore, channelStats, videos, toolUsage, campaigns, clickTrend30d, scoreHistory, dimensions } = data;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Link href="/admin/analytics" className={`flex items-center gap-1 text-sm ${muted} hover:text-[#3dc3ff] mb-4 transition`}>
          <ArrowLeftIcon className="w-4 h-4" />
          Back to Analytics
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className={`text-2xl font-bold ${txt}`}>{user.fullName || "Unknown Member"}</h1>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${TIER_COLORS[user.serviceTier] || "bg-gray-100 dark:bg-gray-700 text-[#1e2a38]/60 dark:text-gray-300 border-gray-200 dark:border-gray-600"}`}>
                {TIER_LABELS[user.serviceTier] || user.serviceTier}
              </span>
            </div>
            {(user.youtubeHandle || user.youtubeChannelUrl) && (
              <a
                href={user.youtubeChannelUrl || `https://youtube.com/${user.youtubeHandle}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-[#3dc3ff] hover:underline mt-1 block"
              >
                {user.youtubeHandle || user.youtubeChannelUrl}
              </a>
            )}
            <p className={`text-xs ${dim} mt-1`}>Member since {fmtDate(user.createdAt)}</p>
          </div>
          <div className="flex items-center gap-4">
            {currentScore !== null && (
              <div className="text-right">
                <div className={`text-4xl font-bold ${scoreColor(currentScore)}`}>{currentScore.toFixed(1)}</div>
                <div className={`text-xs ${dim}`}>Current Score</div>
              </div>
            )}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className={`flex items-center gap-2 border border-gray-200 dark:border-[#2d3748] bg-white dark:bg-[#242b3d] hover:bg-gray-50 dark:hover:bg-[#1a1f2e] disabled:opacity-60 ${txt} text-sm px-4 py-2 rounded-lg transition`}
            >
              <ArrowPathIcon className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing…" : "Refresh Channel"}
            </button>
          </div>
        </div>
      </div>

      {/* YouTube Activity */}
      <section>
        <h2 className={`text-lg font-semibold ${txt} mb-4`}>YouTube Activity</h2>

        {channelStats ? (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className={`${card} p-4`}>
              <div className={`text-xs ${muted} uppercase tracking-wide mb-1`}>Subscribers</div>
              <div className={`text-2xl font-bold ${txt}`}>{channelStats.subscriberCount.toLocaleString()}</div>
              <div className="mt-1 flex items-center gap-1.5">
                <Delta val={channelStats.subscriberChange30d} />
                <span className={`text-xs ${dim}`}>30d</span>
              </div>
            </div>
            <div className={`${card} p-4`}>
              <div className={`text-xs ${muted} uppercase tracking-wide mb-1`}>Total Views</div>
              <div className={`text-2xl font-bold ${txt}`}>{channelStats.totalViewCount.toLocaleString()}</div>
              <div className="mt-1 flex items-center gap-1.5">
                <Delta val={channelStats.viewChange30d} />
                <span className={`text-xs ${dim}`}>30d</span>
              </div>
            </div>
            <div className={`${card} p-4`}>
              <div className={`text-xs ${muted} uppercase tracking-wide mb-1`}>Videos/Week</div>
              <div className={`text-2xl font-bold ${txt}`}>{channelStats.videosPerWeek30d ?? "—"}</div>
              <div className={`text-xs ${dim} mt-1`}>30d avg</div>
            </div>
          </div>
        ) : (
          <p className={`${muted} text-sm mb-4`}>No channel snapshot yet. Click Refresh Channel to sync.</p>
        )}

        {/* Video list */}
        <div className="space-y-3">
          {videos.slice(0, 10).map((video) => {
            const latestAudit = video.audits[0];
            const started = auditDone[video.id];
            return (
              <div key={video.id} className={`flex items-center gap-4 ${card} p-3`}>
                {video.thumbnailUrl ? (
                  <img src={video.thumbnailUrl} alt={video.title} className="w-24 h-14 object-cover rounded-lg flex-shrink-0" />
                ) : (
                  <div className="w-24 h-14 bg-gray-100 dark:bg-[#1e2530] rounded-lg flex items-center justify-center flex-shrink-0">
                    <VideoCameraIcon className={`w-6 h-6 ${dim}`} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className={`text-sm ${txt} font-medium truncate`}>{video.title}</div>
                  <div className={`text-xs ${dim} mt-0.5`}>{fmtDate(video.publishedAt)} · {video.viewCount.toLocaleString()} views</div>
                </div>
                <div className="flex-shrink-0">
                  {latestAudit ? (
                    <Link
                      href={`/admin/audits/${latestAudit.id}`}
                      className="text-xs bg-emerald-50 dark:bg-emerald-600/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-600/30 rounded-lg px-3 py-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-600/30 transition whitespace-nowrap"
                    >
                      View Audit {latestAudit.overallScore !== null ? `(${latestAudit.overallScore.toFixed(1)})` : ""}
                    </Link>
                  ) : started ? (
                    <span className={`text-xs ${dim}`}>Queued…</span>
                  ) : (
                    <button
                      onClick={() => handleRunAudit(video)}
                      disabled={runningAudit[video.id]}
                      className="text-xs bg-[#3dc3ff] hover:bg-[#29b0f0] disabled:opacity-60 text-white rounded-lg px-3 py-1.5 transition whitespace-nowrap"
                    >
                      {runningAudit[video.id] ? "Starting…" : "Run Audit"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {videos.length === 0 && (
            <p className={`${muted} text-sm`}>No videos stored yet. Refresh channel to sync.</p>
          )}
        </div>
      </section>

      {/* Tool Usage */}
      <section>
        <h2 className={`text-lg font-semibold ${txt} mb-4`}>Tool Usage</h2>
        <div className={`${card} overflow-hidden`}>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={thCls}>Tool</th>
                <th className={thCls}>Uses (7d)</th>
                <th className={thCls}>All Time</th>
                <th className={thCls}>Last Used</th>
              </tr>
            </thead>
            <tbody>
              {toolUsage.map((t) => (
                <tr key={t.tool} className={rowCls}>
                  <td className={`px-4 py-3 font-medium ${txt}`}>{t.tool}</td>
                  <td className={`px-4 py-3 ${muted}`}>{t.uses7d}</td>
                  <td className={`px-4 py-3 ${muted}`}>{t.usesAllTime}</td>
                  <td className={`px-4 py-3 text-xs ${dim}`}>{fmtDate(t.lastUsed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Campaigns & Leads */}
      {campaigns.length > 0 && (
        <section>
          <h2 className={`text-lg font-semibold ${txt} mb-4`}>Campaigns &amp; Leads</h2>
          <div className="space-y-4 mb-6">
            {campaigns.map((campaign) => (
              <div key={campaign.id} className={`${card} overflow-hidden`}>
                <div className={`px-4 py-3 border-b border-gray-100 dark:border-[#2d3748] text-sm font-semibold ${txt}`}>{campaign.name}</div>
                {campaign.links.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className={thCls}>Link</th>
                        <th className={thCls}>Clicks (7d)</th>
                        <th className={thCls}>Clicks (All)</th>
                        <th className={thCls}>Conv. (7d)</th>
                        <th className={thCls}>Conv. (All)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaign.links.map((link) => (
                        <tr key={link.id} className={rowCls}>
                          <td className={`px-4 py-2 ${muted}`}>{link.name}</td>
                          <td className={`px-4 py-2 ${muted}`}>{link.clicks7d}</td>
                          <td className={`px-4 py-2 ${muted}`}>{link.clicksAllTime}</td>
                          <td className={`px-4 py-2 ${muted}`}>{link.conversions7d}</td>
                          <td className={`px-4 py-2 ${muted}`}>{link.conversionsAllTime}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className={`px-4 py-3 text-sm ${dim}`}>No links yet.</div>
                )}
              </div>
            ))}
          </div>

          {/* Click trend chart */}
          <div className={`${card} p-4`}>
            <div className={`text-sm font-semibold ${txt} mb-3`}>Click Trend (30 days)</div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={clickTrend30d} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: chartTick }} tickFormatter={(v) => v.slice(5)} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: chartTick }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={chartTooltip} />
                <Bar dataKey="clicks" fill="#3dc3ff" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Score History */}
      <section>
        <h2 className={`text-lg font-semibold ${txt} mb-4`}>Score History</h2>
        {scoreHistory.length > 1 ? (
          <div className={`${card} p-4 mb-6`}>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={scoreHistory} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: chartTick }} tickFormatter={(v) => v.slice(5)} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 10, fill: chartTick }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={chartTooltip} />
                <Line type="monotone" dataKey="overallScore" stroke="#3dc3ff" strokeWidth={2.5} dot={{ r: 3, fill: "#3dc3ff" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className={`${muted} text-sm mb-4`}>
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
              <div key={label} className={`${card} p-4 text-center`}>
                <div className={`text-xs ${muted} mb-2`}>{label}</div>
                <div className={`text-3xl font-bold ${scoreColor(val)}`}>{val !== null ? val.toFixed(1) : "—"}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

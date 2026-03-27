"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  VideoCameraIcon,
  UserGroupIcon,
  ExclamationTriangleIcon,
  CursorArrowRaysIcon,
  TrophyIcon,
  ArrowPathIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";

interface SummaryCards {
  videosThisWeek: number;
  activeMembers: number;
  inactiveMembers: number;
  linkClicks7d: number;
  topLead: { userId: string; fullName: string; conversions: number } | null;
}

interface RecentVideo {
  id: string;
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  viewCount: number;
  user: { id: string; fullName: string | null };
  audits: { id: string; overallScore: number | null }[];
}

interface MemberRow {
  id: string;
  fullName: string | null;
  serviceTier: string;
  lastVideoAt: string | null;
  videos7d: number;
  currentScore: number | null;
  toolUses7d: number;
  clicks7d: number;
  conversions7d: number;
  status: string;
}

type SortKey = "fullName" | "lastVideoAt" | "videos7d" | "currentScore" | "toolUses7d" | "clicks7d" | "conversions7d" | "status";
type SortDir = "asc" | "desc";

const TIER_LABELS: Record<string, string> = {
  foundations: "Foundations",
  editing_2: "Editing 2",
  editing_4: "Editing 4",
  mastery_2: "Mastery 2",
  mastery_4: "Mastery 4",
};

// ── Design system class helpers ──────────────────────────────────────────────
const txt   = "text-[#2f3437] dark:text-[#e2e8f0]";
const muted = "text-[#2f3437]/60 dark:text-[#94a3b8]";
const dim   = "text-[#2f3437]/30 dark:text-[#64748b]";
const card  = "bg-white dark:bg-[#1a1a1a] rounded-lg border border-gray-200 dark:border-[#2a2a2a]";
const thCls = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#2f3437]/50 dark:text-[#94a3b8] bg-gray-50 dark:bg-[#1e2530] whitespace-nowrap";
const rowHover = "border-b border-gray-100 dark:border-[#2a2a2a]/60 hover:bg-gray-50 dark:hover:bg-[#111111] transition-colors";

function scoreColor(score: number | null) {
  if (score === null) return muted;
  if (score >= 7) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 5) return "text-yellow-600 dark:text-yellow-400";
  return "text-[#ff0033] dark:text-red-400";
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "active" ? "bg-emerald-500" :
    status === "at_risk" ? "bg-yellow-400" :
    "bg-red-400";
  const label =
    status === "active" ? "Active" :
    status === "at_risk" ? "At Risk" :
    "Inactive";
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      <span className={`text-xs ${muted}`}>{label}</span>
    </span>
  );
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const PAGE_SIZE = 20;

export default function AnalyticsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const pageRole = (session?.user as any)?.role;

  const [cards, setCards] = useState<SummaryCards | null>(null);
  const [recentVideos, setRecentVideos] = useState<RecentVideo[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [runningAudit, setRunningAudit] = useState<Record<string, boolean>>({});
  const [auditDone, setAuditDone] = useState<Record<string, string>>({});

  const [statusFilter, setStatusFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("fullName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (session && pageRole === "editor") router.replace("/admin");
  }, [session, pageRole, router]);

  useEffect(() => {
    fetch("/api/admin/analytics")
      .then((r) => r.json())
      .then((d) => {
        setCards(d.cards);
        setRecentVideos(d.recentVideos || []);
        setMembers(d.members || []);
        setLastSyncedAt(d.lastSyncedAt);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleRefreshAll() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/admin/youtube/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const d = await res.json();
      setSyncMsg(`Synced ${d.membersPolled ?? 0} members — ${d.newVideosFound ?? 0} new videos found.`);
      const refreshed = await fetch("/api/admin/analytics").then((r) => r.json());
      setCards(refreshed.cards);
      setRecentVideos(refreshed.recentVideos || []);
      setMembers(refreshed.members || []);
      setLastSyncedAt(refreshed.lastSyncedAt);
    } catch {
      setSyncMsg("Sync failed. Please try again.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleRunAudit(video: RecentVideo) {
    setRunningAudit((p) => ({ ...p, [video.id]: true }));
    try {
      const res = await fetch("/api/audits/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: video.user.id, auditType: "single_video", videoId: video.videoId }),
      });
      const d = await res.json();
      if (d.jobId) {
        setAuditDone((p) => ({ ...p, [video.id]: d.jobId }));
      }
    } finally {
      setRunningAudit((p) => ({ ...p, [video.id]: false }));
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span className={`${dim} ml-1`}>↕</span>;
    return sortDir === "asc" ? (
      <ChevronUpIcon className="w-3 h-3 inline ml-1 text-[#0d9488]" />
    ) : (
      <ChevronDownIcon className="w-3 h-3 inline ml-1 text-[#0d9488]" />
    );
  }

  const filtered = members
    .filter((m) => statusFilter === "all" || m.status === statusFilter)
    .filter((m) => tierFilter === "all" || m.serviceTier === tierFilter)
    .sort((a, b) => {
      let av: any = a[sortKey];
      let bv: any = b[sortKey];
      if (av === null) av = sortDir === "asc" ? Infinity : -Infinity;
      if (bv === null) bv = sortDir === "asc" ? Infinity : -Infinity;
      if (typeof av === "string" && typeof bv === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? av - bv : bv - av;
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (pageRole === "editor") return null;

  if (loading) {
    return (
      <div className={`flex items-center justify-center h-64 ${muted}`}>
        <ArrowPathIcon className="w-6 h-6 animate-spin mr-2" />
        Loading analytics…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-2xl font-bold ${txt}`}>Member Analytics</h1>
          {lastSyncedAt && (
            <p className={`text-sm ${muted} mt-1`}>Last synced {fmtDate(lastSyncedAt)}</p>
          )}
        </div>
        <button
          onClick={handleRefreshAll}
          disabled={syncing}
          className="flex items-center gap-2 bg-[#0d9488] hover:bg-[#29b0f0] disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
        >
          <ArrowPathIcon className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing…" : "Refresh All Channels"}
        </button>
      </div>

      {syncMsg && (
        <div className="bg-[#0d9488]/10 border border-[#0d9488]/30 text-[#2f3437] dark:text-[#e2e8f0] text-sm px-4 py-3 rounded-lg">
          {syncMsg}
        </div>
      )}

      {/* Summary Cards */}
      {cards && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className={`${card} p-4`}>
            <div className="flex items-center gap-3 mb-3">
              <VideoCameraIcon className="w-5 h-5 text-[#0d9488]" />
              <span className={`text-xs uppercase tracking-wide font-semibold ${muted}`}>Videos This Week</span>
            </div>
            <div className={`text-3xl font-bold ${txt}`}>{cards.videosThisWeek}</div>
          </div>
          <div className={`${card} p-4`}>
            <div className="flex items-center gap-3 mb-3">
              <UserGroupIcon className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
              <span className={`text-xs uppercase tracking-wide font-semibold ${muted}`}>Active Members</span>
            </div>
            <div className={`text-3xl font-bold ${txt}`}>{cards.activeMembers}</div>
          </div>
          <div className={`${card} p-4`}>
            <div className="flex items-center gap-3 mb-3">
              <ExclamationTriangleIcon className="w-5 h-5 text-[#ff0033] dark:text-red-400" />
              <span className={`text-xs uppercase tracking-wide font-semibold ${muted}`}>Inactive</span>
            </div>
            <div className={`text-3xl font-bold ${txt}`}>{cards.inactiveMembers}</div>
          </div>
          <div className={`${card} p-4`}>
            <div className="flex items-center gap-3 mb-3">
              <CursorArrowRaysIcon className="w-5 h-5 text-[#0d9488]" />
              <span className={`text-xs uppercase tracking-wide font-semibold ${muted}`}>Link Clicks (7d)</span>
            </div>
            <div className={`text-3xl font-bold ${txt}`}>{cards.linkClicks7d}</div>
          </div>
          <div className={`${card} p-4`}>
            <div className="flex items-center gap-3 mb-3">
              <TrophyIcon className="w-5 h-5 text-yellow-500 dark:text-yellow-400" />
              <span className={`text-xs uppercase tracking-wide font-semibold ${muted}`}>Top Lead Performer</span>
            </div>
            {cards.topLead ? (
              <>
                <div className={`text-sm font-semibold ${txt} truncate`}>{cards.topLead.fullName}</div>
                <div className={`text-xs ${muted}`}>{cards.topLead.conversions} conversions</div>
              </>
            ) : (
              <div className={`text-sm ${dim}`}>—</div>
            )}
          </div>
        </div>
      )}

      {/* Recent Videos */}
      {recentVideos.length > 0 && (
        <section>
          <h2 className={`text-lg font-semibold ${txt} mb-4`}>Videos Published This Week</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {recentVideos.map((video) => {
              const latestAudit = video.audits[0];
              const started = auditDone[video.id];
              return (
                <div key={video.id} className={`${card} overflow-hidden flex flex-col`}>
                  {video.thumbnailUrl ? (
                    <img src={video.thumbnailUrl} alt={video.title} className="w-full aspect-video object-cover" />
                  ) : (
                    <div className="w-full aspect-video bg-gray-100 dark:bg-[#1e2530] flex items-center justify-center">
                      <VideoCameraIcon className={`w-8 h-8 ${dim}`} />
                    </div>
                  )}
                  <div className="p-3 flex flex-col gap-2 flex-1">
                    <div className="text-xs text-[#0d9488] font-medium truncate">{video.user.fullName || "Unknown"}</div>
                    <div className={`text-sm ${txt} font-medium line-clamp-2 leading-snug`}>{video.title}</div>
                    <div className={`text-xs ${dim}`}>{fmtDate(video.publishedAt)} · {video.viewCount.toLocaleString()} views</div>
                    <div className="mt-auto">
                      {latestAudit ? (
                        <Link
                          href={`/admin/audits/${latestAudit.id}`}
                          className="block text-center text-xs bg-emerald-50 dark:bg-emerald-600/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-600/30 rounded-lg px-3 py-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-600/30 transition"
                        >
                          View Audit {latestAudit.overallScore !== null ? `(${Number(latestAudit.overallScore).toFixed(1)})` : ""}
                        </Link>
                      ) : started ? (
                        <div className={`text-center text-xs ${dim} py-1.5`}>Audit queued…</div>
                      ) : (
                        <button
                          onClick={() => handleRunAudit(video)}
                          disabled={runningAudit[video.id]}
                          className="w-full text-xs bg-[#0d9488] hover:bg-[#29b0f0] disabled:opacity-60 text-white rounded-lg px-3 py-1.5 transition"
                        >
                          {runningAudit[video.id] ? "Starting…" : "Run Audit"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Member Table */}
      <section>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h2 className={`text-lg font-semibold ${txt}`}>Member Engagement</h2>
          <div className="flex items-center gap-1 ml-auto flex-wrap">
            {["all", "active", "at_risk", "inactive"].map((s) => (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setPage(1); }}
                className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                  statusFilter === s
                    ? "bg-[#0d9488] border-[#0d9488] text-white"
                    : "bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-[#2a2a2a] text-[#2f3437]/60 dark:text-[#94a3b8] hover:border-[#0d9488]/50"
                }`}
              >
                {s === "all" ? "All" : s === "at_risk" ? "At Risk" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
            <select
              value={tierFilter}
              onChange={(e) => { setTierFilter(e.target.value); setPage(1); }}
              className={`text-xs bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-[#2a2a2a] ${txt} rounded-lg px-3 py-1.5 ml-2 focus:outline-none focus:border-[#0d9488]`}
            >
              <option value="all">All Tiers</option>
              {Object.entries(TIER_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        </div>

        <div className={`${card} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {[
                    { key: "fullName", label: "Member" },
                    { key: "lastVideoAt", label: "Last Video" },
                    { key: "videos7d", label: "Videos (7d)" },
                    { key: "currentScore", label: "Score" },
                    { key: "toolUses7d", label: "Tools (7d)" },
                    { key: "clicks7d", label: "Clicks (7d)" },
                    { key: "conversions7d", label: "Conv. (7d)" },
                    { key: "status", label: "Status" },
                  ].map(({ key, label }) => (
                    <th
                      key={key}
                      onClick={() => toggleSort(key as SortKey)}
                      className={`${thCls} cursor-pointer select-none`}
                    >
                      {label}
                      <SortIcon col={key as SortKey} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={8} className={`px-4 py-8 text-center ${dim}`}>No members match current filters.</td>
                  </tr>
                ) : (
                  paginated.map((m) => (
                    <tr key={m.id} className={rowHover}>
                      <td className="px-4 py-3">
                        <Link href={`/admin/analytics/members/${m.id}`} className="text-[#0d9488] hover:underline font-medium">
                          {m.fullName || "Unknown"}
                        </Link>
                        <div className={`text-xs ${dim}`}>{TIER_LABELS[m.serviceTier] || m.serviceTier}</div>
                      </td>
                      <td className={`px-4 py-3 ${muted} whitespace-nowrap`}>{fmtDate(m.lastVideoAt)}</td>
                      <td className={`px-4 py-3 ${muted}`}>{m.videos7d}</td>
                      <td className={`px-4 py-3 font-semibold ${scoreColor(m.currentScore)}`}>
                        {m.currentScore !== null ? m.currentScore.toFixed(1) : "—"}
                      </td>
                      <td className={`px-4 py-3 ${muted}`}>{m.toolUses7d}</td>
                      <td className={`px-4 py-3 ${muted}`}>{m.clicks7d}</td>
                      <td className={`px-4 py-3 ${muted}`}>{m.conversions7d}</td>
                      <td className="px-4 py-3">
                        <StatusDot status={m.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-[#2a2a2a]">
            <span className={`text-xs ${dim}`}>
              Showing {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className={`text-xs px-3 py-1.5 bg-gray-100 dark:bg-[#1e2530] border border-gray-200 dark:border-[#2a2a2a] rounded-lg disabled:opacity-40 hover:bg-gray-200 dark:hover:bg-[#2a2a2a] transition ${muted}`}
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className={`text-xs px-3 py-1.5 bg-gray-100 dark:bg-[#1e2530] border border-gray-200 dark:border-[#2a2a2a] rounded-lg disabled:opacity-40 hover:bg-gray-200 dark:hover:bg-[#2a2a2a] transition ${muted}`}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

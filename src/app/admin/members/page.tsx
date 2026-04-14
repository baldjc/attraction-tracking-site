"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ArrowPathIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  VideoCameraIcon,
  UserGroupIcon,
  ExclamationTriangleIcon,
  CursorArrowRaysIcon,
  TrophyIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/ToastProvider";

interface SummaryCards {
  videosThisWeek: number;
  activeMembers: number;
  inactiveMembers: number;
  linkClicks7d: number;
  topLead: { userId: string; fullName: string; conversions: number } | null;
  mrr: number;
  usdToCadRate: number;
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

interface Member {
  id: string;
  email: string;
  fullName: string | null;
  youtubeHandle: string | null;
  youtubeChannelUrl: string | null;
  youtubeChannelThumbnail: string | null;
  serviceTier: string;
  latestAuditScore: number | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  stripePlanName: string | null;
  stripeCurrentPeriodEnd: string | null;
  stripePriceAmount: number | null;
  stripeCurrency: string | null;
  lastVideoAt: string | null;
  videos7d: number;
  clicks7d: number;
  conversions7d: number;
  toolUses7d: number;
  status: string;
}

type TierFilter = "all" | "foundations" | "production" | "growth" | "done_with_you";
type SubFilter = "all" | "active" | "past_due" | "cancelled" | "none";
type StatusFilter = "all" | "active" | "at_risk" | "inactive";
type SortKey = "fullName" | "videos7d" | "clicks7d" | "conversions7d" | "toolUses7d" | "latestAuditScore" | "status" | "lastVideoAt";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 50;

const tierLabels: Record<string, string> = {
  foundations: "Foundations",
  editing_2: "Production (2)",
  editing_4: "Production (4)",
  mastery_2: "Growth (2)",
  mastery_4: "Growth (4)",
  done_with_you: "Done-With-You",
};

const txt   = "text-[#2f3437]";
const muted = "text-[#2f3437]/60";
const dim   = "text-[#2f3437]/30";
const card  = "bg-white rounded-lg border border-gray-200";
const thCls = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#2f3437]/50 bg-gray-50 whitespace-nowrap select-none cursor-pointer";

function tierBadge(tier: string) {
  const label = tierLabels[tier] || tier;
  const cls =
    tier === "foundations"
      ? "bg-[#6ba3c7] text-white"
      : tier === "editing_2" || tier === "editing_4"
      ? "bg-[#f59e0b] text-white"
      : tier === "mastery_2" || tier === "mastery_4"
      ? "bg-[#8b5cf6] text-white"
      : tier === "done_with_you"
      ? "bg-[#78350f] text-[#fef3c7]"
      : "bg-gray-200 text-gray-700";
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${cls}`}>{label}</span>
  );
}

function subStatusBadge(status: string | null) {
  if (!status) return null;
  const cfg: Record<string, { dot: string; label: string; cls: string }> = {
    active:    { dot: "bg-green-500",  label: "Active",    cls: "text-green-700 bg-green-50 border-green-200" },
    trialing:  { dot: "bg-blue-400",   label: "Trial",     cls: "text-blue-700 bg-blue-50 border-blue-200" },
    past_due:  { dot: "bg-amber-400",  label: "Past Due",  cls: "text-amber-700 bg-amber-50 border-amber-200" },
    cancelled: { dot: "bg-red-500",    label: "Cancelled", cls: "text-red-700 bg-red-50 border-red-200" },
  };
  const c = cfg[status] ?? { dot: "bg-gray-400", label: status, cls: "text-gray-600 bg-gray-50 border-gray-200" };
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold border px-2 py-0.5 rounded-full ${c.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
      {c.label}
    </span>
  );
}

function fmtPeriodEnd(iso: string | null, status: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  const formatted = d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
  return status === "cancelled" ? `Ended ${formatted}` : `Renews ${formatted}`;
}

function scoreColor(score: number | null) {
  if (score === null) return muted;
  if (score >= 7) return "text-emerald-600 font-semibold";
  if (score >= 5) return "text-yellow-600 font-semibold";
  return "text-red-500 font-semibold";
}

function StatusDot({ status }: { status: string }) {
  const cfg: Record<string, { color: string; label: string }> = {
    active:   { color: "bg-emerald-500", label: "Active" },
    at_risk:  { color: "bg-yellow-400",  label: "At Risk" },
    inactive: { color: "bg-red-400",     label: "Inactive" },
  };
  const c = cfg[status] ?? { color: "bg-gray-400", label: status };
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span className={`w-2 h-2 rounded-full shrink-0 ${c.color}`} />
      <span className={`text-xs ${muted}`}>{c.label}</span>
    </span>
  );
}

function fmtPrice(cents: number | null) {
  if (!cents) return null;
  const dollars = Math.round(cents / 100);
  return `$${dollars.toLocaleString("en-CA")}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function matchesTierFilter(tier: string, filter: TierFilter) {
  if (filter === "all") return true;
  if (filter === "foundations") return tier === "foundations";
  if (filter === "production") return tier === "editing_2" || tier === "editing_4";
  if (filter === "growth") return tier === "mastery_2" || tier === "mastery_4";
  if (filter === "done_with_you") return tier === "done_with_you";
  return true;
}

function matchesSubFilter(m: Member, filter: SubFilter) {
  if (filter === "all") return true;
  if (filter === "none") return !m.subscriptionStatus;
  return m.subscriptionStatus === filter;
}

function subtitleLabel(count: number) {
  return `${count} Member${count !== 1 ? "s" : ""}`;
}

const TIER_FILTERS: { value: TierFilter; label: string }[] = [
  { value: "all",          label: "All" },
  { value: "foundations",  label: "Foundations" },
  { value: "production",   label: "Production" },
  { value: "growth",       label: "Growth" },
  { value: "done_with_you", label: "Done-With-You" },
];

const SUB_FILTERS: { value: SubFilter; label: string }[] = [
  { value: "all",       label: "All" },
  { value: "active",    label: "Active" },
  { value: "past_due",  label: "Past Due" },
  { value: "cancelled", label: "Cancelled" },
  { value: "none",      label: "No Sub" },
];

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all",      label: "All" },
  { value: "active",   label: "Active" },
  { value: "at_risk",  label: "At Risk" },
  { value: "inactive", label: "Inactive" },
];

function MembersPageInner() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role ?? "admin";
  const isEditorRole = role === "editor";
  const searchParams = useSearchParams();
  const router = useRouter();
  const toast = useToast();

  const [members, setMembers] = useState<Member[]>([]);
  const [cards, setCards] = useState<SummaryCards | null>(null);
  const [recentVideos, setRecentVideos] = useState<RecentVideo[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [flaggedInactive, setFlaggedInactive] = useState<{ email: string; name: string }[]>([]);

  const [refreshing, setRefreshing] = useState(false);
  const [backfillingPrices, setBackfillingPrices] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  const [runningAudit, setRunningAudit] = useState<Record<string, boolean>>({});
  const [auditDone, setAuditDone] = useState<Record<string, string>>({});

  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [tierFilter, setTierFilter] = useState<TierFilter>((searchParams.get("tier") as TierFilter) || "all");
  const [subFilter, setSubFilter] = useState<SubFilter>((searchParams.get("sub") as SubFilter) || "all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>((searchParams.get("status") as StatusFilter) || "all");

  const [sortKey, setSortKey] = useState<SortKey>("fullName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [videosOpen, setVideosOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (tierFilter !== "all") params.set("tier", tierFilter);
    if (subFilter !== "all") params.set("sub", subFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    const qs = params.toString();
    router.replace(`/admin/members${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [search, tierFilter, subFilter, statusFilter, router]);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/members");
      const data = await res.json();
      const memberList: Member[] = data.members || [];
      setMembers(memberList);
      setCards(data.cards || null);
      setRecentVideos(data.recentVideos || []);
      setLastSyncedAt(data.lastSyncedAt || null);
      const needsBackfill = memberList.some(
        (m) => m.stripeSubscriptionId && (m.stripePriceAmount === null || m.stripeCurrency === null)
      );
      if (needsBackfill) {
        setBackfillingPrices(true);
        fetch("/api/admin/stripe/backfill-prices", { method: "POST" })
          .then(() => fetch("/api/members"))
          .then((r) => r.json())
          .then((d) => {
            setMembers(d.members || []);
            setCards(d.cards || null);
          })
          .finally(() => setBackfillingPrices(false));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    setFlaggedInactive([]);
    try {
      const res = await fetch("/api/ghl-sync", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setSyncResult(`Error: ${data.error}${data.details ? ` — ${data.details}` : ""}`);
      } else {
        setSyncResult(`Synced: ${data.created} new, ${data.updated} updated, ${data.skipped} unchanged`);
        if (data.flaggedInactive?.length > 0) setFlaggedInactive(data.flaggedInactive);
        fetchMembers();
      }
    } catch {
      setSyncResult("Sync failed. Check your GHL API key.");
    }
    setSyncing(false);
  }

  async function handleRefreshAll() {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const res = await fetch("/api/admin/youtube/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const d = await res.json();
      setRefreshMsg(`Synced ${d.membersPolled ?? 0} members — ${d.newVideosFound ?? 0} new videos found.`);
      fetchMembers();
    } catch {
      setRefreshMsg("Sync failed. Please try again.");
    }
    setRefreshing(false);
  }

  function handleExportCSV() {
    const headers = [
      "Name", "Email", "YouTube Handle", "Tier", "Subscription",
      "Audit Score", "Videos (7d)", "Clicks (7d)", "Conversions (7d)",
      "Tool Uses (7d)", "Status",
    ];
    const rows = filtered.map((m: Member) => [
      m.fullName || "",
      m.email || "",
      m.youtubeHandle || "",
      m.serviceTier || "",
      m.subscriptionStatus || "",
      m.latestAuditScore ?? "",
      m.videos7d ?? 0,
      m.clicks7d ?? 0,
      m.conversions7d ?? 0,
      m.toolUses7d ?? 0,
      m.status || "",
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `members-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} members to CSV`);
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
      if (d.jobId) setAuditDone((p) => ({ ...p, [video.id]: d.jobId }));
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
    return sortDir === "asc"
      ? <ChevronUpIcon className="w-3 h-3 inline ml-1 text-[#6ba3c7]" />
      : <ChevronDownIcon className="w-3 h-3 inline ml-1 text-[#6ba3c7]" />;
  }

  function FilterBtn({ active, label, activeClass, onClick }: { active: boolean; label: string; activeClass: string; onClick: () => void }) {
    return (
      <button
        onClick={onClick}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
          active ? activeClass : "bg-white text-[#2f3437]/60 border-gray-200 hover:border-gray-300 hover:text-[#2f3437]"
        }`}
      >
        {label}
      </button>
    );
  }

  const filtered = members
    .filter((m) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        m.fullName?.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.youtubeHandle?.toLowerCase().includes(q)
      );
    })
    .filter((m) => matchesTierFilter(m.serviceTier, tierFilter))
    .filter((m) => matchesSubFilter(m, subFilter))
    .filter((m) => statusFilter === "all" || m.status === statusFilter)
    .sort((a, b) => {
      let av: any = a[sortKey];
      let bv: any = b[sortKey];
      if (av === null || av === undefined) av = sortDir === "asc" ? Infinity : -Infinity;
      if (bv === null || bv === undefined) bv = sortDir === "asc" ? Infinity : -Infinity;
      if (typeof av === "string" && typeof bv === "string")
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? av - bv : bv - av;
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className={`text-2xl font-bold ${txt}`}>Members</h1>
          <p className={`${muted} mt-1`}>
            {loading ? "Loading…" : subtitleLabel(filtered.length)}
            {lastSyncedAt && !loading && (
              <span className="ml-2 text-xs">· Last channel sync {fmtDate(lastSyncedAt)}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#2f3437]/20 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5 text-[#2f3437] dark:text-white transition-colors"
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            Export CSV
          </button>
          {!isEditorRole && (
            <button
              onClick={handleRefreshAll}
              disabled={refreshing}
              className="flex items-center gap-2 bg-white hover:bg-gray-50 text-[#2f3437] border border-gray-200 px-4 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 text-sm"
            >
              <ArrowPathIcon className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Syncing…" : "Refresh All Channels"}
            </button>
          )}
          {!isEditorRole && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-2 bg-[#6ba3c7] hover:bg-[#5490b5] text-white px-4 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 text-sm"
            >
              <ArrowPathIcon className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing from GHL…" : "Sync from GHL"}
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {!isEditorRole && syncResult && (
        <div className={`text-sm px-4 py-3 rounded-lg ${syncResult.startsWith("Error") || syncResult.startsWith("Sync failed") ? "bg-red-50 text-red-700" : "bg-[#6ba3c7]/10 text-[#2f3437]"}`}>
          {syncResult}
        </div>
      )}
      {!isEditorRole && refreshMsg && (
        <div className="text-sm px-4 py-3 rounded-lg bg-[#6ba3c7]/10 text-[#2f3437]">{refreshMsg}</div>
      )}
      {!isEditorRole && flaggedInactive.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-sm font-semibold text-amber-800 mb-2">
            These members no longer have the &ldquo;foundations - weekly coaching&rdquo; tag in GHL:
          </p>
          <ul className="space-y-1">
            {flaggedInactive.map((m) => (
              <li key={m.email} className="text-sm text-amber-700">
                {m.name} <span className="text-amber-500">({m.email})</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-amber-600 mt-2">
            These members have NOT been removed. You can manually decide what to do with them.
          </p>
        </div>
      )}

      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className={`${card} p-4 h-[100px] animate-pulse bg-gray-100`} />
          ))}
        </div>
      ) : cards && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Videos This Week */}
          <div className={`${card} p-4 flex flex-col justify-between h-[100px]`}>
            <div className="flex items-center gap-1.5">
              <VideoCameraIcon className="w-4 h-4 text-[#6ba3c7] shrink-0" />
              <span className={`text-[10px] uppercase tracking-widest font-semibold ${muted}`}>Videos This Week</span>
            </div>
            <div className={`text-3xl font-bold ${txt}`}>{cards.videosThisWeek}</div>
          </div>
          {/* Active Members */}
          <div className={`${card} p-4 flex flex-col justify-between h-[100px]`}>
            <div className="flex items-center gap-1.5">
              <UserGroupIcon className="w-4 h-4 text-emerald-500 shrink-0" />
              <span className={`text-[10px] uppercase tracking-widest font-semibold ${muted}`}>Active Members</span>
            </div>
            <div className={`text-3xl font-bold ${txt}`}>{cards.activeMembers}</div>
          </div>
          {/* Inactive */}
          <div className={`${card} p-4 flex flex-col justify-between h-[100px]`}>
            <div className="flex items-center gap-1.5">
              <ExclamationTriangleIcon className="w-4 h-4 text-red-500 shrink-0" />
              <span className={`text-[10px] uppercase tracking-widest font-semibold ${muted}`}>Inactive</span>
            </div>
            <div className={`text-3xl font-bold ${txt}`}>{cards.inactiveMembers}</div>
          </div>
          {/* Link Clicks */}
          <div className={`${card} p-4 flex flex-col justify-between h-[100px]`}>
            <div className="flex items-center gap-1.5">
              <CursorArrowRaysIcon className="w-4 h-4 text-[#6ba3c7] shrink-0" />
              <span className={`text-[10px] uppercase tracking-widest font-semibold ${muted}`}>Link Clicks (7d)</span>
            </div>
            <div className={`text-3xl font-bold ${txt}`}>{cards.linkClicks7d}</div>
          </div>
          {/* Top Lead */}
          <div className={`${card} p-4 flex flex-col justify-between h-[100px]`}>
            <div className="flex items-center gap-1.5">
              <TrophyIcon className="w-4 h-4 text-yellow-500 shrink-0" />
              <span className={`text-[10px] uppercase tracking-widest font-semibold ${muted}`}>Top Lead Performer</span>
            </div>
            {cards.topLead ? (
              <div>
                <div className={`text-sm font-semibold ${txt} truncate leading-tight`}>{cards.topLead.fullName}</div>
                <div className={`text-[11px] ${muted} mt-0.5`}>{cards.topLead.conversions} conversions</div>
              </div>
            ) : (
              <div className={`text-sm ${dim}`}>—</div>
            )}
          </div>
        </div>
      )}

      {/* Recent Videos */}
      {!loading && recentVideos.length > 0 && (
        <section className={`${card} overflow-hidden`}>
          <button
            onClick={() => setVideosOpen((o) => !o)}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
          >
            <span className={`text-base font-semibold ${txt}`}>
              Videos Published This Week
              <span className={`ml-2 text-sm font-normal ${muted}`}>({recentVideos.length})</span>
            </span>
            {videosOpen
              ? <ChevronUpIcon className="w-4 h-4 text-[#2f3437]/40" />
              : <ChevronDownIcon className="w-4 h-4 text-[#2f3437]/40" />}
          </button>
          {videosOpen && (
            <div className="px-6 pb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 border-t border-gray-100">
              {recentVideos.map((video) => {
                const latestAudit = video.audits[0];
                const started = auditDone[video.id];
                return (
                  <div key={video.id} className="mt-4 rounded-lg border border-gray-200 overflow-hidden flex flex-col">
                    {video.thumbnailUrl ? (
                      <img src={video.thumbnailUrl} alt={video.title} className="w-full aspect-video object-cover" />
                    ) : (
                      <div className="w-full aspect-video bg-gray-100 flex items-center justify-center">
                        <VideoCameraIcon className={`w-8 h-8 ${dim}`} />
                      </div>
                    )}
                    <div className="p-3 flex flex-col gap-2 flex-1">
                      <div className="text-xs text-[#6ba3c7] font-medium truncate">{video.user.fullName || "Unknown"}</div>
                      <div className={`text-sm ${txt} font-medium line-clamp-2 leading-snug`}>{video.title}</div>
                      <div className={`text-xs ${dim}`}>{fmtDate(video.publishedAt)} · {video.viewCount.toLocaleString()} views</div>
                      <div className="mt-auto flex flex-col gap-1.5">
                        {latestAudit ? (
                          <Link
                            href={`/admin/audits/${latestAudit.id}`}
                            className="block text-center text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg px-3 py-1.5 hover:bg-emerald-100 transition"
                          >
                            View Audit {latestAudit.overallScore !== null ? `(${Number(latestAudit.overallScore).toFixed(1)})` : ""}
                          </Link>
                        ) : started ? (
                          <div className={`text-center text-xs ${dim} py-1.5`}>Audit queued…</div>
                        ) : (
                          <button
                            onClick={() => handleRunAudit(video)}
                            disabled={runningAudit[video.id]}
                            className="w-full text-xs bg-[#6ba3c7] hover:bg-[#5490b5] disabled:opacity-60 text-white rounded-lg px-3 py-1.5 transition"
                          >
                            {runningAudit[video.id] ? "Starting…" : "Run Audit"}
                          </button>
                        )}
                        <a
                          href={`https://www.youtube.com/watch?v=${video.videoId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-center text-xs text-[#2f3437]/50 border border-[#2f3437]/12 rounded-lg px-3 py-1.5 hover:text-[#2f3437] hover:border-[#2f3437]/25 hover:bg-gray-50 transition"
                        >
                          View on YouTube ↗
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search by name, email, or YouTube handle…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full max-w-sm px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6ba3c7] focus:border-transparent outline-none text-[#2f3437] bg-white text-sm"
        />
        <select
          value={tierFilter}
          onChange={(e) => { setTierFilter(e.target.value as TierFilter); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-[#2f3437] bg-white focus:ring-2 focus:ring-[#6ba3c7] focus:border-transparent outline-none"
        >
          {TIER_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.value === "all" ? "All Tiers" : f.label}</option>
          ))}
        </select>
        <select
          value={subFilter}
          onChange={(e) => { setSubFilter(e.target.value as SubFilter); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-[#2f3437] bg-white focus:ring-2 focus:ring-[#6ba3c7] focus:border-transparent outline-none"
        >
          {SUB_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.value === "all" ? "All Subs" : f.label}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as StatusFilter); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-[#2f3437] bg-white focus:ring-2 focus:ring-[#6ba3c7] focus:border-transparent outline-none"
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.value === "all" ? "All Statuses" : f.label}</option>
          ))}
        </select>
      </div>

      {/* Mobile list */}
      <div className="md:hidden bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
        {loading ? (
          <div className="px-4 py-10 text-center text-[#2f3437]/40 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-[#2f3437]/40 text-sm">
            {members.length === 0 ? "No members yet. Sync from GHL to import." : "No members match your search."}
          </div>
        ) : (
          paginated.map((m) => (
            <Link key={m.id} href={`/admin/members/${m.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <StatusDot status={m.status} />
                <span className="font-medium text-[#2f3437] text-sm truncate">{m.fullName || "—"}</span>
                <span className="shrink-0">{tierBadge(m.serviceTier)}</span>
              </div>
              <div className="text-right shrink-0 ml-2">
                <div className={`text-xs font-semibold ${scoreColor(m.latestAuditScore)}`}>
                  {m.latestAuditScore != null ? `${m.latestAuditScore.toFixed(1)}/10` : "—"}
                </div>
                <div className={`text-xs ${muted}`}>{m.videos7d}v</div>
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <div className={`${card} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className={thCls} onClick={() => toggleSort("fullName")}>
                    Name <SortIcon col="fullName" />
                  </th>
                  <th className={`${thCls} cursor-default text-center`}>YT</th>
                  <th className={`${thCls} cursor-default`}>Tier</th>
                  <th className={`${thCls} cursor-default`}>Subscription</th>
                  <th className={thCls} onClick={() => toggleSort("latestAuditScore")}>
                    Score <SortIcon col="latestAuditScore" />
                  </th>
                  <th className={thCls} onClick={() => toggleSort("videos7d")}>
                    Videos (7d) <SortIcon col="videos7d" />
                  </th>
                  <th className={thCls} onClick={() => toggleSort("clicks7d")}>
                    Clicks (7d) <SortIcon col="clicks7d" />
                  </th>
                  <th className={thCls} onClick={() => toggleSort("conversions7d")}>
                    Conv. (7d) <SortIcon col="conversions7d" />
                  </th>
                  <th className={thCls} onClick={() => toggleSort("toolUses7d")}>
                    Tools (7d) <SortIcon col="toolUses7d" />
                  </th>
                  <th className={thCls} onClick={() => toggleSort("status")}>
                    Status <SortIcon col="status" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={10} className={`px-6 py-12 text-center ${muted}`}>Loading…</td></tr>
                ) : paginated.length === 0 ? (
                  <tr><td colSpan={10} className={`px-6 py-12 text-center ${muted}`}>
                    {members.length === 0 ? "No members yet. Click \"Sync from GHL\" to import." : "No members match your filters."}
                  </td></tr>
                ) : (
                  paginated.map((m) => (
                    <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/admin/members/${m.id}`} className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-green-500 rounded-full shrink-0" />
                          <span className={`font-medium ${txt} hover:text-[#6ba3c7] transition-colors`}>{m.fullName || "—"}</span>
                        </Link>
                        <div className={`text-xs ${dim} ml-4`}>{m.email}</div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {m.youtubeChannelUrl ? (
                          <a
                            href={m.youtubeChannelUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={m.youtubeHandle || m.youtubeChannelUrl}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-block"
                          >
                            {m.youtubeChannelThumbnail ? (
                              <img
                                src={m.youtubeChannelThumbnail}
                                alt={m.youtubeHandle || "YouTube"}
                                className="w-7 h-7 rounded-full object-cover ring-1 ring-gray-200 hover:ring-[#6ba3c7] transition-all"
                              />
                            ) : (
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-red-50 hover:bg-red-100 transition-colors">
                                <svg className="w-3.5 h-3.5 text-red-600" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.54 3.5 12 3.5 12 3.5s-7.54 0-9.38.55A3.02 3.02 0 0 0 .5 6.19C0 8.04 0 12 0 12s0 3.96.5 5.81a3.02 3.02 0 0 0 2.12 2.14C4.46 20.5 12 20.5 12 20.5s7.54 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14C24 15.96 24 12 24 12s0-3.96-.5-5.81zM9.75 15.02V8.98L15.5 12l-5.75 3.02z"/>
                                </svg>
                              </span>
                            )}
                          </a>
                        ) : (
                          <span className={`text-sm ${dim}`}>—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">{tierBadge(m.serviceTier)}</td>
                      <td className="px-4 py-3">
                        {m.subscriptionStatus ? (
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {subStatusBadge(m.subscriptionStatus)}
                              {fmtPrice(m.stripePriceAmount) && (() => {
                                const isUSD = (m.stripeCurrency ?? "USD").toUpperCase() === "USD";
                                const rate = cards?.usdToCadRate ?? 1.38;
                                const cadAmount = isUSD && m.stripePriceAmount
                                  ? Math.round(m.stripePriceAmount * rate)
                                  : m.stripePriceAmount;
                                return (
                                  <span className="text-xs font-semibold text-emerald-700">
                                    {isUSD ? (
                                      <>
                                        {fmtPrice(cadAmount)}/mo
                                        <span className="ml-1 font-normal text-gray-400 text-[10px]">CAD</span>
                                        <span className="ml-1 font-normal text-gray-300 text-[10px]">({fmtPrice(m.stripePriceAmount)} USD)</span>
                                      </>
                                    ) : (
                                      <>
                                        {fmtPrice(m.stripePriceAmount)}/mo
                                        <span className="ml-1 font-normal text-gray-400 text-[10px]">CAD</span>
                                      </>
                                    )}
                                  </span>
                                );
                              })()}
                            </div>
                            {fmtPeriodEnd(m.stripeCurrentPeriodEnd, m.subscriptionStatus) && (
                              <span className={`text-[10px] ${dim}`}>
                                {fmtPeriodEnd(m.stripeCurrentPeriodEnd, m.subscriptionStatus)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className={`text-sm ${dim}`}>—</span>
                        )}
                      </td>
                      <td className={`px-4 py-3 ${scoreColor(m.latestAuditScore)}`}>
                        {m.latestAuditScore != null ? `${Number(m.latestAuditScore).toFixed(1)}/10` : <span className={dim}>—</span>}
                      </td>
                      <td className={`px-4 py-3 ${muted}`}>{m.videos7d || <span className={dim}>0</span>}</td>
                      <td className={`px-4 py-3 ${muted}`}>{m.clicks7d || <span className={dim}>0</span>}</td>
                      <td className={`px-4 py-3 ${muted}`}>{m.conversions7d || <span className={dim}>0</span>}</td>
                      <td className={`px-4 py-3 ${muted}`}>{m.toolUses7d || <span className={dim}>0</span>}</td>
                      <td className="px-4 py-3"><StatusDot status={m.status} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!loading && filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <span className={`text-xs ${dim}`}>
                Showing {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className={`text-xs px-3 py-1.5 bg-gray-100 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-200 transition ${muted}`}
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className={`text-xs px-3 py-1.5 bg-gray-100 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-200 transition ${muted}`}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MembersPage() {
  return (
    <Suspense>
      <MembersPageInner />
    </Suspense>
  );
}

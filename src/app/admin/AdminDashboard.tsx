"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ClipboardDocumentListIcon,
  UserGroupIcon,
  ExclamationTriangleIcon,
  UsersIcon,
  VideoCameraIcon,
  CurrencyDollarIcon,
  StarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  MinusIcon,
  ChartBarIcon,
} from "@heroicons/react/24/outline";

interface ActionCard {
  label: string;
  subtitle: string;
  count: number;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  urgent: boolean;
}

interface StatCard {
  label: string;
  value: string | number;
  subtitle?: string;
  trend?: "up" | "down" | "same" | null;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
}

interface Activity {
  type: string;
  title: string;
  description: string;
  timestamp: string;
  link: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function fmtMrr(cents: number): string {
  const dollars = Math.round(cents / 100);
  return `$${dollars.toLocaleString("en-CA")}`;
}

function fmtHours(h: number | null): string {
  if (h === null) return "—";
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function FlowKpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-[#2f3437]/50 dark:text-white/40">{label}</p>
      <p className="text-xl font-bold text-[#6ba3c7] mt-0.5">{value}</p>
    </div>
  );
}

const TYPE_EMOJI: Record<string, string> = {
  audit_complete: "📊",
  member_signup: "👤",
  waitlist_entry: "🔔",
  ai_tool_use: "🤖",
  tier_change: "⬆️",
};

export default function AdminDashboard() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const sessionIsMainOwner = !!(session?.user as { isMainOwner?: boolean } | undefined)?.isMainOwner;
  const [impersonatedRole, setImpersonatedRole] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("abv_impersonate");
      if (raw) {
        const parsed = JSON.parse(raw);
        setImpersonatedRole(parsed?.targetRole ?? null);
      } else {
        setImpersonatedRole(null);
      }
    } catch {
      setImpersonatedRole(null);
    }
  }, []);

  // Effective role: when impersonating a Staff Admin, treat as editor for gating.
  const effectiveRole = impersonatedRole === "editor" ? "editor" : role;
  // Main owner (Jared) sees the restricted tiles; sub-admins do not.
  // When the owner is "viewing as" a Staff Admin, treat them as a sub-admin
  // for UI gating so the preview matches what a sub-admin actually sees.
  const isMainOwner = sessionIsMainOwner && impersonatedRole !== "editor";
  // Layout helper: true admins (incl. main owner) get the multi-row layout;
  // sub-admins get the simpler single-row layout.
  const isAdminRole = effectiveRole === "admin";

  const [actions, setActions] = useState<ActionCard[]>([]);
  const [topStats, setTopStats] = useState<StatCard[]>([]);
  const [ownerStats, setOwnerStats] = useState<StatCard[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamPipeline, setTeamPipeline] = useState<{ scripted: number; filmed: number; assignedToMe: number; unassigned: number } | null>(null);
  const [flowMetrics, setFlowMetrics] = useState<{
    scriptingVelocityHours: number | null;
    productionVelocityHours: number | null;
    reviewStickinessPct: number;
    repurposeCompletionPct: number;
    plansByStatus: Array<{ status: string; count: number }>;
  } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [membersRes, auditTrendRes] = await Promise.all([
          fetch("/api/members"),
          fetch("/api/admin/dashboard/audit-trend"),
        ]);

        const membersData = await membersRes.json();
        const members: any[] = membersData.members ?? [];
        const cards = membersData.cards ?? {};

        const atRisk = members.filter((m) => m.status === "at_risk").length;
        const activeCount = cards.activeMembers ?? 0;
        const videosThisWeek = cards.videosThisWeek ?? 0;
        // Server returns null for non-owners and a number (incl. 0) for owners.
        // Treat presence of the number as the source of truth for visibility.
        const mrrRaw = cards.mrr;
        const mrrAvailable = typeof mrrRaw === "number";
        const mrr: number = mrrAvailable ? mrrRaw : 0;

        let auditTrend: { currentAvg: number | null; trend: "up" | "down" | "same" | null } = {
          currentAvg: null,
          trend: null,
        };
        if (auditTrendRes.ok) {
          auditTrend = await auditTrendRes.json();
        }

        let pendingAudits = 0;
        try {
          const auditRes = await fetch("/api/admin/audit-requests/count");
          if (auditRes.ok) {
            const auditData = await auditRes.json();
            pendingAudits = auditData.count ?? 0;
          }
        } catch {}

        let waitlistCount = 0;
        try {
          const waitlistRes = await fetch("/api/admin/hire/waitlist/count");
          if (waitlistRes.ok) {
            const waitlistData = await waitlistRes.json();
            waitlistCount = waitlistData.count ?? 0;
          }
        } catch {}

        // Row 1 — shown to all admins
        setTopStats([
          {
            label: "Total Members",
            value: members.length,
            icon: UsersIcon,
            href: "/admin/members",
          },
          {
            label: "Videos This Week",
            value: videosThisWeek,
            subtitle: "Published in the last 7 days",
            icon: VideoCameraIcon,
            href: "/admin/analytics",
          },
        ]);

        // Action cards — Jared only
        setActions([
          {
            label: "Pending Audits",
            subtitle: "Audit requests awaiting review",
            count: pendingAudits,
            href: "/admin/audits",
            icon: ClipboardDocumentListIcon,
            urgent: pendingAudits > 0,
          },
          {
            label: "Hire Waitlist",
            subtitle: "Editors waiting for placement",
            count: waitlistCount,
            href: "/admin/hire",
            icon: UserGroupIcon,
            urgent: waitlistCount > 0,
          },
          {
            label: "Active This Week",
            subtitle: "Posted, used tools, or had clicks",
            count: activeCount,
            href: "/admin/members?status=active",
            icon: UsersIcon,
            urgent: false,
          },
        ]);

        // Stat cards — MRR only included when the server returned it
        // (i.e. the requester is the main owner). Avg Audit Score is for everyone.
        const stats: StatCard[] = [];
        if (mrrAvailable) {
          stats.push({
            label: "MRR",
            value: mrr > 0 ? fmtMrr(mrr) : "—",
            subtitle: "Active + past-due subs · ~CAD",
            icon: CurrencyDollarIcon,
            href: "/admin/members",
          });
        }
        stats.push({
          label: "Avg Audit Score",
          value: auditTrend.currentAvg !== null ? auditTrend.currentAvg : "—",
          subtitle:
            auditTrend.trend === "up"
              ? "Group trending up"
              : auditTrend.trend === "down"
              ? "Group trending down"
              : auditTrend.trend === "same"
              ? "Group holding steady"
              : "Latest baseline or monthly",
          trend: auditTrend.trend,
          icon: StarIcon,
          href: "/admin/audits",
        });
        setOwnerStats(stats);

        try {
          const actRes = await fetch("/api/admin/dashboard/activity");
          if (actRes.ok) {
            const actData = await actRes.json();
            setActivities(actData.activities ?? []);
          }
        } catch {}

        try {
          const tpRes = await fetch("/api/admin/team-pipeline/summary");
          if (tpRes.ok) setTeamPipeline(await tpRes.json());
        } catch {}

        try {
          const fmRes = await fetch("/api/admin/flow-metrics");
          if (fmRes.ok) {
            const fm = await fmRes.json();
            setFlowMetrics({
              scriptingVelocityHours: fm.scriptingVelocityHours,
              productionVelocityHours: fm.productionVelocityHours,
              reviewStickinessPct: fm.reviewStickinessPct,
              repurposeCompletionPct: fm.repurposeCompletionPct,
              plansByStatus: fm.plansByStatus ?? [],
            });
          }
        } catch {}
      } catch (err) {
        console.error("Dashboard load error:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 bg-gray-100 dark:bg-white/5 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-gray-100 dark:bg-white/5 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#2f3437] dark:text-[#e2e8f0]">Dashboard</h1>
        <p className="text-sm text-[#2f3437]/50 dark:text-white/40 mt-0.5">
          Overview of your platform —{" "}
          {new Date().toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Row 1 — Total Members + Videos This Week — shown to all admins */}
      <div className="grid grid-cols-2 gap-4">
        {topStats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-gray-200 dark:border-[#2a2a2a] p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-2 mb-1">
              <s.icon className="w-4 h-4 text-[#6ba3c7]" />
              <p className="text-xs text-[#2f3437]/50 dark:text-white/40 uppercase tracking-wider">
                {s.label}
              </p>
            </div>
            <p className="text-2xl font-bold text-[#6ba3c7]">{s.value}</p>
            {s.subtitle && (
              <p className="text-[10px] text-[#2f3437]/30 dark:text-white/20 mt-0.5 leading-tight">
                {s.subtitle}
              </p>
            )}
          </Link>
        ))}
      </div>

      {/* Rows 2+ — visible to admins and staff admins */}
      <>
          {(() => {
            // ownerStats already filters MRR server-side (only main owner gets it).
            const visibleActions = actions;
            const visibleStats = ownerStats;

            const renderAction = (a: ActionCard) => (
              <Link
                key={a.label}
                href={a.href}
                className={`bg-white dark:bg-[#1a1a1a] rounded-xl border border-gray-200 dark:border-[#2a2a2a] p-5 hover:shadow-md transition-shadow ${
                  a.urgent ? "border-l-4 border-l-amber-400" : ""
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-3xl font-black text-[#2f3437] dark:text-white">{a.count}</p>
                    <p className="text-xs text-[#2f3437]/50 dark:text-white/40 uppercase tracking-wider mt-1">
                      {a.label}
                    </p>
                    <p className="text-[10px] text-[#2f3437]/30 dark:text-white/20 mt-0.5 leading-tight">
                      {a.subtitle}
                    </p>
                  </div>
                  <a.icon
                    className={`w-5 h-5 shrink-0 ${a.urgent ? "text-amber-500" : "text-[#2f3437]/20 dark:text-white/20"}`}
                  />
                </div>
              </Link>
            );

            const renderStat = (s: StatCard) => (
              <Link
                key={s.label}
                href={s.href}
                className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-gray-200 dark:border-[#2a2a2a] p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-2 mb-1">
                  <s.icon className="w-4 h-4 text-[#6ba3c7]" />
                  <p className="text-xs text-[#2f3437]/50 dark:text-white/40 uppercase tracking-wider">
                    {s.label}
                  </p>
                </div>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold text-[#6ba3c7]">{s.value}</p>
                  {s.trend === "up" && (
                    <ArrowTrendingUpIcon className="w-4 h-4 text-emerald-500 shrink-0" />
                  )}
                  {s.trend === "down" && (
                    <ArrowTrendingDownIcon className="w-4 h-4 text-red-400 shrink-0" />
                  )}
                  {s.trend === "same" && (
                    <MinusIcon className="w-4 h-4 text-gray-400 shrink-0" />
                  )}
                </div>
                {s.subtitle && (
                  <p className="text-[10px] text-[#2f3437]/30 dark:text-white/20 mt-0.5 leading-tight">
                    {s.subtitle}
                  </p>
                )}
              </Link>
            );

            if (!isAdminRole) {
              // Staff admin view: Pending Audits + Hire Waitlist + Active This Week
              // + Avg Audit Score in one neat 4-col row.
              return (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {visibleActions.map(renderAction)}
                  {visibleStats.map(renderStat)}
                </div>
              );
            }

            return (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {visibleActions.map(renderAction)}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {visibleStats.map(renderStat)}
                </div>
              </>
            );
          })()}

          {/* Team Pipeline summary */}
          {teamPipeline && (teamPipeline.scripted + teamPipeline.filmed + teamPipeline.assignedToMe + teamPipeline.unassigned > 0) && (
            <Link
              href="/admin/team-pipeline"
              className="block bg-white dark:bg-[#1a1a1a] rounded-xl border border-gray-200 dark:border-[#2a2a2a] p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-[#2f3437] dark:text-[#e2e8f0]">🎬 Team Pipeline</h2>
                <span className="text-xs text-[#6ba3c7]">Open →</span>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <p className="text-2xl font-bold text-[#6ba3c7]">{teamPipeline.scripted}</p>
                  <p className="text-[10px] uppercase tracking-wider text-[#2f3437]/50 dark:text-white/40 mt-0.5">Scripted</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-[#10B981]">{teamPipeline.filmed}</p>
                  <p className="text-[10px] uppercase tracking-wider text-[#2f3437]/50 dark:text-white/40 mt-0.5">Filmed</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-[#2f3437] dark:text-white">{teamPipeline.assignedToMe}</p>
                  <p className="text-[10px] uppercase tracking-wider text-[#2f3437]/50 dark:text-white/40 mt-0.5">Assigned to me</p>
                </div>
                <div>
                  <p className={`text-2xl font-bold ${teamPipeline.unassigned > 0 ? "text-amber-500" : "text-[#2f3437] dark:text-white"}`}>{teamPipeline.unassigned}</p>
                  <p className="text-[10px] uppercase tracking-wider text-[#2f3437]/50 dark:text-white/40 mt-0.5">Unassigned</p>
                </div>
              </div>
            </Link>
          )}

          {/* Content Flow Metrics — flag-gated server-side */}
          {flowMetrics && (
            <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-gray-200 dark:border-[#2a2a2a] p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-[#2f3437] dark:text-[#e2e8f0] flex items-center gap-1.5">
                  <ChartBarIcon className="w-4 h-4 text-[#6ba3c7]" />
                  Content Flow Metrics
                </h2>
                <Link href="/admin/flow-metrics" className="text-xs text-[#6ba3c7] hover:underline">
                  View full report →
                </Link>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <FlowKpi label="Scripting velocity" value={fmtHours(flowMetrics.scriptingVelocityHours)} />
                <FlowKpi label="Production velocity" value={fmtHours(flowMetrics.productionVelocityHours)} />
                <FlowKpi label="Review stickiness" value={`${flowMetrics.reviewStickinessPct}%`} />
                <FlowKpi label="Repurpose done" value={`${flowMetrics.repurposeCompletionPct}%`} />
              </div>
              {flowMetrics.plansByStatus.length > 0 && (
                <div className="space-y-1.5">
                  {flowMetrics.plansByStatus.slice(0, 7).map((row) => {
                    const max = Math.max(...flowMetrics.plansByStatus.map((r) => r.count), 1);
                    const pct = (row.count / max) * 100;
                    return (
                      <div key={row.status} className="flex items-center gap-2 text-xs">
                        <div className="w-28 shrink-0 text-[#2f3437]/60 dark:text-white/50 truncate">{row.status}</div>
                        <div className="flex-1 h-3 bg-gray-100 dark:bg-white/5 rounded overflow-hidden">
                          <div className="h-full bg-[#6ba3c7]" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="w-8 text-right tabular-nums text-[#2f3437]/60 dark:text-white/50">{row.count}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Recent Activity */}
          {activities.length > 0 ? (
            <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-gray-200 dark:border-[#2a2a2a] overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 dark:border-[#2a2a2a]">
                <h2 className="text-sm font-semibold text-[#2f3437] dark:text-[#e2e8f0]">Recent Activity</h2>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-[#2a2a2a]">
                {activities.slice(0, 10).map((a, i) => (
                  <Link
                    key={i}
                    href={a.link}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-white/5"
                  >
                    <span className="text-lg">{TYPE_EMOJI[a.type] || "📌"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#2f3437] dark:text-[#e2e8f0] truncate">{a.title}</p>
                      <p className="text-xs text-[#2f3437]/40 dark:text-white/30">{a.description}</p>
                    </div>
                    <span className="text-xs text-[#2f3437]/30 dark:text-white/20 shrink-0">
                      {timeAgo(a.timestamp)}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-gray-200 dark:border-[#2a2a2a] p-5">
              <h2 className="text-sm font-semibold text-[#2f3437] dark:text-[#e2e8f0] mb-3">Quick Links</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "View Members", href: "/admin/members", emoji: "👥" },
                  { label: "Run Audits", href: "/admin/audits", emoji: "📊" },
                  { label: "Q&A Prep", href: "/admin/qa-prep", emoji: "💬" },
                  { label: "Academy Manager", href: "/admin/academy-manager", emoji: "🎓" },
                ].map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center gap-2 p-3 rounded-lg border border-gray-100 dark:border-[#2a2a2a] hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                  >
                    <span className="text-lg">{link.emoji}</span>
                    <span className="text-sm font-medium text-[#2f3437] dark:text-[#e2e8f0]">{link.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ClipboardDocumentListIcon,
  UserGroupIcon,
  ExclamationTriangleIcon,
  UsersIcon,
  VideoCameraIcon,
  CurrencyDollarIcon,
  StarIcon,
} from "@heroicons/react/24/outline";

interface ActionCard {
  label: string;
  count: number;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  urgent: boolean;
}

interface StatCard {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
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

const TYPE_EMOJI: Record<string, string> = {
  audit_complete: "📊",
  member_signup: "👤",
  waitlist_entry: "🔔",
  ai_tool_use: "🤖",
  tier_change: "⬆️",
};

export default function AdminDashboard() {
  const [actions, setActions] = useState<ActionCard[]>([]);
  const [stats, setStats] = useState<StatCard[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const membersRes = await fetch("/api/admin/members");
        const membersData = await membersRes.json();
        const members: any[] = membersData.members ?? membersData ?? [];

        const atRisk = members.filter((m) => m.activityStatus === "at_risk").length;
        const activeCount = members.filter((m) => m.subscriptionStatus === "active").length;
        const totalVideos = members.reduce((sum, m) => sum + (m.videosThisWeek ?? 0), 0);

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

        const mrr = membersData.mrr ?? membersData.summary?.mrr ?? "—";

        const scored = members.filter((m) => m.latestAuditScore != null);
        const avgScore =
          scored.length > 0
            ? (scored.reduce((sum, m) => sum + m.latestAuditScore, 0) / scored.length).toFixed(1)
            : "—";

        setActions([
          { label: "Pending Audit Requests", count: pendingAudits, href: "/admin/audits", icon: ClipboardDocumentListIcon, urgent: pendingAudits > 0 },
          { label: "Hire Waitlist", count: waitlistCount, href: "/admin/hire", icon: UserGroupIcon, urgent: waitlistCount > 0 },
          { label: "Members At Risk", count: atRisk, href: "/admin/members?status=at_risk", icon: ExclamationTriangleIcon, urgent: atRisk > 0 },
          { label: "Active Members", count: activeCount, href: "/admin/members?sub=active", icon: UsersIcon, urgent: false },
        ]);

        setStats([
          { label: "Total Members", value: members.length, icon: UsersIcon },
          { label: "Videos This Week", value: totalVideos, icon: VideoCameraIcon },
          { label: "MRR", value: typeof mrr === "number" ? `$${mrr.toLocaleString()}` : mrr, icon: CurrencyDollarIcon },
          { label: "Avg Audit Score", value: avgScore, icon: StarIcon },
        ]);

        try {
          const actRes = await fetch("/api/admin/dashboard/activity");
          if (actRes.ok) {
            const actData = await actRes.json();
            setActivities(actData.activities ?? []);
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-gray-100 dark:bg-white/5 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-gray-100 dark:bg-white/5 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-gray-100 dark:bg-white/5 rounded-xl animate-pulse" />
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

      {/* Needs Attention */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {actions.map((a) => (
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
              </div>
              <a.icon
                className={`w-5 h-5 ${a.urgent ? "text-amber-500" : "text-[#2f3437]/20 dark:text-white/20"}`}
              />
            </div>
          </Link>
        ))}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-gray-200 dark:border-[#2a2a2a] p-4"
          >
            <div className="flex items-center gap-2 mb-1">
              <s.icon className="w-4 h-4 text-[#6ba3c7]" />
              <p className="text-xs text-[#2f3437]/50 dark:text-white/40 uppercase tracking-wider">
                {s.label}
              </p>
            </div>
            <p className="text-2xl font-bold text-[#6ba3c7]">{s.value}</p>
          </div>
        ))}
      </div>

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
    </div>
  );
}

"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { ArrowLeftIcon, ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import { useToast } from "@/components/ToastProvider";

const TOOL_LABELS: Record<string, string> = {
  avatar_architect: "Avatar Architect",
  content_engine: "Content Engine",
  title_thumbnail_analyzer: "Title & Thumbnail Analyser",
  arc_script_builder: "ARC Script Builder",
  script_review: "Script Review",
};

const TOOL_ICONS: Record<string, string> = {
  avatar_architect: "🎯",
  content_engine: "🚀",
  title_thumbnail_analyzer: "🖼️",
  arc_script_builder: "🎬",
  script_review: "📋",
};

interface Conversation {
  id: string;
  toolType: string;
  title?: string;
  downloadCount: number;
  createdAt: string;
  user: { id: string; fullName: string | null; email: string };
}

function getDateRange(days: number | null): { from?: string; to?: string } {
  if (!days) return {};
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return {
    from: from.toISOString().split("T")[0],
    to: to.toISOString().split("T")[0],
  };
}

export default function AIToolsUsagePage() {
  const toast = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDays, setActiveDays] = useState<number | null>(30);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { from, to } = getDateRange(activeDays);
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      try {
        const res = await fetch(`/api/admin/ai-tools/usage?${params}`);
        const data = await res.json();
        setConversations(data.conversations ?? []);
      } catch {
        toast.error("Failed to load usage data.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [activeDays]); // eslint-disable-line react-hooks/exhaustive-deps

  const { byTool, byMember, totalDownloads, uniqueMembers } = useMemo(() => {
    const toolMap: Record<string, { count: number; downloads: number; members: Set<string> }> = {};
    const memberMap: Record<string, { name: string; email: string; total: number; byTool: Record<string, number>; lastActive: string }> = {};

    for (const c of conversations) {
      if (!toolMap[c.toolType]) toolMap[c.toolType] = { count: 0, downloads: 0, members: new Set() };
      toolMap[c.toolType].count++;
      toolMap[c.toolType].downloads += c.downloadCount ?? 0;
      toolMap[c.toolType].members.add(c.user.id);

      if (!memberMap[c.user.id]) {
        memberMap[c.user.id] = {
          name: c.user.fullName || c.user.email,
          email: c.user.email,
          total: 0,
          byTool: {},
          lastActive: c.createdAt,
        };
      }
      memberMap[c.user.id].total++;
      memberMap[c.user.id].byTool[c.toolType] = (memberMap[c.user.id].byTool[c.toolType] || 0) + 1;
      if (c.createdAt > memberMap[c.user.id].lastActive) memberMap[c.user.id].lastActive = c.createdAt;
    }

    return {
      byTool: Object.entries(toolMap).sort((a, b) => b[1].count - a[1].count),
      byMember: Object.entries(memberMap).sort((a, b) => b[1].total - a[1].total),
      totalDownloads: conversations.reduce((s, c) => s + (c.downloadCount ?? 0), 0),
      uniqueMembers: new Set(conversations.map((c) => c.user.id)).size,
    };
  }, [conversations]);

  function handleExport() {
    const toolKeys = Object.keys(TOOL_LABELS);
    const headers = ["Member", "Email", "Total", ...toolKeys.map((k) => TOOL_LABELS[k]), "Last Active"];
    const rows = byMember.map(([, m]) => [
      m.name,
      m.email,
      m.total,
      ...toolKeys.map((t) => m.byTool[t] || 0),
      new Date(m.lastActive).toLocaleDateString("en-CA"),
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-tools-usage-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("CSV exported!");
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/admin/ai-tools" className="text-[var(--abv-text)]/40 hover:text-[var(--abv-azure)] transition-colors">
            <ArrowLeftIcon className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-[var(--abv-text)] dark:text-[#e2e8f0]">AI Tools Usage</h1>
            <p className="text-sm text-[var(--abv-text)]/50 dark:text-white/40">Track how members use AI tools across the platform.</p>
          </div>
        </div>
      </div>

      {/* Date filter + Export */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { label: "7 days", days: 7 },
          { label: "30 days", days: 30 },
          { label: "90 days", days: 90 },
          { label: "All time", days: null },
        ].map(({ label, days }) => (
          <button
            key={label}
            onClick={() => setActiveDays(days)}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
              activeDays === days
                ? "bg-[var(--abv-dark)] text-white"
                : "bg-gray-100 dark:bg-white/10 text-[var(--abv-text)]/60 dark:text-white/40 hover:bg-gray-200 dark:hover:bg-white/20"
            }`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={handleExport}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--abv-text)]/20 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5 text-[var(--abv-text)] dark:text-white transition-colors"
        >
          <ArrowDownTrayIcon className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-gray-100 dark:bg-white/5 rounded-xl animate-pulse" />
            ))}
          </div>
          <div className="h-64 bg-gray-100 dark:bg-white/5 rounded-xl animate-pulse" />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Total Conversations", value: conversations.length },
              { label: "Active Members", value: uniqueMembers },
              { label: "Total Downloads", value: totalDownloads },
              { label: "Tools Used", value: byTool.length },
            ].map((s) => (
              <div key={s.label} className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-gray-200 dark:border-[#2a2a2a] p-4">
                <p className="text-3xl font-black text-[var(--abv-text)] dark:text-white">{s.value}</p>
                <p className="text-xs text-[var(--abv-text)]/50 dark:text-white/40 uppercase tracking-wider mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {/* By Tool */}
          <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-gray-200 dark:border-[#2a2a2a] overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 dark:border-[#2a2a2a]">
              <h2 className="text-sm font-semibold text-[var(--abv-text)] dark:text-[#e2e8f0]">Usage by Tool</h2>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-[#2a2a2a]">
              {Object.entries(TOOL_LABELS).map(([toolType, label]) => {
                const data = byTool.find(([t]) => t === toolType)?.[1];
                return (
                  <div key={toolType} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{TOOL_ICONS[toolType]}</span>
                      <div>
                        <p className="text-sm font-medium text-[var(--abv-text)] dark:text-[#e2e8f0]">{label}</p>
                        <p className="text-xs text-[var(--abv-text)]/40 dark:text-white/30">
                          {data ? `${data.members.size} member${data.members.size !== 1 ? "s" : ""}` : "No usage"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-[var(--abv-text)] dark:text-white">{data?.count ?? 0}</div>
                      <div className="text-xs text-[var(--abv-text)]/40 dark:text-white/30">
                        {data?.downloads ? `${data.downloads} downloads` : "conversations"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Member Activity */}
          {byMember.length > 0 && (
            <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-gray-200 dark:border-[#2a2a2a] overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 dark:border-[#2a2a2a]">
                <h2 className="text-sm font-semibold text-[var(--abv-text)] dark:text-[#e2e8f0]">Member Activity</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-gray-50 dark:bg-white/5">
                      <th className="text-left px-4 py-2 font-medium text-[var(--abv-text)]/50 dark:text-white/40">Member</th>
                      <th className="text-center px-3 py-2 font-medium text-[var(--abv-text)]/50 dark:text-white/40">Total</th>
                      {Object.entries(TOOL_LABELS).map(([key, label]) => (
                        <th key={key} className="text-center px-3 py-2 font-medium text-[var(--abv-text)]/50 dark:text-white/40" title={label}>
                          {TOOL_ICONS[key]}
                        </th>
                      ))}
                      <th className="text-right px-4 py-2 font-medium text-[var(--abv-text)]/50 dark:text-white/40">Last Active</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-[#2a2a2a]">
                    {byMember.map(([userId, m]) => (
                      <tr key={userId} className="hover:bg-gray-50 dark:hover:bg-white/5">
                        <td className="px-4 py-2.5">
                          <Link href={`/admin/members/${userId}`} className="font-medium text-[var(--abv-text)] dark:text-[#e2e8f0] hover:text-[var(--abv-azure)]">
                            {m.name}
                          </Link>
                          <p className="text-[10px] text-[var(--abv-text)]/30 dark:text-white/20">{m.email}</p>
                        </td>
                        <td className="text-center px-3 py-2.5">
                          <span className="inline-flex items-center justify-center w-7 h-7 bg-[var(--abv-dark)]/10 text-[var(--abv-azure)] font-bold rounded-full text-xs">
                            {m.total}
                          </span>
                        </td>
                        {Object.keys(TOOL_LABELS).map((tool) => (
                          <td key={tool} className="text-center px-3 py-2.5 text-[var(--abv-text)]/50 dark:text-white/40">
                            {m.byTool[tool] || "—"}
                          </td>
                        ))}
                        <td className="text-right px-4 py-2.5 text-[var(--abv-text)]/40 dark:text-white/30">
                          {new Date(m.lastActive).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { FolderIcon, ClockIcon } from "@heroicons/react/24/outline";
import PageHeader from "@/components/PageHeader";

interface WorkItem {
  id: string;
  type: "script" | "idea" | "review" | "analysis" | "repurposed";
  title: string;
  createdAt: string;
  expiresAt: string | null;
  toolUrl: string;
  badge: string;
}

const TABS = [
  { id: "all", label: "All" },
  { id: "script", label: "Scripts" },
  { id: "idea", label: "Ideas" },
  { id: "review", label: "Reviews" },
  { id: "repurposed", label: "Repurposed" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function daysUntil(dateStr: string): number {
  const now = new Date();
  const target = new Date(dateStr);
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

function badgeColor(type: string): string {
  switch (type) {
    case "script":    return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
    case "idea":      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
    case "review":    return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300";
    case "analysis":  return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
    case "repurposed":return "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300";
    default:          return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  }
}

export default function MyWorkPage() {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/member/my-work")
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = items.filter((item) => {
    if (activeTab !== "all" && item.type !== activeTab) return false;
    if (search && !item.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-5 pb-10">
      <PageHeader
        emoji="📁"
        title="My Work"
        description="Everything you've created, all in one place."
      />

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-1 bg-[#111]/5 dark:bg-white/5 rounded-lg p-1 overflow-x-auto scrollbar-hide">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-white dark:bg-[#1a1a1a] text-[#2f3437] dark:text-white shadow-sm"
                  : "text-[#2f3437]/50 dark:text-white/40 hover:text-[#2f3437] dark:hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search by title..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-64 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-[#2f3437] dark:text-[#e2e8f0] placeholder:text-[#2f3437]/40 dark:placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40"
        />
      </div>

      {loading && (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-[#eaeaea] dark:bg-white/10 rounded-lg" />
          ))}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="bg-white dark:bg-[#1a1a1a] border border-[#2f3437]/10 dark:border-white/10 rounded-xl p-12 text-center">
          <FolderIcon className="w-10 h-10 text-[#2f3437]/20 dark:text-white/20 mx-auto mb-3" />
          <h2 className="font-semibold text-[#2f3437] dark:text-white mb-2">No saved work yet</h2>
          <p className="text-sm text-[#2f3437]/50 dark:text-white/50 mb-4">
            Head to AI Tools to start creating scripts, ideas, and more. Everything you save will show up here.
          </p>
          <Link
            href="/member/ai-tools"
            className="inline-flex items-center gap-2 bg-[#6ba3c7] text-white rounded-lg px-4 py-2.5 text-sm font-semibold hover:bg-[#5490b5] transition-colors"
          >
            Open AI Tools →
          </Link>
        </div>
      )}

      {!loading && items.length > 0 && filtered.length === 0 && (
        <div className="bg-white dark:bg-[#1a1a1a] border border-[#2f3437]/10 dark:border-white/10 rounded-lg p-8 text-center">
          <p className="text-sm text-[#2f3437]/50 dark:text-white/50">
            No items match your current filter. Try a different tab or search term.
          </p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((item) => {
            const daysLeft = item.expiresAt ? daysUntil(item.expiresAt) : null;
            return (
              <Link
                key={`${item.type}-${item.id}`}
                href={item.toolUrl}
                className="block bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-[#2a2a2a] rounded-lg p-4 hover:border-[#6ba3c7]/40 hover:shadow-sm transition-all group"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${badgeColor(item.type)}`}>
                        {item.badge}
                      </span>
                      {daysLeft !== null && daysLeft <= 14 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                          <ClockIcon className="w-3 h-3" />
                          Expires in {daysLeft} day{daysLeft !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-[#2f3437] dark:text-[#e2e8f0] group-hover:text-[#6ba3c7] transition-colors truncate">
                      {item.title}
                    </h3>
                    <p className="text-xs text-[#2f3437]/40 dark:text-white/30 mt-0.5">
                      {new Date(item.createdAt).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                  <span className="text-xs text-[#6ba3c7] font-medium opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    Open →
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  UsersIcon,
  ClipboardDocumentListIcon,
  ArrowPathIcon,
  ChartBarIcon,
  EyeIcon,
  EyeSlashIcon,
} from "@heroicons/react/24/outline";
import MemberPickerModal from "@/components/admin/MemberPickerModal";

interface DashboardStats {
  totalMembers: number;
  totalAudits: number;
}

interface FeatureFlags {
  campaigns: boolean;
  ai_tools: boolean;
  resources: boolean;
  tool_avatar_architect: boolean;
  tool_content_engine: boolean;
  tool_arc_script_builder: boolean;
  tool_title_analyzer: boolean;
  tool_script_review: boolean;
  [key: string]: boolean;
}

const FEATURE_DEFS = [
  {
    group: "Navigation",
    items: [
      { key: "campaigns", label: "Campaigns & Link Tracking", desc: "Campaigns, conversions, and link tracker pages" },
      { key: "ai_tools", label: "AI Tools Hub", desc: "The entire AI tools section (also controls individual tools below)" },
      { key: "resources", label: "Resources", desc: "Resource library page" },
    ],
  },
  {
    group: "AI Tools",
    items: [
      { key: "tool_avatar_architect", label: "Avatar Architect", desc: "Client avatar builder" },
      { key: "tool_content_engine", label: "Content Engine", desc: "Video idea generation" },
      { key: "tool_arc_script_builder", label: "ARC Script Builder", desc: "Video script outline builder" },
      { key: "tool_title_analyzer", label: "Title & Thumbnail Analyzer", desc: "Title/thumbnail scoring" },
      { key: "tool_script_review", label: "Script Review", desc: "Script scoring and feedback" },
    ],
  },
];

function Toggle({ enabled, onChange, disabled }: { enabled: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${
        disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
      } ${enabled ? "bg-[#3dc3ff]" : "bg-[#1e2a38]/20"}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          enabled ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function FeatureVisibilitySection() {
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    fetch("/api/admin/feature-visibility")
      .then((r) => r.json())
      .then(setFlags)
      .catch(() => setLoadError(true));
  }, []);

  async function toggleFlag(key: string, newValue: boolean) {
    if (!flags) return;
    setSaving(key);
    const optimistic = { ...flags, [key]: newValue };
    setFlags(optimistic);
    try {
      const res = await fetch("/api/admin/feature-visibility", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: newValue }),
      });
      if (res.ok) {
        const updated = await res.json();
        setFlags(updated);
      } else {
        setFlags(flags);
      }
    } catch {
      setFlags(flags);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-base font-semibold text-[#1e2a38]">Feature Visibility</h2>
          <p className="text-sm text-[#1e2a38]/50 mt-0.5">
            Control what members can see and access. Changes take effect immediately.
            You always see everything when viewing as a member.
          </p>
        </div>
      </div>

      {loadError && (
        <p className="text-sm text-red-500">Failed to load feature settings.</p>
      )}

      {!flags && !loadError && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-[#1e2a38]/5 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {flags && FEATURE_DEFS.map((group) => {
        const isAiToolsGroup = group.group === "AI Tools";
        const aiToolsOn = flags.ai_tools !== false;

        return (
          <div key={group.group} className={`mb-5 ${isAiToolsGroup ? "last:mb-0" : ""}`}>
            <p className="text-xs font-semibold text-[#1e2a38]/40 uppercase tracking-wider mb-2">
              {group.group}
              {isAiToolsGroup && !aiToolsOn && (
                <span className="ml-2 font-normal text-amber-600 normal-case tracking-normal">
                  — hidden (AI Tools Hub is off)
                </span>
              )}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const isOn = flags[item.key] !== false;
                const isSavingThis = saving === item.key;
                const isDisabledByParent = isAiToolsGroup && !aiToolsOn;

                return (
                  <div
                    key={item.key}
                    className={`flex items-center justify-between gap-4 px-4 py-3 rounded-xl border transition-colors ${
                      isDisabledByParent
                        ? "bg-[#1e2a38]/3 border-[#1e2a38]/5 opacity-50"
                        : isOn
                        ? "bg-white border-[#1e2a38]/10"
                        : "bg-[#ff0033]/3 border-[#ff0033]/15"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOn && !isDisabledByParent ? "bg-[#3dc3ff]" : "bg-[#1e2a38]/20"}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#1e2a38] truncate">{item.label}</p>
                        <p className="text-xs text-[#1e2a38]/45 leading-snug">{item.desc}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!isOn && !isDisabledByParent && (
                        <span className="text-[10px] font-semibold text-[#ff0033] uppercase tracking-wide flex items-center gap-0.5">
                          <EyeSlashIcon className="w-3 h-3" />
                          Hidden
                        </span>
                      )}
                      {isSavingThis ? (
                        <div className="w-9 flex justify-center">
                          <span className="w-4 h-4 border-2 border-[#3dc3ff] border-t-transparent rounded-full animate-spin" />
                        </div>
                      ) : (
                        <Toggle
                          enabled={isOn}
                          onChange={(v) => toggleFlag(item.key, v)}
                          disabled={isDisabledByParent || saving !== null}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [showMemberPicker, setShowMemberPicker] = useState(false);

  useEffect(() => {
    fetch("/api/members")
      .then((r) => r.json())
      .then((d) => {
        setStats({
          totalMembers: d.members?.length ?? 0,
          totalAudits: d.members?.reduce(
            (acc: number, m: any) => acc + (m._count?.audits ?? 0),
            0
          ) ?? 0,
        });
      })
      .catch(() => setStats({ totalMembers: 0, totalAudits: 0 }));
  }, []);

  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/ghl-sync", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setSyncMsg(`Error: ${data.error}`);
      } else {
        setSyncMsg(
          `Sync complete — ${data.created} new, ${data.updated} updated, ${data.skipped} unchanged`
        );
        const r = await fetch("/api/members");
        const d = await r.json();
        setStats({
          totalMembers: d.members?.length ?? 0,
          totalAudits: d.members?.reduce(
            (acc: number, m: any) => acc + (m._count?.audits ?? 0),
            0
          ) ?? 0,
        });
      }
    } catch {
      setSyncMsg("Sync failed — check your GHL API key in settings.");
    }
    setSyncing(false);
  }

  const kpiCards = [
    {
      label: "Foundations Members",
      value: stats?.totalMembers ?? "—",
      icon: UsersIcon,
      href: "/admin/members",
      color: "text-[#3dc3ff]",
      bg: "bg-[#3dc3ff]/10",
    },
    {
      label: "Total Audits",
      value: stats?.totalAudits ?? "—",
      icon: ClipboardDocumentListIcon,
      href: "/admin/audits",
      color: "text-purple-500",
      bg: "bg-purple-50",
    },
    {
      label: "Analytics",
      value: "View",
      icon: ChartBarIcon,
      href: "/admin/analytics",
      color: "text-green-500",
      bg: "bg-green-50",
    },
  ];

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#1e2a38]">Dashboard</h1>
        <p className="text-[#1e2a38]/50 mt-1 text-sm">
          Welcome back. Here&apos;s an overview of your program.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.label}
              href={card.href}
              className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow group"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wider mb-2">
                    {card.label}
                  </p>
                  <p className="text-3xl font-bold text-[#1e2a38]">{card.value}</p>
                </div>
                <div className={`${card.bg} p-2.5 rounded-lg`}>
                  <Icon className={`w-6 h-6 ${card.color}`} />
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Sync from GHL */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-[#1e2a38]">
              Sync Foundations Members from GHL
            </h2>
            <p className="text-sm text-[#1e2a38]/50 mt-1">
              Pulls all contacts tagged &ldquo;foundations - weekly coaching&rdquo; from GoHighLevel.
            </p>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 bg-[#3dc3ff] hover:bg-[#2bb3ef] disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors shrink-0"
          >
            <ArrowPathIcon className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync from GHL"}
          </button>
        </div>
        {syncMsg && (
          <div
            className={`mt-4 text-sm px-4 py-3 rounded-lg ${
              syncMsg.startsWith("Error") || syncMsg.startsWith("Sync failed")
                ? "bg-[#ff0033]/10 text-[#ff0033]"
                : "bg-[#3dc3ff]/10 text-[#1e2a38]"
            }`}
          >
            {syncMsg}
          </div>
        )}
      </div>

      {/* Feature Visibility */}
      <div className="mb-4">
        <FeatureVisibilitySection />
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/admin/members"
          className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow"
        >
          <h3 className="font-semibold text-[#1e2a38] mb-1">Manage Members</h3>
          <p className="text-sm text-[#1e2a38]/50">
            View, search, and manage all Foundations Members.
          </p>
        </Link>
        <Link
          href="/admin/audits"
          className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow"
        >
          <h3 className="font-semibold text-[#1e2a38] mb-1">Audit History</h3>
          <p className="text-sm text-[#1e2a38]/50">
            Review YouTube channel audits and scores.
          </p>
        </Link>
      </div>

      {/* View as Member */}
      <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="font-semibold text-amber-900 mb-1 flex items-center gap-2">
            <EyeIcon className="w-4 h-4" />
            View as Member
          </h3>
          <p className="text-sm text-amber-700">
            Pick any member to see the platform exactly as they do — their scores, AI tools, and links.
          </p>
        </div>
        <button
          onClick={() => setShowMemberPicker(true)}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors shrink-0"
        >
          <EyeIcon className="w-4 h-4" />
          Choose Member…
        </button>
      </div>

      {showMemberPicker && (
        <MemberPickerModal onClose={() => setShowMemberPicker(false)} />
      )}
    </div>
  );
}

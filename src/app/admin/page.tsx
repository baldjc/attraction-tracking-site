"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  UsersIcon,
  ClipboardDocumentListIcon,
  ArrowPathIcon,
  ChartBarIcon,
  EyeIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";
import { useSession } from "next-auth/react";
import MemberPickerModal from "@/components/admin/MemberPickerModal";

interface DashboardStats {
  totalMembers: number;
  totalAudits: number;
}

export default function AdminDashboard() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role ?? "admin";
  const isEditorRole = role === "editor";

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
      color: "text-[#6ba3c7]",
      bg: "bg-[#6ba3c7]/10",
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
        <h1 className="text-2xl font-bold text-[#2f3437]">Dashboard</h1>
        <p className="text-[#2f3437]/50 mt-1 text-sm">
          {isEditorRole
            ? "Overview of your editing and mastery clients."
            : "Welcome back. Here\u0027s an overview of your program."}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {(isEditorRole ? kpiCards.filter((c) => c.label !== "Analytics") : kpiCards).map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.label}
              href={card.href}
              className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-shadow group"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold text-[#2f3437]/50 uppercase tracking-wider mb-2">
                    {card.label}
                  </p>
                  <p className="text-3xl font-bold text-[#2f3437]">{card.value}</p>
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
      {!isEditorRole && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-[#2f3437]">
                Sync Foundations Members from GHL
              </h2>
              <p className="text-sm text-[#2f3437]/50 mt-1">
                Pulls all contacts tagged &ldquo;foundations - weekly coaching&rdquo; from GoHighLevel.
              </p>
            </div>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-2 bg-[#6ba3c7] hover:bg-[#5490b5] disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors shrink-0"
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
                  : "bg-[#6ba3c7]/10 text-[#2f3437]"
              }`}
            >
              {syncMsg}
            </div>
          )}
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/admin/members"
          className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-shadow"
        >
          <h3 className="font-semibold text-[#2f3437] mb-1">Manage Members</h3>
          <p className="text-sm text-[#2f3437]/50">
            View, search, and manage all Foundations Members.
          </p>
        </Link>
        <Link
          href="/admin/audits"
          className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-shadow"
        >
          <h3 className="font-semibold text-[#2f3437] mb-1">Audit History</h3>
          <p className="text-sm text-[#2f3437]/50">
            Review YouTube channel audits and scores.
          </p>
        </Link>
        <Link
          href="/admin/settings"
          className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-shadow"
        >
          <div className="flex items-center gap-2 mb-1">
            <Cog6ToothIcon className="w-4 h-4 text-[#2f3437]/50" />
            <h3 className="font-semibold text-[#2f3437]">Settings</h3>
          </div>
          <p className="text-sm text-[#2f3437]/50">
            Feature visibility, AI scoring prompt, and platform preferences.
          </p>
        </Link>
      </div>

      {/* View as Member */}
      <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
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

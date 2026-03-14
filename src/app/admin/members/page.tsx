"use client";

import { useState, useEffect } from "react";
import { ArrowPathIcon, UserPlusIcon } from "@heroicons/react/24/outline";

interface Member {
  id: string;
  email: string;
  fullName: string | null;
  youtubeHandle: string | null;
  youtubeChannelUrl: string | null;
  serviceTier: string;
  slackUserId: string | null;
  skoolProfile: string | null;
  ghlContactId: string | null;
  createdAt: string;
  _count?: { audits: number };
  latestAuditScore?: number | null;
  latestAuditDate?: string | null;
}

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [flaggedInactive, setFlaggedInactive] = useState<{ email: string; name: string }[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchMembers();
  }, []);

  async function fetchMembers() {
    setLoading(true);
    const res = await fetch("/api/members");
    const data = await res.json();
    setMembers(data.members || []);
    setLoading(false);
  }

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
        setSyncResult(
          `Synced: ${data.created} new, ${data.updated} updated, ${data.skipped} unchanged`
        );
        if (data.flaggedInactive?.length > 0) {
          setFlaggedInactive(data.flaggedInactive);
        }
        fetchMembers();
      }
    } catch (err) {
      setSyncResult("Sync failed. Check your GHL API key.");
    }
    setSyncing(false);
  }

  const filtered = members.filter(
    (m) =>
      !search ||
      m.fullName?.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase()) ||
      m.youtubeHandle?.toLowerCase().includes(search.toLowerCase())
  );

  const tierLabels: Record<string, string> = {
    foundations: "Foundations",
    editing_2: "Editing 2",
    editing_4: "Editing 4",
    scaling_2: "Scaling 2",
    scaling_4: "Scaling 4",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1e2a38]">Foundations Members</h1>
          <p className="text-[#1e2a38]/60 mt-1">
            {members.length} Foundations Member{members.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 bg-[#3dc3ff] hover:bg-[#2bb3ef] text-white px-4 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          <ArrowPathIcon
            className={`w-5 h-5 ${syncing ? "animate-spin" : ""}`}
          />
          {syncing ? "Syncing from GHL..." : "Sync from GHL"}
        </button>
      </div>

      {syncResult && (
        <div
          className={`mb-4 text-sm px-4 py-3 rounded-lg ${
            syncResult.startsWith("Error") || syncResult.startsWith("Sync failed")
              ? "bg-[#ff0033]/10 text-[#ff0033]"
              : "bg-[#3dc3ff]/10 text-[#1e2a38]"
          }`}
        >
          {syncResult}
        </div>
      )}

      {flaggedInactive.length > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-sm font-semibold text-amber-800 mb-2">
            ⚠️ These members no longer have the &ldquo;foundations - weekly coaching&rdquo; tag in GHL:
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

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by name, email, or YouTube handle..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3dc3ff] focus:border-transparent outline-none text-[#1e2a38] bg-white"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-6 py-3 text-xs font-semibold text-[#1e2a38]/60 uppercase tracking-wider">
                  Name
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-[#1e2a38]/60 uppercase tracking-wider">
                  YouTube
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-[#1e2a38]/60 uppercase tracking-wider">
                  Tier
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-[#1e2a38]/60 uppercase tracking-wider">
                  Score
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-[#1e2a38]/60 uppercase tracking-wider">
                  Email
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-[#1e2a38]/40">
                    Loading...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-[#1e2a38]/40">
                    {members.length === 0
                      ? 'No members yet. Click "Sync from GHL" to import.'
                      : "No members match your search."}
                  </td>
                </tr>
              ) : (
                filtered.map((m) => (
                  <tr
                    key={m.id}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                        <div>
                          <p className="font-medium text-[#1e2a38]">
                            {m.fullName || "—"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-[#1e2a38]/70">
                      {m.youtubeHandle ? (
                        <a
                          href={`https://youtube.com/${m.youtubeHandle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#3dc3ff] hover:underline"
                        >
                          {m.youtubeHandle}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-medium bg-[#3dc3ff]/10 text-[#1e2a38] px-2.5 py-1 rounded-full">
                        {tierLabels[m.serviceTier] || m.serviceTier}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-[#1e2a38]/70">
                      {m.latestAuditScore != null
                        ? `${m.latestAuditScore.toFixed(1)}/10`
                        : "—"}
                    </td>
                    <td className="px-6 py-4 text-sm text-[#1e2a38]/70">
                      {m.email}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { UserCircleIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { IMPERSONATE_LS_KEY } from "@/lib/impersonate-constants";

interface Member {
  id: string;
  email: string;
  fullName: string | null;
  youtubeHandle: string | null;
  latestAuditScore: number | null;
  latestAuditDate: string | null;
  _count: { audits: number };
}

function scoreBg(score: number | null) {
  if (score == null) return "bg-gray-100 text-gray-400";
  if (score >= 7) return "bg-green-100 text-green-700";
  if (score >= 5) return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-[#ff0033]";
}

export default function EditorDashboard() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [viewingId, setViewingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/members")
      .then((r) => r.json())
      .then((d) => {
        setMembers(d.members ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function viewAsMember(member: Member) {
    setViewingId(member.id);
    const res = await fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: member.id }),
    });
    if (res.ok) {
      const memberName = member.fullName || member.email;
      localStorage.setItem(IMPERSONATE_LS_KEY, JSON.stringify({ memberId: member.id, memberName }));
      window.location.href = "/member/scores";
    } else {
      setViewingId(null);
    }
  }

  const filtered = members.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (m.fullName ?? "").toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1e2a38]">Dashboard</h1>
        <p className="text-[#1e2a38]/60 mt-1">
          Select a member to view their scores, content, and AI tools.
        </p>
      </div>

      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#1e2a38]/30" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search members…"
          className="w-full pl-10 pr-4 py-2.5 border border-[#1e2a38]/15 rounded-xl text-sm bg-white focus:outline-none focus:border-[#3dc3ff]"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-[#1e2a38]/10 p-5 h-28 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[#1e2a38]/40 text-center py-16">
          {search ? "No members match your search." : "No members assigned yet."}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((member) => {
            const score = member.latestAuditScore;
            return (
              <div
                key={member.id}
                className="bg-white rounded-xl border border-[#1e2a38]/10 p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-3">
                  <UserCircleIcon className="w-8 h-8 text-[#1e2a38]/20 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1e2a38] truncate">
                      {member.fullName || member.email}
                    </p>
                    {member.fullName && (
                      <p className="text-xs text-[#1e2a38]/40 truncate">{member.email}</p>
                    )}
                    {member.youtubeHandle && (
                      <p className="text-xs text-[#3dc3ff] truncate mt-0.5">{member.youtubeHandle}</p>
                    )}
                  </div>
                  {score !== null && (
                    <span className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ${scoreBg(score)}`}>
                      {score.toFixed(1)}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-[#1e2a38]/40">
                    {member._count.audits} audit{member._count.audits !== 1 ? "s" : ""}
                  </span>
                  <button
                    onClick={() => viewAsMember(member)}
                    disabled={viewingId === member.id}
                    className="text-xs font-semibold text-[#3dc3ff] border border-[#3dc3ff]/30 px-3 py-1.5 rounded-lg hover:bg-[#3dc3ff]/10 disabled:opacity-50 transition-colors"
                  >
                    {viewingId === member.id ? "Opening…" : "View as"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

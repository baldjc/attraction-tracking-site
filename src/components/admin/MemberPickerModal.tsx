"use client";

import { useState, useEffect, useRef } from "react";
import { MagnifyingGlassIcon, XMarkIcon, UserCircleIcon } from "@heroicons/react/24/outline";
import { IMPERSONATE_LS_KEY } from "@/lib/impersonate-constants";

interface Member {
  id: string;
  fullName: string | null;
  email: string;
}

interface Props {
  onClose: () => void;
  adminEmail?: string;
}

export default function MemberPickerModal({ onClose, adminEmail }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selecting, setSelecting] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
    fetch("/api/members")
      .then((r) => r.json())
      .then((d) => {
        const all: Member[] = (d.members ?? []).map((m: any) => ({
          id: m.id,
          fullName: m.fullName,
          email: m.email,
        }));
        setMembers(all);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = members.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (m.fullName ?? "").toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
  });

  async function handleSelect(member: Member) {
    setSelecting(member.id);
    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: member.id }),
      });
      if (!res.ok) {
        alert("Failed to switch member");
        setSelecting(null);
        return;
      }
      const memberName = member.fullName ?? member.email;
      try {
        localStorage.setItem(IMPERSONATE_LS_KEY, JSON.stringify({ memberId: member.id, memberName }));
      } catch { }
      window.location.href = "/member/scores";
    } catch {
      setSelecting(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-[#1e2a38]">View as Member</h2>
            <p className="text-xs text-[#1e2a38]/50 mt-0.5">Pick a member to see their view of the platform</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#3dc3ff] focus:border-transparent outline-none"
            />
          </div>
        </div>

        {/* Member list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-12 text-center text-sm text-[#1e2a38]/40">Loading members…</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#1e2a38]/40">No members found</div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {filtered.map((member) => {
                const isSelecting = selecting === member.id;
                const displayName = member.fullName ?? member.email;
                return (
                  <li key={member.id}>
                    <button
                      onClick={() => handleSelect(member)}
                      disabled={!!selecting}
                      className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-[#3dc3ff]/5 transition-colors text-left disabled:opacity-50"
                    >
                      <div className="w-8 h-8 rounded-full bg-[#1e2a38]/10 flex items-center justify-center shrink-0">
                        <UserCircleIcon className="w-5 h-5 text-[#1e2a38]/40" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#1e2a38] truncate">{displayName}</p>
                        {member.fullName && (
                          <p className="text-xs text-[#1e2a38]/40 truncate">{member.email}</p>
                        )}
                      </div>
                      {isSelecting && (
                        <div className="w-4 h-4 border-2 border-[#3dc3ff] border-t-transparent rounded-full animate-spin shrink-0" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100">
          <p className="text-xs text-[#1e2a38]/40 text-center">
            {members.length} member{members.length !== 1 ? "s" : ""} · You&apos;ll see the platform exactly as they do
          </p>
        </div>
      </div>
    </div>
  );
}

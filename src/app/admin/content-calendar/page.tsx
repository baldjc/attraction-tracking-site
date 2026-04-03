"use client";

import { useState, useEffect } from "react";
import { CalendarDaysIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import ContentPlannerClient from "@/app/member/content-planner/ContentPlannerClient";

interface Member {
  id: string;
  fullName: string | null;
  email: string;
}

interface SelectedMemberData {
  id: string;
  name: string;
  serviceTier: string;
}

export default function AdminContentCalendarPage() {
  const [members,        setMembers]        = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [selected,       setSelected]       = useState<SelectedMemberData | null>(null);
  const [tierLoading,    setTierLoading]    = useState(false);
  const [dropdownOpen,   setDropdownOpen]   = useState(false);
  const [search,         setSearch]         = useState("");

  useEffect(() => {
    fetch("/api/admin/members")
      .then((r) => r.json())
      .then((d) => setMembers(d.members ?? d ?? []))
      .catch(() => {})
      .finally(() => setMembersLoading(false));
  }, []);

  async function selectMember(member: Member) {
    setDropdownOpen(false);
    setSearch("");
    if (selected?.id === member.id) return;
    setSelected(null);
    setTierLoading(true);
    try {
      const res  = await fetch(`/api/admin/members/${member.id}/content-plans`);
      const data = await res.json();
      setSelected({
        id:          member.id,
        name:        member.fullName ?? member.email,
        serviceTier: data.serviceTier ?? "foundations",
      });
    } catch {
      setSelected({
        id:          member.id,
        name:        member.fullName ?? member.email,
        serviceTier: "foundations",
      });
    } finally {
      setTierLoading(false);
    }
  }

  const filteredMembers = members.filter((m) => {
    const q = search.toLowerCase();
    return (m.fullName ?? "").toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
  });

  const displayName = selected?.name ?? "Select a member";

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#2f3437]">Content Calendar</h1>
          <p className="text-sm text-[#2f3437]/50 mt-0.5">View and manage any member&apos;s content plan</p>
        </div>
      </div>

      {/* Member selector */}
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 mb-6 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 shrink-0">
          <CalendarDaysIcon className="w-5 h-5 text-[#6ba3c7]" />
          <span className="text-sm font-medium text-[#2f3437]">Viewing content for:</span>
        </div>

        <div className="relative">
          <button
            onClick={() => setDropdownOpen((o) => !o)}
            disabled={membersLoading}
            className="flex items-center gap-2 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white hover:border-[#6ba3c7] transition-colors min-w-[220px] disabled:opacity-50"
          >
            <span className={`flex-1 text-left truncate ${selected ? "text-[#2f3437]" : "text-[#2f3437]/40"}`}>
              {membersLoading ? "Loading members…" : displayName}
            </span>
            <ChevronDownIcon className={`w-4 h-4 text-[#2f3437]/40 transition-transform shrink-0 ${dropdownOpen ? "rotate-180" : ""}`} />
          </button>

          {dropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-lg z-30 overflow-hidden">
              <div className="p-2 border-b border-gray-100">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                  placeholder="Search members…"
                  className="w-full text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/30"
                />
              </div>
              <div className="max-h-60 overflow-y-auto">
                {filteredMembers.length === 0 ? (
                  <p className="text-sm text-[#2f3437]/40 text-center py-4">No members found</p>
                ) : filteredMembers.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => selectMember(m)}
                    className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors ${selected?.id === m.id ? "bg-blue-50" : ""}`}
                  >
                    <p className="text-sm font-medium text-[#2f3437] truncate">{m.fullName ?? m.email}</p>
                    {m.fullName && <p className="text-xs text-[#2f3437]/50 truncate">{m.email}</p>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {selected && (
          <span className="text-xs bg-gray-100 text-[#2f3437]/60 px-2 py-1 rounded-full capitalize shrink-0">
            {selected.serviceTier.replace(/_/g, " ")}
          </span>
        )}
      </div>

      {/* Click outside to close dropdown */}
      {dropdownOpen && (
        <div className="fixed inset-0 z-20" onClick={() => setDropdownOpen(false)} />
      )}

      {/* Content planner */}
      {tierLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-[#6ba3c7] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!tierLoading && !selected && (
        <div className="bg-white border border-gray-200 rounded-xl p-16 text-center">
          <CalendarDaysIcon className="w-12 h-12 text-[#2f3437]/20 mx-auto mb-4" />
          <p className="text-sm font-medium text-[#2f3437]/50">Select a member above to view their content calendar</p>
        </div>
      )}

      {!tierLoading && selected && (
        <ContentPlannerClient
          key={selected.id}
          serviceTier={selected.serviceTier}
          apiBase={`/api/admin/members/${selected.id}/content-plans`}
          isAdminView
        />
      )}
    </div>
  );
}

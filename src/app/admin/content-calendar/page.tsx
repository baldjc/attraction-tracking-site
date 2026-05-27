"use client";

import { useState, useEffect } from "react";
import { CalendarDaysIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import ContentPlannerClient from "@/app/member/content-planner/ContentPlannerClient";
import { formatTierLabel, tierBadgeClasses } from "@/lib/content-plan-utils";

interface Member {
  id: string;
  fullName: string | null;
  email: string;
  serviceTier?: string | null;
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
  const [memberSearch,   setMemberSearch]   = useState("");
  const [dropdownOpen,   setDropdownOpen]   = useState(false);
  const [mobileSearch,   setMobileSearch]   = useState("");

  useEffect(() => {
    fetch("/api/admin/members")
      .then((r) => r.json())
      .then((d) => setMembers(d.members ?? d ?? []))
      .catch(() => {})
      .finally(() => setMembersLoading(false));
  }, []);

  async function handleSelectMember(member: Member) {
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
    const q = memberSearch.toLowerCase();
    return q === "" || (m.fullName ?? "").toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
  });

  const mobileFiltered = members.filter((m) => {
    const q = mobileSearch.toLowerCase();
    return q === "" || (m.fullName ?? "").toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
  });

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Left panel: Member list (desktop only) */}
      <div className="hidden lg:flex flex-col w-52 shrink-0 border-r border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#1a1a1a]">
        <div className="px-2.5 py-2 border-b border-gray-100 dark:border-[#2a2a2a] sticky top-0 bg-white dark:bg-[#1a1a1a] z-10 shrink-0">
          <p className="text-[10px] font-semibold text-[var(--abv-text)]/50 dark:text-white/40 uppercase tracking-wider mb-1.5">Members</p>
          <input
            type="text"
            placeholder="Search members…"
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-[#2a2a2a] rounded-md px-2.5 py-1.5 text-xs text-[var(--abv-text)] dark:text-[#e2e8f0] placeholder:text-[var(--abv-text)]/30 focus:outline-none focus:border-[var(--abv-azure)]"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {membersLoading ? (
            <div className="p-3 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-10 bg-gray-100 dark:bg-white/5 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : filteredMembers.length === 0 ? (
            <p className="text-xs text-[var(--abv-text)]/40 dark:text-white/30 text-center py-6">No members found</p>
          ) : (
            filteredMembers.map((m) => (
              <button
                key={m.id}
                onClick={() => handleSelectMember(m)}
                className={`w-full text-left px-2.5 py-1.5 border-b border-gray-50 dark:border-[#2a2a2a]/50 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors ${
                  selected?.id === m.id
                    ? "bg-[var(--abv-dark)]/5 dark:bg-[var(--abv-dark)]/10 border-l-2 border-l-[var(--abv-azure)]"
                    : ""
                }`}
              >
                <p className="text-xs font-medium text-[var(--abv-text)] dark:text-[#e2e8f0] truncate leading-tight">{m.fullName || m.email}</p>
                <span
                  className={`inline-block text-[9px] font-medium px-1.5 py-0.5 rounded mt-0.5 ${
                    m.serviceTier ? tierBadgeClasses(m.serviceTier) : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {m.serviceTier ? formatTierLabel(m.serviceTier) : "No tier"}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Mobile: dropdown selector */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="lg:hidden p-4 border-b border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#1a1a1a] shrink-0">
          <div className="relative">
            <button
              onClick={() => setDropdownOpen((o) => !o)}
              disabled={membersLoading}
              className="flex items-center gap-2 text-sm border border-gray-200 dark:border-[#2a2a2a] rounded-lg px-3 py-2 bg-white dark:bg-[#1a1a1a] hover:border-[var(--abv-azure)] transition-colors w-full disabled:opacity-50"
            >
              <CalendarDaysIcon className="w-4 h-4 text-[var(--abv-azure)] shrink-0" />
              <span className={`flex-1 text-left truncate ${selected ? "text-[var(--abv-text)] dark:text-[#e2e8f0]" : "text-[var(--abv-text)]/40 dark:text-white/30"}`}>
                {membersLoading ? "Loading members…" : (selected?.name ?? "Select a member")}
              </span>
              <ChevronDownIcon className={`w-4 h-4 text-[var(--abv-text)]/40 transition-transform shrink-0 ${dropdownOpen ? "rotate-180" : ""}`} />
            </button>
            {dropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-full bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-[#2a2a2a] rounded-xl shadow-lg z-30 overflow-hidden">
                <div className="p-2 border-b border-gray-100 dark:border-[#2a2a2a]">
                  <input
                    type="text"
                    value={mobileSearch}
                    onChange={(e) => setMobileSearch(e.target.value)}
                    autoFocus
                    placeholder="Search members…"
                    className="w-full text-sm px-3 py-1.5 border border-gray-200 dark:border-[#2a2a2a] rounded-lg bg-white dark:bg-[#1a1a1a] text-[var(--abv-text)] dark:text-[#e2e8f0] focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/30"
                  />
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {mobileFiltered.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { handleSelectMember(m); setDropdownOpen(false); setMobileSearch(""); }}
                      className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors ${selected?.id === m.id ? "bg-[var(--abv-dark)]/5 dark:bg-[var(--abv-dark)]/10" : ""}`}
                    >
                      <p className="text-sm font-medium text-[var(--abv-text)] dark:text-[#e2e8f0] truncate">{m.fullName ?? m.email}</p>
                      {m.fullName && <p className="text-xs text-[var(--abv-text)]/50 dark:text-white/30 truncate">{m.email}</p>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        {dropdownOpen && (
          <div className="fixed inset-0 z-20 lg:hidden" onClick={() => setDropdownOpen(false)} />
        )}

        {/* Right panel: Content Planner */}
        <div className="flex-1 overflow-y-auto">
          {tierLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-6 h-6 border-2 border-[var(--abv-azure)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : selected ? (
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-sm font-semibold text-[var(--abv-text)] dark:text-[#e2e8f0]">{selected.name}</h2>
                <span className={`text-[10px] px-2 py-0.5 rounded font-medium capitalize ${
                  selected.serviceTier ? tierBadgeClasses(selected.serviceTier) : "bg-[#E3E2E0] text-[#3F3D38]"
                }`}>
                  {formatTierLabel(selected.serviceTier)}
                </span>
              </div>
              <ContentPlannerClient
                key={selected.id}
                serviceTier={selected.serviceTier}
                apiBase={`/api/admin/members/${selected.id}/content-plans`}
                isAdminView
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <CalendarDaysIcon className="w-10 h-10 text-[var(--abv-text)]/15 dark:text-white/10 mx-auto mb-3" />
                <p className="text-sm text-[var(--abv-text)]/40 dark:text-white/30">
                  Select a member to view their content plan
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

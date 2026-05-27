"use client";

import { useState, useEffect, useRef } from "react";
import { UserCircleIcon, ChevronDownIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { IMPERSONATE_LS_KEY } from "@/lib/impersonate-constants";

interface MemberOption {
  id: string;
  fullName: string | null;
  email: string;
}

export default function WorkingForBanner() {
  const [impersonate, setImpersonate] = useState<{ memberId: string; memberName: string } | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [search, setSearch] = useState("");
  const [loadingMembers, setLoadingMembers] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(IMPERSONATE_LS_KEY);
      setImpersonate(raw ? JSON.parse(raw) : null);
    } catch {
      setImpersonate(null);
    }
  }, []);

  useEffect(() => {
    if (!showPicker) { setSearch(""); return; }
    setLoadingMembers(true);
    fetch("/api/members")
      .then((r) => r.json())
      .then((d) => setMembers(d.members ?? []))
      .finally(() => setLoadingMembers(false));
  }, [showPicker]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function selectMember(member: MemberOption) {
    setShowPicker(false);
    const res = await fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: member.id }),
    });
    if (res.ok) {
      const memberName = member.fullName || member.email;
      localStorage.setItem(IMPERSONATE_LS_KEY, JSON.stringify({ memberId: member.id, memberName, targetRole: "member" }));
      setImpersonate({ memberId: member.id, memberName });
      window.location.reload();
    }
  }

  async function clearMember() {
    setShowPicker(false);
    await fetch("/api/admin/impersonate", { method: "DELETE" });
    localStorage.removeItem(IMPERSONATE_LS_KEY);
    setImpersonate(null);
    window.location.reload();
  }

  const filtered = members.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (m.fullName ?? "").toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
  });

  return (
    <div className="mb-6 bg-[var(--abv-ai-tools)]/8 border border-[var(--abv-ai-tools)]/20 rounded-lg px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <UserCircleIcon className="w-4 h-4 text-[var(--abv-text)]/40 shrink-0" />
          <span className="text-xs text-[var(--abv-text)]/50 font-medium shrink-0">Working for:</span>
          {impersonate ? (
            <span className="text-xs font-semibold text-[var(--abv-text)] truncate">{impersonate.memberName}</span>
          ) : (
            <span className="text-xs text-[var(--abv-text)]/30 italic">No member selected — using your own data</span>
          )}
        </div>

        <div className="relative shrink-0" ref={dropdownRef}>
          <button
            onClick={() => setShowPicker((s) => !s)}
            className="flex items-center gap-1.5 text-xs font-semibold text-[var(--abv-ai-tools)] border border-[var(--abv-ai-tools)]/30 px-3 py-1.5 rounded-lg hover:bg-[var(--abv-ai-tools)]/10 transition-colors whitespace-nowrap"
          >
            {impersonate ? "Change" : "Select member"}
            <ChevronDownIcon className={`w-3 h-3 transition-transform ${showPicker ? "rotate-180" : ""}`} />
          </button>

          {showPicker && (
            <div className="absolute right-0 top-full mt-1 w-72 bg-white rounded-lg shadow-2xl border border-gray-200 z-50 overflow-hidden">
              <div className="p-2 border-b border-gray-100">
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search members…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-6 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-[var(--abv-ai-tools)]"
                  />
                </div>
              </div>
              <ul className="max-h-60 overflow-y-auto divide-y divide-gray-50">
                {loadingMembers ? (
                  <li className="px-3 py-4 text-xs text-center text-gray-400">Loading…</li>
                ) : filtered.length === 0 ? (
                  <li className="px-3 py-4 text-xs text-center text-gray-400">No members found</li>
                ) : (
                  filtered.map((m) => (
                    <li key={m.id}>
                      <button
                        onClick={() => selectMember(m)}
                        className={`w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-[var(--abv-ai-tools)]/5 transition-colors ${
                          impersonate?.memberId === m.id ? "bg-amber-50" : ""
                        }`}
                      >
                        <UserCircleIcon className="w-4 h-4 text-gray-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-[var(--abv-text)] truncate">{m.fullName ?? m.email}</p>
                          {m.fullName && <p className="text-[10px] text-gray-400 truncate">{m.email}</p>}
                        </div>
                        {impersonate?.memberId === m.id && (
                          <span className="text-[10px] text-amber-600 font-semibold shrink-0">Current</span>
                        )}
                      </button>
                    </li>
                  ))
                )}
              </ul>
              {impersonate && (
                <div className="p-2 border-t border-gray-100">
                  <button
                    onClick={clearMember}
                    className="w-full text-xs text-[var(--abv-text)]/50 hover:text-[var(--abv-text)] py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Clear — use my own data
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

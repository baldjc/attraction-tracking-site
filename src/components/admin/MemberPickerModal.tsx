"use client";

import { useState, useEffect, useRef } from "react";
import { MagnifyingGlassIcon, XMarkIcon, UserCircleIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { IMPERSONATE_LS_KEY, IMPERSONATE_COOKIE } from "@/lib/impersonate-constants";

interface User {
  id: string;
  fullName: string | null;
  email: string;
  role: string;
}

interface Props {
  onClose: () => void;
  adminEmail?: string;
}

export default function MemberPickerModal({ onClose, adminEmail }: Props) {
  const [members, setMembers] = useState<User[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selecting, setSelecting] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
    Promise.all([
      fetch("/api/members").then((r) => r.json()),
      fetch("/api/admin/staff-users").then((r) => r.json()),
    ]).then(([memberData, staffData]) => {
      setMembers(
        (memberData.members ?? []).map((m: any) => ({
          id: m.id,
          fullName: m.fullName,
          email: m.email,
          role: "foundations_member",
        }))
      );
      setStaff(staffData.staff ?? []);
    }).finally(() => setLoading(false));
  }, []);

  function matches(u: User) {
    if (!search) return true;
    const q = search.toLowerCase();
    return (u.fullName ?? "").toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  }

  const filteredStaff = staff.filter(matches);
  const filteredMembers = members.filter(matches);
  const totalShown = filteredStaff.length + filteredMembers.length;

  async function handleSelect(user: User) {
    setSelecting(user.id);
    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: user.id }),
      });
      if (!res.ok) {
        alert("Failed to switch view");
        setSelecting(null);
        return;
      }
      const displayName = user.fullName ?? user.email;
      try {
        localStorage.setItem(IMPERSONATE_LS_KEY, JSON.stringify({ memberId: user.id, memberName: displayName }));
      } catch {}
      document.cookie = `impersonate_member=${user.id}; path=/; max-age=${60 * 60 * 8}; SameSite=Lax`;
      const isStaff = user.role === "admin" || user.role === "editor";
      window.location.href = isStaff ? "/admin" : "/member/dashboard";
    } catch {
      setSelecting(null);
    }
  }

  function UserRow({ user }: { user: User }) {
    const isSelecting = selecting === user.id;
    const displayName = user.fullName ?? user.email;
    const isStaff = user.role === "admin" || user.role === "editor";
    return (
      <li>
        <button
          onClick={() => handleSelect(user)}
          disabled={!!selecting}
          className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-[#6ba3c7]/5 transition-colors text-left disabled:opacity-50"
        >
          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isStaff ? "bg-[#1e2a38]/10" : "bg-[#111]/8"}`}>
            {isStaff
              ? <ShieldCheckIcon className="w-4 h-4 text-[#1e2a38]/50" />
              : <UserCircleIcon className="w-5 h-5 text-[#2f3437]/40" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[#2f3437] truncate">{displayName}</p>
            <p className="text-xs text-[#2f3437]/40 truncate">
              {user.fullName ? user.email : ""}
              {isStaff && (
                <span className={`ml-1 capitalize ${user.fullName ? "" : ""}`}>
                  {user.fullName ? `· ${user.role}` : user.role}
                </span>
              )}
            </p>
          </div>
          {isSelecting && (
            <div className="w-4 h-4 border-2 border-[#6ba3c7] border-t-transparent rounded-full animate-spin shrink-0" />
          )}
        </button>
      </li>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#eaeaea]">
          <div>
            <h2 className="text-base font-semibold text-[#2f3437]">Switch View</h2>
            <p className="text-xs text-[#2f3437]/50 mt-0.5">Pick any user to see the platform as they do</p>
          </div>
          <button onClick={onClose} className="text-[#2f3437]/30 hover:text-[#2f3437] transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-[#eaeaea]">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2f3437]/30" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-[#eaeaea] rounded-lg focus:ring-2 focus:ring-[#6ba3c7] focus:border-transparent outline-none"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-12 text-center text-sm text-[#2f3437]/40">Loading…</div>
          ) : totalShown === 0 ? (
            <div className="py-12 text-center text-sm text-[#2f3437]/40">No users found</div>
          ) : (
            <ul className="divide-y divide-[#eaeaea]/60">
              {filteredStaff.length > 0 && (
                <>
                  <li className="px-5 py-2 bg-[#f7f6f3]">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#2f3437]/40">Staff</p>
                  </li>
                  {filteredStaff.map((u) => <UserRow key={u.id} user={u} />)}
                </>
              )}
              {filteredMembers.length > 0 && (
                <>
                  <li className="px-5 py-2 bg-[#f7f6f3]">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#2f3437]/40">
                      Foundations Members
                    </p>
                  </li>
                  {filteredMembers.map((u) => <UserRow key={u.id} user={u} />)}
                </>
              )}
            </ul>
          )}
        </div>

        <div className="px-5 py-3 border-t border-[#eaeaea]">
          <p className="text-xs text-[#2f3437]/40 text-center">
            {staff.length} staff · {members.length} member{members.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

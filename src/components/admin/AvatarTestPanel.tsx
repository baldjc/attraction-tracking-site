"use client";

import { useState, useEffect, useRef } from "react";
import {
  BeakerIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  PencilIcon,
  TrashIcon,
  PlusIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";

interface MemberOption {
  id: string;
  fullName: string | null;
  email: string;
  avatarName?: string | null;
  city?: string | null;
  contentThemes?: any;
}

interface TestAvatar {
  id: string;
  slotNumber: number;
  label: string;
  avatarName: string | null;
  avatarSummary: string | null;
  city: string | null;
  contentThemes: any;
  niche: any;
  avatarProfile: any;
}

interface PanelState {
  testAvatars: TestAvatar[];
  activeTestAvatarId: string | null;
  activeTestMemberId: string | null;
}

interface Props {
  onAvatarChange?: () => void;
}

function themeCount(contentThemes: any): number {
  if (!Array.isArray(contentThemes)) return 0;
  return contentThemes.length;
}

export default function AvatarTestPanel({ onAvatarChange }: Props) {
  const [state, setState] = useState<PanelState>({
    testAvatars: [],
    activeTestAvatarId: null,
    activeTestMemberId: null,
  });
  const [activeMemberName, setActiveMemberName] = useState<string | null>(null);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [showCustomManager, setShowCustomManager] = useState(false);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [search, setSearch] = useState("");
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [showForm, setShowForm] = useState<"create" | { id: string } | null>(null);
  const [formSlot, setFormSlot] = useState<number>(1);
  const [formLabel, setFormLabel] = useState("");
  const [formAvatarName, setFormAvatarName] = useState("");
  const [formAvatarSummary, setFormAvatarSummary] = useState("");
  const [formCity, setFormCity] = useState("");
  const [saving, setSaving] = useState(false);

  const memberRef = useRef<HTMLDivElement>(null);
  const customRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadState();
  }, []);

  useEffect(() => {
    if (!showMemberPicker) { setSearch(""); return; }
    setLoadingMembers(true);
    fetch("/api/members")
      .then((r) => r.json())
      .then((d) => setMembers(d.members ?? []))
      .finally(() => setLoadingMembers(false));
  }, [showMemberPicker]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (memberRef.current && !memberRef.current.contains(e.target as Node)) {
        setShowMemberPicker(false);
      }
      if (customRef.current && !customRef.current.contains(e.target as Node)) {
        setShowCustomManager(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function loadState() {
    try {
      const [panelRes, avatarRes] = await Promise.all([
        fetch("/api/admin/test-avatars").then((r) => r.json()),
        fetch("/api/member/avatar").then((r) => r.json()),
      ]);
      setState({
        testAvatars: panelRes.testAvatars ?? [],
        activeTestAvatarId: panelRes.activeTestAvatarId ?? null,
        activeTestMemberId: panelRes.activeTestMemberId ?? null,
      });
      if (avatarRes.testMemberName) {
        setActiveMemberName(avatarRes.testMemberName);
      }
    } catch {}
  }

  const activeTestAvatar = state.testAvatars.find((a) => a.id === state.activeTestAvatarId) ?? null;
  const isActive = !!state.activeTestAvatarId || !!state.activeTestMemberId;

  async function activateMember(member: MemberOption) {
    setShowMemberPicker(false);
    const res = await fetch("/api/admin/test-avatars/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: member.id }),
    });
    if (res.ok) {
      const name = member.fullName || member.email;
      setState((s) => ({ ...s, activeTestMemberId: member.id, activeTestAvatarId: null }));
      setActiveMemberName(name);
      onAvatarChange?.();
    }
  }

  async function activateCustom(avatar: TestAvatar) {
    setShowCustomManager(false);
    const res = await fetch("/api/admin/test-avatars/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testAvatarId: avatar.id }),
    });
    if (res.ok) {
      setState((s) => ({ ...s, activeTestAvatarId: avatar.id, activeTestMemberId: null }));
      onAvatarChange?.();
    }
  }

  async function clearActive() {
    await fetch("/api/admin/test-avatars/active", { method: "DELETE" });
    setState((s) => ({ ...s, activeTestAvatarId: null, activeTestMemberId: null }));
    setActiveMemberName(null);
    onAvatarChange?.();
  }

  function openCreate() {
    const usedSlots = state.testAvatars.map((a) => a.slotNumber);
    const nextSlot = [1, 2, 3, 4, 5].find((s) => !usedSlots.includes(s)) ?? 1;
    setFormSlot(nextSlot);
    setFormLabel("");
    setFormAvatarName("");
    setFormAvatarSummary("");
    setFormCity("");
    setShowForm("create");
  }

  function openEdit(avatar: TestAvatar) {
    setFormSlot(avatar.slotNumber);
    setFormLabel(avatar.label);
    setFormAvatarName(avatar.avatarName ?? "");
    setFormAvatarSummary(avatar.avatarSummary ?? "");
    setFormCity(avatar.city ?? "");
    setShowForm({ id: avatar.id });
  }

  async function saveForm() {
    if (!formLabel.trim()) return;
    setSaving(true);
    try {
      if (showForm === "create") {
        const res = await fetch("/api/admin/test-avatars", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slotNumber: formSlot,
            label: formLabel,
            avatarName: formAvatarName || null,
            avatarSummary: formAvatarSummary || null,
            city: formCity || null,
          }),
        });
        if (res.ok) {
          await loadState();
          setShowForm(null);
        }
      } else if (showForm && typeof showForm === "object") {
        const res = await fetch(`/api/admin/test-avatars/${showForm.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: formLabel,
            avatarName: formAvatarName || null,
            avatarSummary: formAvatarSummary || null,
            city: formCity || null,
          }),
        });
        if (res.ok) {
          await loadState();
          setShowForm(null);
        }
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteAvatar(id: string) {
    if (!confirm("Delete this custom test avatar?")) return;
    await fetch(`/api/admin/test-avatars/${id}`, { method: "DELETE" });
    await loadState();
  }

  const filtered = members.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (m.fullName ?? "").toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
  });

  const slots = [1, 2, 3, 4, 5];

  return (
    <div className="mb-6">
      {/* Form modal */}
      {showForm !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl border border-[#2f3437]/10 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-[#2f3437]">
                {showForm === "create" ? "Create Custom Test Avatar" : "Edit Custom Test Avatar"}
              </h3>
              <button onClick={() => setShowForm(null)} className="text-[#2f3437]/40 hover:text-[#2f3437]">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-[#2f3437]/60 mb-1 block">Label (required)</label>
                <input
                  type="text"
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  placeholder="e.g. First-Time Buyer, Investor, Empty Nester"
                  className="w-full text-sm border border-[#2f3437]/15 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-[#6ba3c7]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#2f3437]/60 mb-1 block">Avatar Name</label>
                <input
                  type="text"
                  value={formAvatarName}
                  onChange={(e) => setFormAvatarName(e.target.value)}
                  placeholder="e.g. Jamie"
                  className="w-full text-sm border border-[#2f3437]/15 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-[#6ba3c7]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#2f3437]/60 mb-1 block">Avatar Summary</label>
                <textarea
                  value={formAvatarSummary}
                  onChange={(e) => setFormAvatarSummary(e.target.value)}
                  placeholder="Brief description of the avatar persona…"
                  rows={3}
                  className="w-full text-sm border border-[#2f3437]/15 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-[#6ba3c7] resize-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#2f3437]/60 mb-1 block">City</label>
                <input
                  type="text"
                  value={formCity}
                  onChange={(e) => setFormCity(e.target.value)}
                  placeholder="e.g. Edmonton"
                  className="w-full text-sm border border-[#2f3437]/15 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-[#6ba3c7]"
                />
              </div>
              {showForm === "create" && (
                <div>
                  <label className="text-xs font-semibold text-[#2f3437]/60 mb-1 block">Slot</label>
                  <select
                    value={formSlot}
                    onChange={(e) => setFormSlot(Number(e.target.value))}
                    className="w-full text-sm border border-[#2f3437]/15 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-[#6ba3c7]"
                  >
                    {slots.map((s) => (
                      <option key={s} value={s}>
                        Slot {s}{state.testAvatars.find((a) => a.slotNumber === s) ? " (will replace existing)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowForm(null)}
                className="flex-1 text-sm text-[#2f3437]/50 border border-[#2f3437]/15 rounded-lg py-2 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveForm}
                disabled={!formLabel.trim() || saving}
                className="flex-1 text-sm font-semibold text-white bg-[#6ba3c7] rounded-lg py-2 hover:bg-[#5a8fb3] disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Panel bar */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <BeakerIcon className="w-4 h-4 text-amber-600 shrink-0" />
            {!isActive ? (
              <span className="text-xs text-amber-700 font-medium">Test Avatar: None — using your own data</span>
            ) : state.activeTestMemberId ? (
              <div className="min-w-0">
                <span className="text-xs font-semibold text-amber-800">
                  Testing with: {activeMemberName ? `${activeMemberName}'s Avatar` : "Member Avatar"}
                </span>
              </div>
            ) : activeTestAvatar ? (
              <div className="min-w-0">
                <span className="text-xs font-semibold text-amber-800">
                  Testing with: {activeTestAvatar.label} (Custom)
                </span>
                {(activeTestAvatar.avatarName || activeTestAvatar.city) && (
                  <p className="text-[10px] text-amber-600 mt-0.5">
                    {[
                      activeTestAvatar.avatarName,
                      themeCount(activeTestAvatar.contentThemes) > 0 ? `${themeCount(activeTestAvatar.contentThemes)} themes` : null,
                      activeTestAvatar.city,
                    ].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Member picker */}
            <div className="relative" ref={memberRef}>
              <button
                onClick={() => { setShowMemberPicker((s) => !s); setShowCustomManager(false); }}
                className="flex items-center gap-1 text-xs font-semibold text-amber-700 border border-amber-300 px-2.5 py-1.5 rounded-lg hover:bg-amber-100 transition-colors whitespace-nowrap"
              >
                <UserCircleIcon className="w-3 h-3" />
                {isActive && state.activeTestMemberId ? "Change" : "Use Member"}
                <ChevronDownIcon className={`w-3 h-3 transition-transform ${showMemberPicker ? "rotate-180" : ""}`} />
              </button>
              {showMemberPicker && (
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
                        className="w-full pl-6 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-[#6ba3c7]"
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
                            onClick={() => activateMember(m)}
                            className={`w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-amber-50 transition-colors ${
                              state.activeTestMemberId === m.id ? "bg-amber-50" : ""
                            }`}
                          >
                            <UserCircleIcon className="w-4 h-4 text-gray-400 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-[#2f3437] truncate">{m.fullName ?? m.email}</p>
                              {m.fullName && <p className="text-[10px] text-gray-400 truncate">{m.email}</p>}
                            </div>
                            {state.activeTestMemberId === m.id && (
                              <span className="text-[10px] text-amber-600 font-semibold shrink-0">Active</span>
                            )}
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              )}
            </div>

            {/* Custom avatar manager */}
            <div className="relative" ref={customRef}>
              <button
                onClick={() => { setShowCustomManager((s) => !s); setShowMemberPicker(false); }}
                className="flex items-center gap-1 text-xs font-semibold text-amber-700 border border-amber-300 px-2.5 py-1.5 rounded-lg hover:bg-amber-100 transition-colors whitespace-nowrap"
              >
                <BeakerIcon className="w-3 h-3" />
                Custom
                <ChevronDownIcon className={`w-3 h-3 transition-transform ${showCustomManager ? "rotate-180" : ""}`} />
              </button>
              {showCustomManager && (
                <div className="absolute right-0 top-full mt-1 w-80 bg-white rounded-lg shadow-2xl border border-gray-200 z-50 overflow-hidden">
                  <div className="p-3 border-b border-gray-100">
                    <p className="text-xs font-semibold text-[#2f3437]">Custom Test Avatars</p>
                    <p className="text-[10px] text-[#2f3437]/40 mt-0.5">Up to 5 slots for test scenarios</p>
                  </div>
                  <ul className="divide-y divide-gray-50">
                    {slots.map((slot) => {
                      const avatar = state.testAvatars.find((a) => a.slotNumber === slot);
                      return (
                        <li key={slot} className="px-3 py-2.5">
                          {avatar ? (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-[#2f3437] truncate">
                                  {slot}. {avatar.label}
                                </p>
                                {(avatar.avatarName || avatar.city) && (
                                  <p className="text-[10px] text-[#2f3437]/40">
                                    {[avatar.avatarName, avatar.city].filter(Boolean).join(" · ")}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => activateCustom(avatar)}
                                  className={`text-[10px] font-semibold px-2 py-1 rounded ${
                                    state.activeTestAvatarId === avatar.id
                                      ? "bg-amber-100 text-amber-700"
                                      : "bg-[#6ba3c7]/10 text-[#6ba3c7] hover:bg-[#6ba3c7]/20"
                                  }`}
                                >
                                  {state.activeTestAvatarId === avatar.id ? "Active" : "Use"}
                                </button>
                                <button
                                  onClick={() => { setShowCustomManager(false); openEdit(avatar); }}
                                  className="p-1 text-[#2f3437]/30 hover:text-[#2f3437]/60"
                                >
                                  <PencilIcon className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => deleteAvatar(avatar.id)}
                                  className="p-1 text-[#2f3437]/30 hover:text-red-500"
                                >
                                  <TrashIcon className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setShowCustomManager(false); setFormSlot(slot); openCreate(); setFormSlot(slot); }}
                              className="w-full flex items-center gap-2 text-xs text-[#2f3437]/30 hover:text-[#6ba3c7] transition-colors"
                            >
                              <span className="text-[#2f3437]/20">{slot}.</span>
                              <span className="flex-1 text-left border-b border-dashed border-[#2f3437]/10 pb-0.5">empty</span>
                              <PlusIcon className="w-3 h-3 shrink-0" />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  <div className="p-2 border-t border-gray-100">
                    <button
                      onClick={() => { setShowCustomManager(false); openCreate(); }}
                      className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-[#6ba3c7] hover:bg-[#6ba3c7]/5 py-2 rounded-lg transition-colors"
                    >
                      <PlusIcon className="w-3.5 h-3.5" />
                      Create New Custom Avatar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Clear */}
            {isActive && (
              <button
                onClick={clearActive}
                className="flex items-center gap-1 text-xs font-semibold text-amber-700 border border-amber-300 px-2.5 py-1.5 rounded-lg hover:bg-amber-100 transition-colors"
              >
                <XMarkIcon className="w-3 h-3" />
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

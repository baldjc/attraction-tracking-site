"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { EyeSlashIcon, EyeIcon, UserGroupIcon, ChevronDownIcon, XMarkIcon, CheckIcon, SparklesIcon, EnvelopeIcon, PencilSquareIcon, LinkIcon, Cog6ToothIcon, ArrowTopRightOnSquareIcon, CloudArrowUpIcon, MegaphoneIcon } from "@heroicons/react/24/outline";
import { IMPERSONATE_LS_KEY } from "@/lib/impersonate-constants";
import LinkTrackingPage from "@/app/member/link-tracking/page";
import AnnouncementsSection from "@/components/admin/AnnouncementsSection";

// ─── Staff Access ─────────────────────────────────────────────────────────────

interface StaffMember {
  id: string;
  fullName: string | null;
  email: string;
  role: string;
  allowedMemberIds: string[] | null;
}

interface MemberOption {
  id: string;
  fullName: string | null;
  email: string;
  youtubeChannelName: string | null;
}

function MemberPicker({
  allMembers,
  selected,
  onChange,
}: {
  allMembers: MemberOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    function outside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);

  const filtered = allMembers.filter((m) => {
    const name = (m.fullName ?? m.email).toLowerCase();
    return name.includes(search.toLowerCase());
  });

  function toggle(id: string) {
    if (selected.includes(id)) onChange(selected.filter((s) => s !== id));
    else onChange([...selected, id]);
  }

  const selectedMembers = allMembers.filter((m) => selected.includes(m.id));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 border border-[#2f3437]/15 rounded-lg text-sm bg-white hover:border-[#6ba3c7]/50 transition-colors"
      >
        <span className="text-[#2f3437]/60 truncate">
          {selected.length === 0 ? "Add members…" : `${selected.length} member${selected.length !== 1 ? "s" : ""} selected`}
        </span>
        <ChevronDownIcon className={`w-3.5 h-3.5 text-[#2f3437]/40 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-[#2f3437]/15 rounded-lg shadow-lg z-20 overflow-hidden">
          <div className="p-2 border-b border-[#2f3437]/8">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search members…"
              className="w-full px-3 py-1.5 text-sm border border-[#2f3437]/15 rounded-lg focus:outline-none focus:border-[#6ba3c7]"
            />
          </div>
          <ul className="max-h-52 overflow-y-auto divide-y divide-[#2f3437]/6">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-[#2f3437]/40 text-center">No members found</li>
            ) : (
              filtered.map((m) => {
                const checked = selected.includes(m.id);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => toggle(m.id)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#6ba3c7]/5 transition-colors text-left"
                    >
                      <span className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${checked ? "bg-[#6ba3c7] border-[#6ba3c7]" : "border-[#2f3437]/25"}`}>
                        {checked && <CheckIcon className="w-3 h-3 text-white" />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#2f3437] truncate">{m.fullName || m.email}</p>
                        {m.youtubeChannelName && <p className="text-xs text-[#2f3437]/40 truncate">{m.youtubeChannelName}</p>}
                      </div>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}

      {selectedMembers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selectedMembers.map((m) => (
            <span key={m.id} className="inline-flex items-center gap-1 bg-[#6ba3c7]/10 text-[#2f3437] text-xs font-medium px-2 py-1 rounded-full">
              {m.fullName || m.email}
              <button type="button" onClick={() => toggle(m.id)} className="hover:text-[#ff0033]">
                <XMarkIcon className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function StaffCard({
  staff,
  allMembers,
  onSaved,
  onRemoved,
}: {
  staff: StaffMember;
  allMembers: MemberOption[];
  onSaved: (id: string, ids: string[] | null) => void;
  onRemoved: (id: string) => void;
}) {
  const rawIds = staff.allowedMemberIds;
  const initIds = Array.isArray(rawIds) ? (rawIds as string[]) : null;

  const [fullAccess, setFullAccess] = useState(initIds === null);
  const [selected, setSelected] = useState<string[]>(initIds ?? []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [viewingAs, setViewingAs] = useState(false);

  async function handleViewAs() {
    setViewingAs(true);
    const res = await fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: staff.id }),
    });
    if (res.ok) {
      const memberName = staff.fullName || staff.email;
      localStorage.setItem(IMPERSONATE_LS_KEY, JSON.stringify({ memberId: staff.id, memberName, targetRole: staff.role || "editor" }));
      window.location.href = "/admin";
    }
    setViewingAs(false);
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const payload = fullAccess ? null : selected;
    const res = await fetch("/api/admin/staff", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffUserId: staff.id, allowedMemberIds: payload }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      onSaved(staff.id, payload);
      setTimeout(() => setSaved(false), 2500);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    const res = await fetch("/api/admin/staff", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffUserId: staff.id }),
    });
    setRemoving(false);
    if (res.ok) onRemoved(staff.id);
  }

  const roleBadge = staff.role === "admin"
    ? "bg-purple-100 text-purple-700"
    : "bg-amber-100 text-amber-700";

  return (
    <div className="border border-[#2f3437]/10 rounded-lg p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#2f3437] truncate">{staff.fullName || staff.email}</p>
          <p className="text-xs text-[#2f3437]/50 truncate">{staff.email}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full ${roleBadge}`}>
            {staff.role === "admin" ? "Admin" : "Staff Admin"}
          </span>
          <button
            type="button"
            onClick={handleViewAs}
            disabled={viewingAs}
            title={`View as ${staff.fullName || staff.email}`}
            className="text-xs font-medium text-[#6ba3c7] border border-[#6ba3c7]/30 px-2.5 py-1 rounded-lg hover:bg-[#6ba3c7]/10 disabled:opacity-50 transition-colors"
          >
            {viewingAs ? "…" : "View as"}
          </button>
          {!confirmRemove && (
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              className="text-[#2f3437]/30 hover:text-[#ff0033] transition-colors"
              title="Remove account"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {confirmRemove && (
        <div className="bg-[#ff0033]/5 border border-[#ff0033]/20 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-xs text-[#2f3437] font-medium">Remove this account permanently?</p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setConfirmRemove(false)}
              className="text-xs text-[#2f3437]/50 hover:text-[#2f3437] font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={removing}
              className="text-xs font-semibold text-white bg-[#ff0033] hover:bg-[#ff0033]/80 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {removing ? "Removing…" : "Remove"}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFullAccess(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              fullAccess
                ? "bg-[#111] text-white border-[#2f3437]"
                : "bg-white text-[#2f3437]/60 border-[#2f3437]/15 hover:border-[#2f3437]/30"
            }`}
          >
            All members
          </button>
          <button
            type="button"
            onClick={() => setFullAccess(false)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              !fullAccess
                ? "bg-[#111] text-white border-[#2f3437]"
                : "bg-white text-[#2f3437]/60 border-[#2f3437]/15 hover:border-[#2f3437]/30"
            }`}
          >
            Custom access
          </button>
        </div>

        {!fullAccess && (
          <MemberPicker
            allMembers={allMembers}
            selected={selected}
            onChange={setSelected}
          />
        )}

        {fullAccess && (
          <p className="text-xs text-[#2f3437]/40 italic">This account can see all members.</p>
        )}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-[#6ba3c7] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-[#6ba3c7]/90 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-xs text-green-600 font-medium">✓ Saved</span>}
      </div>
    </div>
  );
}

function AddStaffForm({ onCreated }: { onCreated: (s: StaffMember) => void }) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "editor">("editor");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const res = await fetch("/api/admin/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, email, role, password }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to create account");
      return;
    }
    onCreated(data.staff);
    setOpen(false);
    setFullName("");
    setEmail("");
    setPassword("");
    setRole("editor");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-[#2f3437]/15 hover:border-[#6ba3c7]/40 rounded-lg py-3 text-sm text-[#2f3437]/40 hover:text-[#6ba3c7] transition-colors font-medium"
      >
        <span className="text-lg leading-none">+</span> Add staff account
      </button>
    );
  }

  return (
    <div className="border border-[#6ba3c7]/30 bg-[#6ba3c7]/3 rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-[#2f3437]">New staff account</p>
        <button type="button" onClick={() => { setOpen(false); setError(""); }} className="text-[#2f3437]/30 hover:text-[#2f3437]">
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>
      <form onSubmit={handleCreate} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Full name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Smith"
              className="w-full px-3 py-2 text-sm border border-[#2f3437]/15 rounded-lg focus:outline-none focus:border-[#6ba3c7] bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "editor")}
              className="w-full px-3 py-2 text-sm border border-[#2f3437]/15 rounded-lg focus:outline-none focus:border-[#6ba3c7] bg-white"
            >
              <option value="editor">Staff Admin</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Email address <span className="text-[#ff0033]">*</span></label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            className="w-full px-3 py-2 text-sm border border-[#2f3437]/15 rounded-lg focus:outline-none focus:border-[#6ba3c7] bg-white"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Temporary password <span className="text-[#ff0033]">*</span></label>
          <input
            type="text"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Set a temporary password"
            className="w-full px-3 py-2 text-sm border border-[#2f3437]/15 rounded-lg focus:outline-none focus:border-[#6ba3c7] bg-white font-mono"
          />
          <p className="text-[10px] text-[#2f3437]/40 mt-1">Share this password with the team member so they can sign in.</p>
        </div>
        {error && <p className="text-xs text-[#ff0033] font-medium">{error}</p>}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="bg-[#111] text-white text-xs font-semibold px-5 py-2 rounded-lg hover:bg-[#111]/80 disabled:opacity-50 transition-colors"
          >
            {saving ? "Creating…" : "Create account"}
          </button>
          <button type="button" onClick={() => { setOpen(false); setError(""); }} className="text-xs text-[#2f3437]/50 hover:text-[#2f3437]">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function StaffAccessSection() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [allMembers, setAllMembers] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/staff")
      .then((r) => r.json())
      .then((d) => {
        setStaff(d.staff ?? []);
        setAllMembers(d.members ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function handleSaved(id: string, ids: string[] | null) {
    setStaff((prev) =>
      prev.map((s) => (s.id === id ? { ...s, allowedMemberIds: ids } : s))
    );
  }

  function handleRemoved(id: string) {
    setStaff((prev) => prev.filter((s) => s.id !== id));
  }

  function handleCreated(s: StaffMember) {
    setStaff((prev) => [...prev, s]);
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-1">
        <UserGroupIcon className="w-5 h-5 text-[#6ba3c7]" />
        <h2 className="text-base font-semibold text-[#2f3437]">Staff & Editor Access</h2>
      </div>
      <p className="text-sm text-[#2f3437]/50 mb-5">
        Create and manage admin or editor accounts. Control which members each one can see — &ldquo;All members&rdquo; for full access, or &ldquo;Custom access&rdquo; to restrict by member.
      </p>

      {loading && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 bg-[#111]/5 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {!loading && (
        <div className="space-y-3">
          {staff.map((s) => (
            <StaffCard
              key={s.id}
              staff={s}
              allMembers={allMembers}
              onSaved={handleSaved}
              onRemoved={handleRemoved}
            />
          ))}
          <AddStaffForm onCreated={handleCreated} />
        </div>
      )}
    </div>
  );
}

// ─── Feature Visibility ───────────────────────────────────────────────────────

// Wave 0 — v2 per-user gated flags use this object shape. Existing 27 flags
// stay boolean (contract enforced server-side in /api/admin/feature-visibility).
type V2FlagValue = { enabled: boolean; allowedUserIds: string[] };
type FlagValue = boolean | V2FlagValue;

interface FeatureFlags {
  [key: string]: FlagValue;
}

function isV2Flag(v: FlagValue | undefined): v is V2FlagValue {
  return !!v && typeof v === "object" && "enabled" in v && Array.isArray((v as V2FlagValue).allowedUserIds);
}

const V2_FLAG_DEFS: { key: string; label: string; desc: string }[] = [
  { key: "tool_market_data", label: "Market Data Upload", desc: "v2 — CSV upload + market configuration" },
  { key: "tool_fact_validator", label: "Fact Validator", desc: "v2 — Validates uploaded MLS data into market facts" },
  { key: "tool_content_engine_v2", label: "Content Engine v2", desc: "v2 — Idea generation grounded in validated facts" },
  { key: "tool_idea_validation", label: "Idea Validation", desc: "v2 — Pre-script idea check against avatar + facts" },
  { key: "tool_script_builder_v2", label: "Script Builder v2", desc: "v2 — Data-grounded script writer" },
  { key: "tool_home_tour_mode", label: "Home Tour Mode", desc: "v2 — Home-tour shoot type in planner" },
  { key: "nav_v2_hub", label: "v2 Navigation Hub", desc: "v2 — Unified hub entry point for data-first features" },
];

const FEATURE_DEFS = [
  {
    group: "Navigation",
    items: [
      { key: "campaigns", label: "Campaigns & Link Tracking", desc: "Campaigns, conversions, and link tracker pages" },
      { key: "ai_tools", label: "AI Tools Hub", desc: "The entire AI tools section — also controls individual tools below" },
      { key: "resources", label: "Resources", desc: "Resource library page" },
      { key: "content_calendar", label: "Content Calendar", desc: "Content planner and video pipeline" },
      { key: "client_hub", label: "Client Hub", desc: "Client Hub page for production-tier members" },
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
      { key: "tool_repurpose_content", label: "Repurpose Content", desc: "Turn transcripts into content — also controls individual formats below" },
      { key: "tool_listing_video_builder", label: "Listing Video Builder", desc: "Turn listings into avatar-driven video concepts" },
    ],
  },
  {
    group: "Repurpose Content Formats",
    parentFlag: "tool_repurpose_content",
    items: [
      { key: "tool_repurpose_newsletter", label: "Newsletter", desc: "Email newsletter format" },
      { key: "tool_repurpose_linkedin", label: "LinkedIn Article", desc: "Long-form LinkedIn article" },
      { key: "tool_repurpose_facebook", label: "Facebook Post", desc: "Facebook post and first comment" },
      { key: "tool_repurpose_blog", label: "Blog Post (AI-Optimized)", desc: "AI-citation-ready blog article" },
      { key: "tool_repurpose_postcard", label: "Neighbourhood Postcard", desc: "Direct mail postcard copy" },
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
      } ${enabled ? "bg-[#6ba3c7]" : "bg-[#111]/20"}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          enabled ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

const FLAG_DESCRIPTIONS: Record<string, string> = {
  campaigns: "Shows the Generate Leads section and campaign tracking for all members.",
  ai_tools: "Master toggle for the AI Tools sidebar section. When off, no AI tools are accessible.",
  resources: "Shows learning resources. When off, resource content is hidden from members.",
  tool_avatar_architect: "Avatar Architect — build ideal viewer profiles. Requires AI Tools enabled.",
  tool_content_engine: "Content Engine — generate video ideas from avatar. Requires AI Tools enabled.",
  tool_arc_script_builder: "ARC Script Builder — write video scripts. Requires AI Tools enabled.",
  tool_title_analyzer: "Title & Thumbnail Analyzer — score titles. Requires AI Tools enabled.",
  tool_script_review: "Script Review — score scripts against 14 principles. Requires AI Tools enabled.",
  tool_repurpose_content: "Master toggle for Repurpose Content tool. Requires AI Tools enabled.",
  tool_repurpose_newsletter: "Newsletter format in Repurpose. Requires Repurpose Content enabled.",
  tool_repurpose_linkedin: "LinkedIn article format in Repurpose. Requires Repurpose Content enabled.",
  tool_repurpose_facebook: "Facebook post format in Repurpose. Requires Repurpose Content enabled.",
  tool_repurpose_blog: "Blog post format in Repurpose. Requires Repurpose Content enabled.",
  tool_repurpose_postcard: "Postcard format in Repurpose. Requires Repurpose Content enabled.",
};

function V2FlagCard({
  flagKey,
  label,
  desc,
  value,
  allMembers,
  saving,
  onSave,
}: {
  flagKey: string;
  label: string;
  desc: string;
  value: V2FlagValue;
  allMembers: MemberOption[];
  saving: boolean;
  onSave: (next: V2FlagValue) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<V2FlagValue>(value);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<"saved" | "error" | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    function outside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);

  const dirty =
    draft.enabled !== value.enabled ||
    draft.allowedUserIds.length !== value.allowedUserIds.length ||
    draft.allowedUserIds.some((id, i) => id !== value.allowedUserIds[i]);

  const memberById = new Map(allMembers.map((m) => [m.id, m]));
  const candidates = allMembers.filter((m) => {
    if (draft.allowedUserIds.includes(m.id)) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const name = (m.fullName ?? "").toLowerCase();
    return name.includes(q) || m.email.toLowerCase().includes(q);
  });

  function addMember(id: string) {
    if (draft.allowedUserIds.includes(id)) return;
    setDraft({ ...draft, allowedUserIds: [...draft.allowedUserIds, id] });
    setSearch("");
    setPickerOpen(false);
  }

  function removeMember(id: string) {
    setDraft({
      ...draft,
      allowedUserIds: draft.allowedUserIds.filter((x) => x !== id),
    });
  }

  async function handleSave() {
    const ok = await onSave(draft);
    setToast(ok ? "saved" : "error");
    setTimeout(() => setToast(null), 2500);
  }

  return (
    <div className="border border-[#2f3437]/10 rounded-lg p-4 bg-white">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <code className="text-sm font-semibold text-[#2f3437]">{flagKey}</code>
            <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
              v2
            </span>
          </div>
          <p className="text-xs text-[#2f3437]/50 mt-0.5">{label} — {desc}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-medium text-[#2f3437]/60">Enabled</span>
          <Toggle
            enabled={draft.enabled}
            onChange={(v) => setDraft({ ...draft, enabled: v })}
            disabled={saving}
          />
        </div>
      </div>

      <div className="border-t border-[#2f3437]/8 pt-3">
        <p className="text-xs font-medium text-[#2f3437]/60 mb-2">
          Members with early access (allowlist)
        </p>

        {draft.allowedUserIds.length === 0 ? (
          <p className="text-xs italic text-[#2f3437]/40 mb-2">
            No members in allowlist. Admins still see this flag via admin bypass.
          </p>
        ) : (
          <ul className="space-y-1 mb-2">
            {draft.allowedUserIds.map((id) => {
              const m = memberById.get(id);
              return (
                <li
                  key={id}
                  className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-md bg-[#6ba3c7]/5 border border-[#6ba3c7]/15"
                >
                  <div className="min-w-0">
                    {m ? (
                      <>
                        <p className="text-xs font-medium text-[#2f3437] truncate">
                          {m.fullName || m.email}
                        </p>
                        <p className="text-[10px] text-[#2f3437]/50 truncate font-mono">
                          {m.email} · {id}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs font-medium text-amber-700 truncate">Unknown user</p>
                        <p className="text-[10px] text-[#2f3437]/50 truncate font-mono">{id}</p>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeMember(id)}
                    disabled={saving}
                    className="text-[11px] font-medium text-[#ff0033] hover:bg-[#ff0033]/10 px-2 py-1 rounded disabled:opacity-40"
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div ref={pickerRef} className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            disabled={saving}
            className="text-xs font-medium text-[#6ba3c7] hover:bg-[#6ba3c7]/5 border border-[#6ba3c7]/30 rounded-md px-3 py-1.5 disabled:opacity-40"
          >
            + Add member
          </button>

          {pickerOpen && (
            <div className="absolute left-0 top-full mt-1 z-20 w-80 bg-white border border-[#2f3437]/15 rounded-lg shadow-lg overflow-hidden">
              <div className="p-2 border-b border-[#2f3437]/8">
                <input
                  autoFocus
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or email…"
                  className="w-full px-3 py-1.5 text-xs border border-[#2f3437]/15 rounded-md focus:outline-none focus:border-[#6ba3c7]"
                />
              </div>
              <ul className="max-h-56 overflow-y-auto divide-y divide-[#2f3437]/6">
                {candidates.length === 0 ? (
                  <li className="px-3 py-3 text-xs text-[#2f3437]/40 text-center">
                    {search ? "No matches" : "No members available"}
                  </li>
                ) : (
                  candidates.slice(0, 50).map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => addMember(m.id)}
                        className="w-full text-left px-3 py-2 hover:bg-[#6ba3c7]/5"
                      >
                        <p className="text-xs font-medium text-[#2f3437] truncate">
                          {m.fullName || m.email}
                        </p>
                        <p className="text-[10px] text-[#2f3437]/50 truncate">{m.email}</p>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[#2f3437]/8">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="bg-[#6ba3c7] text-white text-xs font-semibold px-4 py-1.5 rounded-md hover:bg-[#6ba3c7]/90 disabled:opacity-40 transition-colors"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {!dirty && !toast && (
          <span className="text-[11px] text-[#2f3437]/40">No changes</span>
        )}
        {toast === "saved" && (
          <span className="text-[11px] text-green-600 font-medium">✓ Saved</span>
        )}
        {toast === "error" && (
          <span className="text-[11px] text-[#ff0033] font-medium">Failed to save</span>
        )}
      </div>
    </div>
  );
}

function FeatureVisibilitySection() {
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [allMembers, setAllMembers] = useState<MemberOption[]>([]);

  useEffect(() => {
    fetch("/api/admin/feature-visibility")
      .then((r) => r.json())
      .then(setFlags)
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    // Reuse the staff endpoint's member list for the allowlist typeahead.
    // Returns non-admin members with id/fullName/email.
    fetch("/api/admin/staff")
      .then((r) => r.json())
      .then((d) => setAllMembers(d.members ?? []))
      .catch(() => {
        /* non-fatal — allowlist UI will fall back to "Unknown user" labels */
      });
  }, []);

  async function toggleFlag(key: string, newValue: boolean) {
    if (!flags) return;
    setSaving(key);
    const prev = { ...flags };
    setFlags({ ...flags, [key]: newValue });
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
        setFlags(prev);
      }
    } catch {
      setFlags(prev);
    } finally {
      setSaving(null);
    }
  }

  async function saveV2Flag(key: string, next: V2FlagValue): Promise<boolean> {
    if (!flags) return false;
    setSaving(key);
    const prev = { ...flags };
    setFlags({ ...flags, [key]: next });
    try {
      const res = await fetch("/api/admin/feature-visibility", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: next }),
      });
      if (res.ok) {
        const updated = await res.json();
        setFlags(updated);
        return true;
      }
      setFlags(prev);
      return false;
    } catch {
      setFlags(prev);
      return false;
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <EyeIcon className="w-5 h-5 text-[#6ba3c7]" />
          <h2 className="text-base font-semibold text-[#2f3437]">Feature Visibility</h2>
        </div>
        <p className="text-sm text-[#2f3437]/50 mt-0.5">
          Control what members can see and access. Changes take effect immediately.
          You always see everything when viewing as a member.
        </p>
      </div>

      {loadError && <p className="text-sm text-red-500">Failed to load settings.</p>}

      {!flags && !loadError && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-[#111]/5 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {flags && (
        <div className="mb-6">
          <p className="text-[11px] font-bold text-[#2f3437]/50 uppercase tracking-widest mb-3">
            Standard flags
          </p>
        </div>
      )}

      {flags && FEATURE_DEFS.map((group) => {
        const isAiGroup = group.group === "AI Tools";
        const aiOn = flags.ai_tools !== false;
        const parentFlag = (group as { parentFlag?: string }).parentFlag;
        const parentOn = parentFlag ? flags[parentFlag] !== false : true;
        const groupDimmed = (isAiGroup && !aiOn) || (!!parentFlag && (!aiOn || !parentOn));
        const isSubGroup = !!parentFlag;

        return (
          <div key={group.group} className={`mb-5 last:mb-0 ${isSubGroup ? "ml-4 pl-4 border-l-2 border-[#2f3437]/10" : ""}`}>
            <p className="text-xs font-semibold text-[#2f3437]/40 uppercase tracking-wider mb-2">
              {group.group}
              {isAiGroup && !aiOn && (
                <span className="ml-2 font-normal text-amber-600 normal-case tracking-normal">
                  — hidden (AI Tools Hub is off)
                </span>
              )}
              {isSubGroup && !parentOn && aiOn && (
                <span className="ml-2 font-normal text-amber-600 normal-case tracking-normal">
                  — hidden (Repurpose Content is off)
                </span>
              )}
              {isSubGroup && !aiOn && (
                <span className="ml-2 font-normal text-amber-600 normal-case tracking-normal">
                  — hidden (AI Tools Hub is off)
                </span>
              )}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const isOn = flags[item.key] !== false;
                const isSaving = saving === item.key;
                const dimmed = groupDimmed;

                return (
                  <div
                    key={item.key}
                    className={`flex items-center justify-between gap-4 px-4 py-3 rounded-lg border transition-colors ${
                      dimmed
                        ? "bg-[#111]/3 border-[#2f3437]/5 opacity-50"
                        : isOn
                        ? "bg-white border-[#2f3437]/10"
                        : "bg-[#ff0033]/3 border-[#ff0033]/15"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOn && !dimmed ? "bg-[#6ba3c7]" : "bg-[#111]/20"}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#2f3437]">{item.label}</p>
                        <p className="text-xs text-[#2f3437]/45">{item.desc}</p>
                        {FLAG_DESCRIPTIONS[item.key] && (
                          <p className="text-[11px] text-[#2f3437]/40 mt-0.5 leading-relaxed">
                            {FLAG_DESCRIPTIONS[item.key]}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!isOn && !dimmed && (
                        <span className="text-[10px] font-semibold text-[#ff0033] uppercase tracking-wide flex items-center gap-0.5">
                          <EyeSlashIcon className="w-3 h-3" /> Hidden
                        </span>
                      )}
                      {isSaving ? (
                        <div className="w-9 flex justify-center">
                          <span className="w-4 h-4 border-2 border-[#6ba3c7] border-t-transparent rounded-full animate-spin" />
                        </div>
                      ) : (
                        <Toggle
                          enabled={isOn}
                          onChange={(v) => toggleFlag(item.key, v)}
                          disabled={dimmed || saving !== null}
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

      {flags && (
        <div className="mt-8 pt-6 border-t border-[#2f3437]/10">
          <div className="mb-4">
            <p className="text-[11px] font-bold text-[#2f3437]/50 uppercase tracking-widest mb-1">
              Per-user gated flags (v2)
            </p>
            <p className="text-xs text-[#2f3437]/50 leading-relaxed">
              v2 flags are off for everyone by default. Toggle <em>Enabled</em> to open
              globally, or add specific members to the allowlist for early access.
              Admins and editors see these regardless via staff bypass.
            </p>
          </div>
          <div className="space-y-3">
            {V2_FLAG_DEFS.map(({ key, label, desc }) => {
              const raw = flags[key];
              const value: V2FlagValue = isV2Flag(raw)
                ? raw
                : { enabled: false, allowedUserIds: [] };
              return (
                <V2FlagCard
                  key={key}
                  flagKey={key}
                  label={label}
                  desc={desc}
                  value={value}
                  allMembers={allMembers}
                  saving={saving === key}
                  onSave={(next) => saveV2Flag(key, next)}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Generic Prompt Editor ────────────────────────────────────────────────────

function PromptEditorSection({
  title,
  description,
  settingKey,
  rows = 20,
  icon,
}: {
  title: string;
  description: string;
  settingKey: string;
  rows?: number;
  icon?: React.ReactNode;
}) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/settings?key=${settingKey}`)
      .then((r) => r.json())
      .then((d) => { setPrompt(d.value ?? ""); setLoading(false); });
  }, [settingKey]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: settingKey, value: prompt }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function handleReset() {
    await fetch(`/api/settings?key=${settingKey}`, { method: "DELETE" });
    const res = await fetch(`/api/settings?key=${settingKey}`);
    const d = await res.json();
    setPrompt(d.value ?? "");
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-base font-semibold text-[#2f3437]">{title}</h2>
        </div>
        <button onClick={handleReset} className="text-xs text-[#2f3437]/50 hover:text-[#2f3437] underline">
          Reset to Default
        </button>
      </div>
      <p className="text-xs text-[#2f3437]/50 mb-3">{description}</p>
      {loading ? (
        <div className="h-64 bg-gray-50 rounded-lg animate-pulse" />
      ) : (
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={rows}
          className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-[#2f3437] font-mono focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/30 resize-y"
        />
      )}
      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="bg-[#6ba3c7] hover:bg-[#5490b5] disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
        >
          {saving ? "Saving…" : "Save Prompt"}
        </button>
        {saved && <span className="text-sm text-green-600 font-medium">✓ Saved</span>}
      </div>
    </div>
  );
}

// ─── AI Scoring Prompt ────────────────────────────────────────────────────────

function AIScoringPromptSection() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => { setPrompt(d.audit_prompt ?? ""); setLoading(false); });
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audit_prompt: prompt }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function handleReset() {
    await fetch("/api/settings?key=audit_prompt", { method: "DELETE" });
    const res = await fetch("/api/settings");
    const d = await res.json();
    setPrompt(d.audit_prompt ?? "");
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <SparklesIcon className="w-5 h-5 text-[#6ba3c7]" />
          <h2 className="text-base font-semibold text-[#2f3437]">AI Scoring Prompt</h2>
        </div>
        <button onClick={handleReset} className="text-xs text-[#2f3437]/50 hover:text-[#2f3437] underline">
          Reset to Default
        </button>
      </div>
      <p className="text-xs text-[#2f3437]/50 mb-3">
        System prompt sent to Claude when running audits. Changes take effect on the next audit run.
      </p>
      {loading ? (
        <div className="h-64 bg-gray-50 rounded-lg animate-pulse" />
      ) : (
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={24}
          className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-[#2f3437] font-mono focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/30 resize-y"
        />
      )}
      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="bg-[#6ba3c7] hover:bg-[#5490b5] disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
        >
          {saving ? "Saving…" : "Save Prompt"}
        </button>
        {saved && <span className="text-sm text-green-600 font-medium">✓ Saved</span>}
      </div>
    </div>
  );
}

// ─── Currency Rate ────────────────────────────────────────────────────────────

function CurrencyRateSection() {
  const [rate, setRate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings?key=usd_to_cad_rate")
      .then((r) => r.json())
      .then((d) => { setRate(d.value ?? "1.38"); setLoading(false); });
  }, []);

  async function handleSave() {
    const parsed = parseFloat(rate);
    if (isNaN(parsed) || parsed <= 0) return;
    setSaving(true);
    setSaved(false);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "usd_to_cad_rate", value: parsed.toString() }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-base font-semibold text-[#2f3437] mb-1">USD → CAD Exchange Rate</h2>
      <p className="text-xs text-[#2f3437]/50 mb-4">
        Used to convert USD subscription amounts to CAD across the Members page and MRR card. Update whenever the rate changes.
      </p>
      {loading ? (
        <div className="h-10 bg-gray-50 rounded-lg animate-pulse w-40" />
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden w-40">
            <span className="px-3 py-2.5 text-sm text-[#2f3437]/50 bg-gray-50 border-r border-gray-200 select-none">1 USD =</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="w-full px-3 py-2.5 text-sm text-[#2f3437] focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/30"
              placeholder="1.38"
            />
          </div>
          <span className="text-sm text-[#2f3437]/50">CAD</span>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="bg-[#6ba3c7] hover:bg-[#5490b5] disabled:opacity-50 text-white font-semibold px-4 py-2.5 rounded-lg text-sm transition-colors"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {saved && <span className="text-sm text-green-600 font-medium">✓ Saved</span>}
        </div>
      )}
    </div>
  );
}

// ─── Landing Page Settings ────────────────────────────────────────────────────

interface SiteConfigRow {
  id: number;
  key: string;
  value: string;
  label: string | null;
  fieldType: string;
  category: string;
  ghlCustomValueKey: string | null;
  sortOrder: number;
}

function LandingPageSettingsSection() {
  const [rows, setRows] = useState<SiteConfigRow[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "warn" | "error" } | null>(null);

  useEffect(() => {
    fetch("/api/admin/site-config")
      .then((r) => r.json())
      .then((d) => {
        const r: SiteConfigRow[] = d.settings ?? [];
        setRows(r);
        const v: Record<string, string> = {};
        for (const row of r) v[row.key] = row.value;
        setValues(v);
      })
      .catch(() => setToast({ msg: "Failed to load settings.", type: "error" }))
      .finally(() => setLoading(false));
  }, []);

  function showToast(msg: string, type: "success" | "warn" | "error") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 5000);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const settings = Object.entries(values).map(([key, value]) => ({ key, value }));
      const res = await fetch("/api/admin/site-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Save failed.", "error");
        return;
      }
      const { ghlSync } = data;
      if (ghlSync?.failed > 0) {
        showToast(
          `Settings saved. GHL sync: ${ghlSync.synced} ok, ${ghlSync.failed} failed (${ghlSync.errors?.join(", ")}).`,
          "warn"
        );
      } else {
        showToast("Settings saved. GHL custom values updated.", "success");
      }
      // Reload to show updated computed values
      const fresh = await fetch("/api/admin/site-config").then((r) => r.json());
      const r2: SiteConfigRow[] = fresh.settings ?? [];
      setRows(r2);
      const v2: Record<string, string> = {};
      for (const row of r2) v2[row.key] = row.value;
      setValues(v2);
    } catch {
      showToast("An unexpected error occurred.", "error");
    } finally {
      setSaving(false);
    }
  }

  const webinarRows = rows.filter((r) => r.category === "webinar").sort((a, b) => a.sortOrder - b.sortOrder);
  const computedRows = rows.filter((r) => r.category === "webinar_computed").sort((a, b) => a.sortOrder - b.sortOrder);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-12 bg-[#111]/5 dark:bg-white/5 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`rounded-xl px-5 py-3.5 text-sm font-medium flex items-start gap-3 ${
            toast.type === "success"
              ? "bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300"
              : toast.type === "warn"
              ? "bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
              : "bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-300"
          }`}
        >
          <span className="shrink-0 mt-0.5">
            {toast.type === "success" ? "✓" : toast.type === "warn" ? "⚠" : "✕"}
          </span>
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Webinar Configuration card */}
      <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-sm border border-[#111]/8 dark:border-white/8 overflow-hidden">
        <div className="px-6 py-5 border-b border-[#111]/8 dark:border-white/8 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#6ba3c7]/10 flex items-center justify-center shrink-0">
            <Cog6ToothIcon className="w-5 h-5 text-[#6ba3c7]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#2f3437] dark:text-white">Webinar Configuration</h3>
            <p className="text-xs text-[#2f3437]/50 dark:text-white/40 mt-0.5">
              These values feed the public landing page and GHL custom values.
            </p>
          </div>
        </div>
        <div className="divide-y divide-[#111]/5 dark:divide-white/5">
          {webinarRows.map((row) => (
            <div key={row.key} className="px-6 py-4">
              <label className="block text-xs font-semibold text-[#2f3437]/70 dark:text-white/50 mb-1.5 uppercase tracking-wide">
                {row.label ?? row.key}
                {row.ghlCustomValueKey && (
                  <span className="ml-2 normal-case tracking-normal font-normal text-[#6ba3c7]/70">
                    → GHL: {row.ghlCustomValueKey}
                  </span>
                )}
              </label>
              {row.fieldType === "toggle" ? (
                <button
                  onClick={() =>
                    setValues((v) => ({
                      ...v,
                      [row.key]: v[row.key] === "true" ? "false" : "true",
                    }))
                  }
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                    values[row.key] === "true" ? "bg-[#6ba3c7]" : "bg-[#111]/20 dark:bg-white/20"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      values[row.key] === "true" ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              ) : row.fieldType === "url" ? (
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    value={values[row.key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [row.key]: e.target.value }))}
                    className="flex-1 text-sm text-[#2f3437] dark:text-white bg-[#f7f6f3] dark:bg-white/5 border border-[#111]/10 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/30 font-mono"
                    placeholder="https://"
                  />
                  {values[row.key] && (
                    <a
                      href={values[row.key]}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#6ba3c7] hover:text-[#5490b5] shrink-0"
                      title="Open URL"
                    >
                      <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                    </a>
                  )}
                </div>
              ) : (
                <input
                  type="text"
                  value={values[row.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [row.key]: e.target.value }))}
                  className="w-full text-sm text-[#2f3437] dark:text-white bg-[#f7f6f3] dark:bg-white/5 border border-[#111]/10 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/30"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Computed values card (collapsible) */}
      {computedRows.length > 0 && (
        <ComputedValuesCard rows={computedRows} values={values} />
      )}

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-[#6ba3c7] hover:bg-[#5490b5] disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors"
        >
          <CloudArrowUpIcon className="w-4 h-4" />
          {saving ? "Saving…" : "Save & Sync to GHL"}
        </button>
      </div>
    </div>
  );
}

function ComputedValuesCard({
  rows,
  values,
}: {
  rows: SiteConfigRow[];
  values: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-sm border border-[#111]/8 dark:border-white/8 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-6 py-5 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center shrink-0">
            <SparklesIcon className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#2f3437] dark:text-white">Computed Values</h3>
            <p className="text-xs text-[#2f3437]/50 dark:text-white/40 mt-0.5">
              Auto-generated on save — read-only preview of what gets pushed to GHL.
            </p>
          </div>
        </div>
        <ChevronDownIcon
          className={`w-4 h-4 text-[#2f3437]/40 dark:text-white/30 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="border-t border-[#111]/8 dark:border-white/8 divide-y divide-[#111]/5 dark:divide-white/5">
          {rows.map((row) => (
            <div key={row.key} className="px-6 py-4">
              <label className="block text-xs font-semibold text-[#2f3437]/70 dark:text-white/50 mb-1.5 uppercase tracking-wide">
                {row.label ?? row.key}
                {row.ghlCustomValueKey && (
                  <span className="ml-2 normal-case tracking-normal font-normal text-[#6ba3c7]/70">
                    → GHL: {row.ghlCustomValueKey}
                  </span>
                )}
              </label>
              <div className="text-sm text-[#2f3437]/60 dark:text-white/40 bg-[#f7f6f3] dark:bg-white/5 border border-[#111]/8 dark:border-white/8 rounded-lg px-3 py-2 font-mono">
                {values[row.key] || <span className="italic">will be computed on next save</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab definitions ─────────────────────────────────────────────────────────

const ADMIN_SETTINGS_TABS = [
  { id: "general", label: "Platform Settings" },
  { id: "link-tracking", label: "My Link Tracking" },
  { id: "landing-page", label: "Landing Page" },
  { id: "announcements", label: "Announcements" },
] as const;
type AdminSettingsTab = (typeof ADMIN_SETTINGS_TABS)[number]["id"];

// ─── Page ─────────────────────────────────────────────────────────────────────

function SettingsPageInner() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pageRole = (session?.user as any)?.role;
  const tabParam = searchParams.get("tab");
  const activeTab: AdminSettingsTab =
    tabParam === "link-tracking"
      ? "link-tracking"
      : tabParam === "landing-page"
      ? "landing-page"
      : tabParam === "announcements"
      ? "announcements"
      : "general";

  function switchTab(id: AdminSettingsTab) {
    const url = new URL(window.location.href);
    if (id === "general") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", id);
    }
    router.push(url.pathname + url.search, { scroll: false });
  }

  useEffect(() => {
    if (session && pageRole === "editor") router.replace("/admin");
  }, [session, pageRole, router]);

  if (pageRole === "editor") return null;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#2f3437]">Settings</h1>
        <p className="text-[#2f3437]/60 mt-1 text-sm">Configure platform preferences, AI scoring, and your own lead tracking.</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-[#111]/5 dark:bg-white/5 rounded-lg p-1 w-fit overflow-x-auto scrollbar-hide">
        {ADMIN_SETTINGS_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => switchTab(t.id)}
            className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === t.id
                ? "bg-white dark:bg-[#1a1a1a] text-[#2f3437] dark:text-white shadow-sm"
                : "text-[#2f3437]/50 dark:text-white/40 hover:text-[#2f3437] dark:hover:text-white"
            }`}
          >
            {t.id === "link-tracking" && <LinkIcon className="w-4 h-4" />}
            {t.id === "landing-page" && <Cog6ToothIcon className="w-4 h-4" />}
            {t.id === "announcements" && <MegaphoneIcon className="w-4 h-4" />}
            {t.label}
          </button>
        ))}
      </div>

      {/* My Link Tracking tab */}
      {activeTab === "link-tracking" && <LinkTrackingPage />}

      {/* Landing Page tab */}
      {activeTab === "landing-page" && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#6ba3c7]/10 flex items-center justify-center">
              <Cog6ToothIcon className="w-5 h-5 text-[#6ba3c7]" />
            </div>
            <div>
              <p className="text-xs font-semibold text-[#6ba3c7] uppercase tracking-widest">Settings</p>
              <h2 className="text-lg font-bold text-[#2f3437] dark:text-white">Landing Page Settings</h2>
            </div>
          </div>
          <p className="text-sm text-[#2f3437]/60 dark:text-white/40 -mt-2">
            Manage dynamic content for the public landing pages. Changes sync to GHL custom values automatically.
          </p>
          <LandingPageSettingsSection />
        </div>
      )}

      {/* Announcements tab */}
      {activeTab === "announcements" && <AnnouncementsSection />}

      {/* Platform Settings tab */}
      {activeTab === "general" && <>
      <CurrencyRateSection />
      <StaffAccessSection />
      <FeatureVisibilitySection />
      <AIScoringPromptSection />
      <PromptEditorSection
        title="Content Engine — Buy-Side Framing Rules"
        description="Additional rules appended to the Content Engine system prompt. Controls how the AI frames titles across all themes. The default enforces buy-side title framing for sell-side stress themes. Reset to restore the default buy-side constraint."
        settingKey="content_engine_prompt"
        rows={22}
        icon={<SparklesIcon className="w-5 h-5 text-[#6ba3c7]" />}
      />
      <PromptEditorSection
        title="Repurpose Content — Newsletter Prompt"
        description={`System prompt used when generating email newsletters. Use these tokens for dynamic values: {{MEMBER_NAME}}, {{BUSINESS_NAME}}, {{LIST_SIZE_TEXT}}, {{VOICE_STYLE}}, {{AVATAR_TEXT}}.`}
        settingKey="repurpose_newsletter_prompt"
        rows={28}
        icon={<EnvelopeIcon className="w-5 h-5 text-[#6ba3c7]" />}
      />
      <PromptEditorSection
        title="Repurpose Content — LinkedIn Article Prompt"
        description={`System prompt used when generating LinkedIn articles. Use these tokens for dynamic values: {{MEMBER_NAME}}, {{BUSINESS_NAME}}, {{VOICE_STYLE}}, {{AVATAR_TEXT}}, {{LINKS_TEXT}}.`}
        settingKey="repurpose_linkedin_prompt"
        rows={36}
        icon={<PencilSquareIcon className="w-5 h-5 text-[#6ba3c7]" />}
      />
      <PromptEditorSection
        title="Avatar Architect — System Prompt"
        description="Full system prompt for the Avatar Architect coaching conversation. Controls the 4-phase flow, question bank, avatar document template, stress theme format, content engine prompt rules, and title frameworks. Reset to restore the built-in prompt."
        settingKey="avatar_architect_prompt"
        rows={50}
        icon={<SparklesIcon className="w-5 h-5 text-[#6ba3c7]" />}
      />
      <PromptEditorSection
        title="Theme Builder — System Prompt"
        description="System prompt for the Theme Builder coaching tool inside Avatar Architect. Controls the coaching flow for building a single content theme into a complete content engine prompt, including buy-side framing rules and title framework examples. Reset to restore the built-in prompt."
        settingKey="theme_builder_prompt"
        rows={40}
        icon={<SparklesIcon className="w-5 h-5 text-[#6ba3c7]" />}
      />
      </>}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#2f3437]">Settings</h1>
          <p className="text-[#2f3437]/60 mt-1 text-sm">Configure platform preferences, AI scoring, and your own lead tracking.</p>
        </div>
        <div className="h-12 bg-[#111]/5 dark:bg-white/5 rounded-lg animate-pulse w-72" />
      </div>
    }>
      <SettingsPageInner />
    </Suspense>
  );
}

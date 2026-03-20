"use client";

import { useState, useEffect, useRef } from "react";
import { EyeSlashIcon, UserGroupIcon, ChevronDownIcon, XMarkIcon, CheckIcon } from "@heroicons/react/24/outline";

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
        className="w-full flex items-center justify-between gap-2 px-3 py-2 border border-[#1e2a38]/15 rounded-lg text-sm bg-white hover:border-[#3dc3ff]/50 transition-colors"
      >
        <span className="text-[#1e2a38]/60 truncate">
          {selected.length === 0 ? "Add members…" : `${selected.length} member${selected.length !== 1 ? "s" : ""} selected`}
        </span>
        <ChevronDownIcon className={`w-3.5 h-3.5 text-[#1e2a38]/40 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-[#1e2a38]/15 rounded-xl shadow-lg z-20 overflow-hidden">
          <div className="p-2 border-b border-[#1e2a38]/8">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search members…"
              className="w-full px-3 py-1.5 text-sm border border-[#1e2a38]/15 rounded-lg focus:outline-none focus:border-[#3dc3ff]"
            />
          </div>
          <ul className="max-h-52 overflow-y-auto divide-y divide-[#1e2a38]/6">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-[#1e2a38]/40 text-center">No members found</li>
            ) : (
              filtered.map((m) => {
                const checked = selected.includes(m.id);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => toggle(m.id)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#3dc3ff]/5 transition-colors text-left"
                    >
                      <span className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${checked ? "bg-[#3dc3ff] border-[#3dc3ff]" : "border-[#1e2a38]/25"}`}>
                        {checked && <CheckIcon className="w-3 h-3 text-white" />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#1e2a38] truncate">{m.fullName || m.email}</p>
                        {m.youtubeChannelName && <p className="text-xs text-[#1e2a38]/40 truncate">{m.youtubeChannelName}</p>}
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
            <span key={m.id} className="inline-flex items-center gap-1 bg-[#3dc3ff]/10 text-[#1e2a38] text-xs font-medium px-2 py-1 rounded-full">
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
}: {
  staff: StaffMember;
  allMembers: MemberOption[];
  onSaved: (id: string, ids: string[] | null) => void;
}) {
  const rawIds = staff.allowedMemberIds;
  const initIds = Array.isArray(rawIds) ? (rawIds as string[]) : null;

  const [fullAccess, setFullAccess] = useState(initIds === null);
  const [selected, setSelected] = useState<string[]>(initIds ?? []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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

  const roleBadge = staff.role === "admin"
    ? "bg-purple-100 text-purple-700"
    : "bg-amber-100 text-amber-700";

  return (
    <div className="border border-[#1e2a38]/10 rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#1e2a38] truncate">{staff.fullName || staff.email}</p>
          <p className="text-xs text-[#1e2a38]/50 truncate">{staff.email}</p>
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full shrink-0 ${roleBadge}`}>
          {staff.role}
        </span>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFullAccess(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              fullAccess
                ? "bg-[#1e2a38] text-white border-[#1e2a38]"
                : "bg-white text-[#1e2a38]/60 border-[#1e2a38]/15 hover:border-[#1e2a38]/30"
            }`}
          >
            All members
          </button>
          <button
            type="button"
            onClick={() => setFullAccess(false)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              !fullAccess
                ? "bg-[#1e2a38] text-white border-[#1e2a38]"
                : "bg-white text-[#1e2a38]/60 border-[#1e2a38]/15 hover:border-[#1e2a38]/30"
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
          <p className="text-xs text-[#1e2a38]/40 italic">This account can see all members.</p>
        )}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-[#3dc3ff] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-[#3dc3ff]/90 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-xs text-green-600 font-medium">✓ Saved</span>}
      </div>
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

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <UserGroupIcon className="w-5 h-5 text-[#3dc3ff]" />
        <h2 className="text-base font-semibold text-[#1e2a38]">Staff & Editor Access</h2>
      </div>
      <p className="text-sm text-[#1e2a38]/50 mb-5">
        Control which members each admin or editor account can see. "All members" gives full access. "Custom access" restricts them to specific members only.
      </p>

      {loading && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 bg-[#1e2a38]/5 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {!loading && staff.length === 0 && (
        <p className="text-sm text-[#1e2a38]/40 italic">No other admin or editor accounts found.</p>
      )}

      {!loading && staff.length > 0 && (
        <div className="space-y-3">
          {staff.map((s) => (
            <StaffCard
              key={s.id}
              staff={s}
              allMembers={allMembers}
              onSaved={handleSaved}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Feature Visibility ───────────────────────────────────────────────────────

interface FeatureFlags {
  campaigns: boolean;
  ai_tools: boolean;
  resources: boolean;
  tool_avatar_architect: boolean;
  tool_content_engine: boolean;
  tool_arc_script_builder: boolean;
  tool_title_analyzer: boolean;
  tool_script_review: boolean;
  [key: string]: boolean;
}

const FEATURE_DEFS = [
  {
    group: "Navigation",
    items: [
      { key: "campaigns", label: "Campaigns & Link Tracking", desc: "Campaigns, conversions, and link tracker pages" },
      { key: "ai_tools", label: "AI Tools Hub", desc: "The entire AI tools section — also controls individual tools below" },
      { key: "resources", label: "Resources", desc: "Resource library page" },
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
      { key: "tool_repurpose_content", label: "Repurpose Content", desc: "Turn transcripts into newsletters and LinkedIn articles" },
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
      } ${enabled ? "bg-[#3dc3ff]" : "bg-[#1e2a38]/20"}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          enabled ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function FeatureVisibilitySection() {
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    fetch("/api/admin/feature-visibility")
      .then((r) => r.json())
      .then(setFlags)
      .catch(() => setLoadError(true));
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

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-[#1e2a38]">Feature Visibility</h2>
        <p className="text-sm text-[#1e2a38]/50 mt-0.5">
          Control what members can see and access. Changes take effect immediately.
          You always see everything when viewing as a member.
        </p>
      </div>

      {loadError && <p className="text-sm text-red-500">Failed to load settings.</p>}

      {!flags && !loadError && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-[#1e2a38]/5 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {flags && FEATURE_DEFS.map((group) => {
        const isAiGroup = group.group === "AI Tools";
        const aiOn = flags.ai_tools !== false;

        return (
          <div key={group.group} className="mb-5 last:mb-0">
            <p className="text-xs font-semibold text-[#1e2a38]/40 uppercase tracking-wider mb-2">
              {group.group}
              {isAiGroup && !aiOn && (
                <span className="ml-2 font-normal text-amber-600 normal-case tracking-normal">
                  — hidden (AI Tools Hub is off)
                </span>
              )}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const isOn = flags[item.key] !== false;
                const isSaving = saving === item.key;
                const dimmed = isAiGroup && !aiOn;

                return (
                  <div
                    key={item.key}
                    className={`flex items-center justify-between gap-4 px-4 py-3 rounded-xl border transition-colors ${
                      dimmed
                        ? "bg-[#1e2a38]/3 border-[#1e2a38]/5 opacity-50"
                        : isOn
                        ? "bg-white border-[#1e2a38]/10"
                        : "bg-[#ff0033]/3 border-[#ff0033]/15"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOn && !dimmed ? "bg-[#3dc3ff]" : "bg-[#1e2a38]/20"}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#1e2a38]">{item.label}</p>
                        <p className="text-xs text-[#1e2a38]/45">{item.desc}</p>
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
                          <span className="w-4 h-4 border-2 border-[#3dc3ff] border-t-transparent rounded-full animate-spin" />
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
    </div>
  );
}

// ─── Generic Prompt Editor ────────────────────────────────────────────────────

function PromptEditorSection({
  title,
  description,
  settingKey,
  rows = 20,
}: {
  title: string;
  description: string;
  settingKey: string;
  rows?: number;
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
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-semibold text-[#1e2a38]">{title}</h2>
        <button onClick={handleReset} className="text-xs text-[#1e2a38]/50 hover:text-[#1e2a38] underline">
          Reset to Default
        </button>
      </div>
      <p className="text-xs text-[#1e2a38]/50 mb-3">{description}</p>
      {loading ? (
        <div className="h-64 bg-gray-50 rounded-lg animate-pulse" />
      ) : (
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={rows}
          className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-[#1e2a38] font-mono focus:outline-none focus:ring-2 focus:ring-[#3dc3ff]/30 resize-y"
        />
      )}
      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="bg-[#3dc3ff] hover:bg-[#2bb3ef] disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
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
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-semibold text-[#1e2a38]">AI Scoring Prompt</h2>
        <button onClick={handleReset} className="text-xs text-[#1e2a38]/50 hover:text-[#1e2a38] underline">
          Reset to Default
        </button>
      </div>
      <p className="text-xs text-[#1e2a38]/50 mb-3">
        System prompt sent to Claude when running audits. Changes take effect on the next audit run.
      </p>
      {loading ? (
        <div className="h-64 bg-gray-50 rounded-lg animate-pulse" />
      ) : (
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={24}
          className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-[#1e2a38] font-mono focus:outline-none focus:ring-2 focus:ring-[#3dc3ff]/30 resize-y"
        />
      )}
      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="bg-[#3dc3ff] hover:bg-[#2bb3ef] disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
        >
          {saving ? "Saving…" : "Save Prompt"}
        </button>
        {saved && <span className="text-sm text-green-600 font-medium">✓ Saved</span>}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1e2a38]">Settings</h1>
        <p className="text-[#1e2a38]/60 mt-1 text-sm">Configure platform preferences and AI scoring.</p>
      </div>
      <StaffAccessSection />
      <FeatureVisibilitySection />
      <AIScoringPromptSection />
      <PromptEditorSection
        title="Repurpose Content — Newsletter Prompt"
        description={`System prompt used when generating email newsletters. Use these tokens for dynamic values: {{MEMBER_NAME}}, {{BUSINESS_NAME}}, {{LIST_SIZE_TEXT}}, {{VOICE_STYLE}}, {{AVATAR_TEXT}}.`}
        settingKey="repurpose_newsletter_prompt"
        rows={28}
      />
      <PromptEditorSection
        title="Repurpose Content — LinkedIn Article Prompt"
        description={`System prompt used when generating LinkedIn articles. Use these tokens for dynamic values: {{MEMBER_NAME}}, {{BUSINESS_NAME}}, {{VOICE_STYLE}}, {{AVATAR_TEXT}}, {{LINKS_TEXT}}.`}
        settingKey="repurpose_linkedin_prompt"
        rows={36}
      />
    </div>
  );
}

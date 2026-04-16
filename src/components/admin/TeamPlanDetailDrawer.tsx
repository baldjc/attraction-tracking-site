"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IMPERSONATE_LS_KEY } from "@/lib/impersonate-constants";
import type { TeamPipelinePlan } from "@/app/admin/team-pipeline/TeamPipelineClient";

interface StaffUser { id: string; name: string; email: string; role: string }
interface TeamNote {
  id: string;
  note: string;
  visibility: string;
  createdAt: string;
  author: { id: string; name: string };
}

interface Props {
  plan: TeamPipelinePlan;
  staff: StaffUser[];
  currentUserId: string;
  currentUserRole: string;
  onClose: () => void;
  onUpdated: (patch: Partial<TeamPipelinePlan> & { id: string }) => void;
  onRefreshNeeded: () => void;
}

const STATUS_OPTIONS = ["Idea", "Scripted", "Ready to Shoot", "Shooting", "Shot - In Post", "Filmed", "Published"];

export default function TeamPlanDetailDrawer({ plan, staff, currentUserId, currentUserRole, onClose, onUpdated, onRefreshNeeded }: Props) {
  const [notes, setNotes] = useState<TeamNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [newNoteVisibility, setNewNoteVisibility] = useState<"team" | "member_visible">("team");
  const [savingNote, setSavingNote] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [statusWorking, setStatusWorking] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/team-pipeline/note?planId=${plan.id}`)
      .then((r) => r.json())
      .then((d) => setNotes(d.notes ?? []))
      .catch(() => {});
  }, [plan.id]);

  async function handleAssign(userId: string | null) {
    setAssigning(true);
    try {
      const res = await fetch("/api/admin/team-pipeline/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id, assignedUserId: userId }),
      });
      const data = await res.json();
      if (res.ok) {
        onUpdated({ id: plan.id, assignedUserId: userId, assignedUser: data.assignedUser });
      }
    } finally {
      setAssigning(false);
    }
  }

  async function handleStatusChange(status: string) {
    setStatusWorking(true);
    try {
      const res = await fetch(`/api/admin/members/${plan.member.id}/content-plans/${plan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) onUpdated({ id: plan.id, status });
    } finally {
      setStatusWorking(false);
    }
  }

  async function addNote() {
    if (!newNote.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch("/api/admin/team-pipeline/note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id, note: newNote.trim(), visibility: newNoteVisibility }),
      });
      const data = await res.json();
      if (res.ok && data.note) {
        setNotes((prev) => [data.note, ...prev]);
        setNewNote("");
      }
    } finally {
      setSavingNote(false);
    }
  }

  async function toggleNoteVisibility(n: TeamNote) {
    const next = n.visibility === "member_visible" ? "team" : "member_visible";
    const res = await fetch("/api/admin/team-pipeline/note", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId: n.id, visibility: next }),
    });
    if (res.ok) setNotes((prev) => prev.map((x) => (x.id === n.id ? { ...x, visibility: next } : x)));
  }

  async function deleteNote(n: TeamNote) {
    const res = await fetch(`/api/admin/team-pipeline/note?noteId=${n.id}`, { method: "DELETE" });
    if (res.ok) setNotes((prev) => prev.filter((x) => x.id !== n.id));
  }

  async function openAsMember() {
    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: plan.member.id }),
      });
      if (!res.ok) {
        alert("Failed to switch view");
        return;
      }
      try {
        localStorage.setItem(IMPERSONATE_LS_KEY, JSON.stringify({ memberId: plan.member.id, memberName: plan.member.name }));
      } catch {}
      document.cookie = `impersonate_member=${plan.member.id}; path=/; max-age=${60 * 60 * 8}; SameSite=Lax`;
      window.location.href = "/member/content-planner";
    } catch {
      alert("Failed to switch view");
    }
  }

  const artifactRow = Object.entries(plan.artifactCounts).filter(([, n]) => n > 0);

  return (
    <div className="fixed inset-0 z-[90] flex">
      <div className="flex-1 bg-[#1e2a38]/40" onClick={onClose} />
      <aside className="w-full max-w-xl bg-white h-full overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-[#2f3437]/10 px-5 py-3 flex items-center justify-between z-10">
          <div className="min-w-0">
            <p className="text-[11px] text-[#2f3437]/50">{plan.member.name} · {plan.member.serviceTier}</p>
            <h2 className="text-base font-semibold text-[#2f3437] truncate">{plan.title}</h2>
          </div>
          <button onClick={onClose} className="text-[#2f3437]/50 hover:text-[#2f3437] w-8 h-8 flex items-center justify-center rounded-md hover:bg-[#f7f6f3]">✕</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Status + Assignee */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#2f3437]/50 mb-1">Status</label>
              <select
                value={plan.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                disabled={statusWorking}
                className="w-full border border-[#2f3437]/15 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#6ba3c7]"
              >
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#2f3437]/50 mb-1">Assignee</label>
              <select
                value={plan.assignedUserId ?? ""}
                onChange={(e) => handleAssign(e.target.value || null)}
                disabled={assigning}
                className="w-full border border-[#2f3437]/15 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#6ba3c7]"
              >
                <option value="">Unassigned</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
              </select>
            </div>
          </div>

          {/* Meta */}
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="bg-[#f7f6f3] rounded-md p-2">
              <p className="text-[10px] uppercase tracking-wider text-[#2f3437]/50">Shoot</p>
              <p className="text-[#2f3437] font-semibold mt-0.5">{plan.shootDate ? new Date(plan.shootDate).toLocaleDateString() : "—"}</p>
            </div>
            <div className="bg-[#f7f6f3] rounded-md p-2">
              <p className="text-[10px] uppercase tracking-wider text-[#2f3437]/50">Edit due</p>
              <p className="text-[#2f3437] font-semibold mt-0.5">{plan.editDueDate ? new Date(plan.editDueDate).toLocaleDateString() : "—"}</p>
            </div>
            <div className="bg-[#f7f6f3] rounded-md p-2">
              <p className="text-[10px] uppercase tracking-wider text-[#2f3437]/50">Publish</p>
              <p className="text-[#2f3437] font-semibold mt-0.5">{plan.publishDate ? new Date(plan.publishDate).toLocaleDateString() : "—"}</p>
            </div>
          </div>

          {/* Artifacts summary */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#2f3437]/50 mb-2">Artifacts</p>
            {artifactRow.length === 0 ? (
              <p className="text-xs text-[#2f3437]/40 italic">No tool outputs saved yet</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {artifactRow.map(([type, n]) => (
                  <span key={type} className="text-[11px] bg-[#6ba3c7]/10 text-[#6ba3c7] px-2 py-0.5 rounded-full font-semibold">
                    {type.replace(/_/g, " ")} · {n}
                  </span>
                ))}
                {plan.latestScriptReviewScore != null && (
                  <span className="text-[11px] bg-[#10B981]/15 text-[#10B981] px-2 py-0.5 rounded-full font-semibold">Score: {plan.latestScriptReviewScore}/14</span>
                )}
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleStatusChange("Ready to Shoot")}
              className="text-xs bg-[#6ba3c7]/10 hover:bg-[#6ba3c7]/20 text-[#6ba3c7] font-semibold px-3 py-1.5 rounded-md"
              disabled={statusWorking}
            >Mark Ready to Shoot</button>
            <button
              onClick={() => handleStatusChange("Shot - In Post")}
              className="text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 font-semibold px-3 py-1.5 rounded-md"
              disabled={statusWorking}
            >Send to editing queue</button>
            <button
              onClick={openAsMember}
              className="text-xs bg-[#1e2a38] hover:bg-[#2f3437] text-white font-semibold px-3 py-1.5 rounded-md"
            >Open as member →</button>
          </div>

          {/* External links */}
          <div className="flex flex-wrap gap-2 text-xs">
            {plan.driveFolderLink && <a href={plan.driveFolderLink} target="_blank" rel="noreferrer" className="text-[#6ba3c7] hover:underline">📁 Drive folder</a>}
            {plan.footageLink && <a href={plan.footageLink} target="_blank" rel="noreferrer" className="text-[#6ba3c7] hover:underline">🎥 Footage</a>}
            <Link href={`/admin/members/${plan.member.id}`} className="text-[#6ba3c7] hover:underline">👤 Member page</Link>
            <Link href={`/admin/audits?memberId=${plan.member.id}`} className="text-[#6ba3c7] hover:underline">📊 Audits</Link>
          </div>

          {/* Team notes */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#2f3437]/50 mb-2">Team notes</p>
            <div className="space-y-2 mb-3">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Add a note for the team…"
                rows={2}
                className="w-full border border-[#2f3437]/15 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#6ba3c7] resize-none"
              />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-[11px] text-[#2f3437]/70">
                  <input
                    type="checkbox"
                    checked={newNoteVisibility === "member_visible"}
                    onChange={(e) => setNewNoteVisibility(e.target.checked ? "member_visible" : "team")}
                  />
                  Member-visible
                </label>
                <button
                  onClick={addNote}
                  disabled={savingNote || !newNote.trim()}
                  className="text-xs bg-[#6ba3c7] hover:bg-[#5490b5] disabled:opacity-50 text-white font-semibold px-3 py-1.5 rounded-md"
                >{savingNote ? "Saving…" : "Add note"}</button>
              </div>
            </div>

            {notes.length === 0 ? (
              <p className="text-xs text-[#2f3437]/40 italic">No notes yet</p>
            ) : (
              <ul className="space-y-2">
                {notes.map((n) => (
                  <li key={n.id} className={`border rounded-md px-3 py-2 ${n.visibility === "member_visible" ? "border-[#6ba3c7]/30 bg-[#6ba3c7]/5" : "border-[#2f3437]/10 bg-white"}`}>
                    <p className="text-sm text-[#2f3437] whitespace-pre-wrap leading-relaxed">{n.note}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <p className="text-[10px] text-[#2f3437]/50">
                        {n.author.name} · {new Date(n.createdAt).toLocaleString()} · <span className={n.visibility === "member_visible" ? "text-[#6ba3c7] font-semibold" : ""}>{n.visibility === "member_visible" ? "Member-visible" : "Team-only"}</span>
                      </p>
                      <div className="flex gap-2">
                        <button onClick={() => toggleNoteVisibility(n)} className="text-[10px] text-[#6ba3c7] hover:underline">
                          {n.visibility === "member_visible" ? "Hide from member" : "Show to member"}
                        </button>
                        {(currentUserRole === "admin" || n.author.id === currentUserId) && (
                          <button onClick={() => deleteNote(n)} className="text-[10px] text-red-500 hover:underline">Delete</button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

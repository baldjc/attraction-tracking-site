"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import TeamPlanDetailDrawer from "@/components/admin/TeamPlanDetailDrawer";

export interface TeamPipelinePlan {
  id: string;
  title: string;
  status: string;
  theme: string | null;
  shootDate: string | null;
  publishDate: string | null;
  editDueDate: string | null;
  priority: string | null;
  driveFolderLink: string | null;
  footageLink: string | null;
  updatedAt: string;
  member: { id: string; name: string; email: string; serviceTier: string; avatarUrl: string | null };
  assignedUserId: string | null;
  assignedUser: { id: string; name: string; email: string } | null;
  artifactCounts: Record<string, number>;
  latestScriptReviewScore: number | null;
}

interface StaffUser { id: string; name: string; email: string; role: string }

const BOARD_STATUSES = ["Idea", "Scripted", "Ready to Shoot", "Shooting", "Shot - In Post", "Filmed", "Published"];

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function fmtDate(val: string | null): string {
  if (!val) return "—";
  return new Date(val).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

interface Props {
  currentUserId: string;
  currentUserRole: string;
}

export default function TeamPipelineClient({ currentUserId, currentUserRole }: Props) {
  const [plans, setPlans] = useState<TeamPipelinePlan[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [members, setMembers] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"board" | "table">("board");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [memberFilter, setMemberFilter] = useState<string[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>([]);
  const [shootBefore, setShootBefore] = useState("");
  const [activePlanId, setActivePlanId] = useState<string | null>(null);

  const buildQuery = useCallback(() => {
    const p = new URLSearchParams();
    if (search.trim()) p.set("search", search.trim());
    statusFilter.forEach((s) => p.append("status", s));
    memberFilter.forEach((m) => p.append("memberId", m));
    assigneeFilter.forEach((a) => p.append("assignedTo", a));
    if (shootBefore) p.set("shootDateBefore", shootBefore);
    p.set("pageSize", "200");
    return p.toString();
  }, [search, statusFilter, memberFilter, assigneeFilter, shootBefore]);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/team-pipeline?${buildQuery()}`);
      const data = await res.json();
      setPlans(data.plans ?? []);
      const uniqueMembers = new Map<string, string>();
      (data.plans ?? []).forEach((pl: TeamPipelinePlan) => uniqueMembers.set(pl.member.id, pl.member.name));
      setMembers([...uniqueMembers.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)));
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  useEffect(() => {
    fetch("/api/admin/team-pipeline/staff")
      .then((r) => r.json())
      .then((d) => setStaff(d.staff ?? []))
      .catch(() => {});
  }, []);

  const byStatus = useMemo(() => {
    const map: Record<string, TeamPipelinePlan[]> = {};
    BOARD_STATUSES.forEach((s) => (map[s] = []));
    plans.forEach((p) => {
      if (!map[p.status]) map[p.status] = [];
      map[p.status].push(p);
    });
    return map;
  }, [plans]);

  const activePlan = plans.find((p) => p.id === activePlanId) ?? null;

  function toggle<T extends string>(list: T[], value: T, setter: (v: T[]) => void) {
    setter(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  }

  function handlePlanUpdated(updated: Partial<TeamPipelinePlan> & { id: string }) {
    setPlans((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--abv-text)]">🎬 Team Pipeline</h1>
        <p className="text-sm text-[var(--abv-text)]/60 mt-1">Every video in flight across Production, Growth, and DWY members.</p>
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-[var(--abv-text)]/10 rounded-xl p-4 mb-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, theme, or member…"
            className="flex-1 min-w-[220px] border border-[var(--abv-text)]/15 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-[var(--abv-azure)]"
          />
          <input
            type="date"
            value={shootBefore}
            onChange={(e) => setShootBefore(e.target.value)}
            className="border border-[var(--abv-text)]/15 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-[var(--abv-azure)]"
            title="Shoot date before"
          />
          <div className="flex border border-[var(--abv-text)]/15 rounded-md overflow-hidden text-sm">
            <button
              onClick={() => setView("board")}
              className={`px-3 py-1.5 ${view === "board" ? "bg-[var(--abv-dark)] text-white" : "bg-white text-[var(--abv-text)]/70 hover:bg-[var(--abv-bg)]"}`}
            >Board</button>
            <button
              onClick={() => setView("table")}
              className={`px-3 py-1.5 border-l border-[var(--abv-text)]/15 ${view === "table" ? "bg-[var(--abv-dark)] text-white" : "bg-white text-[var(--abv-text)]/70 hover:bg-[var(--abv-bg)]"}`}
            >Table</button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--abv-text)]/50 self-center mr-1">Status:</span>
          {BOARD_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => toggle(statusFilter, s, setStatusFilter)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${statusFilter.includes(s) ? "bg-[var(--abv-dark)] text-white border-[var(--abv-azure)]" : "bg-white text-[var(--abv-text)]/70 border-[var(--abv-text)]/15 hover:border-[var(--abv-azure)]"}`}
            >{s}</button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--abv-text)]/50 self-center mr-1">Member:</span>
          {members.slice(0, 20).map((m) => (
            <button
              key={m.id}
              onClick={() => toggle(memberFilter, m.id, setMemberFilter)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${memberFilter.includes(m.id) ? "bg-[var(--abv-dark)] text-white border-[var(--abv-dark)]" : "bg-white text-[var(--abv-text)]/70 border-[var(--abv-text)]/15 hover:border-[var(--abv-dark)]"}`}
            >{m.name}</button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--abv-text)]/50 self-center mr-1">Assignee:</span>
          <button
            onClick={() => toggle(assigneeFilter, "__unassigned__", setAssigneeFilter)}
            className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${assigneeFilter.includes("__unassigned__") ? "bg-amber-500 text-white border-amber-500" : "bg-white text-[var(--abv-text)]/70 border-[var(--abv-text)]/15 hover:border-amber-500"}`}
          >Unassigned</button>
          {staff.map((s) => (
            <button
              key={s.id}
              onClick={() => toggle(assigneeFilter, s.id, setAssigneeFilter)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${assigneeFilter.includes(s.id) ? "bg-[var(--abv-academy)] text-white border-[var(--abv-academy)]" : "bg-white text-[var(--abv-text)]/70 border-[var(--abv-text)]/15 hover:border-[var(--abv-academy)]"}`}
            >{s.name}</button>
          ))}
        </div>

        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-[var(--abv-text)]/50">{loading ? "Loading…" : `${plans.length} plan${plans.length === 1 ? "" : "s"}`}</p>
          {(search || statusFilter.length || memberFilter.length || assigneeFilter.length || shootBefore) ? (
            <button
              onClick={() => { setSearch(""); setStatusFilter([]); setMemberFilter([]); setAssigneeFilter([]); setShootBefore(""); }}
              className="text-xs text-[var(--abv-azure)] hover:underline"
            >Clear filters</button>
          ) : null}
        </div>
      </div>

      {/* Board / Table */}
      {view === "board" ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {BOARD_STATUSES.map((status) => {
            const col = byStatus[status] || [];
            if (col.length === 0 && statusFilter.length > 0 && !statusFilter.includes(status)) return null;
            return (
              <div key={status} className="shrink-0 w-[280px] bg-[var(--abv-bg)] rounded-lg p-2">
                <div className="flex items-center justify-between px-1 pb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--abv-text)]/70">{status}</span>
                  <span className="text-[10px] text-[var(--abv-text)]/50">{col.length}</span>
                </div>
                <div className="space-y-2">
                  {col.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setActivePlanId(p.id)}
                      className="w-full text-left bg-white border border-[var(--abv-text)]/10 hover:border-[var(--abv-azure)] rounded-lg p-3 transition-colors"
                    >
                      <p className="text-[11px] text-[var(--abv-text)]/55 mb-0.5">{p.member.name}</p>
                      <p className="text-sm font-semibold text-[var(--abv-text)] leading-snug mb-2 line-clamp-2">{p.title}</p>
                      <div className="flex items-center justify-between text-[11px] text-[var(--abv-text)]/60">
                        <span>📅 {fmtDate(p.shootDate)}</span>
                        {p.assignedUser ? (
                          <span className="w-6 h-6 rounded-full bg-[var(--abv-academy)]/15 text-[var(--abv-academy)] flex items-center justify-center font-bold text-[10px]">{initials(p.assignedUser.name)}</span>
                        ) : (
                          <span className="text-amber-600 font-medium">Unassigned</span>
                        )}
                      </div>
                      {p.latestScriptReviewScore != null && (
                        <div className="mt-2 text-[10px] text-[var(--abv-azure)] font-semibold">Score: {p.latestScriptReviewScore}/14</div>
                      )}
                    </button>
                  ))}
                  {col.length === 0 && <p className="text-[11px] text-[var(--abv-text)]/35 px-1 py-2 italic">No plans</p>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-[var(--abv-text)]/10 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--abv-bg)] text-xs uppercase tracking-wider text-[var(--abv-text)]/60">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">Member</th>
                <th className="px-4 py-2.5 text-left font-semibold">Title</th>
                <th className="px-4 py-2.5 text-left font-semibold">Status</th>
                <th className="px-4 py-2.5 text-left font-semibold">Assignee</th>
                <th className="px-4 py-2.5 text-left font-semibold">Shoot</th>
                <th className="px-4 py-2.5 text-left font-semibold">Score</th>
                <th className="px-4 py-2.5 text-left font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id} className="border-t border-[var(--abv-text)]/5 hover:bg-[var(--abv-bg)]/50 cursor-pointer" onClick={() => setActivePlanId(p.id)}>
                  <td className="px-4 py-2.5 text-[var(--abv-text)]/80">{p.member.name}</td>
                  <td className="px-4 py-2.5 font-medium text-[var(--abv-text)] max-w-xs truncate">{p.title}</td>
                  <td className="px-4 py-2.5"><span className="inline-block text-[11px] px-2 py-0.5 rounded-full bg-[var(--abv-dark)]/10 text-[var(--abv-azure)] font-semibold">{p.status}</span></td>
                  <td className="px-4 py-2.5 text-[var(--abv-text)]/70">{p.assignedUser?.name ?? <span className="text-amber-600">Unassigned</span>}</td>
                  <td className="px-4 py-2.5 text-[var(--abv-text)]/70">{fmtDate(p.shootDate)}</td>
                  <td className="px-4 py-2.5 text-[var(--abv-text)]/70">{p.latestScriptReviewScore != null ? `${p.latestScriptReviewScore}/14` : "—"}</td>
                  <td className="px-4 py-2.5 text-right text-[var(--abv-azure)]">→</td>
                </tr>
              ))}
              {plans.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-[var(--abv-text)]/50 text-sm italic">No plans match your filters</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-[var(--abv-text)]/40 mt-4">
        <Link href="/admin" className="hover:text-[var(--abv-azure)]">← Admin Dashboard</Link>
      </p>

      {activePlan && (
        <TeamPlanDetailDrawer
          plan={activePlan}
          staff={staff}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          onClose={() => setActivePlanId(null)}
          onUpdated={handlePlanUpdated}
          onRefreshNeeded={loadPlans}
        />
      )}
    </div>
  );
}

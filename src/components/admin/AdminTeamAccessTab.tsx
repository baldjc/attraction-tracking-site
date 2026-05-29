"use client";

import { useCallback, useEffect, useState } from "react";

interface MemberRow {
  id: string;
  email: string;
  name: string | null;
  acceptedAt: string;
}
interface InviteRow {
  id: string;
  email: string;
  sentAt: string;
  expiresAt: string;
}
interface ActivityRow {
  id: string;
  actorType: "primary" | "team" | "admin";
  actorName: string | null;
  action: string;
  createdAt: string;
}
interface TeamData {
  members: MemberRow[];
  invites: InviteRow[];
  activity: ActivityRow[];
}

const ACTOR_LABEL: Record<string, string> = {
  primary: "Owner",
  team: "Team member",
  admin: "Admin",
};

function fmt(ts: string): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminTeamAccessTab({ memberId }: { memberId: string }) {
  const [data, setData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/team?userId=${encodeURIComponent(memberId)}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [memberId]);

  useEffect(() => {
    load();
  }, [load]);

  async function revoke(id: string, label: string) {
    if (!confirm(`Revoke team access for ${label}? They'll lose access immediately. This is logged as an admin action.`))
      return;
    setBusyId(id);
    await fetch("/api/admin/team/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: id }),
    });
    setBusyId(null);
    load();
  }

  if (loading) {
    return <p className="text-sm text-[var(--abv-text)]/40 dark:text-[#718096] animate-pulse">Loading team access…</p>;
  }

  const card =
    "bg-white dark:bg-[#1a1a1a] border border-[var(--abv-text)]/10 dark:border-[#2a2a2a] rounded-lg overflow-hidden";
  const head = "px-5 py-4 border-b border-[var(--abv-text)]/10 dark:border-[#2a2a2a]";

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--abv-text)]/50 dark:text-[#718096]">
        Support view of this member's delegated account access. Admins can revoke access but cannot send invites.
      </p>

      {/* Active members */}
      <div className={card}>
        <div className={head}>
          <h3 className="font-semibold text-[var(--abv-text)] dark:text-[#e2e8f0]">Active team members</h3>
        </div>
        <div className="p-5">
          {data && data.members.length > 0 ? (
            <ul className="divide-y divide-[var(--abv-text)]/10 dark:divide-[#2a2a2a]">
              {data.members.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--abv-text)] dark:text-[#e2e8f0] truncate">
                      {m.name || m.email}
                    </p>
                    <p className="text-xs text-[var(--abv-text)]/50 dark:text-[#718096] truncate">
                      {m.email} · since {new Date(m.acceptedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => revoke(m.id, m.name || m.email)}
                    disabled={busyId === m.id}
                    className="text-xs font-semibold text-red-600 border border-red-200 dark:border-red-900/40 px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors whitespace-nowrap disabled:opacity-50"
                  >
                    {busyId === m.id ? "Revoking…" : "Revoke"}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--abv-text)]/40 dark:text-[#718096]">No active team members.</p>
          )}
        </div>
      </div>

      {/* Pending invites */}
      <div className={card}>
        <div className={head}>
          <h3 className="font-semibold text-[var(--abv-text)] dark:text-[#e2e8f0]">Pending invites</h3>
        </div>
        <div className="p-5">
          {data && data.invites.length > 0 ? (
            <ul className="divide-y divide-[var(--abv-text)]/10 dark:divide-[#2a2a2a]">
              {data.invites.map((inv) => (
                <li key={inv.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="text-sm font-medium text-[var(--abv-text)] dark:text-[#e2e8f0] truncate">{inv.email}</p>
                  <p className="text-xs text-[var(--abv-text)]/50 dark:text-[#718096]">
                    Sent {new Date(inv.sentAt).toLocaleDateString()} · expires {new Date(inv.expiresAt).toLocaleDateString()}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--abv-text)]/40 dark:text-[#718096]">No pending invites.</p>
          )}
        </div>
      </div>

      {/* Activity log */}
      <div className={card}>
        <div className={head}>
          <h3 className="font-semibold text-[var(--abv-text)] dark:text-[#e2e8f0]">Recent activity</h3>
        </div>
        <div className="p-5">
          {data && data.activity.length > 0 ? (
            <ul className="space-y-2.5">
              {data.activity.map((a) => (
                <li key={a.id} className="flex items-start gap-2 text-sm">
                  <span className="text-[var(--abv-text)]/40 dark:text-[#718096] tabular-nums whitespace-nowrap text-xs mt-0.5">
                    {fmt(a.createdAt)}
                  </span>
                  <span className="text-[var(--abv-text)]/80 dark:text-[#a0aec0]">
                    <span className="font-medium text-[var(--abv-text)] dark:text-[#e2e8f0]">
                      {a.actorName || ACTOR_LABEL[a.actorType] || a.actorType}
                    </span>{" "}
                    · {a.action}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--abv-text)]/40 dark:text-[#718096]">No activity recorded.</p>
          )}
        </div>
      </div>
    </div>
  );
}

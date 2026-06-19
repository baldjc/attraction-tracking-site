"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/Button";
import Notice from "@/components/ui/Notice";
import { CheckIcon, TrashIcon } from "@heroicons/react/24/outline";

interface TeamMemberRow {
  id: string;
  email: string;
  name: string | null;
  status: string;
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
  members: TeamMemberRow[];
  invites: InviteRow[];
  activity: ActivityRow[];
}

function fmt(ts: string): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const ACTOR_LABEL: Record<string, string> = {
  primary: "You",
  team: "Team member",
  admin: "Admin",
};

export default function TeamAccessSettings() {
  const [data, setData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSent, setInviteSent] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/member/team");
    if (res.status === 403) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function sendInvite() {
    setInviteError(null);
    setInviteSent(false);
    if (!email.trim()) return;
    setInviting(true);
    const res = await fetch("/api/member/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
    setInviting(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setInviteError(j.error || "Could not send the invite.");
      return;
    }
    setEmail("");
    setInviteSent(true);
    setTimeout(() => setInviteSent(false), 3000);
    load();
  }

  async function cancelInvite(id: string) {
    setBusyId(id);
    await fetch(`/api/member/team/invites/${id}`, { method: "DELETE" });
    setBusyId(null);
    load();
  }

  async function revokeMember(id: string, label: string) {
    if (!confirm(`Revoke team access for ${label}? They'll lose access immediately.`)) return;
    setBusyId(id);
    await fetch("/api/member/team/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: id }),
    });
    setBusyId(null);
    load();
  }

  if (loading) {
    return <p className="text-sm text-[var(--abv-text)]/40 dark:text-[#718096] animate-pulse">Loading…</p>;
  }

  if (forbidden) {
    return (
      <Notice variant="info">
        Team management is only available on your own account. Switch back to your account to manage your team.
      </Notice>
    );
  }

  const cardClass =
    "bg-white dark:bg-[#1a1a1a] border border-[var(--abv-text)]/10 dark:border-[#2a2a2a] rounded-lg overflow-hidden";
  const headClass = "px-6 py-5 border-b border-[var(--abv-text)]/10 dark:border-[#2a2a2a]";

  return (
    <div className="space-y-6">
      {/* Invite */}
      <div className={cardClass}>
        <div className={headClass}>
          <h2 className="font-semibold text-[var(--abv-text)] dark:text-[#e2e8f0]">Invite a team member</h2>
          <p className="text-sm text-[var(--abv-text)]/50 dark:text-[#718096] mt-0.5">
            Give someone delegated access to your account. They sign in with their own email and can switch into your account.
          </p>
        </div>
        <div className="p-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendInvite()}
              placeholder="teammate@example.com"
              className="flex-1 border border-[var(--abv-text)]/20 dark:border-[#2a2a2a] rounded-lg px-4 py-3 text-sm text-[var(--abv-text)] dark:text-[#e2e8f0] placeholder-[var(--abv-text)]/30 dark:bg-[#1a1a1a] focus:outline-none focus:border-[var(--abv-azure)]"
            />
            <Button onClick={sendInvite} disabled={inviting || !email.trim()}>
              {inviting ? "Sending…" : "Send invite"}
            </Button>
          </div>
          {inviteError && <p className="text-sm text-red-600 mt-2">{inviteError}</p>}
          {inviteSent && (
            <p className="flex items-center gap-1.5 text-sm text-green-600 mt-2">
              <CheckIcon className="w-4 h-4" /> Invite sent
            </p>
          )}
        </div>
      </div>

      {/* Active members */}
      <div className={cardClass}>
        <div className={headClass}>
          <h2 className="font-semibold text-[var(--abv-text)] dark:text-[#e2e8f0]">Team members</h2>
          <p className="text-sm text-[var(--abv-text)]/50 dark:text-[#718096] mt-0.5">
            People who currently have access to your account.
          </p>
        </div>
        <div className="p-6">
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
                    onClick={() => revokeMember(m.id, m.name || m.email)}
                    disabled={busyId === m.id}
                    className="text-xs font-semibold text-red-600 border border-red-200 dark:border-red-900/40 px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors whitespace-nowrap disabled:opacity-50"
                  >
                    {busyId === m.id ? "Revoking…" : "Revoke"}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--abv-text)]/40 dark:text-[#718096]">No team members yet.</p>
          )}
        </div>
      </div>

      {/* Pending invites */}
      {data && data.invites.length > 0 && (
        <div className={cardClass}>
          <div className={headClass}>
            <h2 className="font-semibold text-[var(--abv-text)] dark:text-[#e2e8f0]">Pending invites</h2>
          </div>
          <div className="p-6">
            <ul className="divide-y divide-[var(--abv-text)]/10 dark:divide-[#2a2a2a]">
              {data.invites.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--abv-text)] dark:text-[#e2e8f0] truncate">{inv.email}</p>
                    <p className="text-xs text-[var(--abv-text)]/50 dark:text-[#718096]">
                      Sent {new Date(inv.sentAt).toLocaleDateString()} · expires {new Date(inv.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => cancelInvite(inv.id)}
                    disabled={busyId === inv.id}
                    className="flex items-center gap-1 text-xs font-semibold text-[var(--abv-text)]/60 dark:text-[#a0aec0] border border-[var(--abv-text)]/20 dark:border-[#2a2a2a] px-3 py-1.5 rounded-lg hover:bg-[var(--abv-text)]/5 transition-colors whitespace-nowrap disabled:opacity-50"
                  >
                    <TrashIcon className="w-3.5 h-3.5" /> {busyId === inv.id ? "Cancelling…" : "Cancel"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Activity log */}
      <div className={cardClass}>
        <div className={headClass}>
          <h2 className="font-semibold text-[var(--abv-text)] dark:text-[#e2e8f0]">Activity</h2>
          <p className="text-sm text-[var(--abv-text)]/50 dark:text-[#718096] mt-0.5">
            A record of every team-access change on your account.
          </p>
        </div>
        <div className="p-6">
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
            <p className="text-sm text-[var(--abv-text)]/40 dark:text-[#718096]">No activity yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

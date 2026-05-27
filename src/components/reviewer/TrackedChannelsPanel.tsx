"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface TrackedChannel {
  id: string;
  channelRef: string;
  channelName: string;
  channelHandle: string | null;
  channelThumbnail: string | null;
  enabled: boolean;
  createdAt: string;
  user: { id: string; fullName: string | null; email: string } | null;
}

interface EligibleMember {
  id: string;
  label: string;
  youtubeHandle: string | null;
  youtubeChannelUrl: string | null;
  youtubeChannelName: string | null;
}

export default function TrackedChannelsPanel() {
  const router = useRouter();
  const [channels, setChannels] = useState<TrackedChannel[]>([]);
  const [members, setMembers] = useState<EligibleMember[]>([]);
  const [memberId, setMemberId] = useState<string>("");
  const [manualInput, setManualInput] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [chRes, mRes] = await Promise.all([
        fetch("/api/admin/reviewer/tracked-channels"),
        fetch("/api/admin/reviewer/eligible-members"),
      ]);
      const chJson = await chRes.json();
      const mJson = await mRes.json();
      setChannels(chJson.channels ?? []);
      setMembers(mJson.members ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function add() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/reviewer/tracked-channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: memberId || null,
          channelInput: manualInput || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Failed to add");
        return;
      }
      setMemberId("");
      setManualInput("");
      await load();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this channel from tracking?")) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/reviewer/tracked-channels/${id}`, {
        method: "DELETE",
      });
      await load();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="mb-6 rounded-lg p-6"
      style={{
        backgroundColor: "var(--atbv-surface)",
        borderRadius: "var(--atbv-radius-lg)",
        boxShadow: "var(--atbv-shadow-sm)",
      }}
    >
      <h2 className="text-lg font-semibold text-[var(--abv-text)] dark:text-white">
        Tracked channels
      </h2>
      <p className="mt-1 text-sm text-[var(--abv-text-secondary)]">
        Pick a member with a saved YouTube handle, paste a channel URL/ID
        manually, or both. The next sync will pull this channel&apos;s data.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
        <select
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
          disabled={busy}
          className="rounded-md border border-[#e6e6e3] bg-white px-3 py-2 text-sm text-[var(--abv-text)]"
        >
          <option value="">— Pick a member with a saved channel —</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
          placeholder="Or paste @handle, channel URL, or UC… ID"
          disabled={busy}
          className="rounded-md border border-[#e6e6e3] bg-white px-3 py-2 text-sm text-[var(--abv-text)]"
        />
        <button
          type="button"
          onClick={add}
          disabled={busy || (!memberId && !manualInput)}
          className="rounded-md bg-[var(--abv-dark)] px-4 py-2 text-sm font-medium text-white hover:bg-black/85 disabled:opacity-50"
        >
          {busy ? "Adding…" : "Add channel"}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-[var(--abv-text-secondary)]">Loading…</p>
        ) : channels.length === 0 ? (
          <p className="text-sm text-[var(--abv-text-secondary)]">
            No channels tracked yet. Add one above.
          </p>
        ) : (
          <ul className="divide-y divide-[#e6e6e3]">
            {channels.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 py-3"
              >
                {c.channelThumbnail ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={c.channelThumbnail}
                    alt=""
                    className="h-10 w-10 rounded-full"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-[#e6e6e3]" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[var(--abv-text)] truncate">
                    {c.channelName}
                  </div>
                  <div className="text-xs text-[var(--abv-text-secondary)] truncate">
                    {c.channelHandle ?? c.channelRef}
                    {c.user
                      ? ` · ${c.user.fullName ?? c.user.email}`
                      : " · standalone"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  disabled={busy}
                  className="text-xs text-[var(--abv-text-secondary)] hover:text-red-600"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

"use client";
import { useState, useEffect, use } from "react";
import Link from "next/link";

interface Competitor {
  id: string;
  notes: string | null;
  addedAt: string;
  channel: {
    id: string;
    ytChannelId: string;
    handle: string | null;
    title: string;
    subscribers: number | null;
    videoCount: number | null;
    thumbnailUrl: string | null;
    lastSyncedAt: string | null;
  };
}

export default function CompetitorsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [channelHandle, setChannelHandle] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/intelligence/clients/${clientId}/competitors`);
    if (res.ok) setCompetitors(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, [clientId]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!channelHandle.trim()) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/intelligence/clients/${clientId}/competitors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelHandle: channelHandle.trim(), notes: notes.trim() || null }),
    });
    if (res.ok) {
      setChannelHandle("");
      setNotes("");
      setAdding(false);
      await load();
    } else {
      const d = await res.json();
      setError(d.error ?? "Failed to add competitor");
    }
    setSubmitting(false);
  }

  async function handleRemove(id: string) {
    if (!confirm("Remove this competitor?")) return;
    await fetch(`/api/intelligence/clients/${clientId}/competitors?id=${id}`, { method: "DELETE" });
    await load();
  }

  async function handleSync(handle: string) {
    setSyncing(handle);
    setSyncMsg(null);
    const res = await fetch("/api/intelligence/channels/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelHandle: handle }),
    });
    const d = await res.json();
    if (res.ok) {
      setSyncMsg(`Synced ${d.videoCount} videos · ${d.outlierCount} outliers`);
      await load();
    } else {
      setSyncMsg(d.error ?? "Sync failed");
    }
    setSyncing(null);
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href={`/admin/intelligence/clients/${clientId}`} className="text-sm text-[var(--abv-text)]/50 hover:text-[var(--abv-text)]">← Client Overview</Link>
          <h1 className="text-xl font-bold text-[var(--abv-text)] mt-1">Competitor Channels</h1>
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="px-4 py-2 bg-[var(--abv-dark)] text-white text-sm font-semibold rounded-lg hover:bg-black/85 transition-colors"
        >
          + Add Channel
        </button>
      </div>

      {adding && (
        <form onSubmit={handleAdd} className="bg-white border border-[var(--abv-azure)]/30 rounded-xl p-5 mb-5 space-y-4">
          <p className="text-sm font-semibold text-[var(--abv-text)]">Add Competitor Channel</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              value={channelHandle}
              onChange={(e) => setChannelHandle(e.target.value)}
              placeholder="@handle or youtube.com/..."
              required
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-[var(--abv-text)] focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/40"
            />
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-[var(--abv-text)] focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/40"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-[var(--abv-dark)] text-white text-sm font-semibold rounded-lg disabled:opacity-50">
              {submitting ? "Adding…" : "Add & Sync"}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="px-4 py-2 text-sm text-[var(--abv-text)]/50 hover:text-[var(--abv-text)]">Cancel</button>
          </div>
          <p className="text-xs text-[var(--abv-text)]/40">Adding a channel will sync its videos immediately. Requires YOUTUBE_API_KEY.</p>
        </form>
      )}

      {syncMsg && (
        <div className="mb-4 bg-[var(--abv-dark)]/10 border border-[var(--abv-azure)]/30 rounded-lg px-4 py-3 text-sm text-[var(--abv-text)]">{syncMsg}</div>
      )}

      {loading ? (
        <div className="h-32 bg-white border border-[var(--abv-text)]/10 rounded-xl animate-pulse" />
      ) : competitors.length === 0 ? (
        <div className="bg-white border border-[var(--abv-text)]/10 rounded-xl p-10 text-center">
          <p className="text-3xl mb-3">📡</p>
          <p className="font-semibold text-[var(--abv-text)]">No competitors yet</p>
          <p className="text-sm text-[var(--abv-text)]/50 mt-1">Add YouTube channels to track their outlier videos and patterns.</p>
        </div>
      ) : (
        <div className="bg-white border border-[var(--abv-text)]/10 rounded-xl divide-y divide-[var(--abv-text)]/6">
          {competitors.map((c) => (
            <div key={c.id} className="p-4 flex items-center gap-4">
              {c.channel.thumbnailUrl && (
                <img src={c.channel.thumbnailUrl} alt={c.channel.title} className="w-12 h-12 rounded-full shrink-0 object-cover" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[var(--abv-text)] text-sm">{c.channel.title}</p>
                <p className="text-xs text-[var(--abv-text)]/50">
                  {c.channel.handle && <span className="mr-2">{c.channel.handle}</span>}
                  {c.channel.subscribers != null && <span>{c.channel.subscribers.toLocaleString()} subs</span>}
                  {c.channel.videoCount != null && <span className="ml-2">{c.channel.videoCount} videos</span>}
                  {c.channel.lastSyncedAt && (
                    <span className="ml-2">Synced {new Date(c.channel.lastSyncedAt).toLocaleDateString("en-CA")}</span>
                  )}
                </p>
                {c.notes && <p className="text-xs text-[var(--abv-text)]/40 mt-0.5">{c.notes}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleSync(c.channel.handle ?? c.channel.ytChannelId)}
                  disabled={syncing === (c.channel.handle ?? c.channel.ytChannelId)}
                  className="px-3 py-1.5 text-xs font-semibold bg-[var(--abv-bg)] text-[var(--abv-text)]/60 hover:text-[var(--abv-text)] rounded-lg disabled:opacity-50 border border-[var(--abv-text)]/10"
                >
                  {syncing === (c.channel.handle ?? c.channel.ytChannelId) ? "Syncing…" : "Re-sync"}
                </button>
                <a
                  href={`https://youtube.com/channel/${c.channel.ytChannelId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 text-xs font-semibold bg-[var(--abv-bg)] text-[var(--abv-text)]/60 hover:text-[var(--abv-text)] rounded-lg border border-[var(--abv-text)]/10"
                >
                  YT ↗
                </a>
                <button
                  onClick={() => handleRemove(c.id)}
                  className="px-3 py-1.5 text-xs font-semibold text-red-400 hover:text-red-600 rounded-lg border border-red-200/50 hover:bg-red-50"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

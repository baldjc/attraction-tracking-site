"use client";

import { useState } from "react";

export default function OverviewSyncAllButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handle() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/reviewer/sync-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(`Sync failed: ${data.error ?? res.status}`);
        return;
      }
      setMsg(`Synced ${data.polled ?? 0} channel(s).`);
    } catch (err) {
      setMsg(`Sync failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(null), 5000);
    }
  }

  return (
    <div className="text-right">
      <button
        onClick={handle}
        disabled={busy}
        className="rounded-md px-3 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
        style={{ backgroundColor: "var(--atbv-primary, var(--abv-text))" }}
      >
        {busy ? "Syncing…" : "Sync all now"}
      </button>
      {msg && <p className="mt-2 text-xs text-[var(--abv-text-secondary)]">{msg}</p>}
    </div>
  );
}

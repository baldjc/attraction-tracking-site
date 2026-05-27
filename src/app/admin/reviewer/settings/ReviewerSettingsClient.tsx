"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Status =
  | { connected: false }
  | { connected: true; email: string; expiresAt: string };

export default function ReviewerSettingsClient({
  initialStatus,
}: {
  initialStatus: Status;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initialStatus);
  const [busy, setBusy] = useState(false);

  async function handleDisconnect() {
    if (!confirm("Disconnect YouTube Analytics?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/reviewer/oauth/disconnect", {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      setStatus({ connected: false });
      router.refresh();
    } catch (err) {
      alert(`Disconnect failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="rounded-xl border border-[var(--abv-border-strong)] bg-white p-6"
      style={{
        borderRadius: "var(--atbv-radius-lg)",
        boxShadow: "var(--atbv-shadow-sm)",
      }}
    >
      <h2 className="text-base font-semibold text-[var(--abv-text)]">
        YouTube Analytics connection
      </h2>
      <p className="mt-1 text-sm text-[var(--abv-text-secondary)]">
        Single-admin OAuth using the Google account that manages every relevant
        channel.
      </p>

      <div className="mt-5 border-t border-[var(--abv-border-strong)] pt-5">
        {status.connected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: "var(--atbv-success)" }}
              />
              <span className="text-[var(--abv-text)]">
                Connected as{" "}
                <span className="font-semibold">{status.email}</span>
              </span>
            </div>
            <div className="text-xs text-[var(--abv-text-secondary)]">
              Access token expires{" "}
              <span className="font-data tabular-nums">
                {new Date(status.expiresAt).toLocaleString("en-CA")}
              </span>{" "}
              (auto-refreshed)
            </div>
            <button
              onClick={handleDisconnect}
              disabled={busy}
              className="mt-2 rounded-md border border-[var(--abv-crimson)]/30 bg-white px-4 py-2 text-sm font-medium text-[var(--abv-crimson)] hover:bg-[var(--abv-crimson)]/5 disabled:opacity-50"
              style={{ borderRadius: "var(--atbv-radius-md)" }}
            >
              {busy ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: "var(--atbv-text-dim)" }}
              />
              <span className="text-[var(--abv-text-secondary)]">Not connected</span>
            </div>
            <a
              href="/api/admin/reviewer/oauth/initiate"
              className="inline-block rounded-md bg-[var(--abv-dark)] px-4 py-2 text-sm font-medium text-white hover:bg-black/85"
              style={{ borderRadius: "var(--atbv-radius-md)" }}
            >
              Connect YouTube Analytics
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

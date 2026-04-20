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
      className="rounded-xl border border-[#eaeaea] bg-white p-6"
      style={{
        borderRadius: "var(--atbv-radius-lg)",
        boxShadow: "var(--atbv-shadow-sm)",
      }}
    >
      <h2 className="text-base font-semibold text-[#2f3437]">
        YouTube Analytics connection
      </h2>
      <p className="mt-1 text-sm text-[#787774]">
        Single-admin OAuth using the Google account that manages every relevant
        channel.
      </p>

      <div className="mt-5 border-t border-[#eaeaea] pt-5">
        {status.connected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: "var(--atbv-success)" }}
              />
              <span className="text-[#2f3437]">
                Connected as{" "}
                <span className="font-semibold">{status.email}</span>
              </span>
            </div>
            <div className="text-xs text-[#787774]">
              Access token expires{" "}
              <span className="font-data tabular-nums">
                {new Date(status.expiresAt).toLocaleString("en-CA")}
              </span>{" "}
              (auto-refreshed)
            </div>
            <button
              onClick={handleDisconnect}
              disabled={busy}
              className="mt-2 rounded-md border border-[#e63946]/30 bg-white px-4 py-2 text-sm font-medium text-[#e63946] hover:bg-[#e63946]/5 disabled:opacity-50"
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
              <span className="text-[#787774]">Not connected</span>
            </div>
            <a
              href="/api/admin/reviewer/oauth/initiate"
              className="inline-block rounded-md bg-[#6ba3c7] px-4 py-2 text-sm font-medium text-white hover:bg-[#5490b5]"
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

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function FeatureFlagToggle({
  initialEnabled,
}: {
  initialEnabled: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const next = !enabled;
    try {
      const res = await fetch("/api/admin/reviewer/flag", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) {
        const t = await res.text();
        alert(`Toggle failed: ${t}`);
        return;
      }
      setEnabled(next);
      router.refresh();
    } catch (err) {
      alert(`Toggle failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="mb-6 flex items-center justify-between rounded-xl border border-[var(--abv-border-strong)] bg-white p-4"
      style={{
        borderRadius: "var(--atbv-radius-lg)",
        boxShadow: "var(--atbv-shadow-sm)",
      }}
    >
      <div>
        <p className="text-sm font-semibold text-[var(--abv-text)]">
          Analytics Reviewer feature
        </p>
        <p className="mt-0.5 text-xs text-[var(--abv-text-secondary)]">
          Controls visibility of all Reviewer routes and the sidebar section.
        </p>
      </div>
      <button
        onClick={toggle}
        disabled={busy}
        role="switch"
        aria-checked={enabled}
        className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50"
        style={{
          backgroundColor: enabled
            ? "var(--atbv-success)"
            : "var(--atbv-border, #d4d4d4)",
        }}
      >
        <span
          className="inline-block h-5 w-5 transform rounded-full bg-white transition-transform"
          style={{ transform: enabled ? "translateX(22px)" : "translateX(2px)" }}
        />
      </button>
    </div>
  );
}

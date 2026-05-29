"use client";

import { useEffect, useState } from "react";
import { ArrowsRightLeftIcon, CheckIcon } from "@heroicons/react/24/outline";

interface AccountOption {
  primaryUserId: string;
  name: string;
}

// Self-contained switcher for regular members who have been granted access to
// other accounts. Renders nothing if the signed-in user has no team grants.
export default function TeamAccountSwitcher() {
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [actingAs, setActingAs] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/member/team/accounts");
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        setAccounts(json.accounts || []);
        setActingAs(json.actingAs ?? null);
      } catch {
        /* no-op */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function switchTo(primaryUserId: string | null) {
    setSwitching(true);
    const res = await fetch("/api/member/team/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ primaryUserId }),
    });
    if (res.ok) {
      window.location.href = "/member";
      return;
    }
    setSwitching(false);
  }

  // Nothing to switch between unless the user has grants (or is currently in one).
  if (!loaded || (accounts.length === 0 && !actingAs)) return null;

  return (
    <div className="px-1 pb-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 py-2.5 px-3 text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors duration-200 w-full rounded-md"
      >
        <ArrowsRightLeftIcon className="w-5 h-5 shrink-0" />
        <span className="flex-1 text-left truncate">Switch account</span>
      </button>

      {open && (
        <div className="mt-1 space-y-0.5">
          <button
            onClick={() => switchTo(null)}
            disabled={switching || !actingAs}
            className="flex items-center justify-between gap-2 py-2 px-3 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors w-full rounded-md disabled:opacity-50"
          >
            <span className="truncate">My account</span>
            {!actingAs && <CheckIcon className="w-4 h-4 shrink-0 text-green-400" />}
          </button>
          {accounts.map((a) => (
            <button
              key={a.primaryUserId}
              onClick={() => switchTo(a.primaryUserId)}
              disabled={switching || actingAs === a.primaryUserId}
              className="flex items-center justify-between gap-2 py-2 px-3 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors w-full rounded-md disabled:opacity-50"
            >
              <span className="truncate">{a.name}</span>
              {actingAs === a.primaryUserId && <CheckIcon className="w-4 h-4 shrink-0 text-green-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

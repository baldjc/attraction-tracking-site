"use client";

import { useState } from "react";
import { ArrowUturnLeftIcon, UserGroupIcon } from "@heroicons/react/24/outline";

// Persistent banner shown while a team member is operating inside someone
// else's account. Provides a one-click way back to their own account.
export default function TeamAccessBanner({ primaryName }: { primaryName?: string | null }) {
  const [leaving, setLeaving] = useState(false);

  async function switchBack() {
    setLeaving(true);
    const res = await fetch("/api/member/team/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ primaryUserId: null }),
    });
    if (res.ok) {
      window.location.href = "/member";
      return;
    }
    setLeaving(false);
  }

  return (
    <div className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-[var(--abv-azure)] px-4 py-2.5 text-white shadow-sm">
      <div className="flex items-center gap-2 min-w-0">
        <UserGroupIcon className="w-5 h-5 shrink-0" />
        <p className="text-sm truncate">
          You're working in{" "}
          <span className="font-semibold">{primaryName || "another member's"}</span>
          {primaryName ? "'s account" : " account"} as a team member.
        </p>
      </div>
      <button
        onClick={switchBack}
        disabled={leaving}
        className="flex items-center gap-1.5 text-sm font-semibold bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
      >
        <ArrowUturnLeftIcon className="w-4 h-4" />
        {leaving ? "Switching…" : "Back to my account"}
      </button>
    </div>
  );
}

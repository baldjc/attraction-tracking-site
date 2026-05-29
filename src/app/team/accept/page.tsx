"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

type State =
  | { kind: "working" }
  | { kind: "success" }
  | { kind: "error"; message: string }
  | { kind: "signin"; message: string };

function AcceptInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") || "";
  const [state, setState] = useState<State>({ kind: "working" });

  useEffect(() => {
    if (!token) {
      setState({ kind: "error", message: "This invite link is missing its token." });
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/team/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (cancelled) return;

      if (res.ok) {
        setState({ kind: "success" });
        setTimeout(() => router.push("/member"), 1600);
        return;
      }

      const j = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setState({ kind: "signin", message: j.error || "Please sign in to accept this invite." });
        return;
      }
      setState({ kind: "error", message: j.error || "This invite could not be accepted." });
    })();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--abv-bg)] dark:bg-[#0f1419] px-4">
      <div className="max-w-md w-full bg-white dark:bg-[#1a1a1a] border border-[var(--abv-text)]/10 dark:border-[#2a2a2a] rounded-2xl p-8 text-center shadow-sm">
        <div className="text-4xl mb-4">📹</div>
        <h1 className="text-xl font-bold text-[var(--abv-text)] dark:text-[#e2e8f0] mb-2">Team invite</h1>

        {state.kind === "working" && (
          <p className="text-sm text-[var(--abv-text)]/60 dark:text-[#a0aec0] animate-pulse">Accepting your invite…</p>
        )}

        {state.kind === "success" && (
          <>
            <p className="text-sm text-green-600 mb-1">You're in! Access granted.</p>
            <p className="text-xs text-[var(--abv-text)]/50 dark:text-[#718096]">Taking you to the dashboard…</p>
          </>
        )}

        {state.kind === "signin" && (
          <>
            <p className="text-sm text-[var(--abv-text)]/70 dark:text-[#a0aec0] mb-4">{state.message}</p>
            <button
              onClick={() => router.push(`/login?callbackUrl=${encodeURIComponent(`/team/accept?token=${token}`)}`)}
              className="inline-block bg-[var(--abv-dark)] text-white rounded-full px-5 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Sign in to accept
            </button>
          </>
        )}

        {state.kind === "error" && (
          <>
            <p className="text-sm text-red-600 mb-4">{state.message}</p>
            <button
              onClick={() => router.push("/member")}
              className="inline-block text-sm font-semibold text-[var(--abv-azure)] hover:underline"
            >
              Go to dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function TeamAcceptPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[var(--abv-bg)] dark:bg-[#0f1419]">
          <p className="text-sm text-[var(--abv-text)]/50 animate-pulse">Loading…</p>
        </div>
      }
    >
      <AcceptInner />
    </Suspense>
  );
}

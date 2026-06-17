"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import ContentPlannerClient from "./ContentPlannerClient";
import OrphanScriptsBanner from "@/components/content-planner/OrphanScriptsBanner";

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; serviceTier: string }
  | { kind: "error"; message: string };

export default function ContentPlannerWrapper() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  // Production bug history — the previous wrapper masked HTTP 500s
  // from /api/member/content-plans (e.g. transient Neon ETIMEDOUT)
  // by silently defaulting to `serviceTier="foundations"`, which
  // sent paid members like Chris Proctor (done_with_you) to the
  // upgrade wall. We now treat ANY non-2xx OR network failure OR
  // explicit `serviceTier: null` from the server as an ERROR state
  // with a retry button — NEVER as a tier downgrade.
  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const r = await fetch("/api/member/content-plans");
      if (!r.ok) {
        let code = "";
        try {
          const body = await r.json();
          code = body?.code ? ` (${body.code})` : "";
        } catch {
          /* HTML error body — ignore */
        }
        setState({
          kind: "error",
          message: `Couldn't load your Content Planner${code}. This usually clears in a few seconds.`,
        });
        return;
      }
      const data = await r.json();
      if (data?.serviceTier == null) {
        // Server explicitly signalled it couldn't determine the
        // tier (503 fallback shape) — same retry path as a thrown
        // error, never a silent downgrade.
        setState({
          kind: "error",
          message: "Couldn't read your account tier. Please retry in a moment.",
        });
        return;
      }
      setState({ kind: "ok", serviceTier: data.serviceTier });
    } catch {
      setState({
        kind: "error",
        message:
          "Network error loading your Content Planner. Please check your connection and retry.",
      });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (state.kind === "loading") {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-[var(--abv-azure)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <p className="text-[var(--abv-text-primary)] text-base">
          {state.message}
        </p>
        <button
          onClick={load}
          className="px-4 py-2 rounded-md bg-[var(--abv-azure)] text-white text-sm font-medium hover:opacity-90"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <Suspense fallback={null}>
      <OrphanScriptsBanner />
      <ContentPlannerClient serviceTier={state.serviceTier} />
    </Suspense>
  );
}

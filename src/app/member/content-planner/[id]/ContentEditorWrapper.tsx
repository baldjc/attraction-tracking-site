"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ContentEditorClient from "./ContentEditorClient";
import type { ContentPlan } from "@/components/content-planner/ContentPlanEditModal";

const PRODUCTION_TIERS = ["production", "growth", "done_with_you"];

/** Client-side bootstrap for the full-page Content Editor. Mirrors the same
 *  bootstrap pattern as ContentPlannerWrapper so the editor and list view
 *  source serviceTier / feature flags the same way. */
export default function ContentEditorWrapper({ planId }: { planId: string }) {
  const [plan, setPlan] = useState<ContentPlan | null>(null);
  const [serviceTier, setServiceTier] = useState<string | null>(null);
  const [scriptBuilderV2Enabled, setScriptBuilderV2Enabled] = useState(false);
  const [errorState, setErrorState] = useState<"none" | "not-found" | "deleted" | "load-failed">("none");

  useEffect(() => {
    let cancelled = false;
    // Fire the three bootstrap requests in parallel — the plan + service tier
    // come back from /api/member/content-plans (also gives us our owner check
    // for free) and feature flags drive the v2 builder strip + downstream
    // behaviour.
    Promise.allSettled([
      fetch(`/api/member/content-plans/${planId}`).then((r) => {
        if (r.status === 404) throw new Error("not-found");
        // 410 Gone = soft-deleted plan. Surface a dedicated friendly page
        // rather than the generic "not found" copy.
        if (r.status === 410) throw new Error("deleted");
        if (!r.ok) throw new Error("load-failed");
        return r.json();
      }),
      fetch("/api/member/content-plans").then((r) => r.json()).catch(() => ({})),
      fetch("/api/member/feature-flags").then((r) => r.json()).catch(() => ({})),
    ]).then(([planRes, listRes, flagsRes]) => {
      if (cancelled) return;
      if (planRes.status === "fulfilled") {
        setPlan(planRes.value.plan ?? null);
      } else {
        const msg = (planRes.reason as Error)?.message;
        setErrorState(
          msg === "not-found" ? "not-found" : msg === "deleted" ? "deleted" : "load-failed",
        );
        return;
      }
      if (listRes.status === "fulfilled") {
        setServiceTier(listRes.value?.serviceTier ?? "foundations");
      } else {
        setServiceTier("foundations");
      }
      if (flagsRes.status === "fulfilled") {
        setScriptBuilderV2Enabled(Boolean(flagsRes.value?.flags?.tool_script_builder_v2));
      }
    });
    return () => { cancelled = true; };
  }, [planId]);

  if (errorState === "deleted") {
    return (
      <div className="max-w-[1280px] mx-auto px-9 py-16 text-center">
        <h1 className="font-display font-extrabold text-3xl text-[var(--abv-text)] mb-3">
          This video was deleted
        </h1>
        <p className="text-[var(--abv-text-muted)] mb-6">
          It&apos;s no longer in your planner. Your coaching team can restore it if you need it
          back — the script, research, and AI-generated content stay saved.
        </p>
        <Link
          href="/member/content-planner"
          className="inline-block px-5 py-2 rounded-full bg-[var(--abv-ink)] text-white text-sm font-semibold"
        >
          Back to Content Planner
        </Link>
      </div>
    );
  }
  if (errorState === "not-found") {
    return (
      <div className="max-w-[1280px] mx-auto px-9 py-16 text-center">
        <h1 className="font-display font-extrabold text-3xl text-[var(--abv-text)] mb-3">
          Plan not found
        </h1>
        <p className="text-[var(--abv-text-muted)] mb-6">
          This plan may have been deleted or doesn&apos;t belong to your account.
        </p>
        <Link
          href="/member/content-planner"
          className="inline-block px-5 py-2 rounded-full bg-[var(--abv-ink)] text-white text-sm font-semibold"
        >
          Back to Content Planner
        </Link>
      </div>
    );
  }
  if (errorState === "load-failed") {
    return (
      <div className="max-w-[1280px] mx-auto px-9 py-16 text-center">
        <p className="text-[var(--abv-leads)]">Couldn&apos;t load this plan — try refreshing.</p>
      </div>
    );
  }
  if (!plan || !serviceTier) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-[var(--abv-azure)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!PRODUCTION_TIERS.includes(serviceTier) && serviceTier !== "foundations") {
    return (
      <div className="max-w-[1280px] mx-auto px-9 py-16 text-center">
        <p className="text-[var(--abv-text-muted)]">
          Upgrade required to access the Content Editor.
        </p>
      </div>
    );
  }

  return (
    <ContentEditorClient
      initialPlan={plan}
      serviceTier={serviceTier}
      scriptBuilderV2Enabled={scriptBuilderV2Enabled}
    />
  );
}

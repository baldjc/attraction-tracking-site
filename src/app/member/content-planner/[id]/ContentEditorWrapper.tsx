"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUturnLeftIcon } from "@heroicons/react/24/outline";
import ContentEditorClient from "./ContentEditorClient";
import type { ContentPlan } from "@/components/content-planner/ContentPlanEditModal";
import type { PlanAccessReason } from "@/lib/content-plan-access";

const PRODUCTION_TIERS = ["production", "growth", "done_with_you"];

type ErrorState = "none" | "not-found" | "deleted" | "wrong-owner" | "load-failed";

interface ErrorDetail {
  /** True when the signed-in account is an admin (unlocks date + restore). */
  admin?: boolean;
  deletedAt?: string | null;
  ownerUserId?: string;
}

function reasonToErrorState(reason: PlanAccessReason | string | undefined, httpStatus: number): ErrorState {
  if (reason === "deleted") return "deleted";
  if (reason === "wrong_owner") return "wrong-owner";
  if (reason === "not_found") return "not-found";
  // Fall back to status codes for any response without a typed reason.
  if (httpStatus === 410) return "deleted";
  if (httpStatus === 404) return "not-found";
  return "load-failed";
}

function formatDeletedAt(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

/** Client-side bootstrap for the full-page Content Editor. Mirrors the same
 *  bootstrap pattern as ContentPlannerWrapper so the editor and list view
 *  source serviceTier / feature flags the same way. */
export default function ContentEditorWrapper({ planId }: { planId: string }) {
  const [plan, setPlan] = useState<ContentPlan | null>(null);
  const [serviceTier, setServiceTier] = useState<string | null>(null);
  const [scriptBuilderV2Enabled, setScriptBuilderV2Enabled] = useState(false);
  const [errorState, setErrorState] = useState<ErrorState>("none");
  const [errorDetail, setErrorDetail] = useState<ErrorDetail | null>(null);
  // Bumped after a successful admin restore to re-run the bootstrap effect.
  const [reloadNonce, setReloadNonce] = useState(0);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Reset transient state on (re)load so a restore retry starts clean.
    setErrorState("none");
    setErrorDetail(null);
    setPlan(null);
    // Fire the three bootstrap requests in parallel — the plan + service tier
    // come back from /api/member/content-plans (also gives us our owner check
    // for free) and feature flags drive the v2 builder strip + downstream
    // behaviour.
    Promise.allSettled([
      fetch(`/api/member/content-plans/${planId}`).then(async (r) => {
        if (r.ok) return r.json();
        // Parse the structured reason payload so admins get an actionable
        // diagnosis (deleted / wrong owner) instead of the generic copy.
        let body: { reason?: string; admin?: boolean; deletedAt?: string | null; ownerUserId?: string } = {};
        try {
          body = await r.json();
        } catch {
          // Non-JSON error body — fall through to status-code mapping.
        }
        const err = new Error(body.reason || `http-${r.status}`) as Error & {
          httpStatus?: number;
          detail?: ErrorDetail;
          reason?: string;
        };
        err.httpStatus = r.status;
        err.reason = body.reason;
        err.detail = { admin: body.admin, deletedAt: body.deletedAt, ownerUserId: body.ownerUserId };
        throw err;
      }),
      fetch("/api/member/content-plans").then((r) => r.json()).catch(() => ({})),
      fetch("/api/member/feature-flags").then((r) => r.json()).catch(() => ({})),
    ]).then(([planRes, listRes, flagsRes]) => {
      if (cancelled) return;
      if (planRes.status === "fulfilled") {
        setPlan(planRes.value.plan ?? null);
      } else {
        const reason = planRes.reason as Error & { httpStatus?: number; reason?: string; detail?: ErrorDetail };
        setErrorState(reasonToErrorState(reason?.reason, reason?.httpStatus ?? 0));
        setErrorDetail(reason?.detail ?? null);
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
  }, [planId, reloadNonce]);

  const handleRestore = async () => {
    if (!errorDetail?.ownerUserId) return;
    setRestoring(true);
    setRestoreError(null);
    try {
      const res = await fetch(
        `/api/admin/members/${errorDetail.ownerUserId}/content-plans/${planId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ restore: true }),
        },
      );
      if (!res.ok) throw new Error("restore failed");
      // Re-run the bootstrap so the now-live plan loads into the editor.
      setReloadNonce((n) => n + 1);
    } catch {
      setRestoreError("Couldn't restore this plan. Please try again.");
    } finally {
      setRestoring(false);
    }
  };

  if (errorState === "deleted") {
    const isAdmin = Boolean(errorDetail?.admin);
    const deletedOn = formatDeletedAt(errorDetail?.deletedAt);
    if (isAdmin) {
      // Admin diagnosing a member's planner: surface the deletion date and an
      // inline Restore (no need to hunt for the Deleted Plans panel).
      return (
        <div className="max-w-[1280px] mx-auto px-9 py-16 text-center">
          <h1 className="font-display font-extrabold text-3xl text-[var(--abv-text)] mb-3">
            This plan was deleted
          </h1>
          <p className="text-[var(--abv-text-muted)] mb-6">
            {deletedOn
              ? `It was soft-deleted on ${deletedOn}. `
              : "It was soft-deleted. "}
            Restore it to return the video to the member&apos;s planner with its script,
            research, and AI content intact.
          </p>
          {restoreError && <p className="text-sm text-[var(--abv-leads)] mb-4">{restoreError}</p>}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => void handleRestore()}
              disabled={restoring || !errorDetail?.ownerUserId}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-[var(--abv-ink)] text-white text-sm font-semibold disabled:opacity-50"
            >
              <ArrowUturnLeftIcon className="h-4 w-4" />
              {restoring ? "Restoring…" : "Restore plan"}
            </button>
            <Link
              href="/member/content-planner"
              className="inline-block px-5 py-2 rounded-full border border-gray-300 text-[var(--abv-text)] text-sm font-semibold"
            >
              Back to Content Planner
            </Link>
          </div>
        </div>
      );
    }
    // Member view — unchanged friendly copy, no internal state leaked.
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
  if (errorState === "wrong-owner") {
    // Only admins ever reach this state (members get the generic not-found).
    // Impersonation context didn't resolve to the plan's owner.
    return (
      <div className="max-w-[1280px] mx-auto px-9 py-16 text-center">
        <h1 className="font-display font-extrabold text-3xl text-[var(--abv-text)] mb-3">
          This plan belongs to a different member
        </h1>
        <p className="text-[var(--abv-text-muted)] mb-6">
          You&apos;re viewing as a member who doesn&apos;t own this plan. Switch to the right
          member from the admin dashboard, then open the plan again.
        </p>
        <Link
          href="/admin/members"
          className="inline-block px-5 py-2 rounded-full bg-[var(--abv-ink)] text-white text-sm font-semibold"
        >
          Back to Members
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

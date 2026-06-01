/**
 * Wave 3 — Script Builder v2 wizard shell (Talking Head).
 *
 * URL contract:
 *   /member/content-planner/wizard/script?planId=<uuid>
 *
 * Server-side gates (mirrors the streaming route + save endpoint):
 *   - auth required (else redirect to login)
 *   - `tool_script_builder_v2` flag ON (else 404)
 *   - plan exists + owned by this user (else 404)
 *   - plan has rotationSlot + titlePromise (else "missing lineage" CTA)
 *   - plan has linkedFactIds.length >= 3 (else "relink facts" CTA)
 *   - plan.shootType is null OR 'talking_head' (else "wrong shoot type" CTA)
 *
 * Renders a client wrapper that owns the Step 4 (shoot type) → Step 5
 * (streaming generate) → Approve & Save flow.
 */
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { getFeatureFlags } from "@/lib/feature-flags";
import { ScriptWizardClient } from "@/components/ai-tools/script-builder-v2/ScriptWizardClient";
import type { Step4PlanSummary } from "@/components/ai-tools/script-builder-v2/Step4ShootType";
import {
  enrichPlanWithRelatedFacts,
  evaluateFactGate,
} from "@/lib/script-plan-enrichment";

export const dynamic = "force-dynamic";

interface SearchParams {
  planId?: string;
}

const BACK_HREF = "/member/content-planner";

export default async function ScriptWizardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Impersonation-aware so the Script Builder loads the impersonated
  // member's content plan, not the admin account's (which wouldn't own it).
  const resolved = await resolveUserFromSession();
  if (!resolved) {
    redirect("/login?callbackUrl=/member/content-planner");
  }
  const userId = resolved.id;
  const userRole = resolved.role;

  const flags = await getFeatureFlags({ userId, userRole });
  if (!flags.tool_script_builder_v2) {
    notFound();
  }

  const { planId } = await searchParams;
  if (!planId || typeof planId !== "string") {
    return (
      <GateMessage
        title="Pick a plan first"
        body="Open a Content Plan from the planner and click Build Script (v2) to start here with the right plan loaded."
      />
    );
  }

  const plan = await prisma.contentPlan.findFirst({
    where: { id: planId, userId },
    select: {
      id: true,
      title: true,
      rotationSlot: true,
      titlePromise: true,
      visualPeak: true,
      thumbnailWords: true,
      linkedFactIds: true,
      shootType: true,
    },
  });
  if (!plan) {
    notFound();
  }

  if (!plan.rotationSlot || !plan.titlePromise) {
    return (
      <GateMessage
        title="This plan needs the Wave 2 wizard first"
        body="Script Builder v2 needs a rotation slot and title promise — those are set when you create a plan with the AI content wizard."
      />
    );
  }

  let linkedFactIds: string[] = Array.isArray(plan.linkedFactIds)
    ? (plan.linkedFactIds as unknown[]).filter(
        (x): x is string => typeof x === "string",
      )
    : [];

  // Layer-1 auto-enrichment runs on Build-Script entry, BEFORE the gate, so a
  // plan that landed with 1–2 facts (narrow Story Lead) is lifted over the
  // threshold with in-scope facts automatically. No-op for ≥3 or 0.
  try {
    const enriched = await enrichPlanWithRelatedFacts({
      userId,
      planId: plan.id,
      persist: true,
    });
    if (enriched.added.length > 0) {
      linkedFactIds = [...linkedFactIds, ...enriched.added.map((a) => a.id)];
    }
  } catch {
    // Enrichment is best-effort — never block entry on it.
  }

  const gate = evaluateFactGate(linkedFactIds.length);
  if (gate === "block") {
    return (
      <FactBlockGate planId={plan.id} />
    );
  }

  if (plan.shootType && plan.shootType !== "talking_head") {
    return (
      <GateMessage
        title="Wrong shoot type for this builder"
        body={`This plan is already scoped as ${plan.shootType}. Script Builder v2 currently only supports Talking Head; Home Tour ships in Wave 4.`}
      />
    );
  }

  const summary: Step4PlanSummary = {
    id: plan.id,
    title: plan.title,
    rotationSlot: plan.rotationSlot,
    titlePromise: plan.titlePromise,
    visualPeak: plan.visualPeak ?? null,
    thumbnailCallouts: (plan.thumbnailWords ?? "")
      .split("|")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
    linkedFactCount: linkedFactIds.length,
    // estimatedRuntime lives inside researchNotes markdown; we surface
    // it as null here to avoid parsing that blob server-side. Step 4
    // gracefully hides the field when null.
    estimatedRuntime: null,
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <ScriptWizardClient
        planSummary={summary}
        backHref={BACK_HREF}
        lowSupport={gate === "low"}
      />
    </div>
  );
}

/**
 * Zero-fact block state. Unlike the generic GateMessage this offers the two
 * recovery CTAs the spec calls for: link facts to this plan, or run a fresh
 * data search to generate facts to link.
 */
function FactBlockGate({ planId }: { planId: string }) {
  return (
    <div className="mx-auto mt-10 max-w-xl rounded-lg border border-amber-300 bg-amber-50 p-6 shadow-sm dark:border-amber-700/60 dark:bg-amber-900/15">
      <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        This plan has no linked facts yet
      </h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        Script Builder v2 anchors every script on cited market facts, and this
        plan doesn&apos;t have any linked yet. Link facts to it, or run a data
        search to generate facts you can link.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href={`/member/content-planner/${planId}`}
          className="inline-flex items-center rounded-md bg-[#185FA5] px-3.5 py-2 text-sm font-medium text-white hover:bg-[#134d87]"
        >
          Link facts now
        </Link>
        <Link
          href="/member/market-data"
          className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          Run data search
        </Link>
      </div>
      <Link
        href={BACK_HREF}
        className="mt-4 inline-block text-sm font-medium text-blue-600 hover:underline"
      >
        ← Back to Content Planner
      </Link>
    </div>
  );
}

function GateMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto mt-10 max-w-xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        {title}
      </h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{body}</p>
      <Link
        href={BACK_HREF}
        className="mt-4 inline-block text-sm font-medium text-blue-600 hover:underline"
      >
        ← Back to Content Planner
      </Link>
    </div>
  );
}

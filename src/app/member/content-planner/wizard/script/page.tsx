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

  const linkedFactIds: string[] = Array.isArray(plan.linkedFactIds)
    ? (plan.linkedFactIds as unknown[]).filter(
        (x): x is string => typeof x === "string",
      )
    : [];
  if (linkedFactIds.length < 3) {
    return (
      <GateMessage
        title="Not enough linked facts"
        body={`This plan has ${linkedFactIds.length} linked facts — Script Builder v2 needs at least 3. Re-run the content wizard to relink facts before building a script.`}
      />
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
      <ScriptWizardClient planSummary={summary} backHref={BACK_HREF} />
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

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
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { resolveUserFromSession } from "@/lib/session-utils";
import { EXCLUDE_LEGACY_FAILURE_RATE } from "@/lib/market-status-buckets";
import prisma from "@/lib/prisma";
import { getFeatureFlags } from "@/lib/feature-flags";
import { getCostCapStatus } from "@/lib/ai-tool-cost";
import { ScriptWizardClient } from "@/components/ai-tools/script-builder-v2/ScriptWizardClient";
import type { Step4PlanSummary } from "@/components/ai-tools/script-builder-v2/Step4ShootType";
import {
  enrichPlanWithRelatedFacts,
  evaluateFactGate,
} from "@/lib/script-plan-enrichment";
import {
  FactBlockGate,
  AutoLinkedPanel,
  UnresolvedFactsBanner,
  type AutoLinkedFact,
  type DataSearchProps,
} from "@/components/content-planner/ScriptFactGate";
import {
  MetricFamily,
  estimateExtractionCostUsd,
  type ScriptDataNeed,
} from "@/lib/script-data-resolver";
import {
  metricNameToLabel,
  formatMetricValue,
} from "@/lib/content-engine-validation";

/**
 * Mode-aware Low Support tone. Mode is derived from the rotation slot (there is
 * no ContentPlan.mode column): data-heavy slots lean on cited numbers, so a thin
 * fact set hurts them more and gets firmer wording than story-driven slots.
 */
function lowSupportToneForSlot(
  rotationSlot: string | null,
): "data-heavy" | "story-driven" {
  return rotationSlot === "market_update" ||
    rotationSlot === "neighbourhood_fact"
    ? "data-heavy"
    : "story-driven";
}

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
    where: { id: planId, userId, deletedAt: null },
    select: {
      id: true,
      title: true,
      rotationSlot: true,
      titlePromise: true,
      visualPeak: true,
      thumbnailWords: true,
      linkedFactIds: true,
      shootType: true,
      factsResolutionState: true,
      factsResolutionConfidence: true,
      propertyTypeFocus: true,
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
  let autoLinkedIds: string[] = [];
  try {
    const enriched = await enrichPlanWithRelatedFacts({
      userId,
      planId: plan.id,
      persist: true,
    });
    if (enriched.added.length > 0) {
      autoLinkedIds = enriched.added.map((a) => a.id);
      linkedFactIds = [...linkedFactIds, ...autoLinkedIds];
    }
  } catch {
    // Enrichment is best-effort — never block entry on it.
  }

  // Best-effort data-search need for the block-case banners. The block case
  // (0 facts) returns early from enrichment with no skippedNeedingPaid, so we
  // derive a market-wide need here: the extractor reads the most-recent
  // validated upload itself, filters to the (optional) property-type focus, and
  // recomputes the real cost cap server-side. The estimate is coarse on purpose.
  let dataSearch: DataSearchProps | undefined;
  {
    const marketConfig = await prisma.marketConfig.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (marketConfig) {
      const uploads = await prisma.marketDataUpload.findMany({
        where: { userId, status: "validated" },
        select: { monthYear: true, rowCount: true },
        orderBy: { monthYear: "desc" },
        take: 12,
      });
      if (uploads.length > 0) {
        const months = uploads
          .map((u) => u.monthYear.slice(0, 7))
          .filter((m) => m.length === 7)
          .sort();
        const propertyType =
          plan.propertyTypeFocus && plan.propertyTypeFocus !== "All"
            ? plan.propertyTypeFocus
            : null;
        const need: ScriptDataNeed = {
          memberId: userId,
          marketConfigId: marketConfig.id,
          neighbourhood: null,
          propertyType,
          metricFamily: MetricFamily.MEDIAN,
          timeWindow: {
            startMonth: months[0],
            endMonth: months[months.length - 1],
          },
        };
        // Coarse estimate from the most-recent upload (the only one the
        // extractor reads); the route recomputes precisely and enforces caps.
        // capUsd lets the member-facing UI show a % of monthly allowance
        // instead of a raw dollar figure.
        const { capUsd } = await getCostCapStatus(userId);
        dataSearch = {
          need,
          estimatedCostUsd: estimateExtractionCostUsd(uploads[0].rowCount),
          capUsd,
        };
      }
    }
  }

  const gate = evaluateFactGate(linkedFactIds.length);
  if (gate === "block") {
    // A Story Lead whose dataThreads couldn't be bridged to facts lands here
    // with zero links. Show the Story-Lead-aware unresolved banner (with
    // auto-enrichment / manual-link / data-search escape hatches) instead of
    // the generic 0-fact block.
    const isUnresolved = plan.factsResolutionState === "unresolved";
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Page-level back nav (the banner no longer carries its own). */}
        {isUnresolved && (
          <Link
            href={BACK_HREF}
            className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-[var(--abv-text)]/70 transition-colors hover:text-[var(--abv-ink)]"
          >
            <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
            Back to Content Planner
          </Link>
        )}
        {isUnresolved ? (
          <UnresolvedFactsBanner planId={plan.id} dataSearch={dataSearch} />
        ) : (
          <FactBlockGate planId={plan.id} dataSearch={dataSearch} />
        )}
      </div>
    );
  }

  // Resolve the auto-linked facts for the review panel (labels + values).
  let autoLinked: AutoLinkedFact[] = [];
  // The review panel surfaces both enrichment auto-links AND any non-validator
  // provenance facts (member-provided / on-demand) the member added via the gate
  // banners — those get a "not validator-verified" badge so they're never
  // mistaken for vetted facts.
  const reviewIds = [...new Set([...autoLinkedIds, ...linkedFactIds])];
  if (reviewIds.length > 0) {
    const rows = await prisma.marketFact.findMany({
      where: { ...EXCLUDE_LEGACY_FAILURE_RATE, id: { in: reviewIds }, userId },
      select: {
        id: true,
        neighbourhood: true,
        metricName: true,
        metricValue: true,
        metricValueString: true,
        dateContext: true,
        sourceType: true,
        upload: { select: { monthYear: true } },
      },
    });
    const autoSet = new Set(autoLinkedIds);
    const keep = rows.filter(
      (f) =>
        autoSet.has(f.id) ||
        f.sourceType === "member_provided" ||
        f.sourceType === "on_demand_extraction",
    );
    // Auto-linked first (in enrichment order), then the member-added facts.
    const order = new Map(autoLinkedIds.map((id, i) => [id, i]));
    keep.sort(
      (a, b) =>
        (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );
    autoLinked = keep.map((f) => {
      const hasNumeric = f.metricValue !== null && f.metricValue !== undefined;
      const d = f.dateContext;
      const monthYear = d
        ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
        : (f.upload?.monthYear ?? "");
      return {
        id: f.id,
        neighbourhood: f.neighbourhood,
        metricLabel: metricNameToLabel(f.metricName),
        metricValueString: hasNumeric
          ? formatMetricValue(f.metricName, f.metricValue as number)
          : (f.metricValueString ?? ""),
        monthYear,
        sourceType: f.sourceType,
      };
    });
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
      {plan.factsResolutionState === "from_textual_resolver" && (
        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-800/60 dark:bg-blue-900/15 dark:text-blue-200">
          Matched from lead data — confidence:{" "}
          <span className="font-semibold capitalize">
            {plan.factsResolutionConfidence ?? "fuzzy"}
          </span>
        </div>
      )}
      <AutoLinkedPanel
        planId={plan.id}
        added={autoLinked}
        currentLinkedIds={linkedFactIds}
      />
      <ScriptWizardClient
        planSummary={summary}
        backHref={BACK_HREF}
        lowSupport={gate === "low"}
        lowSupportTone={lowSupportToneForSlot(plan.rotationSlot)}
        dataSearch={dataSearch}
        currentLinkedIds={linkedFactIds}
      />
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

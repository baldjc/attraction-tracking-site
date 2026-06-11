// Member-facing re-validation under a newly-saved metric methodology.
//
// POST /api/member/methodology-revalidate
//
// Backs the "Re-validate my last 3 months" button in the "How we calculate your
// stats" settings panel. After a member saves new methodology settings, their
// already-validated uploads still carry prose framed under the OLD methodology.
// This endpoint re-runs the validator on the member's most-recent uploads so the
// stored prose facts (and Story Leads) are regenerated under the new framing.
// runValidation snapshots the member's CURRENT MemberMetricSettings at the start
// of each run (see fact-validator.ts), so by the time these jobs fire they pick
// up the just-saved settings automatically — this route does not pass settings.
//
// Order of operations (cheap-to-expensive, fail before destroying data):
//   1. Member auth.
//   2. Find the member's most-recent validated uploads (last 3). No uploads ->
//      friendly 200 no-op (UI shows the empty state).
//   3. Cost estimate = (# prose MarketFact rows across those uploads) ×
//      per-row re-validation cost, where the per-row cost is the member's own
//      historical cost-per-fact (sum validationCostUsd / sum facts), falling
//      back to a baseline when there's no history.
//   4. Cost-cap precheck via getCostCapStatus. If hard-blocked OR the estimate
//      exceeds the remaining monthly budget, 402 BEFORE deleting anything.
//   5. Per upload: atomically claim (skip any already validating), then in one
//      transaction delete its facts/aggregates/leads and reset it to a clean
//      pre-validation state with rawValidatorOutput CLEARED (a methodology
//      change is a deliberate fresh AI pass, not a persistence-only retry).
//      Fire validateUploadAsync(uploadId, userId) — cost attributes to the
//      member and is logged to the existing AIToolUsage ledger by the pipeline.

import { NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { dispatchValidation } from "@/lib/job-dispatch";
import { getCostCapStatus } from "@/lib/ai-tool-cost";
import { isMarketReaggKillSwitchActiveForUser } from "@/lib/feature-flags";

export const runtime = "nodejs";
export const maxDuration = 60;

// "Last 3 months" => the member's three most-recent validated uploads.
const REVALIDATE_RECENT_UPLOADS = 3;
// Baseline cost-per-fact used only when the member has no priced history yet.
// ~$2.75 median upload cost over ~275 facts ≈ $0.01/fact (matches Phase-1 data).
const FALLBACK_COST_PER_FACT_USD = 0.01;

interface RevalidationEstimate {
  uploads: { id: string; validationCostUsd: unknown }[];
  factCount: number;
  estimateUsd: number;
  remainingUsd: number;
  capUsd: number;
  monthSpendUsd: number;
  hardBlocked: boolean;
  overBudget: boolean;
  unlimited: boolean;
}

// Shared cost-estimate logic for the GET dry-run (button enable/disable) and the
// POST run (precheck). Never mutates anything.
async function computeRevalidationEstimate(
  userId: string,
): Promise<RevalidationEstimate> {
  const uploads = await prisma.marketDataUpload.findMany({
    where: { userId, status: "validated" },
    orderBy: [{ monthYear: "desc" }, { uploadedAt: "desc" }],
    take: REVALIDATE_RECENT_UPLOADS,
    select: { id: true, validationCostUsd: true },
  });

  const uploadIds = uploads.map((u) => u.id);
  const factCount =
    uploadIds.length > 0
      ? await prisma.marketFact.count({ where: { uploadId: { in: uploadIds } } })
      : 0;

  // Per-fact cost from the member's own history when available: re-running these
  // uploads costs about what they cost originally, so sum(originalCost) /
  // sum(facts) is a real, member-specific cost-per-fact. Fall back to the
  // baseline if we somehow have no priced facts.
  const sumHistoricCost = uploads.reduce(
    (acc, u) => acc + Number(u.validationCostUsd ?? 0),
    0,
  );
  const perFactCostUsd =
    factCount > 0 && sumHistoricCost > 0
      ? sumHistoricCost / factCount
      : FALLBACK_COST_PER_FACT_USD;
  const estimateUsd = Number((factCount * perFactCostUsd).toFixed(2));

  const cap = await getCostCapStatus(userId);
  const remainingUsd = Math.max(
    0,
    Number((cap.capUsd - cap.monthSpendUsd).toFixed(2)),
  );

  return {
    uploads,
    factCount,
    estimateUsd,
    remainingUsd,
    capUsd: cap.capUsd,
    monthSpendUsd: cap.monthSpendUsd,
    hardBlocked: cap.hardBlocked,
    // Cap-bypass actors (admin / Done-With-You) are unlimited: never over
    // budget, regardless of how large the re-validation estimate is.
    overBudget: cap.unlimited
      ? false
      : cap.hardBlocked || estimateUsd > remainingUsd,
    unlimited: cap.unlimited,
  };
}

// Dry-run estimate — drives the "Re-validate my last 3 months" button's
// enabled/disabled + tooltip state in the settings panel. Read-only.
export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const est = await computeRevalidationEstimate(user.id);
  return NextResponse.json({
    hasUploads: est.uploads.length > 0,
    uploadCount: est.uploads.length,
    factCount: est.factCount,
    estimateUsd: est.estimateUsd,
    remainingUsd: est.remainingUsd,
    capUsd: est.capUsd,
    monthSpendUsd: est.monthSpendUsd,
    overBudget: est.overBudget,
    unlimited: est.unlimited,
  });
}

export async function POST() {
  const user = await resolveUserFromSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Market re-aggregation break-glass — this re-runs the validator on EXISTING
  // uploads (delete-before-replace of facts/aggregates/story leads), so freeze
  // it when the switch is active. Brand-new uploads use a different route and
  // stay open.
  if (await isMarketReaggKillSwitchActiveForUser(user.id)) {
    return NextResponse.json(
      {
        error:
          "Re-validation is temporarily paused while we roll out an update. Your existing market data is unchanged — please check back shortly.",
        code: "REAGGREGATION_PAUSED",
      },
      { status: 423 },
    );
  }

  const est = await computeRevalidationEstimate(user.id);
  const { uploads, factCount, estimateUsd, remainingUsd } = est;

  if (uploads.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        reason: "no_uploads",
        message:
          "You don't have any validated market-data uploads yet. Upload a market report first — new uploads automatically use your latest methodology.",
      },
      { status: 200 },
    );
  }

  // Cost-cap precheck BEFORE any destructive work. Block when hard-capped or
  // when the estimate would push the member past their remaining budget.
  if (est.overBudget) {
    return NextResponse.json(
      {
        ok: false,
        reason: "cost_cap",
        message:
          "Re-validating your last 3 months would exceed your remaining monthly AI budget. Your new methodology is saved and will apply to future uploads automatically — re-validation will be available again after your budget resets.",
        estimateUsd,
        remainingUsd,
        capUsd: est.capUsd,
        monthSpendUsd: est.monthSpendUsd,
        factCount,
      },
      { status: 402 },
    );
  }

  // Claim + reset + fire per upload. Each upload is independent: an upload that
  // is concurrently validating is skipped (its in-flight pass already owns the
  // row), not failed.
  const queued: string[] = [];
  for (const u of uploads) {
    const claim = await prisma.marketDataUpload.updateMany({
      where: { id: u.id, status: { not: "validating" } },
      data: { status: "validating" },
    });
    if (claim.count === 0) continue;

    try {
      await prisma.$transaction(async (tx) => {
        await tx.marketFact.deleteMany({ where: { uploadId: u.id } });
        await tx.aggregatedMetric.deleteMany({ where: { uploadId: u.id } });
        await tx.marketStoryLead.deleteMany({ where: { uploadId: u.id } });
        await tx.marketDataUpload.update({
          where: { id: u.id },
          data: {
            status: "validating",
            validatedAt: null,
            validationError: null,
            validationCostUsd: null,
            // Methodology change => deliberate fresh AI pass. Clearing the
            // stored output prevents runValidation's persistence-only reuse
            // path from re-emitting the old-methodology prose for free.
            rawValidatorOutput: null,
          },
        });
      });
    } catch (err) {
      // Restore the claim so the upload isn't stranded in 'validating'.
      await prisma.marketDataUpload
        .update({ where: { id: u.id }, data: { status: "validated" } })
        .catch(() => {});
      console.error("[methodology-revalidate] reset failed for", u.id, err);
      continue;
    }

    await dispatchValidation(u.id, user.id);
    queued.push(u.id);
  }

  return NextResponse.json(
    { ok: true, queued: queued.length, uploadIds: queued, estimateUsd, factCount },
    { status: 202 },
  );
}

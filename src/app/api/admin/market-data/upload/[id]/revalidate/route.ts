// Admin-only re-validation of an existing MarketDataUpload.
//
// POST /api/admin/market-data/upload/[id]/revalidate
//
// Re-runs the full validator pipeline (chunking + facts + summary/leads) on an
// upload that already exists, without forcing the member to re-upload. Used
// after validator improvements ship (e.g. the B1/B2 fixes, the upcoming
// market-agnostic refactor).
//
// Order of operations (cheap-to-expensive, fail before destroying data):
//   1. Admin auth.
//   2. Load upload. 404 if missing.
//   3. If status === 'validating', 409 — an in-flight pass owns the row and
//      re-queueing would let the serial queue run a duplicate pass.
//   4. Cost-cap precheck on the upload OWNER. If hard-blocked, 402 BEFORE we
//      delete anything — never wipe good facts we cannot rebuild.
//   5. Count existing facts (for the before/after report).
//   6. In one transaction: delete MarketFact + AggregatedMetric +
//      MarketStoryLead for this upload, and reset the upload to a clean
//      pre-validation state (status=validating, validatedAt/validationError/
//      validationCostUsd/rawValidatorOutput cleared).
//   7. Fire validateUploadAsync(id, ownerId) — the per-user serial queue runs
//      runValidation, which re-aggregates, re-seeds vocab, and rebuilds facts.
//      Cost attributes to the OWNER (not the admin) because the pipeline always
//      records AIToolUsage under the upload's userId.
//   8. Log the admin action.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { validateUploadAsync } from "@/lib/fact-validator";
import { getCostCapStatus } from "@/lib/ai-tool-cost";
import { logAdminAction } from "@/lib/admin-log";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const actor = session?.user as
    | { id?: string; email?: string; role?: string }
    | undefined;
  if (!session?.user || actor?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const upload = await prisma.marketDataUpload.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      status: true,
      label: true,
      monthYear: true,
      user: { select: { email: true, fullName: true } },
    },
  });
  if (!upload) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  if (upload.status === "validating") {
    return NextResponse.json(
      {
        error: "already_validating",
        message:
          "This upload is currently validating. Wait for it to finish before re-validating.",
      },
      { status: 409 },
    );
  }

  // Atomically CLAIM the row before doing anything destructive. A conditional
  // updateMany (only flips rows that aren't already validating) closes the
  // TOCTOU window between the status read above and the work below — two
  // concurrent admin clicks can't both proceed; the loser gets 409. From here
  // on we OWN the row (status='validating'), so every early return must restore
  // the prior status or the row would be stuck mid-validation forever.
  const claim = await prisma.marketDataUpload.updateMany({
    where: { id, status: { not: "validating" } },
    data: { status: "validating" },
  });
  if (claim.count === 0) {
    return NextResponse.json(
      {
        error: "already_validating",
        message:
          "This upload is currently validating. Wait for it to finish before re-validating.",
      },
      { status: 409 },
    );
  }

  // Cost-cap check uses the row OWNER, not the admin — an admin re-validating
  // shouldn't get past the member's own monthly cap, and we must not delete
  // the member's existing facts if we can't rebuild them. Checked AFTER the
  // claim but BEFORE any delete: on a hard block we restore the prior status
  // and return without touching the member's facts.
  const cap = await getCostCapStatus(upload.userId);
  if (cap.hardBlocked) {
    await prisma.marketDataUpload.update({
      where: { id },
      data: { status: upload.status },
    });
    return NextResponse.json(
      {
        error: "cost_cap_reached",
        message:
          "This member has reached the monthly AI processing cap. Existing facts were left untouched. Wait for the 1st or raise the cap.",
        monthSpendUsd: cap.monthSpendUsd,
        capUsd: cap.capUsd,
      },
      { status: 402 },
    );
  }

  const factsBefore = await prisma.marketFact.count({
    where: { uploadId: id },
  });

  await prisma.$transaction(async (tx) => {
    await tx.marketFact.deleteMany({ where: { uploadId: id } });
    await tx.aggregatedMetric.deleteMany({ where: { uploadId: id } });
    await tx.marketStoryLead.deleteMany({ where: { uploadId: id } });
    await tx.marketDataUpload.update({
      where: { id },
      data: {
        status: "validating",
        validatedAt: null,
        validationError: null,
        validationCostUsd: null,
        rawValidatorOutput: null,
      },
    });
  });

  // Cost attributes to the upload owner: validateUploadAsync passes
  // upload.userId into runValidation, and persistResults records AIToolUsage
  // under that userId. The admin clicking the button is never billed.
  validateUploadAsync(id, upload.userId);

  const memberLabel = upload.user?.fullName ?? upload.user?.email ?? "member";
  await logAdminAction({
    actorId: actor.id ?? "unknown",
    actorEmail: actor.email ?? "unknown",
    action: "market_upload_revalidate",
    targetType: "market_data_upload",
    targetId: id,
    details: {
      summary: `Re-validated ${memberLabel}'s ${upload.label}`,
      memberId: upload.userId,
      memberEmail: upload.user?.email ?? null,
      memberName: upload.user?.fullName ?? null,
      uploadLabel: upload.label,
      monthYear: upload.monthYear,
      factsBefore,
    },
  });

  return NextResponse.json(
    { ok: true, id, status: "validating", factsBefore },
    { status: 202 },
  );
}

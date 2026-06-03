// Wave 1 Phase 2A — member retry for failed market-data uploads.
//
// POST /api/member/market-data/upload/[id]/retry
//
// Guard rails (in this exact order — checked cheap-to-expensive):
//   1. Auth + ownership (admins bypass via requireMarketAccess).
//   2. Status must be 'failed'. We deliberately do NOT allow retrying a
//      pending/validating upload — the in-flight async pass owns that row,
//      and re-queueing would let the serial queue run a duplicate pass.
//   3. retryCount must be < 3. Past that, automated retry is almost
//      certainly going to re-hit the same wall (oversized file, bad CSV).
//   4. Member's monthly AI cap must still have room. Re-running a 200K-
//      token validator on a hard-blocked account just burns more budget
//      with no chance of success.
//
// On success: clears validationError + validationCostUsd, increments
// retryCount, flips status -> validating, fires validateUploadAsync (which
// the per-user serial queue in fact-validator.ts will schedule), and
// returns 202.

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireMarketAccess } from "@/lib/market-config-server";
import { dispatchValidation } from "@/lib/job-dispatch";
import { getCostCapStatus } from "@/lib/ai-tool-cost";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_RETRIES = 3;

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const access = await requireMarketAccess();
  if (!access.ok) return access.response;
  const { id } = await ctx.params;

  const upload = await prisma.marketDataUpload.findUnique({
    where: { id },
    select: { id: true, userId: true, status: true, retryCount: true },
  });
  if (!upload) {
    return Response.json({ error: "Upload not found" }, { status: 404 });
  }

  if (upload.userId !== access.user.id && access.user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (upload.status !== "failed") {
    return Response.json(
      {
        error: "invalid_status",
        message: "Only failed uploads can be retried.",
      },
      { status: 409 },
    );
  }

  if ((upload.retryCount ?? 0) >= MAX_RETRIES) {
    return Response.json(
      {
        error: "max_retries_reached",
        message:
          "This upload has hit the retry limit. Contact support and reference the upload ID.",
      },
      { status: 429 },
    );
  }

  // Cost-cap check uses the row owner, NOT the current session user — an
  // admin retrying on behalf of a member shouldn't get past the member's
  // own monthly cap.
  const cap = await getCostCapStatus(upload.userId);
  if (cap.hardBlocked) {
    return Response.json(
      {
        error: "cost_cap_reached",
        message:
          "This member has reached the monthly AI processing cap. Wait for the 1st or raise the cap.",
        monthSpendUsd: cap.monthSpendUsd,
        capUsd: cap.capUsd,
      },
      { status: 402 },
    );
  }

  // Atomic compare-and-set. Two concurrent retry requests would both have
  // passed the read-only guards above; this updateMany is the only thing
  // that can actually mutate the row, and the conditional where-clause
  // guarantees exactly one of them flips it from 'failed'. The loser sees
  // count===0 and gets the 409 — same response the second click would have
  // gotten on the next poll anyway.
  const txResult = await prisma.marketDataUpload.updateMany({
    where: {
      id,
      status: "failed",
      retryCount: { lt: MAX_RETRIES },
    },
    data: {
      status: "validating",
      validationError: null,
      validationCostUsd: null,
      retryCount: { increment: 1 },
    },
  });

  if (txResult.count === 0) {
    return Response.json(
      {
        error: "retry_conflict",
        message: "Another retry has already been queued for this upload.",
      },
      { status: 409 },
    );
  }

  await dispatchValidation(id, upload.userId);

  return Response.json(
    { ok: true, id, status: "validating", queuedAt: new Date().toISOString() },
    { status: 202 },
  );
}

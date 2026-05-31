// Wave 1 Phase 2A — upload status polling endpoint + delete-for-replace.
//
// GET — UploadHistoryTable polls this every 3s while any row is non-terminal.
//       Cheap query: just the upload row + two count() rollups.
// DELETE — wipes the upload row; MarketFact and MarketStoryLead cascade
//          (onDelete: Cascade on the upload relation in prisma/schema.prisma).
//          Used by the Replace UX to clear a duplicate month before re-upload.

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireMarketAccess } from "@/lib/market-config-server";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const access = await requireMarketAccess();
  if (!access.ok) return access.response;
  const { id } = await ctx.params;

  const upload = await prisma.marketDataUpload.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      label: true,
      monthYear: true,
      status: true,
      uploadedAt: true,
      validatedAt: true,
      validationCostUsd: true,
      validationError: true,
      rowCount: true,
      retryCount: true,
    },
  });
  if (!upload) return Response.json({ error: "Upload not found" }, { status: 404 });

  if (upload.userId !== access.user.id && access.user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Only run the count queries once the upload is in a terminal state — saves
  // ~2 round-trips per poll while validation is still in flight.
  let factCount = 0;
  let storyLeadCount = 0;
  if (upload.status === "validated") {
    const [f, l] = await Promise.all([
      prisma.marketFact.count({ where: { uploadId: id } }),
      prisma.marketStoryLead.count({ where: { uploadId: id } }),
    ]);
    factCount = f;
    storyLeadCount = l;
  }

  // Whether a prior AI pass left validator output on the row. Only relevant for
  // failed uploads (drives the persistence-only Regenerate copy), so we only pay
  // for the check then. `count` with a NOT-null filter returns 0/1 WITHOUT
  // loading the large rawValidatorOutput blob.
  let hasValidatorOutput = false;
  if (upload.status === "failed") {
    const n = await prisma.marketDataUpload.count({
      where: { id, NOT: { rawValidatorOutput: null } },
    });
    hasValidatorOutput = n > 0;
  }

  return Response.json({
    id: upload.id,
    label: upload.label,
    monthYear: upload.monthYear,
    status: upload.status,
    uploadedAt: upload.uploadedAt,
    validatedAt: upload.validatedAt,
    validationCostUsd: upload.validationCostUsd,
    validationError: upload.validationError,
    rowCount: upload.rowCount,
    retryCount: upload.retryCount,
    factCount,
    storyLeadCount,
    hasValidatorOutput,
  });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const access = await requireMarketAccess();
  if (!access.ok) return access.response;
  const { id } = await ctx.params;

  const upload = await prisma.marketDataUpload.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      monthYear: true,
      _count: { select: { facts: true, storyLeads: true } },
    },
  });
  if (!upload) return Response.json({ error: "Upload not found" }, { status: 404 });

  if (upload.userId !== access.user.id && access.user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const deletedFacts = upload._count.facts;
  const deletedLeads = upload._count.storyLeads;

  // MarketFact + MarketStoryLead cascade via onDelete: Cascade on their
  // upload relations (prisma/schema.prisma) — single delete is sufficient.
  await prisma.marketDataUpload.delete({ where: { id } });

  return Response.json({ ok: true, deletedFacts, deletedLeads });
}

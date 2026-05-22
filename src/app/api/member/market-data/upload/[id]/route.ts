// Wave 1 Phase 2A — upload status polling endpoint.
//
// UploadHistoryTable polls this every 3s while any row is non-terminal.
// Cheap query: just the upload row + two count() rollups.

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

  return Response.json({
    id: upload.id,
    label: upload.label,
    monthYear: upload.monthYear,
    status: upload.status,
    uploadedAt: upload.uploadedAt,
    validatedAt: upload.validatedAt,
    validationCostUsd: upload.validationCostUsd,
    validationError: upload.validationError,
    factCount,
    storyLeadCount,
  });
}

// Wave 1 Phase 2A — fire-and-forget validation kickoff.
//
// Member uploads typically auto-trigger validation from the upload route, but
// this endpoint exists so the UI (and admins) can manually re-run a failed or
// pending upload without going through a fresh upload. Always returns 202.

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireMarketAccess } from "@/lib/market-config-server";
import { validateUploadAsync } from "@/lib/fact-validator";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const access = await requireMarketAccess();
  if (!access.ok) return access.response;
  const { id } = await ctx.params;

  const upload = await prisma.marketDataUpload.findUnique({
    where: { id },
    select: { id: true, userId: true, status: true },
  });
  if (!upload) return Response.json({ error: "Upload not found" }, { status: 404 });

  // Ownership check — admins bypass via requireMarketAccess gate, but we
  // still scope the row to its owner to prevent admin accidents from
  // mutating another member's upload via a guessed id.
  if (upload.userId !== access.user.id && access.user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Already validated → nothing to do. Re-running a validating row is a no-op
  // (the existing async pass will finish or fail on its own).
  if (upload.status === "validated") {
    return Response.json(
      { id: upload.id, status: upload.status, queued: false },
      { status: 200 },
    );
  }

  await prisma.marketDataUpload.update({
    where: { id },
    data: { status: "validating", validationError: null },
  });

  validateUploadAsync(id);

  return Response.json(
    { id, status: "validating", queued: true },
    { status: 202 },
  );
}

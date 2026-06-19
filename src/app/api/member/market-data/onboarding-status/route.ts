import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";

/**
 * GET /api/member/market-data/onboarding-status
 *
 * Tiny status endpoint used by the Onboarding Wizard's Step 2 so it can poll
 * for "has the member finished uploading + validating a CSV yet?" without
 * loading the full setup page state. Returns counts so the success message
 * can show "{factCount} sales loaded. {neighbourhoodCount} neighbourhoods
 * detected."
 */
export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const [validatedUpload, latestUpload] = await Promise.all([
    prisma.marketDataUpload.findFirst({
      where: { userId: user.id, status: "validated" },
      orderBy: { validatedAt: "desc" },
      select: { id: true },
    }),
    // Most-recent upload of ANY status — lets the wizard treat "accepted /
    // queued / validating" as a non-blocking "upload received" state without
    // waiting on validation to finish.
    prisma.marketDataUpload.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: { status: true },
    }),
  ]);

  // hasAnyUpload is the non-blocking signal: the member started an upload, so
  // the wizard's Continue can light up immediately. latestStatus mirrors the
  // UploadStatus enum (pending | validating | validated | failed) or null.
  const latestStatus = latestUpload?.status ?? null;
  const hasAnyUpload = !!latestUpload;

  if (!validatedUpload) {
    return Response.json({
      hasValidatedUpload: false,
      hasAnyUpload,
      latestStatus,
    });
  }

  const [factCount, neighbourhoodCount] = await Promise.all([
    prisma.marketFact.count({ where: { uploadId: validatedUpload.id } }),
    prisma.marketFact
      .findMany({
        where: { uploadId: validatedUpload.id },
        select: { neighbourhood: true },
        distinct: ["neighbourhood"],
      })
      .then((rows) => rows.filter((r) => !!r.neighbourhood).length),
  ]);

  return Response.json({
    hasValidatedUpload: true,
    hasAnyUpload,
    latestStatus,
    factCount,
    neighbourhoodCount,
  });
}

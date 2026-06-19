import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";

/**
 * GET /api/member/onboarding/checklist
 *
 * Read-only aggregator for the dashboard "setup checklist" card. After the
 * wizard's blocking steps were made non-blocking, the slow async tails (CSV
 * validation, neighbourhood research, first idea → script → schedule) finish
 * AFTER onboarding completes — so the dashboard tracks them here instead of
 * walling them mid-wizard.
 *
 * Pure reads against existing models; touches no validator / mapper / idea
 * logic.
 */
export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const [
    profile,
    validatedUpload,
    latestUpload,
    profileCount,
    researchUploadCount,
    firstIdea,
    scriptedPlan,
    scheduledPlan,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { onboardingComplete: true, onboardingCompletedAt: true },
    }),
    prisma.marketDataUpload.count({
      where: { userId: user.id, status: "validated" },
    }),
    prisma.marketDataUpload.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: { status: true },
    }),
    prisma.neighbourhoodProfile.count({ where: { userId: user.id } }),
    prisma.neighbourhoodResearchUpload.count({ where: { userId: user.id } }),
    prisma.contentPlan.count({ where: { userId: user.id, deletedAt: null } }),
    prisma.contentPlan.count({
      where: {
        userId: user.id,
        deletedAt: null,
        NOT: { script: null },
        script: { not: "" },
      },
    }),
    prisma.contentPlan.count({
      where: {
        userId: user.id,
        deletedAt: null,
        OR: [{ publishDate: { not: null } }, { shootDate: { not: null } }],
      },
    }),
  ]);

  // Market-data state: ready once any validated upload exists; otherwise mirror
  // the latest upload's lifecycle so the card can show "Validating…".
  let marketData: "none" | "processing" | "ready" | "failed" = "none";
  if (validatedUpload > 0) {
    marketData = "ready";
  } else if (latestUpload?.status === "pending" || latestUpload?.status === "validating") {
    marketData = "processing";
  } else if (latestUpload?.status === "failed") {
    marketData = "failed";
  }

  return Response.json({
    profile: !!(profile?.onboardingComplete || profile?.onboardingCompletedAt),
    marketData,
    neighbourhood: profileCount > 0 || researchUploadCount > 0,
    firstIdea: firstIdea > 0,
    scripted: scriptedPlan > 0,
    scheduled: scheduledPlan > 0,
  });
}

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

  // Every sub-item degrades to "not done" rather than throwing. A brand-new
  // member has most of these empty, and a single query failing must never take
  // down the whole dashboard card — so we resolve each piece independently and
  // never 500 on a partial failure.
  const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await p;
    } catch (err) {
      console.error("[onboarding/checklist] sub-query failed:", err);
      return fallback;
    }
  };

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
    safe(
      prisma.user.findUnique({
        where: { id: user.id },
        select: { onboardingComplete: true, onboardingCompletedAt: true },
      }),
      null,
    ),
    safe(
      prisma.marketDataUpload.count({
        where: { userId: user.id, status: "validated" },
      }),
      0,
    ),
    safe(
      prisma.marketDataUpload.findFirst({
        where: { userId: user.id },
        orderBy: { uploadedAt: "desc" },
        // storyStatus: Wave 6a two-phase readiness. On the instant-cutover path
        // the upload is `validated` (numbers ready) while the AI story pass runs
        // separately. Parity-inert — stays `not_started` with the flag OFF.
        select: { status: true, storyStatus: true },
      }),
      null,
    ),
    safe(prisma.neighbourhoodProfile.count({ where: { userId: user.id } }), 0),
    safe(
      prisma.neighbourhoodResearchUpload.count({ where: { userId: user.id } }),
      0,
    ),
    safe(
      prisma.contentPlan.count({ where: { userId: user.id, deletedAt: null } }),
      0,
    ),
    safe(
      prisma.contentPlan.count({
        where: {
          userId: user.id,
          deletedAt: null,
          NOT: { script: null },
          script: { not: "" },
        },
      }),
      0,
    ),
    safe(
      prisma.contentPlan.count({
        where: {
          userId: user.id,
          deletedAt: null,
          OR: [{ publishDate: { not: null } }, { shootDate: { not: null } }],
        },
      }),
      0,
    ),
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

  // Wave 6a — the background AI story pass, surfaced as a calm sub-note under the
  // (already-done) "Upload your market data" step. Parity-inert: with the flag
  // OFF storyStatus stays `not_started`, which maps to "none" → no sub-note, so
  // the checklist reads exactly as before.
  let marketStories: "none" | "generating" | "ready" | "failed" = "none";
  if (latestUpload?.storyStatus === "generating") {
    marketStories = "generating";
  } else if (latestUpload?.storyStatus === "failed") {
    marketStories = "failed";
  } else if (latestUpload?.storyStatus === "ready") {
    marketStories = "ready";
  }

  return Response.json({
    profile: !!(profile?.onboardingComplete || profile?.onboardingCompletedAt),
    marketData,
    // Wave 6a — only present once the background story pass is engaged. "none"
    // (always the case with the flag OFF) is omitted so the payload stays
    // byte-identical to before (strict parity).
    ...(marketStories !== "none" ? { marketStories } : {}),
    neighbourhood: profileCount > 0 || researchUploadCount > 0,
    firstIdea: firstIdea > 0,
    scripted: scriptedPlan > 0,
    scheduled: scheduledPlan > 0,
  });
}

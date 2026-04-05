import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";

/** GET /api/admin/radar/stats — overview stats for Radar dashboard */
export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdmin(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    totalChannels,
    totalVideos,
    totalOutliers,
    newOutliersThisWeek,
    recentPipelineRun,
    hookTypeCounts,
    videoTypeCounts,
  ] = await Promise.all([
    prisma.radarChannel.count({ where: { isActive: true } }),
    prisma.radarVideo.count(),
    prisma.radarVideo.count({ where: { outlierTier: { not: null } } }),
    prisma.radarVideo.count({
      where: {
        outlierTier: { not: null },
        createdAt: { gte: sevenDaysAgo },
      },
    }),
    prisma.radarPipelineRun.findFirst({ orderBy: { startedAt: "desc" } }),
    // Most common hook type this month
    prisma.radarVideoAnalysis.groupBy({
      by: ["hookType"],
      where: { analyzedAt: { gte: thirtyDaysAgo }, hookType: { not: null } },
      _count: true,
      orderBy: { _count: { hookType: "desc" } },
      take: 5,
    }),
    // Most common video type this month
    prisma.radarVideoAnalysis.groupBy({
      by: ["videoType"],
      where: { analyzedAt: { gte: thirtyDaysAgo }, videoType: { not: null } },
      _count: true,
      orderBy: { _count: { videoType: "desc" } },
      take: 5,
    }),
  ]);

  return NextResponse.json({
    totalChannels,
    totalVideos,
    totalOutliers,
    newOutliersThisWeek,
    lastPipelineRun: recentPipelineRun,
    topHookTypes: hookTypeCounts,
    topVideoTypes: videoTypeCounts,
  });
}

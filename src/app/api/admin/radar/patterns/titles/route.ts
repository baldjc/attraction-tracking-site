import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";

/** GET /api/admin/radar/patterns/titles — title pattern library */
export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdmin(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const titleGroups = await prisma.radarVideoAnalysis.groupBy({
    by: ["titlePattern"],
    where: { titlePattern: { not: null } },
    _count: true,
    _avg: { arcScore: true },
  });

  const patterns = await Promise.all(
    titleGroups.map(async (group) => {
      const topVideos = await prisma.radarVideoAnalysis.findMany({
        where: { titlePattern: group.titlePattern },
        orderBy: { video: { outlierMultiplier: "desc" } },
        take: 5,
        include: {
          video: {
            select: {
              id: true,
              videoId: true,
              title: true,
              outlierMultiplier: true,
              viewCount: true,
              thumbnailUrl: true,
              channel: { select: { name: true } },
            },
          },
        },
      });

      const multipliers = topVideos
        .map((v) => v.video.outlierMultiplier)
        .filter((m): m is number => m !== null);
      const avgMultiplier =
        multipliers.length > 0
          ? multipliers.reduce((a, b) => a + b, 0) / multipliers.length
          : 0;

      return {
        titlePattern: group.titlePattern,
        count: group._count,
        avgArcScore: group._avg.arcScore,
        avgOutlierMultiplier: parseFloat(avgMultiplier.toFixed(2)),
        topVideos: topVideos.map((v) => v.video),
        exampleTitles: topVideos.map((v) => v.video.title).slice(0, 3),
      };
    })
  );

  patterns.sort((a, b) => b.avgOutlierMultiplier - a.avgOutlierMultiplier);

  return NextResponse.json({ patterns });
}

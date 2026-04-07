import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const outliers = await prisma.intelVideo.findMany({
    where: { isOutlier: true },
    orderBy: { outlierMultiple: "desc" },
    take: 100,
    include: {
      channel: { select: { title: true, handle: true } },
      analysis: { select: { hookType: true, titleFramework: true, whyItWorked: true, stressThemes: true } },
    },
  });

  return NextResponse.json(
    outliers.map((v) => ({
      id: v.id,
      ytVideoId: v.ytVideoId,
      title: v.title,
      thumbnailUrl: v.thumbnailUrl,
      views: v.views.toString(),
      outlierMultiple: v.outlierMultiple,
      publishedAt: v.publishedAt,
      channel: v.channel,
      analysis: v.analysis
        ? {
            hookType: v.analysis.hookType,
            titleFramework: v.analysis.titleFramework,
            whyItWorked: v.analysis.whyItWorked,
            stressThemes: (v.analysis.stressThemes as string[]) ?? [],
          }
        : null,
    }))
  );
}

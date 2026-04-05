import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";
import { RadarOutlierTier } from "@/generated/prisma/enums";

/** GET /api/admin/radar/outliers — filterable outlier video feed */
export async function GET(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdmin(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const page = parseInt(sp.get("page") ?? "1");
  const perPage = Math.min(parseInt(sp.get("perPage") ?? "25"), 100);
  const minMultiplier = parseFloat(sp.get("minMultiplier") ?? "1.5");
  const maxMultiplier = parseFloat(sp.get("maxMultiplier") ?? "999");
  const tier = sp.get("tier") as RadarOutlierTier | null;
  const videoType = sp.get("videoType");
  const hookType = sp.get("hookType");
  const channelId = sp.get("channelId");
  const hasTranscript = sp.get("hasTranscript");
  const sortBy = sp.get("sortBy") ?? "outlierMultiplier";
  const sortDir = (sp.get("sortDir") ?? "desc") as "asc" | "desc";

  const where: any = {
    outlierTier: { not: null },
    outlierMultiplier: { gte: minMultiplier, lte: maxMultiplier },
  };

  if (tier) where.outlierTier = tier;
  if (channelId) where.channelId = channelId;
  if (hasTranscript === "true") where.transcriptText = { not: null };
  if (hasTranscript === "false") where.transcriptText = null;

  // Filter by analysis fields
  if (videoType || hookType) {
    where.analysis = {};
    if (videoType) where.analysis.videoType = videoType;
    if (hookType) where.analysis.hookType = hookType;
  }

  const [videos, total] = await Promise.all([
    prisma.radarVideo.findMany({
      where,
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        channel: { select: { id: true, name: true, handle: true, subscriberCount: true } },
        analysis: {
          select: {
            hookType: true,
            videoType: true,
            dataPointCount: true,
            arcScore: true,
            outlierHypothesis: true,
          },
        },
      },
    }),
    prisma.radarVideo.count({ where }),
  ]);

  return NextResponse.json({
    videos,
    total,
    page,
    perPage,
    totalPages: Math.ceil(total / perPage),
  });
}

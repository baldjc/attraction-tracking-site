import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { parsePeriod, pct } from "@/lib/analytics-utils";

export async function GET(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const session = await auth();
  const isAdmin = (session?.user as { role?: string })?.role === "admin";

  const sp = req.nextUrl.searchParams;
  const p = parsePeriod(sp.get("period") ?? "30d", sp.get("from"), sp.get("to"));
  const campaignId = sp.get("campaignId") ?? "all";
  const sourceType = sp.get("sourceType") ?? "all";
  const linkId = sp.get("linkId") ?? "all";

  const links = await prisma.trackingLink.findMany({
    where: {
      deletedAt: null,
      youtubeVideoUrl: { not: null },
      ...(linkId !== "all" ? { id: linkId } : {}),
      campaign: {
        deletedAt: null,
        ...(isAdmin ? {} : { userId: user.id }),
        ...(campaignId !== "all" ? { id: campaignId } : {}),
        ...(sourceType !== "all" ? { sourceType: sourceType as "YOUTUBE" | "GOOGLE_ADS" | "EMAIL" | "OTHER" } : {}),
      },
    },
    select: {
      id: true,
      name: true,
      youtubeVideoUrl: true,
      youtubeThumbnailUrl: true,
      youtubeViewCount: true,
      campaign: { select: { id: true, name: true } },
      clicks: {
        where: { timestamp: { gte: p.periodStart, lte: p.periodEnd } },
        select: { id: true, lead: { select: { id: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows = links.map((l) => {
    const totalClicks = l.clicks.length;
    const totalLeads = l.clicks.filter((c) => c.lead).length;
    const conversionRate = pct(totalLeads, totalClicks);
    const views = l.youtubeViewCount ?? 0;
    const clickThroughRate = views > 0 ? parseFloat(((totalClicks / views) * 100).toFixed(2)) : 0;
    return {
      id: l.id,
      name: l.name,
      youtubeVideoUrl: l.youtubeVideoUrl,
      youtubeThumbnailUrl: l.youtubeThumbnailUrl,
      youtubeViewCount: views,
      campaignId: l.campaign.id,
      campaignName: l.campaign.name,
      totalClicks,
      totalLeads,
      conversionRate,
      clickThroughRate,
    };
  });

  return NextResponse.json(rows);
}

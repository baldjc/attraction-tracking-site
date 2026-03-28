import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { parsePeriod, pct } from "@/lib/analytics-utils";

export async function GET(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const p = parsePeriod(sp.get("period") ?? "30d", sp.get("from"), sp.get("to"));
  const sourceType = sp.get("sourceType") ?? "all";
  const campaignId = sp.get("campaignId") ?? "all";
  const linkId = sp.get("linkId") ?? "all";

  const campaigns = await prisma.campaign.findMany({
    where: {
      deletedAt: null,
      userId: user.id,
      ...(campaignId !== "all" ? { id: campaignId } : {}),
      ...(sourceType !== "all" ? { sourceType: sourceType as "YOUTUBE" | "GOOGLE_ADS" | "EMAIL" | "OTHER" } : {}),
    },
    select: {
      id: true,
      name: true,
      destinationUrl: true,
      sourceType: true,
      links: {
        where: { deletedAt: null, ...(linkId !== "all" ? { id: linkId } : {}) },
        select: {
          id: true,
          name: true,
          youtubeThumbnailUrl: true,
          youtubeViewCount: true,
          clicks: {
            where: { timestamp: { gte: p.periodStart, lte: p.periodEnd } },
            select: { id: true, lead: { select: { id: true } } },
          },
        },
      },
    },
  });

  const rows = campaigns.map((c) => {
    const totalViews = c.links.reduce((s, l) => s + (l.youtubeViewCount ?? 0), 0);
    const allClicks = c.links.flatMap((l) => l.clicks);
    const totalClicks = allClicks.length;
    const totalLeads = allClicks.filter((cl) => cl.lead).length;
    const conversionRate = pct(totalLeads, totalClicks);

    let bestVideo: { name: string; leads: number; thumbnail: string | null } | null = null;
    for (const link of c.links) {
      const leads = link.clicks.filter((cl) => cl.lead).length;
      if (!bestVideo || leads > bestVideo.leads) {
        bestVideo = { name: link.name, leads, thumbnail: link.youtubeThumbnailUrl ?? null };
      }
    }
    if (bestVideo?.leads === 0) bestVideo = null;

    return {
      id: c.id,
      name: c.name,
      destinationUrl: c.destinationUrl,
      sourceType: c.sourceType,
      totalViews,
      totalClicks,
      totalLeads,
      conversionRate,
      bestVideo,
    };
  });

  return NextResponse.json(rows);
}

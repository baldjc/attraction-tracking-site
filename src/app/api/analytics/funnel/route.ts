import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { parsePeriod } from "@/lib/analytics-utils";

export async function GET(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const p = parsePeriod(sp.get("period") ?? "30d", sp.get("from"), sp.get("to"));
  const campaignId = sp.get("campaignId") ?? "all";
  const sourceType = sp.get("sourceType") ?? "all";
  const linkId = sp.get("linkId") ?? "all";

  const campaigns = await prisma.campaign.findMany({
    where: {
      deletedAt: null,
      userId: user.id,
      ...(campaignId !== "all" ? { id: campaignId } : {}),
      ...(sourceType !== "all" ? { sourceType: sourceType as "YOUTUBE" | "GOOGLE_ADS" | "EMAIL" | "OTHER" } : {}),
    },
    select: { id: true },
  });
  const ids = campaigns.map((c) => c.id);

  if (!ids.length) return NextResponse.json({ views: 0, clicks: 0, leads: 0, viewToClickRate: 0, clickToLeadRate: 0 });

  const linkWhere = { campaignId: { in: ids }, deletedAt: null, ...(linkId !== "all" ? { id: linkId } : {}) };

  const [clicks, links] = await Promise.all([
    prisma.click.findMany({
      where: { timestamp: { gte: p.periodStart, lte: p.periodEnd }, link: linkWhere },
      select: { id: true, lead: { select: { id: true } } },
    }),
    prisma.trackingLink.findMany({
      where: linkWhere,
      select: { youtubeViewCount: true },
    }),
  ]);

  const views = links.reduce((s, l) => s + (l.youtubeViewCount ?? 0), 0);
  const totalClicks = clicks.length;
  const totalLeads = clicks.filter((c) => c.lead).length;
  const viewToClickRate = views > 0 ? parseFloat(((totalClicks / views) * 100).toFixed(2)) : 0;
  const clickToLeadRate = totalClicks > 0 ? parseFloat(((totalLeads / totalClicks) * 100).toFixed(1)) : 0;

  return NextResponse.json({ views, clicks: totalClicks, leads: totalLeads, viewToClickRate, clickToLeadRate });
}

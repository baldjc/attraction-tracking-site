import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { parsePeriod, toLocalDateStr, fillLocalDays, pct, delta } from "@/lib/analytics-utils";

export async function GET(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const session = await auth();
  const isAdmin = (session?.user as { role?: string })?.role === "admin";

  const sp = req.nextUrl.searchParams;
  const period = sp.get("period") ?? "30d";
  const campaignId = sp.get("campaignId") ?? "all";
  const sourceType = sp.get("sourceType") ?? "all";
  const tzOffset = parseInt(sp.get("tzOffset") ?? "0");
  const p = parsePeriod(period, sp.get("from"), sp.get("to"));

  const campaignWhere = {
    deletedAt: null,
    ...(isAdmin ? {} : { userId: user.id }),
    ...(campaignId !== "all" ? { id: campaignId } : {}),
    ...(sourceType !== "all" ? { sourceType: sourceType as "YOUTUBE" | "GOOGLE_ADS" | "EMAIL" | "OTHER" } : {}),
  };

  const campaigns = await prisma.campaign.findMany({
    where: campaignWhere,
    select: { id: true },
  });
  const ids = campaigns.map((c) => c.id);

  if (!ids.length) {
    return NextResponse.json({ totalViews: 0, totalClicks: 0, totalLeads: 0, convRate: 0, viewsDelta: 0, clicksDelta: 0, leadsDelta: 0, convRateDelta: 0, prevClicks: 0, prevLeads: 0, sparkline: [], leadsSparkline: [] });
  }

  const linkWhere = { campaignId: { in: ids }, deletedAt: null };

  const [currentClicks, prevClicks, links] = await Promise.all([
    prisma.click.findMany({
      where: { timestamp: { gte: p.periodStart, lte: p.periodEnd }, link: linkWhere },
      select: { id: true, timestamp: true, lead: { select: { id: true } } },
    }),
    prisma.click.findMany({
      where: { timestamp: { gte: p.prevStart, lt: p.periodStart }, link: linkWhere },
      select: { id: true, lead: { select: { id: true } } },
    }),
    prisma.trackingLink.findMany({
      where: linkWhere,
      select: { youtubeViewCount: true },
    }),
  ]);

  const totalViews = links.reduce((s, l) => s + (l.youtubeViewCount ?? 0), 0);
  const totalClicks = currentClicks.length;
  const totalLeads = currentClicks.filter((c) => c.lead).length;
  const convRate = pct(totalLeads, totalClicks);

  const prevTotalClicks = prevClicks.length;
  const prevTotalLeads = prevClicks.filter((c) => c.lead).length;
  const prevConvRate = pct(prevTotalLeads, prevTotalClicks);

  // Sparklines — last 30 days of clicks & leads
  const spark30Start = new Date(Date.now() - 30 * 86400000);
  const sparkDays = fillLocalDays(spark30Start, new Date(), tzOffset);
  const sparkClickMap = new Map(sparkDays.map((d) => [d, 0]));
  const sparkLeadMap = new Map(sparkDays.map((d) => [d, 0]));

  const sparkSource = period === "30d" ? currentClicks : await prisma.click.findMany({
    where: { timestamp: { gte: spark30Start }, link: linkWhere },
    select: { id: true, timestamp: true, lead: { select: { id: true } } },
  });

  for (const c of sparkSource) {
    const d = toLocalDateStr(c.timestamp, tzOffset);
    if (sparkClickMap.has(d)) sparkClickMap.set(d, (sparkClickMap.get(d) ?? 0) + 1);
    if (c.lead && sparkLeadMap.has(d)) sparkLeadMap.set(d, (sparkLeadMap.get(d) ?? 0) + 1);
  }

  const sparkline = Array.from(sparkClickMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, clicks]) => ({ date, clicks }));
  const leadsSparkline = Array.from(sparkLeadMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, leads]) => ({ date, leads }));

  return NextResponse.json({
    totalViews,
    totalClicks,
    totalLeads,
    convRate,
    prevClicks: prevTotalClicks,
    prevLeads: prevTotalLeads,
    prevConvRate,
    viewsDelta: 0,
    clicksDelta: delta(totalClicks, prevTotalClicks),
    leadsDelta: delta(totalLeads, prevTotalLeads),
    convRateDelta: convRate - prevConvRate,
    sparkline,
    leadsSparkline,
  });
}

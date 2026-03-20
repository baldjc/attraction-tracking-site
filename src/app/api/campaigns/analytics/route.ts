import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fillDays(start: Date, end: Date): string[] {
  const days: string[] = [];
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(23, 59, 59, 999);
  while (cur <= endDay) {
    days.push(toDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function getPeriodStart(period: string): Date {
  const now = new Date();
  if (period === "7d") { const d = new Date(now); d.setDate(d.getDate() - 7); return d; }
  if (period === "30d") { const d = new Date(now); d.setDate(d.getDate() - 30); return d; }
  if (period === "90d") { const d = new Date(now); d.setDate(d.getDate() - 90); return d; }
  return new Date(0); // all time
}

export async function GET(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await auth();
  const isAdmin = (session?.user as { role?: string })?.role === "admin";

  const period = req.nextUrl.searchParams.get("period") ?? "30d";
  const now = new Date();
  const periodStart = getPeriodStart(period);
  const periodDays = period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 90 : 30;
  const prevStart = new Date(periodStart);
  prevStart.setDate(prevStart.getDate() - periodDays);

  const campaigns = await prisma.campaign.findMany({
    where: { deletedAt: null, ...(isAdmin ? {} : { userId: user.id }) },
    select: { id: true },
  });
  const campaignIds = campaigns.map((c) => c.id);

  if (campaignIds.length === 0) {
    return NextResponse.json({ daily: [], totalClicks: 0, totalLeads: 0, conversionRate: 0, previousConversionRate: 0, sparkline: [], topLink: null });
  }

  const [clicks, prevClicks, topLinkData] = await Promise.all([
    prisma.click.findMany({
      where: {
        timestamp: { gte: periodStart, lte: now },
        link: { campaignId: { in: campaignIds }, deletedAt: null },
      },
      select: { id: true, timestamp: true, lead: { select: { id: true } } },
    }),
    prisma.click.findMany({
      where: {
        timestamp: { gte: prevStart, lt: periodStart },
        link: { campaignId: { in: campaignIds }, deletedAt: null },
      },
      select: { id: true, lead: { select: { id: true } } },
    }),
    prisma.trackingLink.findMany({
      where: { campaignId: { in: campaignIds }, deletedAt: null },
      select: {
        id: true, name: true,
        campaign: { select: { name: true } },
        clicks: {
          where: { timestamp: { gte: new Date(now.getTime() - 30 * 86400000) } },
          select: { lead: { select: { id: true } } },
        },
      },
    }),
  ]);

  // Build daily map
  const days = period !== "all" ? fillDays(periodStart, now) : [];
  const dailyMap = new Map<string, { clicks: number; leads: number }>();
  for (const d of days) dailyMap.set(d, { clicks: 0, leads: 0 });

  for (const click of clicks) {
    const d = toDateStr(click.timestamp);
    const entry = dailyMap.get(d) ?? { clicks: 0, leads: 0 };
    entry.clicks++;
    if (click.lead) entry.leads++;
    dailyMap.set(d, entry);
  }

  const daily = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({ date, ...data }));

  // Sparkline: always last 30 days
  const spark30Start = new Date(now.getTime() - 30 * 86400000);
  const sparkDays = fillDays(spark30Start, now);
  const sparkMap = new Map<string, number>(sparkDays.map((d) => [d, 0]));
  const sparkSource = period === "30d" ? clicks : await prisma.click.findMany({
    where: { timestamp: { gte: spark30Start }, link: { campaignId: { in: campaignIds }, deletedAt: null } },
    select: { timestamp: true },
  });
  for (const c of sparkSource) {
    const d = toDateStr(c.timestamp);
    if (sparkMap.has(d)) sparkMap.set(d, (sparkMap.get(d) ?? 0) + 1);
  }
  const sparkline = Array.from(sparkMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, clicks]) => ({ date, clicks }));
  const leadsSparkline = new Map<string, number>(sparkDays.map((d) => [d, 0]));
  for (const c of sparkSource) {
    const cc = c as typeof clicks[number];
    if ("lead" in cc && cc.lead) {
      const d = toDateStr(cc.timestamp);
      if (leadsSparkline.has(d)) leadsSparkline.set(d, (leadsSparkline.get(d) ?? 0) + 1);
    }
  }
  const leadsSparklineArr = Array.from(leadsSparkline.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, leads]) => ({ date, leads }));

  const totalClicks = clicks.length;
  const totalLeads = clicks.filter((c) => c.lead).length;
  const conversionRate = totalClicks > 0 ? Math.round((totalLeads / totalClicks) * 100) : 0;
  const prevTotalClicks = prevClicks.length;
  const prevTotalLeads = prevClicks.filter((c) => c.lead).length;
  const previousConversionRate = prevTotalClicks > 0 ? Math.round((prevTotalLeads / prevTotalClicks) * 100) : 0;

  let topLink: { name: string; campaignName: string; leads: number } | null = null as { name: string; campaignName: string; leads: number } | null;
  for (const link of topLinkData) {
    const leads = link.clicks.filter((c) => c.lead).length;
    if (!topLink || leads > topLink.leads) {
      topLink = { name: link.name, campaignName: link.campaign.name, leads };
    }
  }
  if (topLink?.leads === 0) topLink = null;

  return NextResponse.json({ daily, totalClicks, totalLeads, conversionRate, previousConversionRate, sparkline, leadsSparkline: leadsSparklineArr, topLink });
}

import { NextRequest, NextResponse } from "next/server";
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
  return new Date(0);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const campaign = await prisma.campaign.findFirst({
    where: { id, userId: user.id, deletedAt: null },
    include: {
      links: {
        where: { deletedAt: null },
        select: { id: true, name: true, source: true, youtubeViewCount: true, youtubeVideoId: true },
      },
    },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const period = req.nextUrl.searchParams.get("period") ?? "30d";
  const sourceFilter = req.nextUrl.searchParams.get("source") ?? "all";
  const now = new Date();
  const periodStart = getPeriodStart(period);

  const filteredLinks = sourceFilter === "all"
    ? campaign.links
    : campaign.links.filter((l) => l.source === sourceFilter);

  const linkIds = filteredLinks.map((l) => l.id);

  const clicks = await prisma.click.findMany({
    where: {
      timestamp: { gte: periodStart, lte: now },
      trackingLinkId: { in: linkIds },
    },
    select: { id: true, timestamp: true, trackingLinkId: true, lead: { select: { id: true } } },
  });

  // Daily aggregation
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

  // Per-link breakdown
  const byLink = filteredLinks.map((link) => {
    const linkClicks = clicks.filter((c) => c.trackingLinkId === link.id);
    const linkLeads = linkClicks.filter((c) => c.lead).length;
    return {
      linkId: link.id,
      name: link.name,
      source: link.source,
      clicks: linkClicks.length,
      leads: linkLeads,
      youtubeViews: link.youtubeVideoId ? link.youtubeViewCount : null,
    };
  }).sort((a, b) => b.clicks - a.clicks);

  return NextResponse.json({ daily, byLink });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { parsePeriod, toLocalDateStr, toLocalHourKey, fillLocalDays } from "@/lib/analytics-utils";

function isoWeekStart(d: Date, tzOffset: number): string {
  // Work in local-time space: shift to local, find Monday, return date string
  const local = new Date(d.getTime() - tzOffset * 60000);
  const day = local.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const mon = new Date(local);
  mon.setUTCDate(mon.getUTCDate() + diff);
  return mon.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const session = await auth();
  const isAdmin = (session?.user as { role?: string })?.role === "admin";

  const sp = req.nextUrl.searchParams;
  const p = parsePeriod(sp.get("period") ?? "30d", sp.get("from"), sp.get("to"));
  const granularity = sp.get("granularity") ?? "daily";
  const campaignId = sp.get("campaignId") ?? "all";
  const sourceType = sp.get("sourceType") ?? "all";
  const tzOffset = parseInt(sp.get("tzOffset") ?? "0"); // minutes from getTimezoneOffset()
  const linkId = sp.get("linkId") ?? "all";

  const campaigns = await prisma.campaign.findMany({
    where: {
      deletedAt: null,
      ...(isAdmin ? {} : { userId: user.id }),
      ...(campaignId !== "all" ? { id: campaignId } : {}),
      ...(sourceType !== "all" ? { sourceType: sourceType as "YOUTUBE" | "GOOGLE_ADS" | "EMAIL" | "OTHER" } : {}),
    },
    select: { id: true },
  });
  const ids = campaigns.map((c) => c.id);

  if (!ids.length) return NextResponse.json({ daily: [] });

  const clicks = await prisma.click.findMany({
    where: {
      timestamp: { gte: p.periodStart, lte: p.periodEnd },
      link: { campaignId: { in: ids }, deletedAt: null, ...(linkId !== "all" ? { id: linkId } : {}) },
    },
    select: { timestamp: true, lead: { select: { id: true } } },
  });

  if (granularity === "hourly") {
    const hourMap = new Map<string, { clicks: number; leads: number }>();
    for (const c of clicks) {
      const h = toLocalHourKey(c.timestamp, tzOffset);
      const e = hourMap.get(h) ?? { clicks: 0, leads: 0 };
      e.clicks++;
      if (c.lead) e.leads++;
      hourMap.set(h, e);
    }
    // Fill all local hours in the period
    const localStart = new Date(p.periodStart.getTime() - tzOffset * 60000);
    localStart.setUTCMinutes(0, 0, 0);
    const localEnd = new Date(p.periodEnd.getTime() - tzOffset * 60000);
    const hourKeys: string[] = [];
    const cur = new Date(localStart.getTime());
    while (cur <= localEnd) {
      hourKeys.push(cur.toISOString().slice(0, 13));
      cur.setUTCHours(cur.getUTCHours() + 1);
    }
    const daily = hourKeys.map((h) => ({ date: h, ...(hourMap.get(h) ?? { clicks: 0, leads: 0 }) }));
    return NextResponse.json({ daily });
  }

  if (granularity === "weekly") {
    const weekMap = new Map<string, { clicks: number; leads: number }>();
    for (const c of clicks) {
      const wk = isoWeekStart(c.timestamp, tzOffset);
      const e = weekMap.get(wk) ?? { clicks: 0, leads: 0 };
      e.clicks++;
      if (c.lead) e.leads++;
      weekMap.set(wk, e);
    }
    const daily = Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));
    return NextResponse.json({ daily });
  }

  // Daily (default)
  const days = fillLocalDays(p.periodStart, p.periodEnd, tzOffset);
  const dayMap = new Map(days.map((d) => [d, { clicks: 0, leads: 0 }]));
  for (const c of clicks) {
    const d = toLocalDateStr(c.timestamp, tzOffset);
    const e = dayMap.get(d) ?? { clicks: 0, leads: 0 };
    e.clicks++;
    if (c.lead) e.leads++;
    dayMap.set(d, e);
  }
  const daily = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({ date, ...data }));

  return NextResponse.json({ daily });
}

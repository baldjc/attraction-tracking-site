import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { parsePeriod, countryFlag } from "@/lib/analytics-utils";

export async function GET(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const session = await auth();
  const isAdmin = (session?.user as { role?: string })?.role === "admin";

  const sp = req.nextUrl.searchParams;
  const p = parsePeriod(sp.get("period") ?? "30d", sp.get("from"), sp.get("to"));
  const campaignId = sp.get("campaignId") ?? "all";
  const sourceType = sp.get("sourceType") ?? "all";

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

  if (!ids.length) return NextResponse.json([]);

  const leads = await prisma.lead.findMany({
    where: {
      timestamp: { gte: p.periodStart, lte: p.periodEnd },
      click: { link: { campaignId: { in: ids }, deletedAt: null } },
    },
    select: {
      click: { select: { city: true, province: true, country: true, countryCode: true } },
    },
  });

  const locationMap = new Map<string, { city: string | null; province: string | null; country: string | null; countryCode: string | null; leads: number }>();

  for (const lead of leads) {
    const { city, province, country, countryCode } = lead.click;
    const key = [city ?? "", province ?? "", country ?? ""].join("|");
    const e = locationMap.get(key) ?? { city, province, country, countryCode, leads: 0 };
    e.leads++;
    locationMap.set(key, e);
  }

  const rows = Array.from(locationMap.values())
    .sort((a, b) => b.leads - a.leads)
    .map((r) => ({
      city: r.city,
      province: r.province,
      country: r.country,
      countryCode: r.countryCode,
      flag: countryFlag(r.countryCode),
      leads: r.leads,
    }));

  return NextResponse.json(rows);
}

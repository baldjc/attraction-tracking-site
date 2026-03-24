import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await auth();
  const isAdmin = (session?.user as { role?: string })?.role === "admin";

  const campaign = await prisma.campaign.findFirst({
    where: { id, deletedAt: null, ...(isAdmin ? {} : { userId: user.id }) },
    include: {
      links: { where: { deletedAt: null }, select: { id: true, name: true } },
    },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const linkIdParam = req.nextUrl.searchParams.get("linkId");
  const isEmail = campaign.sourceType === "EMAIL_NEWSLETTER";

  const linkIds = linkIdParam
    ? campaign.links.filter((l) => l.id === linkIdParam).map((l) => l.id)
    : campaign.links.map((l) => l.id);

  const clicks = await prisma.click.findMany({
    where: {
      trackingLinkId: { in: linkIds },
      city: { not: null },
    },
    select: {
      id: true,
      ipAddress: true,
      city: true,
      province: true,
      country: true,
      timestamp: true,
    },
    orderBy: { timestamp: "desc" },
  });

  if (isEmail) {
    // Unique clicks: one per distinct IP (most recent)
    const seen = new Map<string, typeof clicks[0]>();
    for (const c of clicks) {
      const key = c.ipAddress ?? c.id;
      if (!seen.has(key)) seen.set(key, c);
    }
    const unique = Array.from(seen.values());

    // Group by location for table
    const locationMap = new Map<
      string,
      { city: string; province: string | null; country: string | null; neighbourhood: string | null; count: number }
    >();
    for (const c of unique) {
      const key = `${c.city}|${c.province ?? ""}|${c.country ?? ""}`;
      const existing = locationMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        locationMap.set(key, {
          city: c.city!,
          province: c.province,
          country: c.country,
          neighbourhood: null,
          count: 1,
        });
      }
    }

    const locations = Array.from(locationMap.values()).sort((a, b) => b.count - a.count);
    const markers = locations.map((l) => ({ city: l.city, province: l.province, country: l.country, count: l.count }));

    return NextResponse.json({ locations, markers, isEmail: true, links: campaign.links });
  } else {
    // All clicks grouped by location
    const locationMap = new Map<
      string,
      { city: string; province: string | null; country: string | null; neighbourhood: string | null; count: number }
    >();
    for (const c of clicks) {
      const key = `${c.city}|${c.province ?? ""}|${c.country ?? ""}`;
      const existing = locationMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        locationMap.set(key, {
          city: c.city!,
          province: c.province,
          country: c.country,
          neighbourhood: null,
          count: 1,
        });
      }
    }

    const locations = Array.from(locationMap.values()).sort((a, b) => b.count - a.count);
    const markers = locations.map((l) => ({ city: l.city, province: l.province, country: l.country, count: l.count }));

    return NextResponse.json({ locations, markers, isEmail: false, links: campaign.links });
  }
}

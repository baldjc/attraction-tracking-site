import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { normalizeUrl } from "@/lib/tracking-utils";

export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await auth();
  const isAdmin = (session?.user as { role?: string })?.role === "admin";

  const campaigns = await prisma.campaign.findMany({
    where: {
      userId: user.id,
      deletedAt: null,
      name: { not: "__test_installation__" },
    },
    include: {
      links: {
        where: { deletedAt: null },
        include: {
          clicks: {
            include: { lead: true },
          },
        },
      },
      user: { select: { fullName: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const result = campaigns.map((c) => {
    const allClicks = c.links.flatMap((l) => l.clicks);
    const totalClicks = allClicks.length;
    const totalLeads = allClicks.filter((cl) => cl.lead).length;
    const uniqueIps = new Set(allClicks.map((cl) => cl.ipAddress).filter(Boolean));
    const totalUniqueClicks = uniqueIps.size;
    const totalViews = c.links.reduce((sum, l) => sum + l.youtubeViewCount, 0);
    const hasYoutube = c.links.some((l) => l.youtubeVideoId);
    return {
      id: c.id,
      name: c.name,
      destinationUrl: c.destinationUrl,
      leadMagnetUrl: c.leadMagnetUrl ?? null,
      sourceType: c.sourceType,
      createdAt: c.createdAt,
      totalClicks,
      totalLeads,
      totalUniqueClicks,
      totalViews: hasYoutube ? totalViews : null,
      conversionRate: totalClicks > 0 ? Math.round((totalLeads / totalClicks) * 100) : 0,
      linkCount: c.links.length,
      member: isAdmin ? c.user : undefined,
      isOwn: c.userId === user.id,
    };
  });

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, destinationUrl, leadMagnetUrl, sourceType } = await req.json();
  if (!name || !destinationUrl) {
    return NextResponse.json({ error: "name and destinationUrl are required" }, { status: 400 });
  }

  try {
    const campaign = await prisma.campaign.create({
      data: {
        userId: user.id,
        name,
        destinationUrl: normalizeUrl(destinationUrl),
        leadMagnetUrl: leadMagnetUrl || null,
        sourceType: sourceType ?? "YOUTUBE",
      },
    });
    return NextResponse.json(campaign, { status: 201 });
  } catch (err) {
    console.error("[campaigns POST] DB error:", err);
    return NextResponse.json({ error: "Failed to create campaign. Please try again." }, { status: 500 });
  }
}

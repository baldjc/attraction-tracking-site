import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

async function getCampaignForUser(id: string, userId: string, isAdmin: boolean) {
  return prisma.campaign.findFirst({
    where: {
      id,
      deletedAt: null,
      ...(isAdmin ? {} : { userId }),
    },
  });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await auth();
  const isAdmin = (session?.user as { role?: string })?.role === "admin";

  const campaign = await prisma.campaign.findFirst({
    where: { id, deletedAt: null, ...(isAdmin ? {} : { userId: user.id }) },
    include: {
      links: {
        where: { deletedAt: null },
        include: {
          clicks: {
            include: { lead: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      user: { select: { fullName: true, email: true } },
    },
  });

  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const links = campaign.links.map((l) => {
    const clicks = l.clicks.length;
    const leads = l.clicks.filter((c) => c.lead).length;
    return {
      id: l.id,
      name: l.name,
      refCode: l.refCode,
      youtubeVideoUrl: l.youtubeVideoUrl,
      youtubeVideoId: l.youtubeVideoId,
      youtubeThumbnailUrl: l.youtubeThumbnailUrl,
      youtubeViewCount: l.youtubeViewCount,
      youtubeViewsUpdatedAt: l.youtubeViewsUpdatedAt,
      createdAt: l.createdAt,
      trackedUrl: `${campaign.destinationUrl}${campaign.destinationUrl.includes("?") ? "&" : "?"}ref=${l.refCode}`,
      clicks,
      leads,
      conversionRate: clicks > 0 ? Math.round((leads / clicks) * 100) : 0,
    };
  });

  const allClicks = campaign.links.flatMap((l) => l.clicks);
  const totalViews = campaign.links.reduce((sum, l) => sum + l.youtubeViewCount, 0);
  const hasYoutube = campaign.links.some((l) => l.youtubeVideoId);

  return NextResponse.json({
    id: campaign.id,
    name: campaign.name,
    destinationUrl: campaign.destinationUrl,
    sourceType: campaign.sourceType,
    createdAt: campaign.createdAt,
    member: isAdmin ? campaign.user : undefined,
    links,
    totalViews: hasYoutube ? totalViews : null,
    totalClicks: allClicks.length,
    totalLeads: allClicks.filter((c) => c.lead).length,
    hasYoutube,
    lastViewsUpdate: campaign.links.find((l) => l.youtubeViewsUpdatedAt)?.youtubeViewsUpdatedAt ?? null,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await auth();
  const isAdmin = (session?.user as { role?: string })?.role === "admin";

  const campaign = await getCampaignForUser(id, user.id, isAdmin);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { name, destinationUrl, sourceType } = await req.json();
  const updated = await prisma.campaign.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(destinationUrl && { destinationUrl }),
      ...(sourceType && { sourceType }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await auth();
  const isAdmin = (session?.user as { role?: string })?.role === "admin";

  const campaign = await getCampaignForUser(id, user.id, isAdmin);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.campaign.update({ where: { id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ success: true });
}

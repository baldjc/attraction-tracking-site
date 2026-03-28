import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { normalizeUrl } from "@/lib/tracking-utils";

async function getCampaignForUser(id: string, userId: string) {
  return prisma.campaign.findFirst({
    where: { id, userId, deletedAt: null },
  });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await auth();
  const isAdmin = (session?.user as { role?: string })?.role === "admin";

  const campaign = await prisma.campaign.findFirst({
    where: { id, userId: user.id, deletedAt: null },
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
      source: l.source,
      destinationOverride: l.destinationOverride,
      refCode: l.refCode,
      youtubeVideoUrl: l.youtubeVideoUrl,
      youtubeVideoId: l.youtubeVideoId,
      youtubeThumbnailUrl: l.youtubeThumbnailUrl,
      youtubeViewCount: l.youtubeViewCount,
      youtubeViewsUpdatedAt: l.youtubeViewsUpdatedAt,
      createdAt: l.createdAt,
      trackedUrl: (() => {
        const destBase = (l.destinationOverride === "lead_magnet" && campaign.leadMagnetUrl)
          ? normalizeUrl(campaign.leadMagnetUrl)
          : normalizeUrl(campaign.destinationUrl);
        return `${destBase}${destBase.includes("?") ? "&" : "?"}ref=${l.refCode}`;
      })(),
      clicks,
      leads,
      conversionRate: clicks > 0 ? Math.round((leads / clicks) * 100) : 0,
    };
  });

  const allClicks = campaign.links.flatMap((l) => l.clicks);
  const totalViews = campaign.links.reduce((sum, l) => sum + l.youtubeViewCount, 0);
  const hasYoutube = campaign.links.some((l) => l.youtubeVideoId);
  const uniqueIps = new Set(allClicks.map((c) => c.ipAddress).filter(Boolean));
  const totalUniqueClicks = uniqueIps.size;

  return NextResponse.json({
    id: campaign.id,
    name: campaign.name,
    destinationUrl: campaign.destinationUrl,
    leadMagnetUrl: campaign.leadMagnetUrl ?? null,
    sourceType: campaign.sourceType,
    createdAt: campaign.createdAt,
    member: isAdmin ? campaign.user : undefined,
    links,
    totalViews: hasYoutube ? totalViews : null,
    totalClicks: allClicks.length,
    totalLeads: allClicks.filter((c) => c.lead).length,
    totalUniqueClicks,
    hasYoutube,
    lastViewsUpdate: campaign.links.find((l) => l.youtubeViewsUpdatedAt)?.youtubeViewsUpdatedAt ?? null,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const campaign = await getCampaignForUser(id, user.id);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { name, destinationUrl, leadMagnetUrl, sourceType } = await req.json();
  try {
    const updated = await prisma.campaign.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(destinationUrl && { destinationUrl: normalizeUrl(destinationUrl) }),
        ...(leadMagnetUrl !== undefined && { leadMagnetUrl: leadMagnetUrl || null }),
        ...(sourceType && { sourceType }),
      },
    });
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[campaigns PATCH] DB error:", err);
    return NextResponse.json({ error: "Failed to save changes. Please try again." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const campaign = await getCampaignForUser(id, user.id);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date();
  await prisma.trackingLink.updateMany({ where: { campaignId: id, deletedAt: null }, data: { deletedAt: now } });
  await prisma.campaign.update({ where: { id }, data: { deletedAt: now } });
  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { generateUniqueRefCode, extractYoutubeVideoId, buildTrackedUrl } from "@/lib/tracking-utils";
import { fetchSingleTrackingVideoInfo } from "@/lib/youtube";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await auth();
  const isAdmin = (session?.user as { role?: string })?.role === "admin";

  const campaign = await prisma.campaign.findFirst({
    where: { id, deletedAt: null, ...(isAdmin ? {} : { userId: user.id }) },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const links = await prisma.trackingLink.findMany({
    where: { campaignId: id, deletedAt: null },
    include: { clicks: { include: { lead: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    links.map((l) => {
      const clicks = l.clicks.length;
      const leads = l.clicks.filter((c) => c.lead).length;
      return {
        id: l.id,
        name: l.name,
        channel: l.channel ?? null,
        refCode: l.refCode,
        trackedUrl: buildTrackedUrl(campaign.destinationUrl, l.refCode),
        youtubeVideoUrl: l.youtubeVideoUrl,
        youtubeVideoId: l.youtubeVideoId,
        youtubeThumbnailUrl: l.youtubeThumbnailUrl,
        youtubeViewCount: l.youtubeViewCount,
        youtubeViewsUpdatedAt: l.youtubeViewsUpdatedAt,
        createdAt: l.createdAt,
        clicks,
        leads,
        conversionRate: clicks > 0 ? Math.round((leads / clicks) * 100) : 0,
      };
    })
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await auth();
  const isAdmin = (session?.user as { role?: string })?.role === "admin";

  const campaign = await prisma.campaign.findFirst({
    where: { id, deletedAt: null, ...(isAdmin ? {} : { userId: user.id }) },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { name, youtubeVideoUrl, channel } = await req.json();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const refCode = await generateUniqueRefCode();
  const youtubeVideoId = youtubeVideoUrl ? extractYoutubeVideoId(youtubeVideoUrl) : null;

  let youtubeThumbnailUrl: string | null = youtubeVideoId
    ? `https://img.youtube.com/vi/${youtubeVideoId}/mqdefault.jpg`
    : null;
  let resolvedName = name;
  let youtubeViewCount = 0;

  if (youtubeVideoId) {
    try {
      const info = await fetchSingleTrackingVideoInfo(youtubeVideoId);
      if (info) {
        if (info.thumbnailUrl) youtubeThumbnailUrl = info.thumbnailUrl;
        if (info.viewCount) youtubeViewCount = info.viewCount;
      }
    } catch {
      // non-fatal, continue with defaults
    }
  }

  const link = await prisma.trackingLink.create({
    data: {
      campaignId: id,
      name: resolvedName,
      channel: channel ?? null,
      refCode,
      youtubeVideoUrl: youtubeVideoUrl ?? null,
      youtubeVideoId,
      youtubeThumbnailUrl,
      youtubeViewCount,
      ...(youtubeVideoId ? { youtubeViewsUpdatedAt: new Date() } : {}),
    },
  });

  return NextResponse.json(
    {
      ...link,
      trackedUrl: buildTrackedUrl(campaign.destinationUrl, refCode),
      clicks: 0,
      leads: 0,
      conversionRate: 0,
    },
    { status: 201 }
  );
}

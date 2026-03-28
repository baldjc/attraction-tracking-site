import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { fetchSingleTrackingVideoInfo } from "@/lib/youtube";

function extractYoutubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("?")[0] || null;
    return u.searchParams.get("v");
  } catch {
    return null;
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> }
) {
  const { id, linkId } = await params;
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const link = await prisma.trackingLink.findFirst({
    where: {
      id: linkId,
      campaignId: id,
      deletedAt: null,
      campaign: { userId: user.id, deletedAt: null },
    },
  });
  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { name, source, destinationOverride, youtubeVideoUrl } = await req.json() as {
    name?: string;
    source?: string;
    destinationOverride?: string;
    youtubeVideoUrl?: string | null;
  };

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (source !== undefined) updateData.source = source;
  if (destinationOverride !== undefined) updateData.destinationOverride = destinationOverride;

  if (youtubeVideoUrl !== undefined) {
    const trimmed = youtubeVideoUrl?.trim() || null;
    updateData.youtubeVideoUrl = trimmed;
    const videoId = trimmed ? extractYoutubeId(trimmed) : null;
    updateData.youtubeVideoId = videoId;

    if (trimmed && videoId) {
      updateData.youtubeThumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      try {
        const info = await fetchSingleTrackingVideoInfo(videoId);
        if (info) {
          if (info.thumbnailUrl) updateData.youtubeThumbnailUrl = info.thumbnailUrl;
          updateData.youtubeViewCount = info.viewCount;
          updateData.youtubeViewsUpdatedAt = new Date();
        }
      } catch {
        // non-fatal
      }
    } else if (!trimmed) {
      updateData.youtubeThumbnailUrl = null;
      updateData.youtubeViewCount = 0;
      updateData.youtubeViewsUpdatedAt = null;
    }
  }

  const updated = await prisma.trackingLink.update({
    where: { id: linkId },
    data: updateData,
  });

  return NextResponse.json({ success: true, link: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> }
) {
  const { id, linkId } = await params;
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const link = await prisma.trackingLink.findFirst({
    where: {
      id: linkId,
      campaignId: id,
      deletedAt: null,
      campaign: { userId: user.id, deletedAt: null },
    },
  });
  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.trackingLink.update({ where: { id: linkId }, data: { deletedAt: new Date() } });
  return NextResponse.json({ success: true });
}

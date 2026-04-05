import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-utils";
import { getChannelInfo, getTopVideosByViewCount } from "@/lib/youtube";
import prisma from "@/lib/prisma";

/** POST /api/admin/radar/channel-audit — quick audit any YouTube channel */
export async function POST(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdmin(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { handle } = await req.json();
  if (!handle || typeof handle !== "string") {
    return NextResponse.json({ error: "handle is required" }, { status: 400 });
  }

  try {
    const info = await getChannelInfo(handle.trim());

    // Get top 10 videos by view count
    const topVideos = await getTopVideosByViewCount(
      info.uploadsPlaylistId,
      50, // fetch up to 50
      10  // return top 10
    );

    // Calculate average views
    const avgViews =
      topVideos.length > 0
        ? topVideos.reduce((s, v) => s + v.viewCount, 0) / topVideos.length
        : 0;

    // Check if this channel is already tracked in Radar
    const tracked = await prisma.radarChannel.findUnique({
      where: { channelId: info.channelId },
      select: { id: true },
    });

    // Calculate multipliers for the top videos
    const videosWithMultiplier = topVideos.map((v) => ({
      ...v,
      outlierMultiplier: avgViews > 0 ? parseFloat((v.viewCount / avgViews).toFixed(2)) : 0,
    }));

    return NextResponse.json({
      channel: {
        channelId: info.channelId,
        name: info.title,
        handle: info.handle,
        subscriberCount: info.subscriberCount,
        totalVideoCount: info.totalVideoCount,
        thumbnailUrl: info.thumbnailUrl,
      },
      avgViews: Math.round(avgViews),
      topVideos: videosWithMultiplier,
      isTracked: !!tracked,
      trackedId: tracked?.id ?? null,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Failed to audit channel" },
      { status: 422 }
    );
  }
}

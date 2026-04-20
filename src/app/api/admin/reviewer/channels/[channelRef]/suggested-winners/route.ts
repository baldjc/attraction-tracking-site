import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";
import { isReviewerEnabled } from "@/lib/reviewer-flag";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ channelRef: string }> },
) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || !isAdmin(role ?? "")) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!(await isReviewerEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }

  const { channelRef } = await params;
  const since = new Date(Date.now() - 90 * 86400000);

  const snaps = await prisma.videoAnalyticsSnapshot.findMany({
    where: { channelRef, date: { gte: since } },
    select: {
      videoId: true,
      watchTimeMin: true,
      avgViewPercentage: true,
    },
  });

  const grouped = new Map<
    string,
    { totalWatch: number; totalView: number; n: number }
  >();
  for (const s of snaps) {
    const g = grouped.get(s.videoId) ?? { totalWatch: 0, totalView: 0, n: 0 };
    g.totalWatch += s.watchTimeMin;
    g.totalView += s.avgViewPercentage;
    g.n += 1;
    grouped.set(s.videoId, g);
  }

  const aggregated = Array.from(grouped.entries()).map(([videoId, g]) => ({
    videoId,
    avgWatchTimeMinutes: g.n > 0 ? g.totalWatch / g.n : 0,
    avgViewPercentage: g.n > 0 ? g.totalView / g.n : 0,
  }));

  const watchTimes = aggregated.map((a) => a.avgWatchTimeMinutes).sort((a, b) => a - b);
  const channelMedian =
    watchTimes.length === 0
      ? 0
      : watchTimes[Math.floor(watchTimes.length / 2)];

  aggregated.sort((a, b) => b.avgWatchTimeMinutes - a.avgWatchTimeMinutes);
  const top = aggregated.slice(0, 10);

  const videoIds = top.map((v) => v.videoId);
  const videos = videoIds.length
    ? await prisma.youTubeVideo.findMany({
        where: { videoId: { in: videoIds } },
        select: { videoId: true, title: true, thumbnailUrl: true },
      })
    : [];
  const videoMap = new Map(videos.map((v) => [v.videoId, v]));

  return NextResponse.json({
    videos: top.map((v) => {
      const meta = videoMap.get(v.videoId);
      return {
        videoId: v.videoId,
        title: meta?.title ?? "(unknown title)",
        thumbnailUrl: meta?.thumbnailUrl ?? "",
        url: `https://youtube.com/watch?v=${v.videoId}`,
        avgWatchTimeMinutes: Math.round(v.avgWatchTimeMinutes * 100) / 100,
        avgViewPercentage: Math.round(v.avgViewPercentage * 10) / 10,
        isBridgeCandidate:
          v.avgViewPercentage > 50 && v.avgWatchTimeMinutes > channelMedian,
      };
    }),
  });
}

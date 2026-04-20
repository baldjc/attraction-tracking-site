import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";

function verdict(
  performanceRatio: number,
  baseline: unknown,
): "overperforming" | "on-pace" | "underperforming" | "insufficient-data" {
  const sample =
    baseline && typeof baseline === "object" && "sampleSize" in baseline
      ? Number((baseline as { sampleSize: number }).sampleSize)
      : 0;
  if (performanceRatio === 0 && sample < 3) return "insufficient-data";
  if (performanceRatio >= 1.5) return "overperforming";
  if (performanceRatio >= 0.75) return "on-pace";
  return "underperforming";
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ channelRef: string }> },
) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || !isAdmin(role ?? "")) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { channelRef } = await params;
  const cutoff = new Date(Date.now() - 24 * 3600000);

  const pulses = await prisma.pulseSnapshot.findMany({
    where: {
      channelRef,
      pulseWindowEndsAt: { gt: cutoff },
    },
    orderBy: { publishedAt: "desc" },
  });

  if (pulses.length === 0) {
    return NextResponse.json({ active: [] });
  }

  const videoIds = pulses.map((p) => p.videoId);
  const videos = await prisma.youTubeVideo.findMany({
    where: { videoId: { in: videoIds } },
    select: { videoId: true, title: true, thumbnailUrl: true },
  });
  const vMap = new Map(videos.map((v) => [v.videoId, v]));

  const plans = await prisma.contentPlan.findMany({
    where: { youtubeVideoId: { in: videoIds } },
    select: { youtubeVideoId: true, dramaMode: true },
  });
  const dramaMap = new Map(plans.map((p) => [p.youtubeVideoId!, p.dramaMode]));

  const now = Date.now();
  const active = pulses.map((p) => {
    const v = vMap.get(p.videoId);
    return {
      videoId: p.videoId,
      title: v?.title ?? "(Untitled)",
      thumbnailUrl: v?.thumbnailUrl ?? "",
      publishedAt: p.publishedAt.toISOString(),
      hoursSincePublish: Math.round(
        (now - p.publishedAt.getTime()) / 3600000,
      ),
      views: p.views,
      impressions: p.impressions,
      ctr: p.ctr,
      performanceRatio: p.performanceRatio,
      verdict: verdict(p.performanceRatio, p.baseline),
      dramaMode: dramaMap.get(p.videoId) ?? false,
    };
  });

  return NextResponse.json({ active });
}

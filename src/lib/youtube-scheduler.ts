import prisma from "@/lib/prisma";
import { fetchTrackingVideoInfoBatch } from "@/lib/youtube";

let schedulerStarted = false;
const INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

export function scheduleYoutubeViewCounts() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  console.log("[youtube-scheduler] Starting 4-hour view count sync...");

  // Run once 2 minutes after startup to avoid slowing boot
  setTimeout(() => runSync().catch(console.error), 2 * 60 * 1000);
  setInterval(() => runSync().catch(console.error), INTERVAL_MS);
}

export async function runSync() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.warn("[youtube-scheduler] YOUTUBE_API_KEY not set — skipping view count sync");
    return;
  }

  const links = await prisma.trackingLink.findMany({
    where: { youtubeVideoId: { not: null }, deletedAt: null },
    select: { id: true, youtubeVideoId: true },
  });

  if (links.length === 0) {
    console.log("[youtube-scheduler] No YouTube links to sync");
    return;
  }

  const videoIds = [...new Set(links.map((l) => l.youtubeVideoId!))];
  console.log(`[youtube-scheduler] Syncing ${videoIds.length} unique video IDs across ${links.length} links...`);

  const infoMap = await fetchTrackingVideoInfoBatch(videoIds);

  let updated = 0;
  for (const link of links) {
    const info = infoMap.get(link.youtubeVideoId!);
    if (!info) continue;
    await prisma.trackingLink.update({
      where: { id: link.id },
      data: {
        youtubeViewCount: info.viewCount,
        youtubeViewsUpdatedAt: new Date(),
        ...(info.thumbnailUrl ? { youtubeThumbnailUrl: info.thumbnailUrl } : {}),
      },
    });
    updated++;
  }

  console.log(`[youtube-scheduler] Updated ${updated} tracking links`);
}

export async function refreshCampaignViews(campaignId: string): Promise<{ updated: number }> {
  const links = await prisma.trackingLink.findMany({
    where: { campaignId, youtubeVideoId: { not: null }, deletedAt: null },
    select: { id: true, youtubeVideoId: true },
  });

  if (links.length === 0) return { updated: 0 };

  const videoIds = [...new Set(links.map((l) => l.youtubeVideoId!))];
  const infoMap = await fetchTrackingVideoInfoBatch(videoIds);

  let updated = 0;
  for (const link of links) {
    const info = infoMap.get(link.youtubeVideoId!);
    if (!info) continue;
    await prisma.trackingLink.update({
      where: { id: link.id },
      data: {
        youtubeViewCount: info.viewCount,
        youtubeViewsUpdatedAt: new Date(),
        ...(info.thumbnailUrl ? { youtubeThumbnailUrl: info.thumbnailUrl } : {}),
      },
    });
    updated++;
  }

  return { updated };
}

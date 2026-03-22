import prisma from "@/lib/prisma";
import { fetchTrackingVideoInfoBatch } from "@/lib/youtube";

// Runs at these local hours each day (6am, 10am, 2pm, 6pm)
const SYNC_HOURS = [6, 10, 14, 18];

let schedulerStarted = false;

function msUntilNextSync(): { ms: number; hour: number } {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();
  const ms = now.getMilliseconds();
  const elapsedMs = h * 3600000 + m * 60000 + s * 1000 + ms;

  // Find the next target hour that is strictly after now
  const nextHour = SYNC_HOURS.find((th) => th * 3600000 > elapsedMs);

  if (nextHour !== undefined) {
    return { ms: nextHour * 3600000 - elapsedMs, hour: nextHour };
  }

  // All sync slots for today have passed — next is first slot tomorrow
  const tomorrowFirstMs = 24 * 3600000 - elapsedMs + SYNC_HOURS[0] * 3600000;
  return { ms: tomorrowFirstMs, hour: SYNC_HOURS[0] };
}

function scheduleNext() {
  const { ms, hour } = msUntilNextSync();
  const mins = Math.round(ms / 60000);
  console.log(`[youtube-scheduler] Next sync at ${hour}:00 (in ~${mins} min)`);

  setTimeout(async () => {
    await runSync().catch(console.error);
    scheduleNext();
  }, ms);
}

export function scheduleYoutubeViewCounts() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const h = new Date().getHours();
  const inWindow = h >= SYNC_HOURS[0] && h < 22;
  console.log(`[youtube-scheduler] Starting — syncs at ${SYNC_HOURS.map((h) => `${h}:00`).join(", ")} daily`);

  if (inWindow) {
    // Run once shortly after startup if we're within the daytime window
    setTimeout(() => runSync().catch(console.error), 2 * 60 * 1000);
  }

  scheduleNext();
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

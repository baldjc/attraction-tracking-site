import prisma from "@/lib/prisma";
import {
  getChannelMetrics,
  getChannelViewerCohorts,
  getVideoMetrics,
  getVideoRetentionCurve,
  getVideoTrafficSources,
  getVideoViewerCohorts,
} from "@/lib/youtube-analytics";
import { getChannelInfo } from "@/lib/youtube";
import { runGlanceTestForChannel } from "@/lib/glance-test-runner";

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function dayDate(): Date {
  return new Date(today());
}

async function resolveChannelIds(): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: {
      role: "admin",
      OR: [
        { youtubeHandle: { not: null } },
        { youtubeChannelUrl: { not: null } },
      ],
    },
    select: { youtubeHandle: true, youtubeChannelUrl: true },
  });
  const clients = await prisma.client.findMany({
    where: { ownChannelId: { not: null } },
    select: { ownChannelId: true, ownChannelUrl: true },
  });

  const ids = new Set<string>();
  for (const c of clients) {
    if (c.ownChannelId) ids.add(c.ownChannelId);
  }
  for (const a of admins) {
    const handle = a.youtubeHandle || a.youtubeChannelUrl;
    if (!handle) continue;
    try {
      const info = await getChannelInfo(handle);
      if (info?.channelId) ids.add(info.channelId);
    } catch (err) {
      console.error(`[reviewer-sync] resolveChannelIds(${handle}):`, err);
    }
  }
  return Array.from(ids);
}

export async function syncChannelAnalytics(channelId: string) {
  // Channel-level windows: 28d, 7d, 48h, plus cohort split
  const [m28, m7, m48, cohorts] = await Promise.all([
    getChannelMetrics(channelId, {
      startDate: daysAgo(28),
      endDate: today(),
    }),
    getChannelMetrics(channelId, { startDate: daysAgo(7), endDate: today() }),
    getChannelMetrics(channelId, { startDate: daysAgo(2), endDate: today() }),
    getChannelViewerCohorts(channelId, {
      startDate: daysAgo(28),
      endDate: today(),
    }),
  ]);

  await prisma.channelAnalyticsSnapshot.upsert({
    where: { channelRef_date: { channelRef: channelId, date: dayDate() } },
    update: {
      views28d: m28.views,
      views7d: m7.views,
      views48h: m48.views,
      watchTimeMin28d: m28.watchTimeMinutes,
      subsGained28d: m28.subsGained,
      subsLost28d: m28.subsLost,
      newViewers28d: cohorts.newViewers,
      casualViewers28d: cohorts.casualViewers,
      regularViewers28d: cohorts.regularViewers,
    },
    create: {
      channelRef: channelId,
      date: dayDate(),
      views28d: m28.views,
      views7d: m7.views,
      views48h: m48.views,
      watchTimeMin28d: m28.watchTimeMinutes,
      subsGained28d: m28.subsGained,
      subsLost28d: m28.subsLost,
      newViewers28d: cohorts.newViewers,
      casualViewers28d: cohorts.casualViewers,
      regularViewers28d: cohorts.regularViewers,
    },
  });

  // Video-level for videos published in last 60 days (cap 25 most recent)
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000);
  const videos = await prisma.youTubeVideo.findMany({
    where: { publishedAt: { gte: sixtyDaysAgo } },
    orderBy: { publishedAt: "desc" },
    take: 25,
  });

  for (const v of videos) {
    try {
      const [vm, curve, traffic, vCohorts] = await Promise.all([
        getVideoMetrics(v.videoId, {
          startDate: daysAgo(28),
          endDate: today(),
        }),
        getVideoRetentionCurve(v.videoId),
        getVideoTrafficSources(v.videoId, {
          startDate: daysAgo(28),
          endDate: today(),
        }),
        getVideoViewerCohorts(v.videoId, {
          startDate: daysAgo(28),
          endDate: today(),
        }),
      ]);

      await prisma.videoAnalyticsSnapshot.upsert({
        where: { videoId_date: { videoId: v.videoId, date: dayDate() } },
        update: {
          views: vm.views,
          impressions: vm.impressions,
          ctr: vm.ctr,
          avgViewDurationSec: vm.avgViewDuration,
          avgViewPercentage: vm.avgViewPercentage,
          watchTimeMin: vm.watchTimeMinutes,
          retentionCurve: curve,
          trafficSources: traffic,
          viewerCohorts: vCohorts,
        },
        create: {
          videoId: v.videoId,
          channelRef: channelId,
          date: dayDate(),
          views: vm.views,
          impressions: vm.impressions,
          ctr: vm.ctr,
          avgViewDurationSec: vm.avgViewDuration,
          avgViewPercentage: vm.avgViewPercentage,
          watchTimeMin: vm.watchTimeMinutes,
          retentionCurve: curve,
          trafficSources: traffic,
          viewerCohorts: vCohorts,
        },
      });
    } catch (err) {
      console.error(`[reviewer-sync] Video ${v.videoId} failed:`, err);
    }
  }

  // Pulse snapshots for videos published in last 48h
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 3600000);
  const pulseVideos = videos.filter((v) => v.publishedAt >= fortyEightHoursAgo);

  // Compute 30-day median-48h baseline for the channel
  const pastPulses = await prisma.pulseSnapshot.findMany({
    where: {
      channelRef: channelId,
      publishedAt: { gte: new Date(Date.now() - 30 * 86400000) },
    },
    select: { views: true },
  });
  const sampleSize = pastPulses.length;
  const sorted = pastPulses.map((p) => p.views).sort((a, b) => a - b);
  const median = sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)];

  for (const v of pulseVideos) {
    try {
      const vm = await getVideoMetrics(v.videoId, {
        startDate: daysAgo(2),
        endDate: today(),
      });
      const performanceRatio =
        sampleSize < 3 ? 0 : median > 0 ? vm.views / median : 0;

      await prisma.pulseSnapshot.upsert({
        where: { videoId: v.videoId },
        update: {
          views: vm.views,
          impressions: vm.impressions,
          ctr: vm.ctr,
          avgViewDurationSec: vm.avgViewDuration,
          watchTimeMin: vm.watchTimeMinutes,
          performanceRatio,
          baseline: { median, sampleSize },
          lastSyncedAt: new Date(),
        },
        create: {
          videoId: v.videoId,
          channelRef: channelId,
          publishedAt: v.publishedAt,
          pulseWindowEndsAt: new Date(
            v.publishedAt.getTime() + 48 * 3600000,
          ),
          views: vm.views,
          impressions: vm.impressions,
          ctr: vm.ctr,
          avgViewDurationSec: vm.avgViewDuration,
          watchTimeMin: vm.watchTimeMinutes,
          performanceRatio,
          baseline: { median, sampleSize },
        },
      });
    } catch (err) {
      console.error(
        `[reviewer-sync] Pulse for video ${v.videoId} failed:`,
        err,
      );
    }
  }
}

export async function syncAllChannelsAnalytics() {
  const channelIds = await resolveChannelIds();
  const results: Array<{
    channelId: string;
    success: boolean;
    error?: string;
    glanceProcessed?: number;
  }> = [];
  for (const id of channelIds) {
    try {
      await syncChannelAnalytics(id);
      let glanceProcessed = 0;
      try {
        const out = await runGlanceTestForChannel(id, "system");
        glanceProcessed = out.processed;
      } catch (err) {
        console.error(`[reviewer-sync] glance for ${id} failed:`, err);
      }
      results.push({ channelId: id, success: true, glanceProcessed });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ channelId: id, success: false, error: msg });
    }
  }
  return { polled: channelIds.length, results };
}

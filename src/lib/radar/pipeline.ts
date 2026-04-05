// ── Radar Pipeline — YouTube Intelligence Collection ─────────────────────────
//
// Orchestrates: channel sync → video pull → outlier detection → transcript → AI analysis
// Reuses existing youtube.ts helpers for API calls and transcript fetching.

import prisma from "@/lib/prisma";
import {
  getChannelInfo,
  parseDuration,
  getTranscript,
} from "@/lib/youtube";
import { analyzeTranscript } from "./analyze";
import { getOutlierTier } from "./constants";

const YT_API_KEY = process.env.YOUTUBE_API_KEY!;
const YT_BASE = "https://www.googleapis.com/youtube/v3";

// ── Channel sync ─────────────────────────────────────────────────────────────

/** Add or update a channel by handle or URL */
export async function syncChannel(handleOrUrl: string) {
  // Normalise: accept full URL or @handle or plain handle
  let handle = handleOrUrl.trim();
  const urlMatch = handle.match(/youtube\.com\/(?:@|channel\/|c\/)([^/?]+)/);
  if (urlMatch) handle = urlMatch[1];
  if (!handle.startsWith("@") && !handle.startsWith("UC")) handle = `@${handle}`;

  const info = await getChannelInfo(handle);

  return prisma.radarChannel.upsert({
    where: { channelId: info.channelId },
    create: {
      channelId: info.channelId,
      name: info.title,
      handle: info.handle,
      subscriberCount: info.subscriberCount,
    },
    update: {
      name: info.title,
      handle: info.handle,
      subscriberCount: info.subscriberCount,
      updatedAt: new Date(),
    },
  });
}

// ── Video metadata pull ──────────────────────────────────────────────────────

/** Fetch all videos for a channel (paginated, up to maxVideos) and upsert into DB */
export async function pullChannelVideos(channelDbId: string, maxVideos = 100) {
  const channel = await prisma.radarChannel.findUniqueOrThrow({
    where: { id: channelDbId },
  });

  // Get uploads playlist
  const chInfo = await getChannelInfo(channel.channelId);
  const uploadsPlaylistId = chInfo.uploadsPlaylistId;

  const allVideos: any[] = [];
  let nextPageToken: string | undefined;

  while (allVideos.length < maxVideos) {
    const remaining = maxVideos - allVideos.length;
    const pageSize = Math.min(remaining, 50);
    const plUrl = `${YT_BASE}/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=${pageSize}&key=${YT_API_KEY}${nextPageToken ? `&pageToken=${nextPageToken}` : ""}`;
    const plRes = await fetch(plUrl);
    if (!plRes.ok) break;
    const plData = await plRes.json();
    const videoIds = (plData.items ?? [])
      .map((item: any) => item.snippet?.resourceId?.videoId)
      .filter(Boolean);

    if (videoIds.length === 0) break;

    // Fetch video details in batches of 50
    const vidUrl = `${YT_BASE}/videos?part=snippet,contentDetails,statistics&id=${videoIds.join(",")}&key=${YT_API_KEY}`;
    const vidRes = await fetch(vidUrl);
    if (vidRes.ok) {
      const vidData = await vidRes.json();
      allVideos.push(...(vidData.items ?? []));
    }

    nextPageToken = plData.nextPageToken;
    if (!nextPageToken) break;
  }

  // Upsert videos
  let count = 0;
  for (const v of allVideos) {
    const durationSec = parseDuration(v.contentDetails?.duration ?? "PT0S");
    if (durationSec < 60) continue; // skip Shorts

    const thumbs = v.snippet?.thumbnails ?? {};
    const thumbnailUrl = thumbs.maxres?.url ?? thumbs.high?.url ?? thumbs.medium?.url ?? null;

    await prisma.radarVideo.upsert({
      where: { videoId: v.id },
      create: {
        videoId: v.id,
        channelId: channelDbId,
        title: v.snippet?.title ?? "",
        publishDate: new Date(v.snippet?.publishedAt ?? Date.now()),
        viewCount: parseInt(v.statistics?.viewCount ?? "0"),
        likeCount: parseInt(v.statistics?.likeCount ?? "0"),
        commentCount: parseInt(v.statistics?.commentCount ?? "0"),
        durationSeconds: durationSec,
        thumbnailUrl,
        descriptionExcerpt: (v.snippet?.description ?? "").slice(0, 500),
        tags: v.snippet?.tags ?? [],
      },
      update: {
        title: v.snippet?.title ?? "",
        viewCount: parseInt(v.statistics?.viewCount ?? "0"),
        likeCount: parseInt(v.statistics?.likeCount ?? "0"),
        commentCount: parseInt(v.statistics?.commentCount ?? "0"),
        thumbnailUrl,
        updatedAt: new Date(),
      },
    });
    count++;
  }

  // Update channel lastSyncedAt
  await prisma.radarChannel.update({
    where: { id: channelDbId },
    data: { lastSyncedAt: new Date() },
  });

  return count;
}

// ── Outlier calculation ──────────────────────────────────────────────────────

/** Calculate rolling 90-day average and flag outliers for a channel */
export async function calculateOutliers(channelDbId: string) {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // Get all videos for the channel in the last 90 days
  const videos = await prisma.radarVideo.findMany({
    where: { channelId: channelDbId, publishDate: { gte: ninetyDaysAgo } },
    orderBy: { viewCount: "asc" },
  });

  if (videos.length === 0) return { avgViews: 0, outliersFound: 0 };

  // Calculate average excluding top 10% to avoid extreme outliers skewing the average
  const cutoff = Math.max(1, Math.floor(videos.length * 0.9));
  const baseVideos = videos.slice(0, cutoff);
  const avgViews = baseVideos.reduce((sum, v) => sum + v.viewCount, 0) / baseVideos.length;

  // Update channel avg
  await prisma.radarChannel.update({
    where: { id: channelDbId },
    data: { avgViews90d: avgViews },
  });

  // Calculate multiplier for ALL channel videos (not just 90-day)
  const allVideos = await prisma.radarVideo.findMany({
    where: { channelId: channelDbId },
  });

  let outliersFound = 0;
  for (const video of allVideos) {
    const multiplier = avgViews > 0 ? video.viewCount / avgViews : 0;
    const tierInfo = getOutlierTier(multiplier);

    await prisma.radarVideo.update({
      where: { id: video.id },
      data: {
        outlierMultiplier: parseFloat(multiplier.toFixed(2)),
        outlierTier: tierInfo?.tier ?? null,
      },
    });

    if (tierInfo) outliersFound++;
  }

  return { avgViews: Math.round(avgViews), outliersFound };
}

// ── Transcript pull ──────────────────────────────────────────────────────────

/** Pull transcript for a single video using Supadata (existing integration) */
export async function pullTranscript(videoDbId: string) {
  const video = await prisma.radarVideo.findUniqueOrThrow({
    where: { id: videoDbId },
  });

  if (video.transcriptText) return video.transcriptText; // already pulled

  const transcript = await getTranscript(video.videoId);
  if (!transcript) return null;

  await prisma.radarVideo.update({
    where: { id: videoDbId },
    data: {
      transcriptText: transcript,
      transcriptPulledAt: new Date(),
    },
  });

  return transcript;
}

// ── AI Analysis ──────────────────────────────────────────────────────────────

/** Run Claude analysis on a video's transcript */
export async function analyzeVideo(videoDbId: string) {
  const video = await prisma.radarVideo.findUniqueOrThrow({
    where: { id: videoDbId },
    include: { analysis: true },
  });

  if (video.analysis) return video.analysis; // already analyzed
  if (!video.transcriptText) return null; // no transcript to analyze

  const result = await analyzeTranscript(video.title, video.transcriptText);
  if (!result) return null;

  return prisma.radarVideoAnalysis.create({
    data: {
      videoId: videoDbId,
      ...result,
    },
  });
}

// ── Full pipeline run ────────────────────────────────────────────────────────

/** Run the full pipeline for all active channels */
export async function runFullPipeline() {
  const run = await prisma.radarPipelineRun.create({ data: {} });

  try {
    const channels = await prisma.radarChannel.findMany({
      where: { isActive: true },
    });

    let totalVideos = 0;
    let totalOutliers = 0;
    let totalTranscripts = 0;
    let totalAnalyses = 0;

    for (const channel of channels) {
      // Pull videos
      const videoCount = await pullChannelVideos(channel.id);
      totalVideos += videoCount;

      // Calculate outliers
      const { outliersFound } = await calculateOutliers(channel.id);
      totalOutliers += outliersFound;

      // Pull transcripts for outlier videos that don't have them
      const outlierVideos = await prisma.radarVideo.findMany({
        where: {
          channelId: channel.id,
          outlierTier: { not: null },
          transcriptText: null,
        },
        orderBy: { outlierMultiplier: "desc" },
        take: 20, // limit to top 20 outliers per channel per run
      });

      for (const video of outlierVideos) {
        const transcript = await pullTranscript(video.id);
        if (transcript) totalTranscripts++;
      }

      // Run analysis on outliers with transcripts but no analysis
      const unanalyzed = await prisma.radarVideo.findMany({
        where: {
          channelId: channel.id,
          outlierTier: { not: null },
          transcriptText: { not: null },
          analysis: null,
        },
        orderBy: { outlierMultiplier: "desc" },
        take: 10, // limit analysis per channel per run
      });

      for (const video of unanalyzed) {
        const analysis = await analyzeVideo(video.id);
        if (analysis) totalAnalyses++;
      }
    }

    await prisma.radarPipelineRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        channelsProcessed: channels.length,
        videosDiscovered: totalVideos,
        outliersFound: totalOutliers,
        transcriptsPulled: totalTranscripts,
        analysesRun: totalAnalyses,
        completedAt: new Date(),
      },
    });

    return run.id;
  } catch (err: any) {
    await prisma.radarPipelineRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        errorMessage: err.message ?? String(err),
        completedAt: new Date(),
      },
    });
    throw err;
  }
}

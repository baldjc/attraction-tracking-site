import prisma from "./prisma";
import { getChannelInfo } from "./youtube";

const YT_BASE = "https://www.googleapis.com/youtube/v3";

interface RawVideo {
  ytVideoId: string;
  title: string;
  description: string | null;
  publishedAt: Date;
  durationSec: number | null;
  views: bigint;
  likes: number | null;
  comments: number | null;
  thumbnailUrl: string | null;
  tags: string[];
}

function parseDurationSec(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (parseInt(match[1] ?? "0") * 3600) + (parseInt(match[2] ?? "0") * 60) + parseInt(match[3] ?? "0");
}

export async function fetchAllChannelVideos(uploadsPlaylistId: string, maxVideos = 200): Promise<RawVideo[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY is not set");

  const allItems: any[] = [];
  let pageToken: string | undefined;

  while (allItems.length < maxVideos) {
    const url = new URL(`${YT_BASE}/playlistItems`);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("playlistId", uploadsPlaylistId);
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("key", apiKey);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error(`[intel-channel] playlistItems error: ${res.status}`);
      break;
    }
    const data = await res.json();
    const ids: string[] = (data.items ?? [])
      .map((item: any) => item.snippet?.resourceId?.videoId)
      .filter(Boolean);
    if (ids.length === 0) break;

    const detailRes = await fetch(
      `${YT_BASE}/videos?part=snippet,contentDetails,statistics&id=${ids.join(",")}&key=${apiKey}`
    );
    if (detailRes.ok) {
      const dd = await detailRes.json();
      allItems.push(...(dd.items ?? []));
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return allItems.slice(0, maxVideos).map((v: any) => {
    const durationSec = parseDurationSec(v.contentDetails?.duration ?? "PT0S");
    const thumbs = v.snippet?.thumbnails ?? {};
    const thumbnailUrl = thumbs.maxres?.url ?? thumbs.high?.url ?? thumbs.medium?.url ?? thumbs.default?.url ?? null;
    return {
      ytVideoId: v.id as string,
      title: v.snippet?.title ?? "",
      description: v.snippet?.description ?? null,
      publishedAt: new Date(v.snippet?.publishedAt ?? Date.now()),
      durationSec: durationSec || null,
      views: BigInt(parseInt(v.statistics?.viewCount ?? "0")),
      likes: parseInt(v.statistics?.likeCount ?? "0") || null,
      comments: parseInt(v.statistics?.commentCount ?? "0") || null,
      thumbnailUrl,
      tags: v.snippet?.tags ?? [],
    };
  });
}

export async function syncChannel(channelInput: string): Promise<{ channel: any; videoCount: number }> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY is not set — cannot sync channel");

  const info = await getChannelInfo(channelInput);

  const channel = await prisma.intelChannel.upsert({
    where: { ytChannelId: info.channelId },
    create: {
      ytChannelId: info.channelId,
      handle: info.handle,
      title: info.title,
      thumbnailUrl: info.thumbnailUrl,
      subscribers: info.subscriberCount,
      totalViews: BigInt(info.totalViewCount),
      videoCount: info.totalVideoCount,
      lastSyncedAt: new Date(),
    },
    update: {
      handle: info.handle,
      title: info.title,
      thumbnailUrl: info.thumbnailUrl,
      subscribers: info.subscriberCount,
      totalViews: BigInt(info.totalViewCount),
      videoCount: info.totalVideoCount,
      lastSyncedAt: new Date(),
    },
  });

  await prisma.intelChannelSnapshot.create({
    data: {
      channelId: channel.id,
      subscribers: info.subscriberCount,
      totalViews: BigInt(info.totalViewCount),
      videoCount: info.totalVideoCount,
    },
  });

  const rawVideos = await fetchAllChannelVideos(info.uploadsPlaylistId, 200);

  for (const v of rawVideos) {
    await prisma.intelVideo.upsert({
      where: { ytVideoId: v.ytVideoId },
      create: { ...v, channelId: channel.id },
      update: {
        title: v.title,
        views: v.views,
        likes: v.likes,
        comments: v.comments,
        thumbnailUrl: v.thumbnailUrl,
        tags: v.tags,
      },
    });
  }

  return { channel, videoCount: rawVideos.length };
}

export function computeOutlierMultiples(videos: { id: string; views: bigint }[]): Map<string, number> {
  if (videos.length === 0) return new Map();
  const sorted = [...videos].sort((a, b) => (a.views < b.views ? -1 : a.views > b.views ? 1 : 0));
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (Number(sorted[mid - 1].views) + Number(sorted[mid].views)) / 2
    : Number(sorted[mid].views);
  const result = new Map<string, number>();
  for (const v of videos) {
    result.set(v.id, median > 0 ? Number(v.views) / median : 0);
  }
  return result;
}

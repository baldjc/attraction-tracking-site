import prisma from "@/lib/prisma";
import { getChannelInfo, getLatestLongFormVideos } from "@/lib/youtube";

interface SyncResult {
  userId: string;
  fullName: string;
  success: boolean;
  newVideos: number;
  error?: string;
}

interface SyncSummary {
  membersPolled: number;
  membersFailed: number;
  newVideosFound: number;
  results: SyncResult[];
}

export async function syncMemberChannel(userId: string): Promise<SyncResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, fullName: true, youtubeChannelUrl: true, youtubeHandle: true },
  });

  if (!user) {
    return { userId, fullName: "Unknown", success: false, newVideos: 0, error: "User not found" };
  }

  const handle = user.youtubeHandle || user.youtubeChannelUrl;
  if (!handle) {
    return { userId, fullName: user.fullName || "Unknown", success: false, newVideos: 0, error: "No YouTube channel linked" };
  }

  try {
    const channelInfo = await getChannelInfo(handle);
    if (!channelInfo) {
      return { userId, fullName: user.fullName || "Unknown", success: false, newVideos: 0, error: "Channel not found or API error" };
    }

    await prisma.youTubeChannelSnapshot.create({
      data: {
        userId: user.id,
        subscriberCount: channelInfo.subscriberCount,
        totalVideoCount: channelInfo.totalVideoCount,
        totalViewCount: channelInfo.totalViewCount,
      },
    });

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const videos = await getLatestLongFormVideos(channelInfo.uploadsPlaylistId, 10, sevenDaysAgo);

    let newCount = 0;
    for (const video of videos) {
      const thumbnailUrl = `https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`;

      const existing = await prisma.youTubeVideo.findUnique({
        where: { userId_videoId: { userId: user.id, videoId: video.videoId } },
      });

      if (existing) {
        await prisma.youTubeVideo.update({
          where: { id: existing.id },
          data: {
            viewCount: video.viewCount,
            title: video.title,
            thumbnailUrl,
          },
        });
      } else {
        await prisma.youTubeVideo.create({
          data: {
            userId: user.id,
            videoId: video.videoId,
            title: video.title,
            publishedAt: new Date(video.uploadDate),
            viewCount: video.viewCount,
            duration: video.duration,
            thumbnailUrl,
          },
        });
        newCount++;
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastYoutubeSyncAt: new Date(),
        ...(channelInfo.thumbnailUrl ? { youtubeChannelThumbnail: channelInfo.thumbnailUrl } : {}),
        ...(channelInfo.title ? { youtubeChannelName: channelInfo.title } : {}),
      },
    });

    return { userId: user.id, fullName: user.fullName || "Unknown", success: true, newVideos: newCount };
  } catch (err: any) {
    return { userId, fullName: user.fullName || "Unknown", success: false, newVideos: 0, error: err.message };
  }
}

export async function syncAllChannels(): Promise<SyncSummary> {
  const members = await prisma.user.findMany({
    where: {
      role: { not: "admin" },
      OR: [
        { youtubeHandle: { not: null } },
        { youtubeChannelUrl: { not: null } },
      ],
    },
    select: { id: true },
  });

  const results: SyncResult[] = [];
  for (const member of members) {
    const result = await syncMemberChannel(member.id);
    results.push(result);
  }

  return {
    membersPolled: results.length,
    membersFailed: results.filter((r) => !r.success).length,
    newVideosFound: results.reduce((sum, r) => sum + r.newVideos, 0),
    results,
  };
}

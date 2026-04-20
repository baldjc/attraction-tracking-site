import prisma from "@/lib/prisma";
import { getChannelInfo, getLatestLongFormVideos } from "@/lib/youtube";
import { GROWTH_DWY_TIERS } from "@/lib/content-plan-utils";

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
    select: { id: true, fullName: true, youtubeChannelUrl: true, youtubeHandle: true, serviceTier: true },
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

        const publishedStatus = GROWTH_DWY_TIERS.includes(user.serviceTier ?? "")
          ? "Live on YT"
          : "Published";
        const trimmedTitle = video.title.trim();
        const publishDate = new Date(video.uploadDate);

        // 1) Already linked by videoId? Just refresh title + publishDate +
        // status (in case the sync ran before the plan got its publish date).
        const linkedPlan = await prisma.contentPlan.findFirst({
          where: { userId: user.id, youtubeVideoId: video.videoId },
          select: { id: true },
        });

        if (linkedPlan) {
          await prisma.contentPlan.update({
            where: { id: linkedPlan.id },
            data: {
              title: trimmedTitle,
              status: publishedStatus,
              publishDate,
            },
          });
        } else {
          // 2) No videoId match — try to find an existing un-published plan
          // whose title is the same as (or a strong prefix of) the YouTube
          // title. This is the common case: the member drafted/scripted
          // the video in the planner, then refined the title before
          // publishing on YouTube. We want to flip that plan to "Live on
          // YT" instead of inserting a duplicate row.
          //
          // Match strategy, in order:
          //   a) exact case-insensitive title match
          //   b) the YouTube title STARTS WITH a planner title that is
          //      itself ≥ 25 chars (avoids matching tiny generic titles)
          //   c) a planner title STARTS WITH the YouTube title under the
          //      same length guard
          // We exclude already-published plans (Live on YT / Published)
          // so we never overwrite an older live video with the same
          // prefix.
          const PUBLISHED_STATUSES = ["Live on YT", "Published"];
          const PREFIX_GUARD = 25;

          let titleMatch = await prisma.contentPlan.findFirst({
            where: {
              userId: user.id,
              youtubeVideoId: null,
              status: { notIn: PUBLISHED_STATUSES },
              title: { equals: trimmedTitle, mode: "insensitive" },
            },
            orderBy: { updatedAt: "desc" },
            select: { id: true },
          });

          if (!titleMatch && trimmedTitle.length >= PREFIX_GUARD) {
            // Pull recent unmatched plans for this user and check prefixes
            // in JS — Prisma can't express "stored title is a prefix of
            // input string" without raw SQL, and the per-user candidate
            // set is small.
            const candidates = await prisma.contentPlan.findMany({
              where: {
                userId: user.id,
                youtubeVideoId: null,
                status: { notIn: PUBLISHED_STATUSES },
              },
              orderBy: { updatedAt: "desc" },
              select: { id: true, title: true },
              take: 100,
            });
            const ytLower = trimmedTitle.toLowerCase();
            const found = candidates.find((c) => {
              const planTitle = c.title.trim();
              if (planTitle.length < PREFIX_GUARD) return false;
              const planLower = planTitle.toLowerCase();
              return ytLower.startsWith(planLower) || planLower.startsWith(ytLower);
            });
            if (found) titleMatch = { id: found.id };
          }

          if (titleMatch) {
            await prisma.contentPlan.update({
              where: { id: titleMatch.id },
              data: {
                title: trimmedTitle,
                status: publishedStatus,
                publishDate,
                youtubeVideoId: video.videoId,
              },
            });
          } else {
            // 3) Genuine new upload with no matching plan — create one.
            await prisma.contentPlan.create({
              data: {
                userId: user.id,
                title: trimmedTitle,
                status: publishedStatus,
                publishDate,
                youtubeVideoId: video.videoId,
              },
            });
          }
        }

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

import { NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { getChannelInfo, getTopVideosByViewCount } from "@/lib/youtube";

function resolveIdentifier(member: {
  youtubeHandle?: string | null;
  youtubeChannelUrl?: string | null;
}): string | null {
  if (member.youtubeHandle) return member.youtubeHandle;
  if (member.youtubeChannelUrl) {
    const url = member.youtubeChannelUrl;
    const handleMatch = url.match(/@[\w-]+/);
    if (handleMatch) return handleMatch[0];
    const parts = url.replace(/\/$/, "").split("/");
    const last = parts[parts.length - 1];
    if (last && last !== "youtube.com") {
      return last.startsWith("@") ? last : last.startsWith("UC") ? last : `@${last}`;
    }
  }
  return null;
}

export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { youtubeHandle: true, youtubeChannelUrl: true },
  });

  if (!dbUser) return NextResponse.json({ videos: [] });

  const identifier = resolveIdentifier(dbUser);
  if (!identifier) return NextResponse.json({ videos: [], noChannel: true });

  try {
    const channelInfo = await getChannelInfo(identifier);
    const videos = await getTopVideosByViewCount(channelInfo.uploadsPlaylistId, 50, 5);

    return NextResponse.json({
      videos: videos.map((v) => ({
        videoId: v.videoId,
        title: v.title,
        thumbnailUrl: v.thumbnailUrl,
        viewCount: v.viewCount,
        uploadDate: v.uploadDate,
        studioUrl: `https://studio.youtube.com/video/${v.videoId}/edit`,
        watchUrl: `https://www.youtube.com/watch?v=${v.videoId}`,
      })),
    });
  } catch (err: any) {
    console.error("[top-videos]", err.message);
    return NextResponse.json({ videos: [] });
  }
}

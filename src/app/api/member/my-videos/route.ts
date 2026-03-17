import { NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { getChannelInfo, getLatestLongFormVideos } from "@/lib/youtube";

function resolveIdentifier(member: { youtubeHandle?: string | null; youtubeChannelUrl?: string | null }): string | null {
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

  if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const identifier = resolveIdentifier(dbUser);
  if (!identifier) {
    return NextResponse.json({ error: "No YouTube channel set on your profile" }, { status: 422 });
  }

  try {
    const channelInfo = await getChannelInfo(identifier);
    const videos = await getLatestLongFormVideos(channelInfo.uploadsPlaylistId, 15);

    return NextResponse.json({
      videos: videos.map((v) => ({
        videoId: v.videoId,
        title: v.title,
        uploadDate: v.uploadDate,
        thumbnailUrl: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
      })),
    });
  } catch (err: any) {
    console.error("[my-videos]", err.message);
    return NextResponse.json({ error: "Could not fetch your videos — check that your YouTube channel URL is set in your profile" }, { status: 422 });
  }
}

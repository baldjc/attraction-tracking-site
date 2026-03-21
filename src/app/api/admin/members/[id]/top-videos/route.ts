import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !["admin", "editor"].includes(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const member = await prisma.user.findUnique({
    where: { id },
    select: { youtubeHandle: true, youtubeChannelUrl: true },
  });

  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  const identifier = resolveIdentifier(member);
  if (!identifier) return NextResponse.json({ videos: [], noChannel: true });

  try {
    const channelInfo = await getChannelInfo(identifier);
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const videos = await getTopVideosByViewCount(channelInfo.uploadsPlaylistId, 50, 5, since30d);

    return NextResponse.json({
      noUploadsIn30Days: videos.length === 0,
      videos: videos.map((v) => ({
        videoId: v.videoId,
        title: v.title,
        thumbnailUrl: v.thumbnailUrl,
        viewCount: v.viewCount,
        uploadDate: v.uploadDate,
        watchUrl: `https://www.youtube.com/watch?v=${v.videoId}`,
        studioUrl: `https://studio.youtube.com/video/${v.videoId}/edit`,
      })),
    });
  } catch (err: any) {
    console.error("[admin top-videos]", err.message);
    return NextResponse.json({ videos: [], error: err.message });
  }
}

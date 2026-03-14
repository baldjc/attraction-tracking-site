import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getChannelInfo, getLatestLongFormVideos, parseDuration } from "@/lib/youtube";

function fmtDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function resolveIdentifier(member: any): string | null {
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

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const memberId = req.nextUrl.searchParams.get("memberId");
  if (!memberId) {
    return NextResponse.json({ error: "memberId required" }, { status: 400 });
  }

  const member = await prisma.user.findUnique({ where: { id: memberId } });
  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const identifier = resolveIdentifier(member);
  if (!identifier) {
    return NextResponse.json(
      { error: "Could not fetch videos — check that this member has a valid YouTube channel set" },
      { status: 422 }
    );
  }

  try {
    const channelInfo = await getChannelInfo(identifier);
    const videos = await getLatestLongFormVideos(channelInfo.uploadsPlaylistId, 10);

    const result = videos.map((v) => ({
      videoId: v.videoId,
      title: v.title,
      durationSeconds: v.durationSeconds,
      durationFormatted: fmtDuration(v.durationSeconds),
      uploadDate: v.uploadDate,
      viewCount: v.viewCount,
      thumbnailUrl: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
    }));

    return NextResponse.json({ videos: result });
  } catch (err: any) {
    console.error("[channel-videos]", err.message);
    return NextResponse.json(
      { error: "Could not fetch videos — check that this member has a valid YouTube channel set" },
      { status: 422 }
    );
  }
}

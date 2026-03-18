import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { getChannelInfo, getLatestLongFormVideos } from "@/lib/youtube";

export async function GET(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const requestedUserId = searchParams.get("userId");

  let targetUserId = user.id;

  if (requestedUserId && requestedUserId !== user.id) {
    const session = await auth();
    if (!session?.user || (session.user as { role?: string }).role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    targetUserId = requestedUserId;
  }

  const member = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { youtubeHandle: true, youtubeChannelUrl: true },
  });

  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  const handle = member.youtubeHandle;
  if (!handle) {
    return NextResponse.json({ error: "No YouTube channel linked" }, { status: 400 });
  }

  try {
    const channelInfo = await getChannelInfo(handle);
    const videos = await getLatestLongFormVideos(channelInfo.uploadsPlaylistId, 20);
    return NextResponse.json({ videos });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch videos";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

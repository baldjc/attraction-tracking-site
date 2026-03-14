import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getChannelInfo, getLatestLongFormVideos } from "@/lib/youtube";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const member = await prisma.user.findUnique({ where: { id } });
  if (!member) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!member.youtubeHandle) return NextResponse.json({ error: "Member has no YouTube handle" }, { status: 400 });

  try {
    const channelInfo = await getChannelInfo(member.youtubeHandle);
    const videos = await getLatestLongFormVideos(channelInfo.uploadsPlaylistId, 10);
    return NextResponse.json({ videos });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

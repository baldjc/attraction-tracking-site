import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import { fetchSingleTrackingVideoInfo } from "@/lib/youtube";

export async function GET(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const videoId = req.nextUrl.searchParams.get("videoId");
  if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });

  try {
    const info = await fetchSingleTrackingVideoInfo(videoId);
    if (!info) return NextResponse.json({ error: "Video not found" }, { status: 404 });
    return NextResponse.json(info);
  } catch (err) {
    console.error("[youtube/video-info] Error:", err);
    return NextResponse.json({ error: "Failed to fetch video info" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import { getChannelInfo } from "@/lib/youtube";

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { youtubeChannelUrl } = await req.json();
  const url: string | null = youtubeChannelUrl?.trim() || null;

  if (!url) return NextResponse.json({ error: "youtubeChannelUrl is required" }, { status: 400 });

  let youtubeHandle: string | null = null;

  const handleMatch = url.match(/@[\w-]+/);
  if (handleMatch) {
    youtubeHandle = handleMatch[0];
  } else {
    const parts = url.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && last !== "youtube.com") {
      youtubeHandle = last.startsWith("@") ? last : `@${last}`;
    }
  }

  if (!youtubeHandle) {
    return NextResponse.json({ error: "Could not extract a YouTube handle from that URL" }, { status: 400 });
  }

  try {
    const info = await getChannelInfo(youtubeHandle);
    if (!info?.title) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    return NextResponse.json({
      youtubeHandle,
      youtubeChannelName: info.title,
      youtubeChannelThumbnail: info.thumbnailUrl ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Failed to resolve channel" }, { status: 500 });
  }
}

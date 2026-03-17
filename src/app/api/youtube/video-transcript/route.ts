import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import { getTranscript } from "@/lib/youtube";

export async function GET(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const videoId = req.nextUrl.searchParams.get("videoId");
  if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });

  try {
    const fullTranscript = await getTranscript(videoId);
    if (!fullTranscript) {
      return NextResponse.json({ excerpt: null, available: false });
    }

    const THIRTY_SECONDS_MS = 30_000;
    const segments = fullTranscript.split(/(?=\[\d+:\d+\])/);
    const excerptSegments: string[] = [];

    for (const seg of segments) {
      const match = seg.match(/^\[(\d+):(\d+)\]/);
      if (!match) continue;
      const offsetMs = (parseInt(match[1]) * 60 + parseInt(match[2])) * 1000;
      if (offsetMs > THIRTY_SECONDS_MS) break;
      excerptSegments.push(seg.trim());
    }

    const excerpt = excerptSegments.join(" ").replace(/\[\d+:\d+\]\s*/g, "").trim();

    return NextResponse.json({ excerpt: excerpt || null, available: true });
  } catch (err: any) {
    console.error("[video-transcript]", err.message);
    return NextResponse.json({ error: "Failed to fetch transcript" }, { status: 500 });
  }
}

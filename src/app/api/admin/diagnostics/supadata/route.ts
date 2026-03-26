import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "SUPADATA_API_KEY is not set" });
  }

  try {
    const testVideoId = "dQw4w9WgXcQ";
    const res = await fetch(
      `https://api.supadata.ai/v1/youtube/transcript?videoId=${testVideoId}&lang=en`,
      { headers: { "x-api-key": apiKey } }
    );

    const body = await res.text();

    if (res.status === 401) {
      return NextResponse.json({
        ok: false,
        status: 401,
        error: "SUPADATA_API_KEY is invalid or expired",
        detail: body,
      });
    }

    if (res.status === 206) {
      return NextResponse.json({
        ok: true,
        status: 206,
        message: "API key is valid (test video has no transcript, which is fine)",
      });
    }

    if (res.ok) {
      const data = JSON.parse(body);
      const segments = data.content;
      return NextResponse.json({
        ok: true,
        status: 200,
        message: "API key is valid and transcripts are working",
        segmentCount: Array.isArray(segments) ? segments.length : 0,
      });
    }

    return NextResponse.json({
      ok: false,
      status: res.status,
      error: `Unexpected API response`,
      detail: body,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message });
  }
}

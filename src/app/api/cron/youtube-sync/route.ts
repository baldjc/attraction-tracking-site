import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { syncAllChannels } from "@/lib/youtube-sync";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? "";
  const expected = process.env.CRON_SECRET ?? "";
  if (!secret || !expected || !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await syncAllChannels();
    console.log("[youtube-sync cron]", JSON.stringify(summary));
    return NextResponse.json({ success: true, ...summary });
  } catch (err: any) {
    console.error("[youtube-sync cron] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

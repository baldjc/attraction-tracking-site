import { NextRequest, NextResponse } from "next/server";
import { syncAllChannels } from "@/lib/youtube-sync";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
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

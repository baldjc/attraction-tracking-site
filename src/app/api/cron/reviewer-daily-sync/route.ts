import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { syncAllChannelsAnalytics } from "@/lib/reviewer-sync";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? "";
  const expected = process.env.CRON_SECRET ?? "";
  if (
    !secret ||
    !expected ||
    secret.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected))
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await syncAllChannelsAnalytics();
    console.log("[reviewer-daily-sync cron]", JSON.stringify(summary));
    return NextResponse.json({ success: true, ...summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[reviewer-daily-sync cron] Error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

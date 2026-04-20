import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-utils";
import {
  syncAllChannelsAnalytics,
  syncChannelAnalytics,
} from "@/lib/reviewer-sync";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || !isAdmin(role ?? "")) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  let body: { channelId?: string } = {};
  try {
    body = (await req.json()) as { channelId?: string };
  } catch {
    // empty body is fine
  }

  try {
    if (body.channelId) {
      await syncChannelAnalytics(body.channelId);
      return NextResponse.json({
        success: true,
        polled: 1,
        results: [{ channelId: body.channelId, success: true }],
      });
    }
    const summary = await syncAllChannelsAnalytics();
    return NextResponse.json({ success: true, ...summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[reviewer/sync-now] Error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

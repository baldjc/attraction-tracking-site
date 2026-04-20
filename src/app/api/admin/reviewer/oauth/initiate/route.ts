// MANUAL SETUP (one-time, before testing):
// 1. https://console.cloud.google.com/apis/credentials for the project
//    tied to the existing YOUTUBE_API_KEY.
// 2. Create OAuth 2.0 Client ID → Web application.
// 3. Authorized redirect URI: {BASE_URL}/api/admin/reviewer/oauth/callback
//    (add both dev URL and prod URL).
// 4. Copy Client ID and Client Secret into env vars:
//      GOOGLE_OAUTH_CLIENT_ID
//      GOOGLE_OAUTH_CLIENT_SECRET
// 5. Enable the YouTube Analytics API on the project.
// 6. OAuth consent screen: add jared@attractionbyvideo.com as a test user.
// 7. Scopes requested:
//      https://www.googleapis.com/auth/youtube.readonly
//      https://www.googleapis.com/auth/yt-analytics.readonly

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-utils";
import { buildAuthUrl } from "@/lib/youtube-oauth";

export async function GET(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || !isAdmin(role ?? "")) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const host = forwardedHost ?? req.headers.get("host") ?? req.nextUrl.host;
  const proto = forwardedProto ?? req.nextUrl.protocol.replace(":", "");
  const origin = `${proto}://${host}`;
  const redirectUri = `${origin}/api/admin/reviewer/oauth/callback`;
  const state = crypto.randomBytes(16).toString("hex");

  const url = buildAuthUrl(redirectUri, state);

  const res = NextResponse.redirect(url);
  res.cookies.set("yt_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-utils";
import { storeTokensFromCode } from "@/lib/youtube-oauth";

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
  const settingsUrl = `${origin}/admin/reviewer/settings`;

  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const state = req.nextUrl.searchParams.get("state");
  const cookieState = req.cookies.get("yt_oauth_state")?.value;

  const fail = (reason: string) =>
    NextResponse.redirect(
      `${settingsUrl}?oauth=failed&reason=${encodeURIComponent(reason)}`,
    );

  if (error) return fail(error);
  if (!code) return fail("missing_code");
  if (!state || !cookieState || state !== cookieState) {
    return fail("state_mismatch");
  }

  try {
    const redirectUri = `${origin}/api/admin/reviewer/oauth/callback`;
    await storeTokensFromCode(code, redirectUri);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown_error";
    return fail(msg);
  }

  const res = NextResponse.redirect(`${settingsUrl}?oauth=success`);
  res.cookies.delete("yt_oauth_state");
  return res;
}

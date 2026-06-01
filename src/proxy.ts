import { NextRequest, NextResponse } from "next/server";

// Permanent (301) redirect for the member-facing tools hub rename:
//   /member/ai-tools          → /member/content-tools
//   /member/ai-tools/<sub...> → /member/content-tools/<sub...>
// Internal code, component folders, and API routes (/api/ai-tools, /admin/ai-tools)
// intentionally keep their original names — only the member URL moved.
//
// Next.js 16 renamed the `middleware` file convention to `proxy`.
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const rest = pathname.slice("/member/ai-tools".length);
  const url = req.nextUrl.clone();
  url.pathname = `/member/content-tools${rest}`;
  return NextResponse.redirect(url, { status: 301 });
}

export const config = {
  matcher: ["/member/ai-tools", "/member/ai-tools/:path*"],
};

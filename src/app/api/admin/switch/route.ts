import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { IMPERSONATE_COOKIE } from "@/lib/impersonate-constants";

export async function GET(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || (role !== "admin" && role !== "editor")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const memberId = req.nextUrl.searchParams.get("memberId");
  if (!memberId) {
    return NextResponse.redirect(new URL("/admin", req.url));
  }

  if (role === "editor") {
    const editorId = (session.user as any).id as string;
    const editor = await prisma.user.findUnique({
      where: { id: editorId },
      select: { allowedMemberIds: true },
    });
    const allowed = editor?.allowedMemberIds;
    if (allowed !== null && Array.isArray(allowed) && !(allowed as string[]).includes(memberId)) {
      return NextResponse.redirect(new URL("/admin", req.url));
    }
  }

  const member = await prisma.user.findUnique({
    where: { id: memberId },
    select: { id: true },
  });

  if (!member) {
    return NextResponse.redirect(new URL("/admin", req.url));
  }

  const response = NextResponse.redirect(new URL("/member/dashboard", req.url));
  response.cookies.set(IMPERSONATE_COOKIE, memberId, {
    httpOnly: false,
    path: "/",
    maxAge: 60 * 60 * 8,
    sameSite: "lax",
  });

  return response;
}

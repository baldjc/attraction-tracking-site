import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { IMPERSONATE_COOKIE } from "@/lib/impersonate-constants";

function publicBase(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  return `${proto}://${host}`;
}

export async function GET(req: NextRequest) {
  const base = publicBase(req);
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || (role !== "admin" && role !== "editor")) {
    return NextResponse.redirect(new URL("/login", base));
  }

  const memberId = req.nextUrl.searchParams.get("memberId");
  if (!memberId) {
    return NextResponse.redirect(new URL("/admin", base));
  }

  if (role === "editor") {
    const editorId = (session.user as any).id as string;
    const editor = await prisma.user.findUnique({
      where: { id: editorId },
      select: { allowedMemberIds: true },
    });
    const allowed = editor?.allowedMemberIds;
    if (allowed !== null && Array.isArray(allowed) && !(allowed as string[]).includes(memberId)) {
      return NextResponse.redirect(new URL("/admin", base));
    }
  }

  const member = await prisma.user.findUnique({
    where: { id: memberId },
    select: { id: true },
  });

  if (!member) {
    return NextResponse.redirect(new URL("/admin", base));
  }

  const response = NextResponse.redirect(new URL("/member/dashboard", base));
  response.cookies.set(IMPERSONATE_COOKIE, memberId, {
    httpOnly: false,
    path: "/",
    maxAge: 60 * 60 * 8,
    sameSite: "lax",
  });

  return response;
}

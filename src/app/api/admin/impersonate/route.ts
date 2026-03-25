import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { cookies } from "next/headers";
import { IMPERSONATE_COOKIE } from "@/lib/session-utils";
import { isAdminOrEditor, canAccessTier } from "@/lib/auth-utils";

export async function POST(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdminOrEditor(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { memberId } = await req.json();

  if (role === "editor") {
    const editorId = (session.user as any).id as string;
    const editor = await prisma.user.findUnique({
      where: { id: editorId },
      select: { allowedMemberIds: true },
    });
    const allowed = editor?.allowedMemberIds;
    if (allowed !== null && Array.isArray(allowed) && !(allowed as string[]).includes(memberId)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
  }

  const member = await prisma.user.findUnique({
    where: { id: memberId },
    select: { id: true, fullName: true, email: true, serviceTier: true },
  });

  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Editor can only impersonate editing/mastery members
  if (!canAccessTier(role, member.serviceTier)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATE_COOKIE, memberId, {
    httpOnly: false,
    path: "/",
    maxAge: 60 * 60 * 8,
    sameSite: "lax",
  });

  return NextResponse.json({
    ok: true,
    member: { id: member.id, name: member.fullName ?? member.email },
  });
}

export async function DELETE() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdminOrEditor(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.delete(IMPERSONATE_COOKIE);

  return NextResponse.json({ ok: true });
}

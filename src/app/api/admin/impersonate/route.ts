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
  const ownerId = (session.user as any).id as string;

  // Switching "view" to your own account just clears the impersonation cookie.
  // Editors don't include themselves in allowedMemberIds, and admins viewing
  // themselves shouldn't go through the impersonation path either.
  if (memberId && ownerId && memberId === ownerId) {
    const cookieStore = await cookies();
    cookieStore.delete(IMPERSONATE_COOKIE);
    return NextResponse.json({ ok: true, member: { id: ownerId, name: session.user.email ?? "" } });
  }

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

  // Editor can only impersonate editing/mastery members; admin can impersonate anyone
  if (role === "editor" && !canAccessTier(role, member.serviceTier ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  // Tie the cookie to the staff account that set it so a stale cookie left on
  // a shared device cannot apply to whoever logs in next.
  cookieStore.set(IMPERSONATE_COOKIE, `${ownerId}:${memberId}`, {
    httpOnly: true,
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 8,
    sameSite: "lax",
  });

  // Clear any active test avatar state when starting impersonation
  // Wrapped in try/catch — columns may not exist yet on older DB instances
  try {
    if (ownerId) {
      await prisma.user.update({
        where: { id: ownerId },
        data: { activeTestAvatarId: null, activeTestMemberId: null },
      });
    }
  } catch {
    // Non-fatal — impersonation still succeeds
  }

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

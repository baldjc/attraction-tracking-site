import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || role !== "admin") return null;
  return (session.user as any).id as string;
}

export async function POST(req: NextRequest) {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  if (body.testAvatarId) {
    const testAvatar = await prisma.adminTestAvatar.findUnique({
      where: { id: body.testAvatarId },
    });
    if (!testAvatar || testAvatar.adminUserId !== adminId) {
      return NextResponse.json({ error: "Test avatar not found" }, { status: 404 });
    }
    await prisma.user.update({
      where: { id: adminId },
      data: { activeTestAvatarId: body.testAvatarId, activeTestMemberId: null },
    });
    return NextResponse.json({ ok: true, mode: "custom", label: testAvatar.label });
  }

  if (body.memberId) {
    const member = await prisma.user.findUnique({
      where: { id: body.memberId },
      select: { id: true, fullName: true, email: true },
    });
    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }
    try {
      await prisma.user.update({
        where: { id: adminId },
        data: { activeTestMemberId: body.memberId, activeTestAvatarId: null },
      });
    } catch (err) {
      console.error("[test-avatars/active] failed to persist member selection:", err);
      return NextResponse.json({ error: "Failed to save selection" }, { status: 500 });
    }
    const name = member.fullName || member.email;
    return NextResponse.json({ ok: true, mode: "member", label: `${name}'s Avatar` });
  }

  return NextResponse.json({ error: "Must provide testAvatarId or memberId" }, { status: 400 });
}

export async function DELETE() {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.user.update({
    where: { id: adminId },
    data: { activeTestAvatarId: null, activeTestMemberId: null },
  });

  return NextResponse.json({ ok: true });
}

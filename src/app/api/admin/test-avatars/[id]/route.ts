import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || role !== "admin") return null;
  return (session.user as any).id as string;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.adminTestAvatar.findUnique({ where: { id } });
  if (!existing || existing.adminUserId !== adminId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.adminTestAvatar.update({
    where: { id },
    data: {
      ...(body.label !== undefined && { label: body.label }),
      ...(body.avatarName !== undefined && { avatarName: body.avatarName }),
      ...(body.avatarSummary !== undefined && { avatarSummary: body.avatarSummary }),
      ...(body.avatarProfile !== undefined && { avatarProfile: body.avatarProfile }),
      ...(body.contentThemes !== undefined && { contentThemes: body.contentThemes }),
      ...(body.niche !== undefined && { niche: body.niche }),
      ...(body.city !== undefined && { city: body.city }),
    },
  });

  return NextResponse.json({ testAvatar: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const existing = await prisma.adminTestAvatar.findUnique({ where: { id } });
  if (!existing || existing.adminUserId !== adminId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.adminTestAvatar.delete({ where: { id } });

  // Clear active state if this was the active avatar
  await prisma.user.updateMany({
    where: { id: adminId, activeTestAvatarId: id },
    data: { activeTestAvatarId: null },
  });

  return NextResponse.json({ ok: true });
}

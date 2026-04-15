import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || role !== "admin") return null;
  return (session.user as any).id as string;
}

export async function GET() {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [testAvatars, user] = await Promise.all([
    prisma.adminTestAvatar.findMany({
      where: { adminUserId: adminId },
      orderBy: { slotNumber: "asc" },
    }),
    prisma.user.findUnique({
      where: { id: adminId },
      select: { activeTestAvatarId: true, activeTestMemberId: true },
    }),
  ]);

  return NextResponse.json({
    testAvatars,
    activeTestAvatarId: user?.activeTestAvatarId ?? null,
    activeTestMemberId: user?.activeTestMemberId ?? null,
  });
}

export async function POST(req: NextRequest) {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { slotNumber, label, avatarName, avatarSummary, avatarProfile, contentThemes, niche, city } = body;

  if (!label?.trim()) return NextResponse.json({ error: "Label is required" }, { status: 400 });
  if (!slotNumber || slotNumber < 1 || slotNumber > 5) {
    return NextResponse.json({ error: "Slot number must be between 1 and 5" }, { status: 400 });
  }

  // Check if there's an existing avatar in this slot (for active state management)
  const existing = await prisma.adminTestAvatar.findUnique({
    where: { adminUserId_slotNumber: { adminUserId: adminId, slotNumber } },
    select: { id: true },
  });

  const created = await prisma.adminTestAvatar.upsert({
    where: { adminUserId_slotNumber: { adminUserId: adminId, slotNumber } },
    create: {
      adminUserId: adminId,
      slotNumber,
      label: label.trim(),
      avatarName: avatarName ?? null,
      avatarSummary: avatarSummary ?? null,
      avatarProfile: avatarProfile ?? null,
      contentThemes: contentThemes ?? null,
      niche: niche ?? null,
      city: city ?? null,
    },
    update: {
      label: label.trim(),
      avatarName: avatarName ?? null,
      avatarSummary: avatarSummary ?? null,
      avatarProfile: avatarProfile ?? null,
      contentThemes: contentThemes ?? null,
      niche: niche ?? null,
      city: city ?? null,
    },
  });

  // If we replaced the currently active test avatar, update the active ID
  if (existing && existing.id !== created.id) {
    await prisma.user.updateMany({
      where: { id: adminId, activeTestAvatarId: existing.id },
      data: { activeTestAvatarId: created.id },
    });
  }

  return NextResponse.json({ testAvatar: created });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logTeamActivity } from "@/lib/team";

async function requireAdmin() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || role !== "admin") return null;
  return (session.user as { id: string }).id;
}

// Admin support action: revoke an active team grant on a member's account.
// Admins can revoke but never invite. Logged with actorType "admin".
export async function POST(req: NextRequest) {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const memberId = typeof body?.memberId === "string" ? body.memberId : "";
  if (!memberId) {
    return NextResponse.json({ error: "Missing memberId." }, { status: 400 });
  }

  const membership = await prisma.teamMember.findFirst({
    where: { id: memberId, status: "active" },
    select: { id: true, email: true, teamUserId: true, primaryUserId: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "Team member not found." }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.teamMember.update({
      where: { id: membership.id },
      data: { status: "revoked", revokedAt: new Date() },
    }),
    prisma.user.updateMany({
      where: { id: membership.teamUserId, activeAsTeamMemberOf: membership.primaryUserId },
      data: { activeAsTeamMemberOf: null },
    }),
  ]);

  const admin = await prisma.user.findUnique({
    where: { id: adminId },
    select: { fullName: true, email: true },
  });

  await logTeamActivity({
    primaryUserId: membership.primaryUserId,
    actorType: "admin",
    actorUserId: adminId,
    actorName: admin?.fullName?.trim() || admin?.email || "Admin",
    action: `Admin revoked access for ${membership.email}`,
    metadata: { email: membership.email },
  });

  return NextResponse.json({ ok: true });
}

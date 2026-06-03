import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePrimaryUser, logTeamActivity } from "@/lib/team";
import { revokeTeamMemberFromAllFolders } from "@/lib/google-drive";

export const runtime = "nodejs";

// Revokes an active team grant. Owner-only. Clears the team member's active
// switch so they lose access on their very next request.
export async function POST(req: NextRequest) {
  const user = await requirePrimaryUser();
  if (!user) {
    return NextResponse.json({ error: "Only the account owner can revoke access." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const memberId = typeof body?.memberId === "string" ? body.memberId : "";
  if (!memberId) {
    return NextResponse.json({ error: "Missing memberId." }, { status: 400 });
  }

  const membership = await prisma.teamMember.findFirst({
    where: { id: memberId, primaryUserId: user.id, status: "active" },
    select: { id: true, email: true, teamUserId: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "Team member not found." }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.teamMember.update({
      where: { id: membership.id },
      data: { status: "revoked", revokedAt: new Date() },
    }),
    // Snap the team member back to their own account immediately.
    prisma.user.updateMany({
      where: { id: membership.teamUserId, activeAsTeamMemberOf: user.id },
      data: { activeAsTeamMemberOf: null },
    }),
  ]);

  const primary = await prisma.user.findUnique({
    where: { id: user.id },
    select: { fullName: true },
  });
  const primaryName = primary?.fullName?.trim() || user.email;

  await logTeamActivity({
    primaryUserId: user.id,
    actorType: "primary",
    actorUserId: user.id,
    actorName: primaryName,
    action: `Revoked access for ${membership.email}`,
    metadata: { email: membership.email },
  });

  // Phase 3 — strip this team member's access from every Drive folder under the
  // owner's content plans. Best-effort; never blocks the revoke.
  try {
    await revokeTeamMemberFromAllFolders(user.id, membership.email);
  } catch (err) {
    console.error("[team/revoke] Drive permission cleanup failed:", err);
  }

  return NextResponse.json({ ok: true });
}

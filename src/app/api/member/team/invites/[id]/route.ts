import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePrimaryUser, logTeamActivity } from "@/lib/team";

// Cancels a pending invite. Owner-only.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requirePrimaryUser();
  if (!user) {
    return NextResponse.json({ error: "Only the account owner can manage invites." }, { status: 403 });
  }

  const { id } = await params;

  const invite = await prisma.teamInvite.findFirst({
    where: { id, primaryUserId: user.id, status: "pending" },
    select: { id: true, email: true },
  });
  if (!invite) {
    return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  }

  await prisma.teamInvite.update({
    where: { id: invite.id },
    data: { status: "revoked", revokedAt: new Date() },
  });

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
    action: `Cancelled invite to ${invite.email}`,
    metadata: { email: invite.email },
  });

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";
import { hashInviteToken, logTeamActivity } from "@/lib/team";

// Accepts a team invite. The signed-in user's email must match the invited
// address. Creates (or reactivates) the team grant and marks the invite used.
export async function POST(req: NextRequest) {
  const resolved = await resolveUserFromSession();
  if (!resolved) {
    return NextResponse.json({ error: "Please sign in to accept this invite." }, { status: 401 });
  }
  // An admin impersonating a member is not the real actor — never let an
  // impersonated session accept an invite on the member's behalf.
  if (resolved.isImpersonating) {
    return NextResponse.json(
      { error: "Invites can't be accepted while impersonating a member." },
      { status: 403 },
    );
  }

  // Always act on the REAL signed-in account, even if currently operating
  // inside someone else's account.
  const actorId = resolved.actingAsTeamMember ? resolved.teamActorUserId! : resolved.id;
  const actorEmail = (resolved.actingAsTeamMember ? resolved.teamActorEmail! : resolved.email)
    .trim()
    .toLowerCase();

  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token) {
    return NextResponse.json({ error: "Missing invite token." }, { status: 400 });
  }

  const invite = await prisma.teamInvite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    select: { id: true, primaryUserId: true, email: true, status: true, expiresAt: true },
  });

  if (!invite || invite.status !== "pending") {
    return NextResponse.json({ error: "This invite is no longer valid." }, { status: 400 });
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    await prisma.teamInvite.update({
      where: { id: invite.id },
      data: { status: "expired" },
    });
    return NextResponse.json({ error: "This invite has expired. Ask for a new one." }, { status: 400 });
  }
  if (invite.email.trim().toLowerCase() !== actorEmail) {
    return NextResponse.json(
      { error: `This invite was sent to ${invite.email}. Sign in with that email to accept it.` },
      { status: 403 },
    );
  }
  if (invite.primaryUserId === actorId) {
    return NextResponse.json({ error: "You can't grant access to your own account." }, { status: 400 });
  }

  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { fullName: true, email: true },
  });

  // Atomically transition the invite pending -> accepted and only then create
  // the grant. The conditional updateMany (pending + unexpired) closes the
  // TOCTOU window where a concurrent revoke/cancel/expiry could otherwise be
  // overwritten by a late accept.
  const committed = await prisma.$transaction(async (tx) => {
    const transitioned = await tx.teamInvite.updateMany({
      where: { id: invite.id, status: "pending", expiresAt: { gt: new Date() } },
      data: { status: "accepted", acceptedAt: new Date() },
    });
    if (transitioned.count !== 1) {
      return false;
    }
    await tx.teamMember.upsert({
      where: {
        primaryUserId_teamUserId: { primaryUserId: invite.primaryUserId, teamUserId: actorId },
      },
      create: {
        primaryUserId: invite.primaryUserId,
        teamUserId: actorId,
        email: actor?.email ?? actorEmail,
        name: actor?.fullName ?? null,
        status: "active",
      },
      update: {
        status: "active",
        revokedAt: null,
        acceptedAt: new Date(),
        email: actor?.email ?? actorEmail,
        name: actor?.fullName ?? null,
      },
    });
    return true;
  });

  if (!committed) {
    return NextResponse.json({ error: "This invite is no longer valid." }, { status: 400 });
  }

  await logTeamActivity({
    primaryUserId: invite.primaryUserId,
    actorType: "team",
    actorUserId: actorId,
    actorName: actor?.fullName?.trim() || actorEmail,
    action: "Accepted the team invite",
    metadata: { email: actorEmail },
  });

  return NextResponse.json({ ok: true });
}

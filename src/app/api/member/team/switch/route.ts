import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";
import { logTeamActivity } from "@/lib/team";

// Switches the signed-in user into a primary's account, or back to their own.
// Body: { primaryUserId: string | null } (null = switch back to own account).
export async function POST(req: NextRequest) {
  const resolved = await resolveUserFromSession();
  if (!resolved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Never let an admin who is impersonating a member mutate that member's
  // team-switch state — the impersonated identity is not the real actor.
  if (resolved.isImpersonating) {
    return NextResponse.json(
      { error: "Account switching isn't available while impersonating." },
      { status: 403 },
    );
  }

  const actorId = resolved.actingAsTeamMember ? resolved.teamActorUserId! : resolved.id;
  const actorEmail = resolved.actingAsTeamMember ? resolved.teamActorEmail! : resolved.email;

  const body = await req.json().catch(() => null);
  const primaryUserId =
    body && Object.prototype.hasOwnProperty.call(body, "primaryUserId")
      ? body.primaryUserId
      : undefined;

  // Switch back to own account.
  if (primaryUserId === null) {
    // Capture the account being left before clearing it, so the audit trail
    // records the switch-out against the correct primary account.
    const leaving = resolved.actingAsTeamMember ? resolved.id : null;
    await prisma.user.update({
      where: { id: actorId },
      data: { activeAsTeamMemberOf: null },
    });
    if (leaving) {
      const actor = await prisma.user.findUnique({
        where: { id: actorId },
        select: { fullName: true },
      });
      await logTeamActivity({
        primaryUserId: leaving,
        actorType: "team",
        actorUserId: actorId,
        actorName: actor?.fullName?.trim() || actorEmail,
        action: "Switched out of the account",
      });
    }
    return NextResponse.json({ ok: true, actingAs: null });
  }

  if (typeof primaryUserId !== "string" || !primaryUserId) {
    return NextResponse.json({ error: "Missing primaryUserId." }, { status: 400 });
  }

  // Verify the grant is active before switching in.
  const membership = await prisma.teamMember.findFirst({
    where: { primaryUserId, teamUserId: actorId, status: "active" },
    select: { id: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "You don't have access to that account." }, { status: 403 });
  }

  await prisma.user.update({
    where: { id: actorId },
    data: { activeAsTeamMemberOf: primaryUserId },
  });

  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { fullName: true },
  });

  await logTeamActivity({
    primaryUserId,
    actorType: "team",
    actorUserId: actorId,
    actorName: actor?.fullName?.trim() || actorEmail,
    action: "Switched into the account",
  });

  return NextResponse.json({ ok: true, actingAs: primaryUserId });
}

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";

// Returns the accounts the signed-in user may operate as a team member, plus
// which account (if any) they are currently switched into. Drives the sidebar
// account switcher. Always keyed to the REAL signed-in user, even while they
// are operating inside someone else's account.
export async function GET() {
  const resolved = await resolveUserFromSession();
  if (!resolved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // While an admin is impersonating, the resolved identity is not the real
  // signed-in actor — don't expose or imply any team-switch context.
  if (resolved.isImpersonating) {
    return NextResponse.json({ actingAs: null, accounts: [] });
  }

  const actorId = resolved.actingAsTeamMember ? resolved.teamActorUserId! : resolved.id;
  const actingAs = resolved.actingAsTeamMember ? resolved.id : null;

  const grants = await prisma.teamMember.findMany({
    where: { teamUserId: actorId, status: "active" },
    orderBy: { acceptedAt: "desc" },
    select: {
      primaryUserId: true,
      primaryUser: { select: { fullName: true, email: true } },
    },
  });

  const accounts = grants.map((g) => ({
    primaryUserId: g.primaryUserId,
    name: g.primaryUser?.fullName?.trim() || g.primaryUser?.email || "Account",
  }));

  return NextResponse.json({ actingAs, accounts });
}

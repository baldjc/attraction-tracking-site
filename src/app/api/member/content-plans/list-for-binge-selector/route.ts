import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

// Lightweight option list for the Binge Video selector inside the Content
// Planner edit modal. Returns every plan owned by the authenticated user
// EXCEPT the one being edited (passed as `excludeId`), sorted most-recently-
// updated first so the freshest videos surface at the top of the dropdown.
// Includes plans at every status — members plan binge chains in advance, not
// just against already-published videos.
export async function GET(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const excludeId = searchParams.get("excludeId");

  const plans = await prisma.contentPlan.findMany({
    where: {
      userId: user.id,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      theme: true,
      status: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ plans });
}

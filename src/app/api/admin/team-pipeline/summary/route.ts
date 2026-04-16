import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

const PRODUCTION_TIERS = ["editing_2", "editing_4", "mastery_2", "mastery_4", "done_with_you"];

export async function GET() {
  const session = await auth();
  const role = (session?.user as { role?: string; id?: string } | undefined)?.role;
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!session?.user || !userId || (role !== "admin" && role !== "editor")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseWhere = { user: { serviceTier: { in: PRODUCTION_TIERS } } };

  const [scripted, filmed, assignedToMe, unassigned] = await Promise.all([
    prisma.contentPlan.count({ where: { ...baseWhere, status: "Scripted" } }),
    prisma.contentPlan.count({ where: { ...baseWhere, status: "Filmed" } }),
    prisma.contentPlan.count({ where: { ...baseWhere, assignedUserId: userId } }),
    prisma.contentPlan.count({ where: { ...baseWhere, assignedUserId: null } }),
  ]);

  return NextResponse.json({ scripted, filmed, assignedToMe, unassigned });
}

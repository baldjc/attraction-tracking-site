import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ServiceTier } from "@/generated/prisma/client";

const PRODUCTION_TIERS: ServiceTier[] = [
  ServiceTier.production,
  ServiceTier.growth,
  ServiceTier.done_with_you,
];

export async function GET() {
  const session = await auth();
  const role = (session?.user as { role?: string; id?: string } | undefined)?.role;
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!session?.user || !userId || (role !== "admin" && role !== "editor")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [scripted, filmed, assignedToMe, unassigned] = await Promise.all([
    prisma.contentPlan.count({ where: { status: "Scripted", user: { serviceTier: { in: PRODUCTION_TIERS } } } }),
    prisma.contentPlan.count({ where: { status: "Filmed", user: { serviceTier: { in: PRODUCTION_TIERS } } } }),
    prisma.contentPlan.count({ where: { assignedUserId: userId, user: { serviceTier: { in: PRODUCTION_TIERS } } } }),
    prisma.contentPlan.count({ where: { assignedUserId: null, user: { serviceTier: { in: PRODUCTION_TIERS } } } }),
  ]);

  return NextResponse.json({ scripted, filmed, assignedToMe, unassigned });
}

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";

export async function GET(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const isAdmin = user.isAdmin;

  const { searchParams } = new URL(req.url);
  const planIdsParam = searchParams.get("planIds") ?? "";
  const planIds = planIdsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (planIds.length === 0) {
    return NextResponse.json({ artifactsByPlan: {} });
  }

  const plans = await prisma.contentPlan.findMany({
    where: {
      id: { in: planIds },
      deletedAt: null,
      ...(isAdmin ? {} : { userId: user.id }),
    },
    select: { id: true },
  });

  const ownedIds = plans.map((p) => p.id);
  if (ownedIds.length === 0) {
    return NextResponse.json({ artifactsByPlan: {} });
  }

  const artifacts = await prisma.planArtifact.findMany({
    where: { planId: { in: ownedIds } },
    orderBy: [{ planId: "asc" }, { type: "asc" }, { version: "desc" }],
  });

  const artifactsByPlan: Record<string, Record<string, typeof artifacts>> = {};
  for (const a of artifacts) {
    if (!artifactsByPlan[a.planId]) artifactsByPlan[a.planId] = {};
    if (!artifactsByPlan[a.planId][a.type]) artifactsByPlan[a.planId][a.type] = [];
    artifactsByPlan[a.planId][a.type].push(a);
  }

  return NextResponse.json({ artifactsByPlan });
}

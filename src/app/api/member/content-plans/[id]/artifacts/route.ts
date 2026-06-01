import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";
import { getFeatureFlags } from "@/lib/feature-flags";
import { syncArtifactToDrive } from "@/lib/drive-sync";

async function checkOwnership(planId: string, userId: string, isAdmin: boolean) {
  const plan = await prisma.contentPlan.findFirst({ where: { id: planId, deletedAt: null } });
  if (!plan) return null;
  if (!isAdmin && plan.userId !== userId) return null;
  return plan;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const plan = await checkOwnership(id, user.id, user.isAdmin);
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Sprint 3: read gate — when tool_planner_linkage is off, hide artifacts
  // entirely so dependent UI (progress track score badge, Repurposed Content
  // section) collapses without extra client-side flag checks.
  const flags = await getFeatureFlags();
  if (!flags.tool_planner_linkage) {
    return NextResponse.json({ artifacts: {} });
  }

  const artifacts = await prisma.planArtifact.findMany({
    where: { planId: id },
    orderBy: [{ type: "asc" }, { version: "desc" }],
  });

  const grouped: Record<string, typeof artifacts> = {};
  for (const a of artifacts) {
    if (!grouped[a.type]) grouped[a.type] = [];
    grouped[a.type].push(a);
  }

  return NextResponse.json({ artifacts: grouped });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const plan = await checkOwnership(id, user.id, user.isAdmin);
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Sprint 3: gate plan-artifact writes behind tool_planner_linkage so that
  // disabling the flag fully suppresses tool→plan persistence.
  const flags = await getFeatureFlags();
  if (!flags.tool_planner_linkage) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 403 });
  }

  const body = await req.json();
  const { type, content, metadata } = body;
  if (!type) return NextResponse.json({ error: "type is required" }, { status: 400 });

  const existing = await prisma.planArtifact.findFirst({
    where: { planId: id, type, supersededById: null },
    orderBy: { version: "desc" },
  });

  const nextVersion = existing ? existing.version + 1 : 1;

  const artifact = await prisma.$transaction(async (tx) => {
    const created = await tx.planArtifact.create({
      data: {
        planId: id,
        type,
        content: content ?? null,
        metadata: metadata ?? null,
        version: nextVersion,
      },
    });

    if (existing) {
      await tx.planArtifact.update({
        where: { id: existing.id },
        data: { supersededById: created.id },
      });
    }

    return created;
  });

  // Sprint 6 — fire-and-forget Drive sync. Do NOT await: Drive latency must
  // not block the tool save flow, and syncArtifactToDrive swallows its own
  // errors internally.
  if (typeof content === "string" && content.length > 0) {
    void syncArtifactToDrive(id, type, content);
  }

  return NextResponse.json({ artifact }, { status: 201 });
}

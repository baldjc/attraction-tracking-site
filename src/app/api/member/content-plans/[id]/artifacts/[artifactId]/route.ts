import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";

async function checkArtifactOwnership(
  planId: string,
  artifactId: string,
  userId: string,
  isAdmin: boolean
) {
  const plan = await prisma.contentPlan.findUnique({ where: { id: planId } });
  if (!plan) return null;
  if (!isAdmin && plan.userId !== userId) return null;

  const artifact = await prisma.planArtifact.findUnique({
    where: { id: artifactId },
  });
  if (!artifact || artifact.planId !== planId) return null;
  return artifact;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; artifactId: string }> }
) {
  const { id, artifactId } = await params;
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const artifact = await checkArtifactOwnership(id, artifactId, user.id, user.isAdmin);
  if (!artifact) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ artifact });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; artifactId: string }> }
) {
  const { id, artifactId } = await params;
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const artifact = await checkArtifactOwnership(id, artifactId, user.id, user.isAdmin);
  if (!artifact) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const updated = await prisma.planArtifact.update({
    where: { id: artifactId },
    data: {
      ...(body.content !== undefined ? { content: body.content } : {}),
      ...(body.metadata !== undefined ? { metadata: body.metadata } : {}),
    },
  });

  return NextResponse.json({ artifact: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; artifactId: string }> }
) {
  const { id, artifactId } = await params;
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const artifact = await checkArtifactOwnership(id, artifactId, user.id, user.isAdmin);
  if (!artifact) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const tombstone = `deleted:${artifactId}`;
  await prisma.planArtifact.update({
    where: { id: artifactId },
    data: { supersededById: tombstone },
  });

  return NextResponse.json({ success: true });
}

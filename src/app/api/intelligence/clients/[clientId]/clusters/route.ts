import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

async function adminOnly() {
  const session = await auth();
  return (session?.user as any)?.role === "admin" ? session : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  if (!await adminOnly()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { clientId } = await params;

  const clusters = await prisma.seoCluster.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    include: { keywords: { orderBy: { volume: "desc" }, take: 20 } },
  });
  return NextResponse.json(clusters);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  if (!await adminOnly()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { clientId } = await params;
  const { name, theme, notes, keywordIds } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const cluster = await prisma.seoCluster.create({
    data: { clientId, name: name.trim(), theme: theme?.trim() || null, notes: notes?.trim() || null },
  });

  if (keywordIds?.length) {
    await prisma.seoKeyword.updateMany({
      where: { id: { in: keywordIds } },
      data: { clusterId: cluster.id },
    });
  }

  return NextResponse.json(cluster, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  if (!await adminOnly()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await params;
  const { id, name, theme, notes } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const cluster = await prisma.seoCluster.update({
    where: { id },
    data: { name: name?.trim(), theme: theme?.trim() || null, notes: notes?.trim() || null },
  });
  return NextResponse.json(cluster);
}

export async function DELETE(req: NextRequest) {
  if (!await adminOnly()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.seoCluster.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

async function adminOnly() {
  const session = await auth();
  return (session?.user as any)?.role === "admin" ? session : null;
}

export async function GET() {
  if (!await adminOnly()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const entries = await prisma.swipeFileEntry.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json(entries);
}

export async function POST(req: NextRequest) {
  const session = await adminOnly();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { videoId, title, thumbnailUrl, notes, tags, audience, theme, angle } = await req.json();
  if (!title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });

  const existing = videoId ? await prisma.swipeFileEntry.findFirst({ where: { videoId } }) : null;
  if (existing) return NextResponse.json(existing);

  const entry = await prisma.swipeFileEntry.create({
    data: {
      videoId: videoId ?? null,
      title: title.trim(),
      thumbnailUrl: thumbnailUrl ?? null,
      notes: notes?.trim() ?? null,
      tags: tags ?? [],
      audience: audience ?? null,
      theme: theme ?? null,
      angle: angle ?? null,
      createdBy: (session.user as any)?.email ?? "admin",
    },
  });
  return NextResponse.json(entry, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  if (!await adminOnly()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.swipeFileEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

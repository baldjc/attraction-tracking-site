import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function isAdmin(session: any) {
  return session?.user?.id && session.user.role === "admin";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entries = await prisma.changelogEntry.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      _count: { select: { views: true } },
    },
  });

  return NextResponse.json({ entries });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, body, emoji, type } = await req.json();
  if (!title || !body) return NextResponse.json({ error: "Title and body required" }, { status: 400 });

  const entry = await prisma.changelogEntry.create({
    data: { title, body, emoji: emoji || "✨", type: type || "changelog" },
    include: { _count: { select: { views: true } } },
  });

  return NextResponse.json({ entry });
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, published } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const entry = await prisma.changelogEntry.update({
    where: { id },
    data: { published },
    include: { _count: { select: { views: true } } },
  });

  return NextResponse.json({ entry });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.changelogEntry.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}

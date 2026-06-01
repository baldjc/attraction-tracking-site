import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

async function requireStaff() {
  const session = await auth();
  const role = (session?.user as { role?: string; id?: string } | undefined)?.role;
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!session?.user || !userId || (role !== "admin" && role !== "editor")) return null;
  return { userId, role: role! };
}

export async function GET(req: NextRequest) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const planId = searchParams.get("planId");
  if (!planId) return NextResponse.json({ error: "planId required" }, { status: 400 });

  const notes = await prisma.planTeamNote.findMany({
    where: { planId },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { id: true, fullName: true, email: true } } },
  });
  return NextResponse.json({
    notes: notes.map((n) => ({
      id: n.id,
      note: n.note,
      visibility: n.visibility,
      createdAt: n.createdAt,
      author: { id: n.author.id, name: n.author.fullName || n.author.email },
    })),
  });
}

export async function POST(req: NextRequest) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { planId, note, visibility } = body as { planId?: string; note?: string; visibility?: string };
  if (!planId || !note?.trim()) return NextResponse.json({ error: "planId and note required" }, { status: 400 });
  const vis = visibility === "member_visible" ? "member_visible" : "team";

  const plan = await prisma.contentPlan.findFirst({ where: { id: planId, deletedAt: null }, select: { id: true } });
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  const created = await prisma.planTeamNote.create({
    data: { planId, authorId: staff.userId, note: note.trim(), visibility: vis },
    include: { author: { select: { id: true, fullName: true, email: true } } },
  });

  return NextResponse.json({
    note: {
      id: created.id,
      note: created.note,
      visibility: created.visibility,
      createdAt: created.createdAt,
      author: { id: created.author.id, name: created.author.fullName || created.author.email },
    },
  });
}

export async function PATCH(req: NextRequest) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const { noteId, visibility } = body as { noteId?: string; visibility?: string };
  if (!noteId || !visibility) return NextResponse.json({ error: "noteId and visibility required" }, { status: 400 });
  const vis = visibility === "member_visible" ? "member_visible" : "team";
  const updated = await prisma.planTeamNote.update({ where: { id: noteId }, data: { visibility: vis } });
  return NextResponse.json({ ok: true, visibility: updated.visibility });
}

export async function DELETE(req: NextRequest) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const noteId = searchParams.get("noteId");
  if (!noteId) return NextResponse.json({ error: "noteId required" }, { status: 400 });
  await prisma.planTeamNote.delete({ where: { id: noteId } });
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!session?.user || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const plan = await prisma.contentPlan.findUnique({ where: { id }, select: { userId: true } });
  if (!plan || plan.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const notes = await prisma.planTeamNote.findMany({
    where: { planId: id, visibility: "member_visible" },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { id: true, fullName: true, email: true } } },
  });

  return NextResponse.json({
    notes: notes.map((n) => ({
      id: n.id,
      note: n.note,
      createdAt: n.createdAt,
      author: { name: n.author.fullName || n.author.email },
    })),
  });
}

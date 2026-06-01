import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Impersonation-aware so an admin/editor viewing a member's plan sees the
  // member's team notes, not a 404 from comparing against the admin id.
  const resolved = await resolveUserFromSession();
  if (!resolved) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = resolved.id;
  const { id } = await params;

  const plan = await prisma.contentPlan.findFirst({ where: { id, deletedAt: null }, select: { userId: true } });
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

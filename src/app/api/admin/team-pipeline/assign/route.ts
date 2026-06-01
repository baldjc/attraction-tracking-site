import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as { role?: string; id?: string } | undefined)?.role;
  const actorId = (session?.user as { id?: string } | undefined)?.id;
  if (!session?.user || !actorId || (role !== "admin" && role !== "editor")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { planId, assignedUserId } = body as { planId?: string; assignedUserId?: string | null };
  if (!planId) return NextResponse.json({ error: "planId required" }, { status: 400 });

  const plan = await prisma.contentPlan.findFirst({ where: { id: planId, deletedAt: null }, select: { assignedUserId: true } });
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  if (assignedUserId) {
    const assignee = await prisma.user.findUnique({ where: { id: assignedUserId }, select: { role: true } });
    if (!assignee || (assignee.role !== "admin" && assignee.role !== "editor")) {
      return NextResponse.json({ error: "Assignee must be admin or editor" }, { status: 400 });
    }
  }

  const [updated] = await prisma.$transaction([
    prisma.contentPlan.update({
      where: { id: planId },
      data: { assignedUserId: assignedUserId || null },
      include: { assignedUser: { select: { id: true, fullName: true, email: true } } },
    }),
    prisma.planAssignmentLog.create({
      data: {
        planId,
        actorId,
        fromAssigneeId: plan.assignedUserId,
        toAssigneeId: assignedUserId || null,
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    assignedUser: updated.assignedUser
      ? { id: updated.assignedUser.id, name: updated.assignedUser.fullName || updated.assignedUser.email, email: updated.assignedUser.email }
      : null,
  });
}

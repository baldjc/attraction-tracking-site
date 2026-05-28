import { NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { lessonId } = await params;
  const { completed } = await req.json();

  const completedAt = completed ? new Date() : null;

  const record = await prisma.memberLessonProgress.upsert({
    where: { userId_lessonId: { userId: user.id, lessonId } },
    create: { userId: user.id, lessonId, completed, completedAt },
    update: { completed, completedAt },
  });

  return NextResponse.json({ success: true, completed: record.completed, completedAt: record.completedAt });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  if ((session.user as any).role !== "admin") return null;
  return session.user;
}

export async function GET(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "pending";
  const callId = searchParams.get("callId");

  const where: Record<string, unknown> = {};
  if (status && status !== "all") where.status = status;
  if (callId) {
    where.sourceType = "qa_call";
    where.sourceId = callId;
  }

  const entries = await prisma.knowledgeBaseEntry.findMany({
    where,
    include: { member: { select: { id: true, fullName: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });

  // Attach source titles
  const qaCallIds = entries.filter((e) => e.sourceType === "qa_call").map((e) => e.sourceId);
  const lessonIds = entries.filter((e) => e.sourceType === "course_lesson").map((e) => e.sourceId);

  const [qaCalls, lessons] = await Promise.all([
    qaCallIds.length > 0 ? prisma.qACall.findMany({ where: { id: { in: qaCallIds } }, select: { id: true, title: true, callDate: true } }) : [],
    lessonIds.length > 0 ? prisma.resourceLesson.findMany({ where: { id: { in: lessonIds } }, select: { id: true, title: true, lessonNumber: true } }) : [],
  ]);

  const qaMap = Object.fromEntries(qaCalls.map((c) => [c.id, c]));
  const lessonMap = Object.fromEntries(lessons.map((l) => [l.id, l]));

  const members = await prisma.user.findMany({
    where: { role: "foundations_member" },
    select: { id: true, fullName: true, email: true },
    orderBy: { fullName: "asc" },
  });

  return NextResponse.json({
    entries: entries.map((e) => ({
      ...e,
      sourceTitle: e.sourceType === "qa_call"
        ? (qaMap[e.sourceId]?.title ?? "Unknown call")
        : (lessonMap[e.sourceId] ? `${lessonMap[e.sourceId].lessonNumber} — ${lessonMap[e.sourceId].title}` : "Unknown lesson"),
      callDate: e.sourceType === "qa_call" ? (qaMap[e.sourceId]?.callDate ?? null) : null,
    })),
    members,
  });
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action, ids } = await req.json();
  if (action === "approve_all" && Array.isArray(ids)) {
    await prisma.knowledgeBaseEntry.updateMany({
      where: { id: { in: ids }, status: "pending" },
      data: { status: "approved" },
    });
    return NextResponse.json({ updated: ids.length });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { processLessonTranscript } from "../route";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  if ((session.user as any).role !== "admin") return null;
  return session.user;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const lesson = await prisma.resourceLesson.findUnique({ where: { id } });
  if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const segments = await prisma.knowledgeBaseEntry.findMany({
    where: { sourceType: "course_lesson", sourceId: id },
    orderBy: { timestampStart: "asc" },
  });

  return NextResponse.json({ ...lesson, segments });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const lesson = await prisma.resourceLesson.findUnique({ where: { id } });
  if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { title, lessonNumber, sessionNumber, skoolUrl, principles, fullTranscript, reprocess } = await req.json();

  const updated = await prisma.resourceLesson.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(lessonNumber !== undefined && { lessonNumber }),
      ...(sessionNumber !== undefined && { sessionNumber }),
      ...(skoolUrl !== undefined && { skoolUrl }),
      ...(principles !== undefined && { principles }),
      ...(fullTranscript !== undefined && { fullTranscript }),
    },
  });

  if (reprocess && (fullTranscript ?? lesson.fullTranscript)) {
    processLessonTranscript(id, fullTranscript ?? lesson.fullTranscript, principles ?? lesson.principles, title ?? lesson.title).catch(console.error);
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  await prisma.knowledgeBaseEntry.deleteMany({ where: { sourceType: "course_lesson", sourceId: id } });
  await prisma.resourceLesson.delete({ where: { id } });

  return NextResponse.json({ success: true });
}

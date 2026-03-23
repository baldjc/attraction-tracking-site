import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { processLessonTranscript } from "../../route";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  if ((session.user as any).role !== "admin") return null;
  return session.user;
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const lesson = await prisma.courseLesson.findUnique({ where: { id } });
  if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!lesson.fullTranscript.trim()) return NextResponse.json({ error: "No transcript to process" }, { status: 400 });

  try {
    await processLessonTranscript(id, lesson.fullTranscript, lesson.principles, lesson.title);
    const count = await prisma.knowledgeBaseEntry.count({ where: { sourceType: "course_lesson", sourceId: id } });
    return NextResponse.json({ success: true, segmentCount: count });
  } catch (err) {
    console.error("[process-lesson] Error:", err);
    return NextResponse.json({ error: "Failed to process transcript" }, { status: 500 });
  }
}

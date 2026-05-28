import { NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sectionId: string }> }
) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sectionId } = await params;

  const section = await prisma.courseSection.findFirst({
    where: {
      OR: [{ id: sectionId }, { slug: sectionId }],
      published: true,
      moduleType: "lead-generation",
    },
  });
  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const lessons = await prisma.courseLesson.findMany({
    where: { sectionId: section.id, published: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      youtubeUrl: true,
      sortOrder: true,
      principleTags: true,
    },
  });

  const lessonIds = lessons.map((l) => l.id);
  const progress = await prisma.memberLessonProgress.findMany({
    where: { userId: user.id, lessonId: { in: lessonIds } },
    select: { lessonId: true, completed: true },
  });
  const progressMap = new Map(progress.map((p) => [p.lessonId, p.completed]));

  const result = lessons.map((l) => ({
    ...l,
    completed: progressMap.get(l.id) ?? false,
  }));

  return NextResponse.json({ section: { id: section.id, title: section.title, slug: section.slug }, lessons: result });
}

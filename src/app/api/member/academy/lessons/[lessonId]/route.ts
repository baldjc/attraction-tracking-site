import { NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { lessonId } = await params;

  const lesson = await prisma.courseLesson.findFirst({
    where: {
      published: true,
      OR: [{ id: lessonId }, { slug: lessonId }],
    },
    include: {
      section: { select: { id: true, title: true, slug: true, sortOrder: true } },
      workbookFields: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [responses, homeworkRecord, progressRecord] = await Promise.all([
    prisma.memberWorkbookResponse.findMany({
      where: { userId: user.id, workbookFieldId: { in: lesson.workbookFields.map((f) => f.id) } },
    }),
    prisma.memberHomework.findFirst({ where: { userId: user.id, lessonId: lesson.id } }),
    prisma.memberLessonProgress.findFirst({ where: { userId: user.id, lessonId: lesson.id } }),
  ]);

  const responseMap = new Map(responses.map((r) => [r.workbookFieldId, r.response]));

  const workbookFields = lesson.workbookFields.map((f) => ({
    id: f.id,
    fieldType: f.fieldType,
    label: f.label,
    placeholderText: f.placeholderText,
    sortOrder: f.sortOrder,
    config: f.config,
    response: responseMap.get(f.id) ?? null,
  }));

  // Build prev/next by fetching all lessons in all sections ordered
  const allSections = await prisma.courseSection.findMany({
    where: { published: true },
    orderBy: { sortOrder: "asc" },
    include: {
      lessons: {
        where: { published: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, slug: true, title: true, sortOrder: true, sectionId: true },
      },
    },
  });

  const flatLessons: { id: string; slug: string; sectionSlug: string }[] = [];
  for (const sec of allSections) {
    for (const l of sec.lessons) {
      flatLessons.push({ id: l.id, slug: l.slug, sectionSlug: sec.slug });
    }
  }

  const idx = flatLessons.findIndex((l) => l.id === lesson.id);
  const prevLesson = idx > 0 ? flatLessons[idx - 1] : null;
  const nextLesson = idx < flatLessons.length - 1 ? flatLessons[idx + 1] : null;

  // Build sectionLessons — all sibling lessons in the current section with completion status
  const currentSection = allSections.find((sec) => sec.id === lesson.sectionId);
  const siblingLessons = currentSection?.lessons ?? [];
  const siblingLessonIds = siblingLessons.map((l) => l.id);

  const siblingProgressRecords = await prisma.memberLessonProgress.findMany({
    where: {
      userId: user.id,
      lessonId: { in: siblingLessonIds },
      completed: true,
    },
    select: { lessonId: true },
  });

  const completedSiblingIds = new Set(siblingProgressRecords.map((p) => p.lessonId));

  const sectionLessons = siblingLessons.map((l) => ({
    id: l.id,
    slug: l.slug,
    title: l.title,
    sortOrder: l.sortOrder,
    completed: completedSiblingIds.has(l.id),
  }));

  return NextResponse.json({
    lesson: {
      id: lesson.id,
      title: lesson.title,
      slug: lesson.slug,
      youtubeUrl: lesson.youtubeUrl,
      description: lesson.description,
      keyTakeaways: lesson.keyTakeaways,
      actionItems: lesson.actionItems,
      principleTags: lesson.principleTags,
      aiToolLink: lesson.aiToolLink,
      aiToolLabel: lesson.aiToolLabel,
      section: lesson.section,
      workbookFields,
      homework: homeworkRecord ? { homeworkItems: homeworkRecord.homeworkItems } : null,
      completed: progressRecord?.completed ?? false,
      completedAt: progressRecord?.completedAt ?? null,
      prevLesson,
      nextLesson,
      sectionLessons,
    },
  });
}

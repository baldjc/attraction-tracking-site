import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

function adminOnly(role: string | undefined) {
  return !role || role !== "admin";
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || adminOnly(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await params;

  const sections = await prisma.courseSection.findMany({
    where: { published: true },
    orderBy: { sortOrder: "asc" },
    include: {
      lessons: {
        where: { published: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, title: true, slug: true },
      },
    },
  });

  const allLessonIds = sections.flatMap((s) => s.lessons.map((l) => l.id));

  const [progress, allFields, responses, homework] = await Promise.all([
    prisma.memberLessonProgress.findMany({
      where: { userId, lessonId: { in: allLessonIds } },
      orderBy: { completedAt: "desc" },
    }),
    prisma.lessonWorkbookField.findMany({
      where: { lessonId: { in: allLessonIds } },
      select: { id: true, lessonId: true },
    }),
    prisma.memberWorkbookResponse.findMany({
      where: { userId, workbookFieldId: { in: [] } },
    }),
    prisma.memberHomework.findMany({ where: { userId, lessonId: { in: allLessonIds } } }),
  ]);

  const allFieldIds = allFields.map((f) => f.id);
  const filledResponses = await prisma.memberWorkbookResponse.findMany({
    where: { userId, workbookFieldId: { in: allFieldIds } },
  });

  const completedSet = new Set(progress.filter((p) => p.completed).map((p) => p.lessonId));
  const totalLessons = allLessonIds.length;
  const completedLessons = completedSet.size;

  const sectionBreakdown = sections.map((s) => {
    const secLessonIds = s.lessons.map((l) => l.id);
    const completed = secLessonIds.filter((id) => completedSet.has(id)).length;
    return { id: s.id, title: s.title, completed, total: secLessonIds.length };
  });

  const totalFields = allFieldIds.length;
  const filledFields = filledResponses.length;

  const totalHomeworkItems = homework.reduce((acc, h) => {
    const items = h.homeworkItems as { label: string; completed: boolean }[];
    return acc + (Array.isArray(items) ? items.length : 0);
  }, 0);
  const completedHomeworkItems = homework.reduce((acc, h) => {
    const items = h.homeworkItems as { label: string; completed: boolean }[];
    return acc + (Array.isArray(items) ? items.filter((i) => i.completed).length : 0);
  }, 0);

  const lastProgress = progress.find((p) => p.completed && p.completedAt);
  let lastLesson: { title: string; slug: string; sectionSlug: string; date: string } | null = null;
  if (lastProgress) {
    const lesson = sections
      .flatMap((s) => s.lessons.map((l) => ({ ...l, sectionSlug: s.slug })))
      .find((l) => l.id === lastProgress.lessonId);
    if (lesson) {
      lastLesson = {
        title: lesson.title,
        slug: lesson.slug,
        sectionSlug: lesson.sectionSlug,
        date: lastProgress.completedAt!.toISOString(),
      };
    }
  }

  return NextResponse.json({
    overall: {
      completed: completedLessons,
      total: totalLessons,
      pct: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0,
    },
    sections: sectionBreakdown,
    workbook: { filled: filledFields, total: totalFields },
    homework: { completed: completedHomeworkItems, total: totalHomeworkItems },
    lastLesson,
  });
}

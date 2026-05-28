import { NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sections = await prisma.courseSection.findMany({
    where: { published: true, moduleType: "lead-generation" },
    orderBy: { sortOrder: "asc" },
    include: {
      lessons: {
        where: { published: true },
        select: { id: true },
      },
    },
  });

  const lessonIds = sections.flatMap((s) => s.lessons.map((l) => l.id));

  const progress = await prisma.memberLessonProgress.findMany({
    where: { userId: user.id, lessonId: { in: lessonIds }, completed: true },
    select: { lessonId: true },
  });

  const completedSet = new Set(progress.map((p) => p.lessonId));

  const result = sections.map((s) => {
    const lessonCount = s.lessons.length;
    const completedCount = s.lessons.filter((l) => completedSet.has(l.id)).length;
    return {
      id: s.id,
      title: s.title,
      slug: s.slug,
      description: s.description,
      sortOrder: s.sortOrder,
      lessonCount,
      completedCount,
    };
  });

  return NextResponse.json({ sections: result });
}

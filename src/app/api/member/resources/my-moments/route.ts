import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { email: (session.user as any).email! } });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entries = await prisma.knowledgeBaseEntry.findMany({
    where: { memberId: user.id, status: "approved" },
    include: { savedItems: { where: { userId: user.id }, select: { id: true } } },
    orderBy: { createdAt: "desc" },
  });

  const callIds = [...new Set(entries.filter((e) => e.sourceType === "qa_call").map((e) => e.sourceId))];
  const lessonIds = [...new Set(entries.filter((e) => e.sourceType === "course_lesson").map((e) => e.sourceId))];

  const [calls, lessons] = await Promise.all([
    callIds.length > 0
      ? prisma.qACall.findMany({ where: { id: { in: callIds } }, select: { id: true, title: true, callDate: true, fathomShareUrl: true } })
      : [],
    lessonIds.length > 0
      ? prisma.fathomLesson.findMany({ where: { id: { in: lessonIds } }, select: { id: true, title: true, lessonNumber: true, skoolUrl: true } })
      : [],
  ]);

  const callMap = Object.fromEntries(calls.map((c) => [c.id, c]));
  const lessonMap = Object.fromEntries(lessons.map((l) => [l.id, l]));

  return NextResponse.json(
    entries.map((e) => ({
      id: e.id,
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      principles: e.principles,
      subTopic: e.subTopic,
      summary: e.summary,
      searchableText: e.searchableText,
      timestampStart: e.timestampStart,
      timestampEnd: e.timestampEnd,
      isGeneralTeaching: e.isGeneralTeaching,
      isSaved: e.savedItems.length > 0,
      source: e.sourceType === "qa_call" ? callMap[e.sourceId] ?? null : lessonMap[e.sourceId] ?? null,
    }))
  );
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

async function requireMember() {
  const session = await auth();
  if (!session?.user) return null;
  const user = await prisma.user.findUnique({ where: { email: (session.user as any).email! } });
  return user;
}

export async function GET(req: NextRequest) {
  const user = await requireMember();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const principle = searchParams.get("principle");
  const search = searchParams.get("search")?.trim().toLowerCase() ?? "";
  const sourceType = searchParams.get("sourceType"); // "course_lesson" | "qa_call" | null

  // Privacy: show general teaching entries to all, personal entries only to that member
  const where: Record<string, unknown> = {
    status: "approved",
    OR: [
      { isGeneralTeaching: true },
      { memberId: user.id, isGeneralTeaching: false },
    ],
  };

  if (principle) where.principles = { has: principle };
  if (sourceType) where.sourceType = sourceType;

  let entries = await prisma.knowledgeBaseEntry.findMany({
    where,
    include: {
      member: { select: { id: true, fullName: true } },
      savedItems: { where: { userId: user.id }, select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  // Full-text search (client-side after DB fetch for simplicity with small dataset)
  if (search) {
    entries = entries.filter((e) => {
      const haystack = `${e.subTopic} ${e.summary} ${e.searchableText} ${e.principles.join(" ")}`.toLowerCase();
      return search.split(" ").every((word) => haystack.includes(word));
    });
  }

  // Fetch source details (title, skoolUrl/fathomShareUrl)
  const lessonIds = [...new Set(entries.filter((e) => e.sourceType === "course_lesson").map((e) => e.sourceId))];
  const callIds = [...new Set(entries.filter((e) => e.sourceType === "qa_call").map((e) => e.sourceId))];

  const [lessons, calls] = await Promise.all([
    lessonIds.length > 0
      ? prisma.courseLesson.findMany({ where: { id: { in: lessonIds } }, select: { id: true, title: true, lessonNumber: true, skoolUrl: true } })
      : [],
    callIds.length > 0
      ? prisma.qACall.findMany({ where: { id: { in: callIds } }, select: { id: true, title: true, callDate: true, fathomShareUrl: true } })
      : [],
  ]);

  const lessonMap = Object.fromEntries(lessons.map((l) => [l.id, l]));
  const callMap = Object.fromEntries(calls.map((c) => [c.id, c]));

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
      memberId: e.memberId,
      isSaved: e.savedItems.length > 0,
      source: e.sourceType === "course_lesson"
        ? lessonMap[e.sourceId] ?? null
        : callMap[e.sourceId] ?? null,
    }))
  );
}

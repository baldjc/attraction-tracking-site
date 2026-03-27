import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { PRINCIPLE_NAMES, PRINCIPLE_SLUGS } from "@/lib/academy-constants";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const lessons = await prisma.courseLesson.findMany({
    where: { published: true },
    select: { principleTags: true },
  });

  const counts: Record<string, number> = {};
  for (const lesson of lessons) {
    const tags = lesson.principleTags as string[];
    for (const tag of tags) {
      counts[tag] = (counts[tag] ?? 0) + 1;
    }
  }

  const principles = PRINCIPLE_SLUGS.map((slug) => ({
    slug,
    name: PRINCIPLE_NAMES[slug],
    lessonCount: counts[slug] ?? 0,
  })).filter((p) => p.lessonCount > 0);

  return NextResponse.json({ principles });
}

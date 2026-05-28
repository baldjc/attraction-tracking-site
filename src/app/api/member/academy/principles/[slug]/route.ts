import { NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { PRINCIPLE_NAMES } from "@/lib/academy-constants";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;

  const name = PRINCIPLE_NAMES[slug];
  if (!name) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allLessons = await prisma.courseLesson.findMany({
    where: { published: true },
    include: { section: { select: { title: true, slug: true } } },
    orderBy: [{ section: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });

  const lessons = allLessons
    .filter((l) => (l.principleTags as string[]).includes(slug))
    .map((l) => ({
      id: l.id,
      title: l.title,
      slug: l.slug,
      sectionTitle: l.section.title,
      sectionSlug: l.section.slug,
    }));

  return NextResponse.json({ principle: { slug, name }, lessons });
}

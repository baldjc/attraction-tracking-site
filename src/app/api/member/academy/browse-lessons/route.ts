import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { PRINCIPLE_NAMES } from "@/lib/academy-constants";

export async function GET(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const principleDisplay = searchParams.get("principle"); // display name e.g. "ARC Attention"

  // Reverse-map display name → slug for filtering
  let principleSlug: string | null = null;
  if (principleDisplay) {
    const entry = Object.entries(PRINCIPLE_NAMES).find(([, name]) => name === principleDisplay);
    principleSlug = entry ? entry[0] : null;
    if (!principleSlug) return NextResponse.json([]);
  }

  const lessons = await prisma.courseLesson.findMany({
    where: { published: true },
    include: { section: { select: { title: true, slug: true, sortOrder: true } } },
    orderBy: [{ section: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });

  let filtered = lessons;
  if (principleSlug) {
    filtered = lessons.filter((l) =>
      (l.principleTags as string[]).includes(principleSlug!)
    );
  }

  const result = filtered.map((l) => {
    const tags = l.principleTags as string[];
    return {
      id: `fl_${l.id}`,
      title: l.title,
      slug: l.slug,
      sectionTitle: l.section.title,
      sectionSlug: l.section.slug,
      description: l.description,
      principles: tags.map((slug) => PRINCIPLE_NAMES[slug] ?? slug),
      sortOrder: l.sortOrder,
      sectionSortOrder: l.section.sortOrder,
    };
  });

  return NextResponse.json(result);
}

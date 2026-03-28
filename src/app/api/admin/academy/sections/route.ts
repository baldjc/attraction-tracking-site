import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

function adminOnly(role: string | undefined) {
  return !role || role !== "admin";
}

export async function GET() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || adminOnly(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sections = await prisma.courseSection.findMany({
    where: { moduleType: "foundations" },
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { lessons: true } } },
  });

  return NextResponse.json({
    sections: sections.map((s) => ({
      id: s.id,
      title: s.title,
      slug: s.slug,
      description: s.description,
      sortOrder: s.sortOrder,
      published: s.published,
      lessonCount: s._count.lessons,
    })),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || adminOnly(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { title, slug, description, sortOrder, published } = body;

  const section = await prisma.courseSection.create({
    data: {
      title,
      slug: slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      description: description ?? null,
      sortOrder: sortOrder ?? 0,
      published: published ?? false,
    },
  });

  return NextResponse.json({ section });
}

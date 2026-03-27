import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

function adminOnly(role: string | undefined) {
  return !role || role !== "admin";
}

export async function PUT(req: Request) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || adminOnly(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { sections = [], lessons = [] } = await req.json();

  await prisma.$transaction([
    ...sections.map((s: { id: string; sortOrder: number }) =>
      prisma.courseSection.update({ where: { id: s.id }, data: { sortOrder: s.sortOrder } })
    ),
    ...lessons.map((l: { id: string; sortOrder: number }) =>
      prisma.courseLesson.update({ where: { id: l.id }, data: { sortOrder: l.sortOrder } })
    ),
  ]);

  return NextResponse.json({ success: true });
}

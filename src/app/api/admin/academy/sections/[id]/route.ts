import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

function adminOnly(role: string | undefined) {
  return !role || role !== "admin";
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || adminOnly(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { title, slug, description, sortOrder, published } = body;

  const section = await prisma.courseSection.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(slug !== undefined && { slug }),
      ...(description !== undefined && { description }),
      ...(sortOrder !== undefined && { sortOrder }),
      ...(published !== undefined && { published }),
    },
  });

  return NextResponse.json({ section });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || adminOnly(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const lessonCount = await prisma.courseLesson.count({ where: { sectionId: id } });
  if (lessonCount > 0) {
    return NextResponse.json(
      { error: `This section has ${lessonCount} lesson${lessonCount !== 1 ? "s" : ""}. Delete lessons first.` },
      { status: 400 }
    );
  }

  await prisma.courseSection.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

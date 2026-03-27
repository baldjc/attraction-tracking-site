import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

function adminOnly(role: string | undefined) {
  return !role || role !== "admin";
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || adminOnly(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const lesson = await prisma.courseLesson.findUnique({
    where: { id },
    include: { section: { select: { id: true, title: true, slug: true } }, workbookFields: { orderBy: { sortOrder: "asc" } } },
  });

  if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ lesson });
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

  const lesson = await prisma.courseLesson.update({
    where: { id },
    data: {
      ...(body.sectionId !== undefined && { sectionId: body.sectionId }),
      ...(body.title !== undefined && { title: body.title }),
      ...(body.slug !== undefined && { slug: body.slug }),
      ...(body.youtubeUrl !== undefined && { youtubeUrl: body.youtubeUrl || null }),
      ...(body.description !== undefined && { description: body.description || null }),
      ...(body.keyTakeaways !== undefined && { keyTakeaways: body.keyTakeaways || null }),
      ...(body.actionItems !== undefined && { actionItems: body.actionItems || null }),
      ...(body.principleTags !== undefined && { principleTags: body.principleTags }),
      ...(body.aiToolLink !== undefined && { aiToolLink: body.aiToolLink || null }),
      ...(body.aiToolLabel !== undefined && { aiToolLabel: body.aiToolLabel || null }),
      ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
      ...(body.published !== undefined && { published: body.published }),
    },
  });

  return NextResponse.json({ lesson });
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
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "true";

  const [progressCount, responseCount] = await Promise.all([
    prisma.memberLessonProgress.count({ where: { lessonId: id } }),
    prisma.memberWorkbookResponse.count({ where: { workbookField: { lessonId: id } } }),
  ]);

  if ((progressCount > 0 || responseCount > 0) && !force) {
    return NextResponse.json(
      {
        warning: true,
        message: `This lesson has member data (${progressCount} progress records, ${responseCount} workbook responses). Delete anyway?`,
      },
      { status: 409 }
    );
  }

  await prisma.$transaction([
    prisma.memberWorkbookResponse.deleteMany({ where: { workbookField: { lessonId: id } } }),
    prisma.memberLessonProgress.deleteMany({ where: { lessonId: id } }),
    prisma.memberHomework.deleteMany({ where: { lessonId: id } }),
    prisma.lessonWorkbookField.deleteMany({ where: { lessonId: id } }),
    prisma.courseLesson.delete({ where: { id } }),
  ]);

  return NextResponse.json({ success: true });
}

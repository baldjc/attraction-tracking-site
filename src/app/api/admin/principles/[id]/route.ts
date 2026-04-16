import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || role !== "admin") return null;
  return (session.user as any).id as string;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { name, slug, description, colorLight, isActive } = body;

  const data: Record<string, any> = {};
  if (name !== undefined) data.name = name.trim();
  if (slug !== undefined) data.slug = slug.trim();
  if (description !== undefined) data.description = description?.trim() || null;
  if (colorLight !== undefined) data.colorLight = colorLight.trim();
  if (isActive !== undefined) data.isActive = isActive;

  try {
    const principle = await prisma.principle.update({ where: { id }, data });
    return NextResponse.json({ principle });
  } catch (err: any) {
    if (err.code === "P2025") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (err.code === "P2002") return NextResponse.json({ error: "Name or slug already in use" }, { status: 409 });
    throw err;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const principle = await prisma.principle.findUnique({ where: { id } });
  if (!principle) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { slug, name } = principle;

  // Check usage in CourseLesson.principleTags (JSON array of slugs)
  const courseLessonsWithSlug = await prisma.courseLesson.count({
    where: { principleTags: { array_contains: slug } },
  });

  // Check usage in KnowledgeBaseEntry.principles (String[] of display names)
  const kbEntriesWithName = await prisma.knowledgeBaseEntry.count({
    where: { principles: { has: name } },
  });

  // Check usage in ResourceLesson.principles (String[] of display names)
  const resourceLessonsWithName = await prisma.resourceLesson.count({
    where: { principles: { has: name } },
  });

  const totalUsage = courseLessonsWithSlug + kbEntriesWithName + resourceLessonsWithName;

  if (totalUsage > 0) {
    return NextResponse.json({
      error: "in_use",
      message: `This principle is tagged on ${totalUsage} piece${totalUsage !== 1 ? "s" : ""} of content and cannot be deleted. Deactivate it instead.`,
      count: totalUsage,
      breakdown: { courseLessons: courseLessonsWithSlug, kbEntries: kbEntriesWithName, resourceLessons: resourceLessonsWithName },
    }, { status: 409 });
  }

  await prisma.principle.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

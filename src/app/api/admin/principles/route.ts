import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || role !== "admin") return null;
  return (session.user as any).id as string;
}

export async function GET() {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const principles = await prisma.principle.findMany({
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json({ principles });
}

export async function POST(req: NextRequest) {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, slug, description, colorLight, isActive } = body;

  if (!name?.trim() || !slug?.trim() || !colorLight?.trim()) {
    return NextResponse.json({ error: "name, slug, and colorLight are required" }, { status: 400 });
  }

  const maxOrder = await prisma.principle.aggregate({ _max: { sortOrder: true } });
  const nextOrder = (maxOrder._max.sortOrder ?? -1) + 1;

  try {
    const principle = await prisma.principle.create({
      data: {
        name: name.trim(),
        slug: slug.trim(),
        description: description?.trim() || null,
        colorLight: colorLight.trim(),
        sortOrder: nextOrder,
        isActive: isActive !== false,
      },
    });
    return NextResponse.json({ principle });
  } catch (err: any) {
    if (err.code === "P2002") {
      return NextResponse.json({ error: "A principle with that name or slug already exists" }, { status: 409 });
    }
    throw err;
  }
}

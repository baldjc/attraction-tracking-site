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
  const fields = await prisma.lessonWorkbookField.findMany({
    where: { lessonId: id },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json({ fields });
}

export async function POST(
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
  const { fieldType, label, placeholderText, sortOrder, config } = body;

  const field = await prisma.lessonWorkbookField.create({
    data: {
      lessonId: id,
      fieldType,
      label,
      placeholderText: placeholderText ?? null,
      sortOrder: sortOrder ?? 0,
      config: config ?? {},
    },
  });

  return NextResponse.json({ field });
}

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

  const field = await prisma.lessonWorkbookField.update({
    where: { id },
    data: {
      ...(body.fieldType !== undefined && { fieldType: body.fieldType }),
      ...(body.label !== undefined && { label: body.label }),
      ...(body.placeholderText !== undefined && { placeholderText: body.placeholderText || null }),
      ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
      ...(body.config !== undefined && { config: body.config }),
    },
  });

  return NextResponse.json({ field });
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

  const responseCount = await prisma.memberWorkbookResponse.count({ where: { workbookFieldId: id } });
  if (responseCount > 0 && !force) {
    return NextResponse.json(
      {
        warning: true,
        message: `${responseCount} member response${responseCount !== 1 ? "s" : ""} exist for this field. Delete anyway?`,
      },
      { status: 409 }
    );
  }

  await prisma.$transaction([
    prisma.memberWorkbookResponse.deleteMany({ where: { workbookFieldId: id } }),
    prisma.lessonWorkbookField.delete({ where: { id } }),
  ]);

  return NextResponse.json({ success: true });
}

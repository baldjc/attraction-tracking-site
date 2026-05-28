import { NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ fieldId: string }> }
) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { fieldId } = await params;
  const body = await req.json();
  const { response } = body;

  await prisma.memberWorkbookResponse.upsert({
    where: { userId_workbookFieldId: { userId: user.id, workbookFieldId: fieldId } },
    create: { userId: user.id, workbookFieldId: fieldId, response, updatedAt: new Date() },
    update: { response, updatedAt: new Date() },
  });

  return NextResponse.json({ success: true });
}

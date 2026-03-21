import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  await prisma.repurposedContent.deleteMany({
    where: { userId: user.id, createdAt: { lt: sixtyDaysAgo } },
  });

  const outputs = await prisma.repurposedContent.findMany({
    where: {
      userId: user.id,
      createdAt: { gte: sixtyDaysAgo },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      videoTitle: true,
      toolType: true,
      output: true,
      editedOutput: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ outputs });
}

export async function PATCH(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, editedOutput } = await req.json();
  if (!id || editedOutput === undefined) {
    return NextResponse.json({ error: "Missing id or editedOutput" }, { status: 400 });
  }

  const record = await prisma.repurposedContent.findFirst({
    where: { id, userId: user.id },
  });
  if (!record) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.repurposedContent.update({
    where: { id },
    data: { editedOutput },
  });

  return NextResponse.json({ saved: true });
}

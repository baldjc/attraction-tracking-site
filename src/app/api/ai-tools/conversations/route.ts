import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { toolType, title, messages, metadata } = await req.json();
  if (!toolType || !title || !messages) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const conversation = await prisma.aIToolConversation.create({
    data: {
      userId: user.id,
      toolType,
      title: String(title).slice(0, 200),
      messages,
      metadata: metadata ?? null,
    },
  });

  // Auto-purge conversations older than 30 days
  await prisma.aIToolConversation.deleteMany({
    where: {
      createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
  });

  return NextResponse.json(conversation);
}

export async function GET(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const toolType = req.nextUrl.searchParams.get("toolType") ?? undefined;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const conversations = await prisma.aIToolConversation.findMany({
    where: {
      userId: user.id,
      createdAt: { gte: thirtyDaysAgo },
      ...(toolType ? { toolType: toolType as any } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: {
      id: true,
      toolType: true,
      title: true,
      messages: true,
      downloadCount: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ conversations });
}

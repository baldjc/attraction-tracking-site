import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, session] = await Promise.all([resolveUserFromSession(), auth()]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = (session?.user as any)?.role === "admin";
  const { id } = await params;
  const conversation = await prisma.aIToolConversation.findUnique({ where: { id } });
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (conversation.userId !== user.id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(conversation);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, session] = await Promise.all([resolveUserFromSession(), auth()]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = (session?.user as any)?.role === "admin";
  const { id } = await params;
  const conversation = await prisma.aIToolConversation.findUnique({ where: { id } });
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (conversation.userId !== user.id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { messages, metadata } = await req.json();

  const updated = await prisma.aIToolConversation.update({
    where: { id },
    data: {
      ...(messages !== undefined ? { messages } : {}),
      ...(metadata !== undefined ? { metadata } : {}),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, session] = await Promise.all([resolveUserFromSession(), auth()]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = (session?.user as any)?.role === "admin";
  const { id } = await params;
  const conversation = await prisma.aIToolConversation.findUnique({ where: { id } });
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (conversation.userId !== user.id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.aIToolConversation.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

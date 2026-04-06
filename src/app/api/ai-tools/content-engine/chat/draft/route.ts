import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const theme = searchParams.get("theme");
  if (!theme) return NextResponse.json({ error: "theme required" }, { status: 400 });

  const draft = await prisma.contentEngineDraft.findUnique({
    where: { userId_theme: { userId: user.id, theme } },
  });

  return NextResponse.json({ draft: draft ?? null });
}

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { theme, messages } = body;
  if (!theme) return NextResponse.json({ error: "theme required" }, { status: 400 });

  const draft = await prisma.contentEngineDraft.upsert({
    where: { userId_theme: { userId: user.id, theme } },
    create: { userId: user.id, theme, messages: messages ?? [] },
    update: { messages: messages ?? [] },
  });

  return NextResponse.json({ draft });
}

export async function DELETE(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const theme = searchParams.get("theme");
  if (!theme) return NextResponse.json({ error: "theme required" }, { status: 400 });

  await prisma.contentEngineDraft.deleteMany({ where: { userId: user.id, theme } });
  return NextResponse.json({ ok: true });
}

/**
 * v1 Content Engine chat draft persistence — restored on its own table
 * (`content_engine_chat_drafts`, model `ContentEngineChatDraft`) after
 * Wave 4 reshaped the shared `content_engine_drafts` table for the new
 * wizard. The v1 chat auto-saves the in-flight conversation per theme
 * so a tab refresh doesn't lose it.
 *
 * Schema lives in `prisma/schema.prisma`; the dashboard surface this
 * endpoint serves will be retired by follow-up #30, at which point this
 * file and its model can be deleted together.
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const theme = searchParams.get("theme");
  if (!theme) return NextResponse.json({ error: "theme required" }, { status: 400 });

  const draft = await prisma.contentEngineChatDraft.findUnique({
    where: { userId_theme: { userId: user.id, theme } },
  });

  return NextResponse.json({ draft: draft ?? null });
}

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { theme?: string; messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { theme, messages } = body;
  if (!theme) return NextResponse.json({ error: "theme required" }, { status: 400 });

  const draft = await prisma.contentEngineChatDraft.upsert({
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

  await prisma.contentEngineChatDraft.deleteMany({ where: { userId: user.id, theme } });
  return NextResponse.json({ ok: true });
}

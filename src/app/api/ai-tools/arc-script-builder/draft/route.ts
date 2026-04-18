import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  const draft = id
    ? await prisma.scriptDraft.findFirst({ where: { id, userId: user.id } })
    : await prisma.scriptDraft.findFirst({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
      });

  return NextResponse.json({ draft: draft ?? null });
}

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { videoTitle, initialData, messages, currentSection, completedSections, sectionApprovals } = body;

  if (!videoTitle) return NextResponse.json({ error: "videoTitle required" }, { status: 400 });

  const draft = await prisma.scriptDraft.upsert({
    where: { userId_videoTitle: { userId: user.id, videoTitle } },
    create: {
      userId: user.id,
      videoTitle,
      initialData: initialData ?? {},
      messages: messages ?? [],
      currentSection: currentSection ?? "research_strategy",
      completedSections: completedSections ?? [],
      sectionApprovals: sectionApprovals ?? [],
    },
    update: {
      initialData: initialData ?? {},
      messages: messages ?? [],
      currentSection: currentSection ?? "research_strategy",
      completedSections: completedSections ?? [],
      sectionApprovals: sectionApprovals ?? [],
    },
  });

  return NextResponse.json({ id: draft.id });
}

export async function DELETE(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const videoTitle = searchParams.get("videoTitle");

  if (id) {
    await prisma.scriptDraft.deleteMany({ where: { id, userId: user.id } });
  } else if (videoTitle) {
    await prisma.scriptDraft.deleteMany({ where: { userId: user.id, videoTitle } });
  } else {
    return NextResponse.json({ error: "id or videoTitle required" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

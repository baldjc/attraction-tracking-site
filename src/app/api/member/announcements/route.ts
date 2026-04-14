import { NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const seenIds = await prisma.changelogEntryView.findMany({
    where: { userId: user.id },
    select: { entryId: true },
  });
  const seenSet = new Set(seenIds.map((v) => v.entryId));

  const announcements = await prisma.changelogEntry.findMany({
    where: { published: true, type: "announcement" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, title: true, body: true, emoji: true, createdAt: true },
  });

  const unseen = announcements.filter((a) => !seenSet.has(a.id));

  return NextResponse.json({ announcements: unseen });
}

export async function POST(req: Request) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { entryId } = await req.json();
  if (!entryId) return NextResponse.json({ error: "entryId required" }, { status: 400 });

  await prisma.changelogEntryView.upsert({
    where: { entryId_userId: { entryId, userId: user.id } },
    create: { entryId, userId: user.id },
    update: {},
  });

  return NextResponse.json({ ok: true });
}

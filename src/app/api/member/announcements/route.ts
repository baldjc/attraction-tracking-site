import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;

  const seenIds = await prisma.changelogEntryView.findMany({
    where: { userId },
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
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { entryId } = await req.json();
  if (!entryId) return NextResponse.json({ error: "entryId required" }, { status: 400 });

  await prisma.changelogEntryView.upsert({
    where: { entryId_userId: { entryId, userId: session.user.id } },
    create: { entryId, userId: session.user.id },
    update: {},
  });

  return NextResponse.json({ ok: true });
}

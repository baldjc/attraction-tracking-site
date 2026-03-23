import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

async function requireMember() {
  const session = await auth();
  if (!session?.user) return null;
  return prisma.user.findUnique({ where: { email: (session.user as any).email! } });
}

export async function POST(req: NextRequest) {
  const user = await requireMember();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { entryId } = await req.json();
  if (!entryId) return NextResponse.json({ error: "entryId required" }, { status: 400 });

  // Verify the entry is accessible to this user
  const entry = await prisma.knowledgeBaseEntry.findFirst({
    where: {
      id: entryId,
      status: "approved",
      OR: [{ isGeneralTeaching: true }, { memberId: user.id }],
    },
  });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const existing = await prisma.savedItem.findUnique({
    where: { userId_knowledgeBaseEntryId: { userId: user.id, knowledgeBaseEntryId: entryId } },
  });

  if (existing) {
    await prisma.savedItem.delete({ where: { id: existing.id } });
    return NextResponse.json({ saved: false });
  } else {
    await prisma.savedItem.create({ data: { userId: user.id, knowledgeBaseEntryId: entryId } });
    return NextResponse.json({ saved: true });
  }
}

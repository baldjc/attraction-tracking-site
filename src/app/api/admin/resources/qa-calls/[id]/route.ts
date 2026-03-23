import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  if ((session.user as any).role !== "admin") return null;
  return session.user;
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const call = await prisma.qACall.findUnique({ where: { id } });
  if (!call) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Delete KB entries first (SavedItems cascade from KBEntry via FK)
  await prisma.knowledgeBaseEntry.deleteMany({
    where: { sourceType: "qa_call", sourceId: id },
  });

  await prisma.qACall.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}

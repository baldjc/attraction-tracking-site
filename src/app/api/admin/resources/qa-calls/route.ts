import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  if ((session.user as any).role !== "admin") return null;
  return session.user;
}

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const calls = await prisma.qACall.findMany({
    orderBy: { callDate: "desc" },
  });

  const counts = await prisma.knowledgeBaseEntry.groupBy({
    by: ["sourceId"],
    where: { sourceType: "qa_call" },
    _count: { id: true },
  });
  const pendingCounts = await prisma.knowledgeBaseEntry.groupBy({
    by: ["sourceId"],
    where: { sourceType: "qa_call", status: "pending" },
    _count: { id: true },
  });

  const countMap = Object.fromEntries(counts.map((c) => [c.sourceId, c._count.id]));
  const pendingMap = Object.fromEntries(pendingCounts.map((c) => [c.sourceId, c._count.id]));

  return NextResponse.json(calls.map((c) => ({
    ...c,
    momentCount: countMap[c.id] ?? 0,
    pendingCount: pendingMap[c.id] ?? 0,
  })));
}

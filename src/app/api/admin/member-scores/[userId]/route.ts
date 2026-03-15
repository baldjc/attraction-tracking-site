import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;

  const baseline = await prisma.audit.findFirst({
    where: { userId, auditType: "baseline" },
    orderBy: { createdAt: "desc" },
    select: { scores: true, overallScore: true, createdAt: true },
  });

  const latest = await prisma.audit.findFirst({
    where: { userId, auditType: { in: ["monthly", "baseline"] } },
    orderBy: { createdAt: "desc" },
    select: { scores: true, overallScore: true, auditType: true, createdAt: true },
  });

  return NextResponse.json({ baseline, latest });
}

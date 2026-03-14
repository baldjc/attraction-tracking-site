import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id;

  const audits = await prisma.audit.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      auditType: true,
      overallScore: true,
      scores: true,
      createdAt: true,
    },
  });

  if (audits.length === 0) {
    return NextResponse.json({ latestAudit: null, baselineAudit: null, audits: [] });
  }

  const latestAudit = audits[0];
  const baselineAudit = audits.find((a) => a.auditType === "baseline") ?? null;

  return NextResponse.json({ latestAudit, baselineAudit, audits });
}

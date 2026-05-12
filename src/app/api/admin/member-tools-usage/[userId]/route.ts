import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminOrEditor } from "@/lib/auth-utils";
import { canStaffAccessMember } from "@/lib/staff-access";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await auth();
  if (!session?.user || !isAdminOrEditor((session?.user as any)?.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;
  if (!(await canStaffAccessMember((session.user as any).id, userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [scriptsCount, analysesCount, lastScript, lastAnalysis] = await Promise.all([
    prisma.savedScript.count({ where: { userId } }),
    prisma.titleAnalysis.count({ where: { userId } }),
    prisma.savedScript.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.titleAnalysis.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);

  const lastScript_date = lastScript?.createdAt ?? null;
  const lastAnalysis_date = lastAnalysis?.createdAt ?? null;

  let lastActivity: string | null = null;
  if (lastScript_date && lastAnalysis_date) {
    lastActivity = lastScript_date > lastAnalysis_date
      ? lastScript_date.toISOString()
      : lastAnalysis_date.toISOString();
  } else if (lastScript_date) {
    lastActivity = lastScript_date.toISOString();
  } else if (lastAnalysis_date) {
    lastActivity = lastAnalysis_date.toISOString();
  }

  return NextResponse.json({ scriptsCount, analysesCount, lastActivity });
}

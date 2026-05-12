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

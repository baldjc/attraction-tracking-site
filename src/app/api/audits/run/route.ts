import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { processAuditJob } from "@/lib/process-audit-job";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { memberId, auditType, videoId } = await req.json();

  if (!memberId || !auditType) {
    return NextResponse.json({ error: "memberId and auditType required" }, { status: 400 });
  }

  const member = await prisma.user.findUnique({ where: { id: memberId } });
  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const job = await prisma.auditJob.create({
    data: { auditType, userId: memberId, status: "queued" },
  });

  processAuditJob(job.id, videoId ?? undefined).catch(console.error);

  return NextResponse.json({ jobId: job.id });
}

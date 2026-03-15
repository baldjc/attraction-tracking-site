import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await params;
  const job = await prisma.auditJob.findUnique({ where: { id: jobId } });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const TERMINAL = ["complete", "failed", "cancelled"];
  if (TERMINAL.includes(job.status)) {
    return NextResponse.json({ error: "Job is already in a terminal state" }, { status: 400 });
  }

  const updated = await prisma.auditJob.update({
    where: { id: jobId },
    data: { status: "cancelled" as any, errorMessage: "Cancelled by user" },
  });

  return NextResponse.json({ jobId: updated.id, status: updated.status });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkAndTimeoutJob } from "@/lib/audit-job-utils";

const STATUS_MESSAGES: Record<string, string> = {
  queued: "Queued — waiting to start…",
  downloading: "Downloading transcripts from YouTube…",
  analysing: "Analysing with AI…",
  generating: "Generating report…",
  complete: "Complete!",
  failed: "Failed",
  cancelled: "Audit cancelled",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await params;
  let job = await prisma.auditJob.findUnique({ where: { id: jobId } });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  job = await checkAndTimeoutJob(job);

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    message: STATUS_MESSAGES[job.status] ?? job.status,
    auditId: job.auditId ?? null,
    errorMessage: job.errorMessage ?? null,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkAndTimeoutJob } from "@/lib/audit-job-utils";

const ACTIVE_STATUSES = ["queued", "downloading", "analysing", "generating"];

const STATUS_MESSAGES: Record<string, string> = {
  queued: "Queued — waiting to start…",
  downloading: "Downloading transcripts…",
  analysing: "Analysing with AI…",
  generating: "Generating report…",
};

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobs = await prisma.auditJob.findMany({
    where: { status: { in: ACTIVE_STATUSES as any[] } },
    include: { user: { select: { id: true, fullName: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });

  const resolved = await Promise.all(
    jobs.map(async (job) => {
      const checked = await checkAndTimeoutJob(job);
      return {
        id: job.id,
        status: checked.status,
        auditType: job.auditType,
        message: STATUS_MESSAGES[checked.status] ?? checked.status,
        createdAt: job.createdAt,
        updatedAt: checked.updatedAt,
        errorMessage: job.errorMessage ?? null,
        user: job.user ?? null,
      };
    })
  );

  const activeJobs = resolved.filter((j) => ACTIVE_STATUSES.includes(j.status));

  return NextResponse.json({ jobs: activeJobs });
}

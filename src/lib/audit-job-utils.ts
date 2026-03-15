import prisma from "@/lib/prisma";

const TIMEOUT_MS = 5 * 60 * 1000;
const STUCK_STATUSES = ["queued", "downloading", "analysing", "generating"];

export async function checkAndTimeoutJob(job: {
  id: string;
  status: string;
  updatedAt: Date;
}) {
  if (!STUCK_STATUSES.includes(job.status)) return job;
  const ageMs = Date.now() - new Date(job.updatedAt).getTime();
  if (ageMs > TIMEOUT_MS) {
    const updated = await prisma.auditJob.update({
      where: { id: job.id },
      data: { status: "failed", errorMessage: "Job timed out after 5 minutes" },
    });
    return updated;
  }
  return job;
}

export async function timeoutAllStuckJobs() {
  const stuckJobs = await prisma.auditJob.findMany({
    where: { status: { in: STUCK_STATUSES as any[] } },
  });
  for (const job of stuckJobs) {
    await checkAndTimeoutJob(job);
  }
}

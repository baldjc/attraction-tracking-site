import prisma from "@/lib/prisma";
import { UserRole } from "@/generated/prisma/client";
import { processAuditJob } from "@/lib/process-audit-job";

const DELAY_MS = 8000; // 8 seconds between members to avoid API rate limits

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function updateBaselineBatchStatus(update: Record<string, any>) {
  const existing = await prisma.appSetting.findUnique({ where: { key: "batch_baseline_status" } });
  if (!existing) return;
  const current = JSON.parse(existing.value);
  const merged = { ...current, ...update };
  await prisma.appSetting.update({
    where: { key: "batch_baseline_status" },
    data: { value: JSON.stringify(merged) },
  });
  return merged;
}

export async function runBaselineBatch() {
  console.log("[batch-baseline] Starting baseline batch run...");

  // Find all members with YouTube set who have no baseline audit
  const allMembers = await prisma.user.findMany({
    where: {
      role: { not: UserRole.admin },
      OR: [
        { youtubeHandle: { not: null } },
        { youtubeChannelUrl: { not: null } },
      ],
    },
    include: {
      audits: {
        where: { auditType: "baseline" },
        select: { id: true },
        take: 1,
      },
    },
  });

  // Filter to only those without a baseline
  const members = allMembers.filter((m) => m.audits.length === 0);

  const total = members.length;
  const results: Array<{ memberId: string; memberName: string; status: string; reason?: string }> = [];

  let generated = 0;
  let failures = 0;

  for (let i = 0; i < members.length; i++) {
    const member = members[i];
    const memberName = member.fullName ?? member.email;
    console.log(`[batch-baseline] Processing ${i + 1}/${total}: ${memberName}`);

    await updateBaselineBatchStatus({ current: i + 1, results });

    try {
      const job = await prisma.auditJob.create({
        data: { auditType: "baseline", userId: member.id, status: "queued" },
      });

      await processAuditJob(job.id);
      results.push({ memberId: member.id, memberName, status: "success" });
      generated++;
      console.log(`[batch-baseline] ✓ Completed baseline audit for ${memberName}`);
    } catch (err: any) {
      console.error(`[batch-baseline] ✗ Failed for ${memberName}:`, err.message);
      results.push({ memberId: member.id, memberName, status: "failed", reason: err.message });
      failures++;
    }

    if (i < members.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  const summary = {
    date: new Date().toISOString(),
    total_eligible: total,
    generated,
    failures,
    results,
  };

  console.log(`[batch-baseline] Done. ${generated} baselines generated, ${failures} failures.`);

  await Promise.all([
    prisma.appSetting.upsert({
      where: { key: "batch_baseline_status" },
      update: { value: JSON.stringify({ status: "complete", current: total, total, results, completed: new Date().toISOString() }) },
      create: { key: "batch_baseline_status", value: JSON.stringify({ status: "complete", current: total, total, results, completed: new Date().toISOString() }) },
    }),
    prisma.appSetting.upsert({
      where: { key: "last_baseline_run" },
      update: { value: JSON.stringify(summary) },
      create: { key: "last_baseline_run", value: JSON.stringify(summary) },
    }),
  ]);

  return summary;
}

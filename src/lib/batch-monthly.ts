import prisma from "@/lib/prisma";
import { UserRole } from "@/generated/prisma/client";
import { getChannelInfo, getLatestLongFormVideos } from "@/lib/youtube";
import { processAuditJob } from "@/lib/process-audit-job";

const DELAY_MS = 8000; // 8 seconds between members to avoid rate limits

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveYoutubeIdentifier(member: { youtubeHandle?: string | null; youtubeChannelUrl?: string | null }): string | null {
  if (member.youtubeHandle) return member.youtubeHandle;
  if (member.youtubeChannelUrl) {
    const url = member.youtubeChannelUrl;
    const handleMatch = url.match(/@[\w-]+/);
    if (handleMatch) return handleMatch[0];
    const parts = url.replace(/\/$/, "").split("/");
    const last = parts[parts.length - 1];
    if (last && last !== "youtube.com") {
      return last.startsWith("@") ? last : last.startsWith("UC") ? last : `@${last}`;
    }
  }
  return null;
}

async function updateBatchStatus(update: Record<string, any>) {
  const existing = await prisma.appSetting.findUnique({ where: { key: "batch_run_status" } });
  if (!existing) return;
  const current = JSON.parse(existing.value);
  const merged = { ...current, ...update };
  await prisma.appSetting.update({
    where: { key: "batch_run_status" },
    data: { value: JSON.stringify(merged) },
  });
  return merged;
}

export async function runMonthlyBatch() {
  console.log("[batch-monthly] Starting monthly batch run...");

  const members = await prisma.user.findMany({
    where: {
      role: { not: UserRole.admin },
      OR: [
        { youtubeHandle: { not: null } },
        { youtubeChannelUrl: { not: null } },
      ],
    },
  });

  const total = members.length;
  const results: Array<{ memberId: string; memberName: string; status: string; reason?: string }> = [];

  let audits_queued = 0;
  let skipped_no_baseline = 0;
  let skipped_no_new_videos = 0;
  let skipped_no_youtube = 0;
  let failures = 0;

  for (let i = 0; i < members.length; i++) {
    const member = members[i];
    const memberName = member.fullName ?? member.email;
    console.log(`[batch-monthly] Processing ${i + 1}/${total}: ${memberName}`);

    // Update progress
    await updateBatchStatus({ current: i + 1, results });

    const youtubeIdentifier = resolveYoutubeIdentifier(member);
    if (!youtubeIdentifier) {
      console.log(`[batch-monthly] Skipping ${memberName} — no YouTube identifier`);
      results.push({ memberId: member.id, memberName, status: "skipped", reason: "no YouTube channel" });
      skipped_no_youtube++;
      continue;
    }

    // Check for baseline audit
    const baseline = await prisma.audit.findFirst({
      where: { userId: member.id, auditType: "baseline" },
      orderBy: { createdAt: "asc" },
    });
    if (!baseline) {
      console.log(`[batch-monthly] Skipping ${memberName} — no baseline audit`);
      results.push({ memberId: member.id, memberName, status: "skipped", reason: "no baseline audit" });
      skipped_no_baseline++;
      continue;
    }

    // Find last audit date (for sinceDate) — baseline/monthly only, not single video audits
    const lastAudit = await prisma.audit.findFirst({
      where: { userId: member.id, auditType: { in: ["baseline", "monthly"] } },
      orderBy: { createdAt: "desc" },
    });
    const sinceDate = lastAudit?.createdAt;

    try {
      // Lightweight gate check: does the channel have at least 1 new long-form video since last audit?
      const channelInfo = await getChannelInfo(youtubeIdentifier);
      const newCheck = await getLatestLongFormVideos(channelInfo.uploadsPlaylistId, 1, sinceDate);

      if (newCheck.length === 0) {
        console.log(`[batch-monthly] Skipping ${memberName} — no new videos since last audit`);
        results.push({ memberId: member.id, memberName, status: "skipped", reason: "no new videos" });
        skipped_no_new_videos++;
        continue;
      }

      // Create job and process — processAuditJob will fetch the last 5 videos for scoring
      console.log(`[batch-monthly] Queuing monthly audit for ${memberName} (has new content)`);
      const job = await prisma.auditJob.create({
        data: { auditType: "monthly", userId: member.id, status: "queued" },
      });

      await processAuditJob(job.id);
      results.push({ memberId: member.id, memberName, status: "success" });
      audits_queued++;
      console.log(`[batch-monthly] ✓ Completed audit for ${memberName}`);
    } catch (err: any) {
      console.error(`[batch-monthly] ✗ Failed for ${memberName}:`, err.message);
      results.push({ memberId: member.id, memberName, status: "failed", reason: err.message });
      failures++;
    }

    // Delay before next member (skip delay after last one)
    if (i < members.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  // Build summary
  const nowMST = new Date(Date.now() - 7 * 60 * 60 * 1000);
  const yearMonth = `${nowMST.getUTCFullYear()}-${String(nowMST.getUTCMonth() + 1).padStart(2, "0")}`;
  const summary = {
    yearMonth,
    date: new Date().toISOString(),
    total_eligible: total,
    audits_queued,
    skipped_no_baseline,
    skipped_no_new_videos,
    skipped_no_youtube,
    failures,
    results,
  };

  console.log(`[batch-monthly] Done. ${audits_queued} audits, ${skipped_no_baseline + skipped_no_new_videos + skipped_no_youtube} skipped, ${failures} failures.`);

  // Save final state
  await Promise.all([
    prisma.appSetting.upsert({
      where: { key: "batch_run_status" },
      update: { value: JSON.stringify({ status: "complete", current: total, total, results, completed: new Date().toISOString() }) },
      create: { key: "batch_run_status", value: JSON.stringify({ status: "complete", current: total, total, results, completed: new Date().toISOString() }) },
    }),
    prisma.appSetting.upsert({
      where: { key: "last_monthly_run" },
      update: { value: JSON.stringify(summary) },
      create: { key: "last_monthly_run", value: JSON.stringify(summary) },
    }),
  ]);

  return summary;
}

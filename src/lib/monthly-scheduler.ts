import prisma from "@/lib/prisma";
import { UserRole } from "@/generated/prisma/client";
import { runMonthlyBatch } from "@/lib/batch-monthly";

let schedulerStarted = false;

export function scheduleMonthlyCheck() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  console.log("[monthly-scheduler] Starting hourly cron check...");

  async function checkAndRun() {
    try {
      // Check if today is the 1st of the month in MST (UTC-7)
      const nowMST = new Date(Date.now() - 7 * 60 * 60 * 1000);
      const dayOfMonth = nowMST.getUTCDate();
      if (dayOfMonth !== 1) return;

      const yearMonth = `${nowMST.getUTCFullYear()}-${String(nowMST.getUTCMonth() + 1).padStart(2, "0")}`;

      // Check if already ran this month
      const lastRunSetting = await prisma.appSetting.findUnique({ where: { key: "last_monthly_run" } });
      if (lastRunSetting) {
        const lastRun = JSON.parse(lastRunSetting.value) as any;
        if (lastRun.yearMonth === yearMonth) return;
      }

      // Check if already running
      const batchStatus = await prisma.appSetting.findUnique({ where: { key: "batch_run_status" } });
      if (batchStatus) {
        const status = JSON.parse(batchStatus.value) as any;
        if (status.status === "running") return;
      }

      console.log(`[monthly-scheduler] It's the 1st of ${yearMonth} MST — triggering monthly batch...`);

      const members = await prisma.user.findMany({
        where: {
          role: { not: UserRole.admin },
          OR: [{ youtubeHandle: { not: null } }, { youtubeChannelUrl: { not: null } }],
        },
        select: { id: true },
      });

      await prisma.appSetting.upsert({
        where: { key: "batch_run_status" },
        update: { value: JSON.stringify({ status: "running", current: 0, total: members.length, started: new Date().toISOString(), results: [] }) },
        create: { key: "batch_run_status", value: JSON.stringify({ status: "running", current: 0, total: members.length, started: new Date().toISOString(), results: [] }) },
      });

      runMonthlyBatch().catch((err) => console.error("[monthly-scheduler] Batch failed:", err));
    } catch (err) {
      console.error("[monthly-scheduler] Error in hourly check:", err);
    }
  }

  // Check once on startup (after a short delay to let the server settle)
  setTimeout(checkAndRun, 30_000);

  // Then check every hour
  setInterval(checkAndRun, 60 * 60 * 1000);
}

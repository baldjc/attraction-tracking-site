import prisma from "@/lib/prisma";
import fs from "fs";
import path from "path";

export const BACKUP_DIR = "/tmp/backups";
const MAX_BACKUPS = 90;

let schedulerStarted = false;

export async function runDailyBackup(): Promise<{ file: string; counts: Record<string, number> }> {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  const file = path.join(BACKUP_DIR, `backup-${today}.json`);

  const [users, campaigns, trackingLinks, clicks, leads] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, fullName: true, email: true, role: true },
    }),
    prisma.campaign.findMany(),
    prisma.trackingLink.findMany(),
    prisma.click.findMany(),
    prisma.lead.findMany(),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    date: today,
    counts: {
      users: users.length,
      campaigns: campaigns.length,
      trackingLinks: trackingLinks.length,
      clicks: clicks.length,
      leads: leads.length,
    },
    data: { users, campaigns, trackingLinks, clicks, leads },
  };

  fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf-8");
  console.log(`[backup] Wrote ${file} — ${JSON.stringify(payload.counts)}`);

  pruneOldBackups();

  return { file, counts: payload.counts };
}

function pruneOldBackups() {
  try {
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith("backup-") && f.endsWith(".json"))
      .sort();

    const toDelete = files.slice(0, Math.max(0, files.length - MAX_BACKUPS));
    for (const f of toDelete) {
      fs.unlinkSync(path.join(BACKUP_DIR, f));
      console.log(`[backup] Pruned old backup: ${f}`);
    }
  } catch (err) {
    console.error("[backup] Error pruning old backups:", err);
  }
}

export function scheduleBackup() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  console.log("[backup-scheduler] Starting — runs daily at 2:00 AM MST");

  async function checkAndRun() {
    try {
      const nowMST = new Date(Date.now() - 7 * 60 * 60 * 1000);
      const hour = nowMST.getUTCHours();
      const today = nowMST.toISOString().slice(0, 10);

      if (hour !== 2) return;

      const lastRun = await prisma.appSetting.findUnique({ where: { key: "last_backup_date" } });
      if (lastRun?.value === today) return;

      console.log(`[backup-scheduler] Running daily backup for ${today}...`);
      const result = await runDailyBackup();

      await prisma.appSetting.upsert({
        where: { key: "last_backup_date" },
        update: { value: today },
        create: { key: "last_backup_date", value: today },
      });

      console.log(`[backup-scheduler] Backup complete — ${JSON.stringify(result.counts)}`);
    } catch (err) {
      console.error("[backup-scheduler] Backup failed:", err);
    }
  }

  setTimeout(checkAndRun, 30_000);
  setInterval(checkAndRun, 60 * 60 * 1000);
}

import { NextRequest, NextResponse } from "next/server";
import { runDailyBackup } from "@/lib/backup-scheduler";
import prisma from "@/lib/prisma";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);

  const lastRun = await prisma.appSetting.findUnique({ where: { key: "last_backup_date" } });
  if (lastRun?.value === today) {
    return NextResponse.json({ skipped: true, reason: `Backup already ran today (${today})` });
  }

  try {
    const result = await runDailyBackup();

    await prisma.appSetting.upsert({
      where: { key: "last_backup_date" },
      update: { value: today },
      create: { key: "last_backup_date", value: today },
    });

    return NextResponse.json({
      success: true,
      file: result.file,
      counts: result.counts,
      date: today,
    });
  } catch (err) {
    console.error("[cron/backup] Failed:", err);
    return NextResponse.json(
      { error: "Backup failed", detail: String(err) },
      { status: 500 }
    );
  }
}

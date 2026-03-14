import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { runMonthlyBatch } from "@/lib/batch-monthly";

export const maxDuration = 60;

// Called daily by an external cron. Returns immediately after starting the batch.
// Protect with CRON_SECRET header so only authorised callers can trigger it.
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if today is the 1st of the month in MST (UTC-7)
  const nowMST = new Date(Date.now() - 7 * 60 * 60 * 1000);
  const dayOfMonth = nowMST.getUTCDate();
  if (dayOfMonth !== 1) {
    return NextResponse.json({ skipped: true, reason: `Not the 1st of the month (day ${dayOfMonth} MST)` });
  }

  // Check if already ran this month
  const yearMonth = `${nowMST.getUTCFullYear()}-${String(nowMST.getUTCMonth() + 1).padStart(2, "0")}`;
  const lastRunSetting = await prisma.appSetting.findUnique({ where: { key: "last_monthly_run" } });
  if (lastRunSetting) {
    const lastRun = JSON.parse(lastRunSetting.value) as any;
    if (lastRun.yearMonth === yearMonth) {
      return NextResponse.json({ skipped: true, reason: `Already ran this month (${yearMonth})` });
    }
  }

  // Check if a batch is already running
  const existing = await prisma.appSetting.findUnique({ where: { key: "batch_run_status" } });
  if (existing) {
    const status = JSON.parse(existing.value) as any;
    if (status.status === "running") {
      return NextResponse.json({ skipped: true, reason: "Batch already running" });
    }
  }

  const members = await prisma.user.findMany({
    where: {
      role: "member",
      OR: [{ youtubeHandle: { not: null } }, { youtubeChannelUrl: { not: null } }],
    },
    select: { id: true },
  });

  await prisma.appSetting.upsert({
    where: { key: "batch_run_status" },
    update: { value: JSON.stringify({ status: "running", current: 0, total: members.length, started: new Date().toISOString(), results: [] }) },
    create: { key: "batch_run_status", value: JSON.stringify({ status: "running", current: 0, total: members.length, started: new Date().toISOString(), results: [] }) },
  });

  runMonthlyBatch().catch(console.error);

  return NextResponse.json({ started: true, total: members.length, yearMonth });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { runMonthlyBatch } from "@/lib/batch-monthly";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if a batch is already running
  const existing = await prisma.appSetting.findUnique({ where: { key: "batch_run_status" } });
  if (existing) {
    const status = JSON.parse(existing.value) as any;
    if (status.status === "running") {
      return NextResponse.json({ error: "A batch run is already in progress." }, { status: 409 });
    }
  }

  // Count eligible members to return immediately
  const members = await prisma.user.findMany({
    where: {
      role: "member",
      OR: [
        { youtubeHandle: { not: null } },
        { youtubeChannelUrl: { not: null } },
      ],
    },
    select: { id: true },
  });

  const total = members.length;

  // Mark as running
  await prisma.appSetting.upsert({
    where: { key: "batch_run_status" },
    update: { value: JSON.stringify({ status: "running", current: 0, total, started: new Date().toISOString(), results: [] }) },
    create: { key: "batch_run_status", value: JSON.stringify({ status: "running", current: 0, total, started: new Date().toISOString(), results: [] }) },
  });

  // Fire and forget
  runMonthlyBatch().catch(console.error);

  return NextResponse.json({ started: true, total });
}

export async function GET() {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [statusSetting, lastRunSetting] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: "batch_run_status" } }),
    prisma.appSetting.findUnique({ where: { key: "last_monthly_run" } }),
  ]);

  return NextResponse.json({
    batchStatus: statusSetting ? JSON.parse(statusSetting.value) : null,
    lastRun: lastRunSetting ? JSON.parse(lastRunSetting.value) : null,
  });
}

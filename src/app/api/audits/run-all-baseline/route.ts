import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { UserRole } from "@/generated/prisma/client";
import { runBaselineBatch } from "@/lib/batch-baseline";

export const maxDuration = 60;

export async function POST(_req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if a baseline batch is already running
  const existing = await prisma.appSetting.findUnique({ where: { key: "batch_baseline_status" } });
  if (existing) {
    const status = JSON.parse(existing.value) as any;
    if (status.status === "running") {
      return NextResponse.json({ error: "A baseline batch is already in progress." }, { status: 409 });
    }
  }

  // Count eligible: members with YouTube set but no baseline
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

  const eligible = allMembers.filter((m) => m.audits.length === 0);
  const total = eligible.length;

  if (total === 0) {
    return NextResponse.json({ started: false, message: "All eligible members already have a baseline audit." });
  }

  // Mark as running
  await prisma.appSetting.upsert({
    where: { key: "batch_baseline_status" },
    update: { value: JSON.stringify({ status: "running", current: 0, total, started: new Date().toISOString(), results: [] }) },
    create: { key: "batch_baseline_status", value: JSON.stringify({ status: "running", current: 0, total, started: new Date().toISOString(), results: [] }) },
  });

  // Fire and forget
  runBaselineBatch().catch(console.error);

  return NextResponse.json({ started: true, total });
}

export async function GET() {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [statusSetting, lastRunSetting] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: "batch_baseline_status" } }),
    prisma.appSetting.findUnique({ where: { key: "last_baseline_run" } }),
  ]);

  return NextResponse.json({
    batchStatus: statusSetting ? JSON.parse(statusSetting.value) : null,
    lastRun: lastRunSetting ? JSON.parse(lastRunSetting.value) : null,
  });
}

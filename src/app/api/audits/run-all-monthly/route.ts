import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { UserRole } from "@/generated/prisma/client";
import { runMonthlyBatch } from "@/lib/batch-monthly";

export const maxDuration = 60;

const ACTIVE_STATUSES = ["queued", "downloading", "analysing", "generating"];

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
      // Verify there are actually active jobs before blocking
      const activeCount = await prisma.auditJob.count({ where: { status: { in: ACTIVE_STATUSES as any[] } } });
      if (activeCount > 0) {
        return NextResponse.json({ error: "A batch run is already in progress." }, { status: 409 });
      }
    }
  }

  // Count eligible members to return immediately
  const members = await prisma.user.findMany({
    where: {
      role: { notIn: [UserRole.admin, UserRole.audit_lead] },
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

  let batchStatus = statusSetting ? JSON.parse(statusSetting.value) : null;

  // Auto-correct stale "running" status: if no active jobs exist, mark as complete
  if (batchStatus?.status === "running") {
    const activeCount = await prisma.auditJob.count({ where: { status: { in: ACTIVE_STATUSES as any[] } } });
    if (activeCount === 0) {
      batchStatus = {
        ...batchStatus,
        status: "complete",
        completed: batchStatus.completed ?? new Date().toISOString(),
      };
      await prisma.appSetting.update({
        where: { key: "batch_run_status" },
        data: { value: JSON.stringify(batchStatus) },
      });
    }
  }

  return NextResponse.json({
    batchStatus,
    lastRun: lastRunSetting ? JSON.parse(lastRunSetting.value) : null,
  });
}

// DELETE — dismiss/reset the batch status
export async function DELETE() {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.appSetting.deleteMany({ where: { key: "batch_run_status" } });
  return NextResponse.json({ ok: true });
}

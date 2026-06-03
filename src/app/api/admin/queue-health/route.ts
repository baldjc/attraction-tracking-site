// Admin-only durable-queue health readout.
//
// GET /api/admin/queue-health
//
// Pure reader: the always-on worker is the single writer of the `queue_health`
// AppSetting heartbeat (see src/lib/job-worker.ts). If the worker is down the
// heartbeat goes stale and `workerOnline` flips false. `stuckValidatingCount`
// is an independent signal (uploads sitting in 'validating' well past a normal
// run) that catches work dropped before the queue rollout — point the recovery
// CLI at those.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { QUEUE_HEALTH_KEY, type QueueHealth } from "@/lib/queue-health";

export const runtime = "nodejs";

// A heartbeat older than this means the worker is considered offline (it writes
// every ~30s).
const HEARTBEAT_STALE_MS = 90_000;
// Uploads in 'validating' older than this are treated as likely-stuck.
const STUCK_VALIDATING_MS = 30 * 60 * 1000;

export async function GET() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const setting = await prisma.appSetting.findUnique({
    where: { key: QUEUE_HEALTH_KEY },
  });

  let health: QueueHealth | null = null;
  if (setting) {
    try {
      health = JSON.parse(setting.value) as QueueHealth;
    } catch {
      health = null;
    }
  }

  const now = Date.now();
  const lastHeartbeatMs = health
    ? new Date(health.lastHeartbeatAt).getTime()
    : null;
  const workerOnline =
    lastHeartbeatMs != null && now - lastHeartbeatMs < HEARTBEAT_STALE_MS;

  const recent = health?.recentOutcomes ?? [];
  const recentFailureRate = recent.length
    ? recent.filter((o) => o === "fail").length / recent.length
    : 0;

  // Independent of the worker — surfaces rows whose background work never
  // finished (uses uploadedAt because MarketDataUpload has no updatedAt; a
  // revalidate that strands a row keeps its old uploadedAt and so is flagged).
  const stuckValidatingCount = await prisma.marketDataUpload.count({
    where: {
      status: "validating",
      uploadedAt: { lt: new Date(now - STUCK_VALIDATING_MS) },
    },
  });

  return NextResponse.json({
    workerOnline,
    secondsSinceHeartbeat:
      lastHeartbeatMs != null
        ? Math.round((now - lastHeartbeatMs) / 1000)
        : null,
    lastHeartbeatAt: health?.lastHeartbeatAt ?? null,
    lastJobCompletedAt: health?.lastJobCompletedAt ?? null,
    workerStartedAt: health?.workerStartedAt ?? null,
    workerPid: health?.workerPid ?? null,
    jobsProcessed: health?.jobsProcessed ?? 0,
    jobsFailed: health?.jobsFailed ?? 0,
    recentSampleSize: recent.length,
    recentFailureRate: Number(recentFailureRate.toFixed(3)),
    depthByQueue: health?.depthByQueue ?? {},
    stuckValidatingCount,
  });
}

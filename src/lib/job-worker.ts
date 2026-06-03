// Durable-queue worker. Runs as an always-on Reserved VM deployment
// (`npm run worker` → scripts/worker.ts → startWorker) and drains the pg-boss
// queues defined in job-queue.ts.
//
// The handlers call the SAME business functions the old fire-and-forget paths
// did (runValidation, executeCoachRun, runGlanceTestForChannel), so behaviour is
// unchanged — only the scheduling moves from an in-process Promise chain to a
// durable queue that survives an autoscale redeploy.
//
// FAILURE MODEL: handlers catch business errors, persist them (validation marks
// the upload failed, mirroring the old validateUploadAsync outer catch), and
// return normally so pg-boss marks the job complete — no auto-retry, no double
// AI spend, and the route-level retry budget (retryCount) stays authoritative.
// The ONLY thing that triggers a pg-boss retry is genuine process death: a job
// left 'active' when the worker dies expires and is re-fetched (validate-upload
// has retryLimit 2). That is exactly the durability win over fire-and-forget.

import PgBoss from "pg-boss";
import prisma from "@/lib/prisma";
import { runValidation, markUploadFailed } from "@/lib/fact-validator";
import { scheduleBackfillCompletionEmail } from "@/lib/backfill-email";
import { executeCoachRun } from "@/lib/reviewer-run";
import { runGlanceTestForChannel } from "@/lib/glance-test-runner";
import {
  getQueueConnectionString,
  ensureQueues,
  ALL_QUEUES,
  QUEUE_VALIDATE_UPLOAD,
  QUEUE_REVIEWER_COACH_RUN,
  QUEUE_GLANCE_TEST,
  type ValidateUploadJob,
  type ReviewerCoachRunJob,
  type GlanceTestJob,
} from "@/lib/job-queue";
import { QUEUE_HEALTH_KEY, type QueueHealth } from "@/lib/queue-health";

const HEARTBEAT_INTERVAL_MS = 30_000;
const RECENT_OUTCOMES_CAP = 50;

// In-memory rolling stats, flushed to the AppSetting heartbeat row. Resets on
// worker restart (acceptable — the admin endpoint flags a stale heartbeat).
const stats = {
  startedAt: new Date().toISOString(),
  jobsProcessed: 0,
  jobsFailed: 0,
  lastJobCompletedAt: null as string | null,
  recent: [] as Array<"ok" | "fail">,
};

function recordOutcome(ok: boolean): void {
  stats.jobsProcessed += 1;
  if (!ok) stats.jobsFailed += 1;
  stats.lastJobCompletedAt = new Date().toISOString();
  stats.recent.push(ok ? "ok" : "fail");
  if (stats.recent.length > RECENT_OUTCOMES_CAP) stats.recent.shift();
}

async function writeHealth(boss: PgBoss): Promise<void> {
  const depthByQueue: Record<string, number> = {};
  for (const q of ALL_QUEUES) {
    try {
      depthByQueue[q] = await boss.getQueueSize(q);
    } catch {
      depthByQueue[q] = -1;
    }
  }
  const health: QueueHealth = {
    lastHeartbeatAt: new Date().toISOString(),
    lastJobCompletedAt: stats.lastJobCompletedAt,
    workerPid: process.pid,
    workerStartedAt: stats.startedAt,
    jobsProcessed: stats.jobsProcessed,
    jobsFailed: stats.jobsFailed,
    recentOutcomes: [...stats.recent],
    depthByQueue,
  };
  const value = JSON.stringify(health);
  await prisma.appSetting.upsert({
    where: { key: QUEUE_HEALTH_KEY },
    create: { key: QUEUE_HEALTH_KEY, value },
    update: { value },
  });
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handleValidate(data: ValidateUploadJob): Promise<void> {
  const { uploadId, userId } = data;
  try {
    await runValidation(uploadId);
    // "ok" = the job ran to completion. runValidation marks the upload
    // 'failed' internally on a business failure (without throwing), so a green
    // job outcome here does not imply a successful validation — it implies the
    // worker did its work and the row reached a terminal state.
    recordOutcome(true);
  } catch (err) {
    console.error("[worker] validate-upload failed for", uploadId, err);
    try {
      await markUploadFailed(uploadId, err);
    } catch (err2) {
      console.error("[worker] markUploadFailed also threw for", uploadId, err2);
    }
    recordOutcome(false);
  } finally {
    // Same debounced batch-completion email the in-process queue scheduled when
    // a user's chain drained. Process-local timer; lives in the worker now.
    try {
      scheduleBackfillCompletionEmail(userId);
    } catch (err) {
      console.error("[worker] backfill email schedule threw for", userId, err);
    }
  }
}

async function handleCoachRun(data: ReviewerCoachRunJob): Promise<void> {
  try {
    await executeCoachRun(data.runId);
    recordOutcome(true);
  } catch (err) {
    console.error("[worker] reviewer-coach-run failed for", data.runId, err);
    recordOutcome(false);
  }
}

async function handleGlanceTest(data: GlanceTestJob): Promise<void> {
  try {
    await runGlanceTestForChannel(data.channelRef, data.runBy);
    recordOutcome(true);
  } catch (err) {
    console.error("[worker] glance-test failed for", data.channelRef, err);
    recordOutcome(false);
  }
}

// Parse a positive-integer env var, falling back (with a warning) when unset,
// non-numeric, or <= 0 so a typo can never silently set concurrency to NaN/0.
function positiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    console.warn(
      `[worker] ${name}="${raw}" is not a positive integer; using ${fallback}`,
    );
    return fallback;
  }
  return n;
}

export async function startWorker(): Promise<void> {
  const boss = new PgBoss({
    connectionString: getQueueConnectionString(),
    max: positiveIntEnv("QUEUE_WORKER_MAX_CONNECTIONS", 5),
    // The worker owns maintenance (archiving/expiry); no cron scheduling in use.
    supervise: true,
    schedule: false,
  });
  boss.on("error", (err) => console.error("[worker] pg-boss error:", err.message));

  await boss.start();
  await ensureQueues(boss);

  // batchSize caps in-flight jobs PER queue on this single Reserved VM. For
  // validate-upload this is the global concurrency ceiling — kept small because
  // each runValidation itself fans out to ~5 concurrent Anthropic calls, so 2 ×
  // 5 = ~10 keeps us within the rate budget the pipeline was tuned for. This
  // preserves the spirit of the old per-user serial chain (bounded fan-out)
  // without per-user bookkeeping.
  const validateConcurrency = positiveIntEnv("QUEUE_VALIDATE_CONCURRENCY", 2);

  await boss.work<ValidateUploadJob>(
    QUEUE_VALIDATE_UPLOAD,
    { batchSize: validateConcurrency },
    async (jobs) => {
      await Promise.all(jobs.map((job) => handleValidate(job.data)));
    },
  );

  await boss.work<ReviewerCoachRunJob>(
    QUEUE_REVIEWER_COACH_RUN,
    { batchSize: 1 },
    async (jobs) => {
      for (const job of jobs) await handleCoachRun(job.data);
    },
  );

  await boss.work<GlanceTestJob>(
    QUEUE_GLANCE_TEST,
    { batchSize: 1 },
    async (jobs) => {
      for (const job of jobs) await handleGlanceTest(job.data);
    },
  );

  await writeHealth(boss).catch((err) =>
    console.error("[worker] initial heartbeat write failed:", err),
  );
  const heartbeat = setInterval(() => {
    void writeHealth(boss).catch((err) =>
      console.error("[worker] heartbeat write failed:", err),
    );
  }, HEARTBEAT_INTERVAL_MS);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[worker] ${signal} received — draining and stopping`);
    clearInterval(heartbeat);
    try {
      await boss.stop({ graceful: true, timeout: 30_000 });
    } catch (err) {
      console.error("[worker] error during graceful stop:", err);
    }
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  console.log(
    `[worker] started (pid ${process.pid}); queues: ${ALL_QUEUES.join(", ")}; ` +
      `validate concurrency=${validateConcurrency}`,
  );
}

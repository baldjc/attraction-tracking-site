// Shared shape for the durable-queue worker heartbeat / health snapshot.
//
// The worker (scripts/worker.ts → src/lib/job-worker.ts) is the SINGLE writer
// of this AppSetting row; the admin queue-health endpoint is a pure reader.
// Keeping the worker as the source of truth means the web app never has to open
// a pg-boss connection just to report health — if the worker dies,
// `lastHeartbeatAt` simply goes stale and the endpoint flags it offline.

export const QUEUE_HEALTH_KEY = "queue_health";

export interface QueueHealth {
  /** ISO timestamp of the most recent heartbeat write. */
  lastHeartbeatAt: string;
  /** ISO timestamp of the last job that ran to completion (ok or business-fail). */
  lastJobCompletedAt: string | null;
  /** OS pid of the worker process (diagnostics only). */
  workerPid: number | null;
  /** ISO timestamp the current worker process booted. */
  workerStartedAt: string | null;
  /** Jobs that ran to completion since this worker booted. */
  jobsProcessed: number;
  /** Subset of jobsProcessed whose handler threw (job-execution failures). */
  jobsFailed: number;
  /** Ring buffer of the last N job outcomes, newest last. */
  recentOutcomes: Array<"ok" | "fail">;
  /** Pending-job depth per queue at last heartbeat (-1 = lookup failed). */
  depthByQueue: Record<string, number>;
}

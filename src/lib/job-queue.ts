// Durable job queue (pg-boss on the existing Postgres) — shared queue names,
// connection derivation, and typed enqueue helpers.
//
// WHY pg-boss + Postgres (not BullMQ/Redis): the app already runs on Neon
// Postgres, so a Postgres-backed queue adds durability without a new service.
// Background work that used to be fire-and-forget (validateUploadAsync,
// executeCoachRun, runGlanceTestForChannel) died whenever an autoscale instance
// was torn down mid-flight. Enqueued jobs survive a redeploy and are drained by
// an always-on Reserved VM worker (scripts/worker.ts).
//
// CONNECTION: pg-boss needs a DIRECT (session-mode) Postgres connection — it
// uses LISTEN/NOTIFY, advisory locks, and prepared statements that Neon's
// transaction-mode pooler (`-pooler` host) does not support. We derive the
// direct URL from DATABASE_URL by dropping the `-pooler` host segment, or use an
// explicit QUEUE_DATABASE_URL / DIRECT_DATABASE_URL override.

import PgBoss from "pg-boss";

// ── Queue names ──────────────────────────────────────────────────────────────
export const QUEUE_VALIDATE_UPLOAD = "validate-upload";
export const QUEUE_REVIEWER_COACH_RUN = "reviewer-coach-run";
export const QUEUE_GLANCE_TEST = "glance-test";
export const QUEUE_KB_MERGE_APPLY = "kb-merge-apply";
// Wave 6a (Phase 2) — the Anthropic story-leads/prose enrichment pass, split out
// of validate-upload so the member's deterministic numbers are ready instantly
// and an AI outage degrades story prose only. Only enqueued on the cutover path.
export const QUEUE_GENERATE_STORIES = "generate-stories";

export const ALL_QUEUES = [
  QUEUE_VALIDATE_UPLOAD,
  QUEUE_REVIEWER_COACH_RUN,
  QUEUE_GLANCE_TEST,
  QUEUE_KB_MERGE_APPLY,
  QUEUE_GENERATE_STORIES,
] as const;

// ── Job payload types ────────────────────────────────────────────────────────
export interface ValidateUploadJob {
  uploadId: string;
  userId: string;
}
export interface ReviewerCoachRunJob {
  runId: string;
}
export interface GlanceTestJob {
  channelRef: string;
  runBy: string;
}
export interface KbMergeApplyJob {
  mergeRunId: string;
  // KB owner whose areas/facts are re-aggregated; also governs the dispatch flag.
  userId: string;
  // `${from}->${into}` review-queue items opted into the merge (may be empty).
  selectedReviewKeys?: string[];
}
export interface GenerateStoriesJob {
  uploadId: string;
  // Owning member; governs the dispatch flag and per-user serialization.
  userId: string;
}

/**
 * Resolve the DIRECT (non-pooled) Postgres connection string pg-boss requires.
 *
 * Order: explicit QUEUE_DATABASE_URL / DIRECT_DATABASE_URL → derive from
 * NEON_DATABASE_URL / DATABASE_URL by stripping the `-pooler` host segment.
 * When deriving, we also drop `pgbouncer`/`channel_binding` params (the latter
 * trips node-postgres SCRAM against Neon) and force `sslmode=require`.
 */
export function getQueueConnectionString(): string {
  const explicit =
    process.env.QUEUE_DATABASE_URL ?? process.env.DIRECT_DATABASE_URL;
  const raw =
    explicit ?? process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!raw) {
    throw new Error(
      "Queue database URL not configured. Set QUEUE_DATABASE_URL (preferred — " +
        "a direct, non-pooled Postgres URL) or DATABASE_URL.",
    );
  }
  const cleaned = raw.replace(/\s+/g, "");
  if (explicit) return cleaned;

  try {
    const u = new URL(cleaned);
    // Neon's pooled host carries a `-pooler` segment; the direct/session-mode
    // host is the same name without it.
    u.hostname = u.hostname.replace("-pooler", "");
    u.searchParams.delete("pgbouncer");
    u.searchParams.delete("channel_binding");
    if (!u.searchParams.has("sslmode")) u.searchParams.set("sslmode", "require");
    return u.toString();
  } catch {
    // Not a parseable URL (e.g. a libpq keyword string) — hand it back as-is and
    // let pg-boss surface a connection error rather than guessing.
    return cleaned;
  }
}

/**
 * Idempotently ensure every queue exists. pg-boss v10 requires queues to be
 * created before send()/work(). Safe to call from both the web app (before the
 * first enqueue) and the worker (on boot).
 */
export async function ensureQueues(boss: PgBoss): Promise<void> {
  for (const name of ALL_QUEUES) {
    try {
      await boss.createQueue(name);
    } catch (err) {
      // createQueue is effectively create-if-not-exists; a throw here almost
      // always means "already exists", which is fine. Log anything unexpected.
      console.error(
        `[job-queue] createQueue ${name} note:`,
        (err as Error).message,
      );
    }
  }
}

// ── Enqueue-side singleton (web app) ─────────────────────────────────────────
//
// The web app only ENQUEUES; it must never run pg-boss maintenance/scheduling
// (that's the always-on worker's job). We cache one boss instance per warm
// autoscale instance and start it with supervise/schedule disabled. With the
// durable-queue flag OFF (the default), none of this code runs — getEnqueueBoss
// is only reached from the dispatch helpers when the flag is on, so a flag-off
// deploy opens zero extra Postgres connections.

let enqueueBossPromise: Promise<PgBoss> | null = null;

async function getEnqueueBoss(): Promise<PgBoss> {
  if (!enqueueBossPromise) {
    enqueueBossPromise = (async () => {
      const boss = new PgBoss({
        connectionString: getQueueConnectionString(),
        // Tiny pool — the web app only inserts jobs.
        max: 2,
        // Maintenance + cron scheduling belong to the worker, not the web app.
        supervise: false,
        schedule: false,
      });
      boss.on("error", (err) =>
        console.error("[job-queue] enqueue boss error:", err.message),
      );
      await boss.start();
      await ensureQueues(boss);
      return boss;
    })().catch((err) => {
      // Allow a later request to retry the connection rather than caching a
      // permanently-rejected promise.
      enqueueBossPromise = null;
      throw err;
    });
  }
  return enqueueBossPromise;
}

// ── Typed enqueue helpers ────────────────────────────────────────────────────
//
// `singletonKey` dedupes concurrent enqueues of the same unit of work (e.g. a
// double-clicked button) — pg-boss drops the second while the first is still
// queued/active and returns null. A null return therefore means "already
// queued", which callers treat as success.

export async function enqueueValidateUpload(
  data: ValidateUploadJob,
): Promise<string | null> {
  const boss = await getEnqueueBoss();
  return boss.send(QUEUE_VALIDATE_UPLOAD, data, {
    singletonKey: data.uploadId,
    // Only crashes (process death mid-job) leave a job to expire and retry —
    // business failures are caught + persisted by the handler, which returns
    // normally so pg-boss marks the job complete (no retry, no double AI spend).
    retryLimit: 2,
    retryDelay: 30,
    retryBackoff: true,
    // Comfortable headroom over the ~5 min route maxDuration so a slow-but-alive
    // validation is never expired + re-run while still working.
    expireInMinutes: 20,
  });
}

export async function enqueueReviewerCoachRun(
  data: ReviewerCoachRunJob,
): Promise<string | null> {
  const boss = await getEnqueueBoss();
  return boss.send(QUEUE_REVIEWER_COACH_RUN, data, {
    singletonKey: data.runId,
    retryLimit: 0,
    expireInMinutes: 60,
  });
}

export async function enqueueGlanceTest(
  data: GlanceTestJob,
): Promise<string | null> {
  const boss = await getEnqueueBoss();
  return boss.send(QUEUE_GLANCE_TEST, data, {
    singletonKey: data.channelRef,
    retryLimit: 0,
    expireInMinutes: 60,
  });
}

export async function enqueueGenerateStories(
  data: GenerateStoriesJob,
): Promise<string | null> {
  const boss = await getEnqueueBoss();
  return boss.send(QUEUE_GENERATE_STORIES, data, {
    // One story-generation job in flight per upload; a duplicate dispatch (e.g.
    // a re-validate) dedupes to a single job while one is queued/active.
    singletonKey: data.uploadId,
    // Business failures are caught + persisted (storyStatus=failed) by the
    // handler, which returns normally so pg-boss marks the job complete — no
    // auto-retry, no double AI spend. Only genuine process death (job left
    // 'active' when the worker dies) expires + re-runs; the reuse path then
    // rebuilds from the already-paid-for rawValidatorOutput at $0. This mirrors
    // the validate-upload model exactly.
    retryLimit: 2,
    retryDelay: 30,
    retryBackoff: true,
    expireInMinutes: 20,
  });
}

export async function enqueueKbMergeApply(
  data: KbMergeApplyJob,
): Promise<string | null> {
  const boss = await getEnqueueBoss();
  return boss.send(QUEUE_KB_MERGE_APPLY, data, {
    // One apply in flight per run; a double-clicked Confirm dedupes to a single
    // job (null return = already queued, treated as success by the dispatcher).
    singletonKey: data.mergeRunId,
    // applyMergeRun guards itself with a DRY_RUN→APPLYING CAS and a stale-APPLYING
    // reclaim, so we do NOT want pg-boss auto-retrying (a retry would either
    // collide with the CAS or risk re-running heavy work). Process death leaves
    // the run resumable via a later apply trigger — matching the old in-request
    // behaviour, which also had no auto-retry.
    retryLimit: 0,
    // Generous headroom: a first big backlog re-aggregates every upload and can
    // run ~30 min. Keep well above that so a slow-but-alive apply is never
    // expired out from under the worker.
    expireInMinutes: 60,
  });
}

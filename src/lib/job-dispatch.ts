// Flag-gated dispatch layer between route handlers and background work.
//
// Each helper decides, per the durable_job_queue feature flag (resolved for the
// OWNING user), whether to enqueue a durable pg-boss job (drained by the
// always-on worker) or fall back to the legacy in-process fire-and-forget path.
//
// CONTRACT: these helpers NEVER throw. Every call site relies on the old
// fire-and-forget contract (validateUploadAsync etc. could not throw), and
// several routes have already CLAIMED the row (status='validating') and only
// roll back if dispatch fails. So on ANY error — flag read, connection,
// enqueue — we log and fall back to the in-process path. The work always gets
// dispatched somehow; a row is never stranded by a queue hiccup.

import prisma from "@/lib/prisma";
import { isDurableQueueEnabledForUser } from "@/lib/feature-flags";
import { validateUploadAsync } from "@/lib/fact-validator";
import { executeCoachRun } from "@/lib/reviewer-run";
import { runGlanceTestForChannel } from "@/lib/glance-test-runner";
import { foldReviewSelectionsIntoRun } from "@/lib/kb-merge/merge-run";
import {
  enqueueValidateUpload,
  enqueueReviewerCoachRun,
  enqueueGlanceTest,
  enqueueKbMergeApply,
  QUEUE_KB_MERGE_APPLY,
} from "@/lib/job-queue";
import { QUEUE_HEALTH_KEY, type QueueHealth } from "@/lib/queue-health";

export async function dispatchValidation(
  uploadId: string,
  userId: string,
): Promise<void> {
  try {
    if (await isDurableQueueEnabledForUser(userId)) {
      // null return = pg-boss deduped (a job for this upload is already queued),
      // which is success from our perspective — work is pending either way.
      await enqueueValidateUpload({ uploadId, userId });
      return;
    }
  } catch (err) {
    console.error(
      "[job-dispatch] durable enqueue failed for upload",
      uploadId,
      "— falling back to in-process validation:",
      err,
    );
  }
  validateUploadAsync(uploadId, userId);
}

/**
 * @param actorUserId user whose flag governs dispatch (the admin who triggered
 * the run). Reviewer runs have no member "owner", so during rollout an admin
 * adds their own id to the flag allowlist (or flips it globally on).
 */
export async function dispatchCoachRun(
  runId: string,
  actorUserId: string,
): Promise<void> {
  try {
    if (await isDurableQueueEnabledForUser(actorUserId)) {
      await enqueueReviewerCoachRun({ runId });
      return;
    }
  } catch (err) {
    console.error(
      "[job-dispatch] durable enqueue failed for coach run",
      runId,
      "— falling back to in-process execution:",
      err,
    );
  }
  void executeCoachRun(runId).catch((err) =>
    console.error(`[coach-panel/run] ${runId} crashed:`, err),
  );
}

export async function dispatchGlanceTest(
  channelRef: string,
  runBy: string,
): Promise<void> {
  try {
    if (await isDurableQueueEnabledForUser(runBy)) {
      await enqueueGlanceTest({ channelRef, runBy });
      return;
    }
  } catch (err) {
    console.error(
      "[job-dispatch] durable enqueue failed for glance test",
      channelRef,
      "— falling back to in-process execution:",
      err,
    );
  }
  void runGlanceTestForChannel(channelRef, runBy).catch((err) =>
    console.error(`[glance-test/run] channel ${channelRef}:`, err),
  );
}

// A heartbeat older than this means the worker is down (or pre-redeploy). The
// worker writes one every ~30s, so 90s tolerates a missed beat without flapping.
const QUEUE_HEARTBEAT_STALE_MS = 90 * 1000;

/**
 * True only when a LIVE worker that actually serves the kb-merge-apply queue is
 * draining it. The worker is the sole writer of `queue_health` and publishes
 * `depthByQueue` for every queue it serves — so a fresh heartbeat that contains
 * the kb-merge-apply key proves the deployed worker has THIS handler registered.
 *
 * WHY: rollout safety. If the flag were enabled before the worker is redeployed
 * with the new handler, enqueued apply jobs would strand undrained and the run
 * would sit DRY_RUN forever. Gating enqueue on this check makes the rollout
 * order-independent — until a capable worker is live we fall back to the proven
 * in-request path. NEVER throws; any read/parse failure → not drainable.
 */
async function isKbMergeApplyDrainable(): Promise<boolean> {
  try {
    const row = await prisma.appSetting.findUnique({
      where: { key: QUEUE_HEALTH_KEY },
      select: { value: true },
    });
    if (!row?.value) return false;
    const health = JSON.parse(row.value) as QueueHealth;
    const ageMs = Date.now() - new Date(health.lastHeartbeatAt).getTime();
    if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > QUEUE_HEARTBEAT_STALE_MS)
      return false;
    return Object.prototype.hasOwnProperty.call(
      health.depthByQueue ?? {},
      QUEUE_KB_MERGE_APPLY,
    );
  } catch {
    return false;
  }
}

/**
 * KB merge "apply" is request-blocking and, on a first big backlog, re-aggregates
 * every upload for ~30 min — long enough to look like a failure in the browser.
 * When the durable queue is on for the OWNER *and* a capable worker is live, hand
 * the apply to the always-on worker and return `true` (the route then responds
 * `{ queued: true }`).
 *
 * Before enqueuing we fold the member's review-queue selections onto the run
 * (foldReviewSelectionsIntoRun) so the persisted plan — not the job payload that a
 * singletonKey dedupe could drop — is the source of truth; the worker then runs
 * with an empty selection and reproduces the plan from the report.
 *
 * Returns `false` — so the route falls back to running applyMergeRun IN-REQUEST
 * (today's synchronous, idempotent, resumable behaviour) — when the flag is off,
 * no capable worker is live, OR on ANY error. Like the other dispatch helpers
 * this NEVER throws; a queue hiccup degrades to the proven in-request path rather
 * than dead-ending the member. A null enqueue return (pg-boss deduped a
 * double-click) still means "queued", so we return `true`.
 */
export async function tryEnqueueKbMergeApply(
  mergeRunId: string,
  userId: string,
  selectedReviewKeys: string[],
): Promise<boolean> {
  try {
    if (
      (await isDurableQueueEnabledForUser(userId)) &&
      (await isKbMergeApplyDrainable())
    ) {
      await foldReviewSelectionsIntoRun(userId, mergeRunId, selectedReviewKeys);
      await enqueueKbMergeApply({ mergeRunId, userId, selectedReviewKeys: [] });
      return true;
    }
  } catch (err) {
    console.error(
      "[job-dispatch] durable enqueue failed for kb-merge-apply",
      mergeRunId,
      "— falling back to in-request apply:",
      err,
    );
  }
  return false;
}

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

import { isDurableQueueEnabledForUser } from "@/lib/feature-flags";
import { validateUploadAsync } from "@/lib/fact-validator";
import { executeCoachRun } from "@/lib/reviewer-run";
import { runGlanceTestForChannel } from "@/lib/glance-test-runner";
import {
  enqueueValidateUpload,
  enqueueReviewerCoachRun,
  enqueueGlanceTest,
} from "@/lib/job-queue";

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

// Market-data validation recovery: boot requeue + watchdog.
//
// WHY THIS EXISTS
// ---------------
// Validation is dispatched via dispatchValidation(): with the durable_job_queue
// flag ON it enqueues a pg-boss job (drained by the always-on worker); with the
// flag OFF (default) it runs as an un-awaited in-process promise inside the
// serving process (validateUploadAsync). The in-process path dies whenever the
// process is torn down (dev workflow restart, prod VM redeploy/scale event)
// mid-validation, stranding the upload in status="validating" forever — facts,
// briefing and story leads never arrive, and the non-blocking onboarding shows
// the member a permanent "crunching in the background…" with no resolution.
//
// Nothing in the app re-claimed those rows. This module is the reclaim layer:
//   - recoverStuckValidations("boot"): on process startup, re-dispatch ANY
//     upload still in pending/validating. The process that owned an in-process
//     job is gone, so it is by definition orphaned; pg-boss jobs are deduped by
//     singletonKey so re-dispatch is harmless when the flag is on.
//   - recoverStuckValidations("watchdog"): on an interval, re-dispatch uploads
//     that have been stuck past STALE_MS with no progress, and after
//     MAX_RECOVERY_ATTEMPTS mark them "failed" with a clear validationError so
//     they surface in the UI / dashboard checklist instead of spinning forever.
//
// IDEMPOTENCY / NO DOUBLE-SPEND: re-dispatch routes through dispatchValidation,
// and runValidation reuses stored rawValidatorOutput ($0) when a prior attempt
// already paid for the AI pass, and refuses to re-run an already-"validated"
// row. A per-process in-flight guard stops a watchdog tick from re-kicking an
// id we just dispatched while it is still running.
//
// SCOPE: this changes only how reliably the job runs/recovers — never what the
// validator extracts, the column mapper, or the story-lead algorithm.

import prisma from "@/lib/prisma";
import { dispatchValidation } from "@/lib/job-dispatch";
import { isInFlight, markInFlight } from "@/lib/validation-inflight";

// Terminal/non-terminal status sets. All recovery mutations are guarded on the
// non-terminal set via updateMany so a row that reached a terminal state (e.g.
// the durable worker just flipped it to "validated") between our scan and our
// write is never clobbered back to "failed" or have its retryCount inflated.
const NON_TERMINAL = ["pending", "validating"] as const;

// Runs the watchdog sweep this often.
const WATCHDOG_INTERVAL_MS = 5 * 60 * 1000;
// Runs the due-auto-retry sweep this often. Much tighter than the watchdog
// because the first backoff step is ~1 min, so a coarse interval would add
// significant latency to the earliest retries.
const AUTO_RETRY_INTERVAL_MS = 60 * 1000;
// An upload "validating" longer than this (since uploadedAt) with no terminal
// state is considered stuck. Comfortably above the worst observed healthy run
// (~13 min) and above pg-boss's 20-min job expiry, so a slow-but-alive run is
// not requeued out from under itself.
const STALE_MS = 25 * 60 * 1000;
// Total automatic attempts (shared budget with the member's manual Retry, which
// also uses retryCount and caps at 3) before we give up and mark the upload
// failed instead of requeueing it forever.
const MAX_RECOVERY_ATTEMPTS = 3;

// The per-process in-flight guard (markInFlight / isInFlight) lives in
// validation-inflight.ts so the in-process executor can CLEAR a marker the
// instant its run settles — see that module's lifecycle note. Relying on the
// TTL alone would suppress a due auto-retry (1m/2m/5m backoff) for up to 25m.

export interface RecoveryResult {
  scanned: number;
  requeued: number;
  failed: number;
}

/**
 * Find market-data uploads stuck in a non-terminal state and either re-dispatch
 * them or, once they have exhausted their attempt budget, mark them failed.
 *
 * NEVER throws — recovery runs from a background timer / boot hook where an
 * unhandled rejection would be silently lost; every failure is logged and
 * swallowed so one bad row can't abort the sweep.
 */
export async function recoverStuckValidations(
  reason: "boot" | "watchdog",
): Promise<RecoveryResult> {
  const result: RecoveryResult = { scanned: 0, requeued: 0, failed: 0 };

  let rows: Array<{
    id: string;
    userId: string;
    status: string;
    retryCount: number | null;
  }> = [];
  try {
    rows = await prisma.marketDataUpload.findMany({
      where: {
        status: { in: ["pending", "validating"] },
        // Rows with a scheduled auto-retry (nextAttemptAt set) are owned by the
        // provider-outage backoff machinery (runDueAutoRetries), NOT this stale
        // watchdog. Excluding them here prevents the watchdog from re-dispatching
        // mid-backoff or burning the attempt budget on a deliberately-waiting row.
        nextAttemptAt: null,
        // On boot, reclaim everything (the owning process is gone). On the
        // watchdog pass, only act on rows that have been stuck past the stale
        // bound so we never touch a healthy in-flight validation.
        ...(reason === "watchdog"
          ? { uploadedAt: { lt: new Date(Date.now() - STALE_MS) } }
          : {}),
      },
      select: { id: true, userId: true, status: true, retryCount: true },
      orderBy: { uploadedAt: "asc" },
      take: 200,
    });
  } catch (err) {
    console.error("[validation-recovery] scan failed:", err);
    return result;
  }

  result.scanned = rows.length;

  for (const row of rows) {
    if (isInFlight(row.id)) continue;
    const attempts = row.retryCount ?? 0;
    try {
      if (attempts >= MAX_RECOVERY_ATTEMPTS) {
        // Out of attempts — surface a clear failure instead of spinning. Manual
        // Retry is disabled at this point (it shares the retryCount budget), so
        // the message points the member at support; the team can re-run via
        // scripts/recover-stuck-upload.ts after fixing the root cause.
        // Guarded on the non-terminal set: if the row reached a terminal state
        // since the scan, count===0 and we leave it alone (never clobber a
        // validated row back to failed).
        const message =
          `Validation didn't finish after ${MAX_RECOVERY_ATTEMPTS} automatic attempts. ` +
          `Please contact support and reference this upload ID so we can re-run it.`;
        const failedRes = await prisma.marketDataUpload.updateMany({
          where: { id: row.id, status: { in: [...NON_TERMINAL] } },
          data: { status: "failed", validationError: message.slice(0, 4000) },
        });
        if (failedRes.count > 0) result.failed += 1;
        continue;
      }

      // A watchdog hit means genuine no-progress past the stale bound, so it
      // counts against the attempt budget. A boot reclaim is a process death,
      // not the validation's fault, so it does NOT consume an attempt (otherwise
      // a few dev restarts would prematurely fail a perfectly good upload).
      // The increment doubles as a claim: it is guarded on the non-terminal set,
      // so if the row reached a terminal state between scan and now (count===0)
      // we skip the re-dispatch entirely rather than re-kick a finished upload.
      if (reason === "watchdog") {
        const claim = await prisma.marketDataUpload.updateMany({
          where: { id: row.id, status: { in: [...NON_TERMINAL] } },
          data: { retryCount: { increment: 1 } },
        });
        if (claim.count === 0) continue;
      }

      markInFlight(row.id);
      // dispatchValidation never throws and routes to the durable queue or the
      // in-process path depending on the owner's flag.
      await dispatchValidation(row.id, row.userId);
      result.requeued += 1;
    } catch (err) {
      console.error("[validation-recovery] recovery failed for", row.id, err);
    }
  }

  if (result.scanned > 0) {
    console.log(
      `[validation-recovery] reason=${reason} scanned=${result.scanned} ` +
        `requeued=${result.requeued} failed=${result.failed}`,
    );
  }
  return result;
}

/**
 * Fire any uploads whose scheduled provider-outage auto-retry has come due.
 *
 * A transient AI-provider failure leaves the upload in status="validating" with
 * `nextAttemptAt` set to when the next attempt should run (see
 * handleValidationFailure). This sweep finds rows whose time has arrived, CLAIMS
 * each by atomically nulling nextAttemptAt (so a concurrent process / the next
 * tick can't double-dispatch it), and re-dispatches the validation. Re-dispatch
 * reuses the stored rawValidatorOutput when the AI pass already succeeded, so no
 * double-charge. Honours the same in-flight guard as the watchdog.
 *
 * NEVER throws — runs from a background timer.
 */
export async function runDueAutoRetries(): Promise<RecoveryResult> {
  const result: RecoveryResult = { scanned: 0, requeued: 0, failed: 0 };

  let rows: Array<{ id: string; userId: string }> = [];
  try {
    rows = await prisma.marketDataUpload.findMany({
      where: {
        status: "validating",
        nextAttemptAt: { not: null, lte: new Date() },
      },
      select: { id: true, userId: true },
      orderBy: { nextAttemptAt: "asc" },
      take: 25,
    });
  } catch (err) {
    console.error("[validation-recovery] auto-retry scan failed:", err);
    return result;
  }

  result.scanned = rows.length;

  for (const row of rows) {
    if (isInFlight(row.id)) continue;
    try {
      // Claim: null nextAttemptAt, guarded so exactly one claimant wins and a
      // row already resolved/rescheduled since the scan is skipped (count===0).
      const claim = await prisma.marketDataUpload.updateMany({
        where: {
          id: row.id,
          status: "validating",
          nextAttemptAt: { not: null, lte: new Date() },
        },
        data: { nextAttemptAt: null },
      });
      if (claim.count === 0) continue;

      markInFlight(row.id);
      await dispatchValidation(row.id, row.userId);
      result.requeued += 1;
    } catch (err) {
      console.error("[validation-recovery] auto-retry dispatch failed for", row.id, err);
    }
  }

  if (result.scanned > 0) {
    console.log(
      `[validation-recovery] auto-retry scanned=${result.scanned} requeued=${result.requeued}`,
    );
  }
  return result;
}

let started = false;

/**
 * Idempotently start the recovery loop: one boot reclaim shortly after startup
 * (giving the DB a moment to be reachable) plus a periodic watchdog. Safe to
 * call from instrumentation.register(); a no-op if already started.
 */
export function scheduleValidationWatchdog(): void {
  if (started) return;
  started = true;

  // Initial boot reclaim — unsticks anything orphaned by the restart that just
  // happened. Delayed slightly so Prisma/DB is ready (mirrors the setup hook).
  setTimeout(() => {
    void recoverStuckValidations("boot");
    // Also fire any auto-retries that came due while the process was down — a
    // restart mid-backoff must not strand a scheduled retry until the watchdog.
    void runDueAutoRetries();
  }, 8000);

  const timer = setInterval(() => {
    void recoverStuckValidations("watchdog");
  }, WATCHDOG_INTERVAL_MS);
  // Don't hold the event loop open solely for the watchdog.
  if (typeof timer.unref === "function") timer.unref();

  // Tighter sweep for provider-outage auto-retries — the first backoff step is
  // ~1 min, so this runs every minute to fire due retries promptly.
  const retryTimer = setInterval(() => {
    void runDueAutoRetries();
  }, AUTO_RETRY_INTERVAL_MS);
  if (typeof retryTimer.unref === "function") retryTimer.unref();

  console.log("[validation-recovery] watchdog + auto-retry scheduled");
}

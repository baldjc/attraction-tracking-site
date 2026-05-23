// Wave 1 Phase 2A — debounced batch-completion email scheduler.
//
// Called from the fact-validator per-user queue cleanup hook. The hook
// fires every time a user's queue drains, which for a 24-month backfill
// means at least once and potentially many more if uploads come in
// staggered. We debounce by 30 seconds so that:
//
//   1. Mid-backfill drain (chain goes empty for 2s while the next upload
//      route handler enqueues the next month) doesn't fire a partial
//      email.
//   2. Single uploads — the steady-state monthly drop — never spam the
//      member with a 1-line "done" email. The recipient already saw the
//      row turn green in the table.
//
// The schedule map is process-local. A redeploy mid-backfill loses pending
// timers; that's acceptable since the cleanup hook will re-fire when the
// next chunk completes. The same TODO that applies to userQueues applies
// here — production-scale needs a real queue.

import prisma from "@/lib/prisma";
import { sendBackfillCompletionEmail } from "@/lib/email";
import { classifyUploadError } from "@/lib/upload-error-messages";

const DEBOUNCE_MS = 30_000;
/** Window of "recent enough to be part of this batch" — uploads outside
 *  this window aren't counted, so we don't email about old failures the
 *  member already knows about. */
const BATCH_WINDOW_MS = 4 * 60 * 60 * 1000; // 4 hours
/** Minimum uploads in the window for an email to fire. Single uploads
 *  are the regular monthly drop and don't need a summary email. */
const MIN_BATCH_SIZE = 2;

const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleBackfillCompletionEmail(userId: string): void {
  const existing = pendingTimers.get(userId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    pendingTimers.delete(userId);
    void runBackfillEmailNow(userId).catch((err) => {
      console.error('[backfill-email] failed for user', userId, err);
    });
  }, DEBOUNCE_MS);
  pendingTimers.set(userId, timer);
}

async function runBackfillEmailNow(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, fullName: true },
  });
  if (!user || !user.email) {
    console.log('[backfill-email] skipping — no email for user', userId);
    return;
  }

  const cutoff = new Date(Date.now() - BATCH_WINDOW_MS);
  // Only un-notified rows are eligible — once a row participates in a
  // completion email we mark it so subsequent queue drains within the
  // 4h window can't include it in a second summary.
  const recent = await prisma.marketDataUpload.findMany({
    where: {
      userId,
      uploadedAt: { gte: cutoff },
      backfillEmailedAt: null,
    },
    orderBy: { monthYear: "asc" },
    select: {
      id: true,
      monthYear: true,
      label: true,
      status: true,
      rowCount: true,
      retryCount: true,
      validationError: true,
    },
  });

  if (recent.length < MIN_BATCH_SIZE) {
    console.log(
      '[backfill-email] skipping — batch size',
      recent.length,
      'below threshold',
      MIN_BATCH_SIZE,
      'for user',
      userId,
    );
    return;
  }

  // Only fire when EVERYTHING in the window has reached a terminal state —
  // otherwise we'll send a "X failed" email while the next chunk is still
  // working and then have to send a correction.
  const anyInFlight = recent.some(
    (u) => u.status !== "validated" && u.status !== "failed",
  );
  if (anyInFlight) {
    console.log('[backfill-email] skipping — uploads still in flight for user', userId);
    return;
  }

  const succeeded = recent.filter((u) => u.status === "validated");
  const failed = recent
    .filter((u) => u.status === "failed")
    .map((u) => ({
      monthYear: u.monthYear,
      label: u.label,
      friendly: classifyUploadError(u.validationError ?? "", {
        rowCount: u.rowCount,
        retryCount: u.retryCount,
      }),
    }));

  // Stamp BEFORE the network send so a slow Resend call can't open a
  // window for a concurrent drain to grab the same rows. If the send
  // throws, the stamp stays — we'd rather drop a duplicate-attempt email
  // than spam the member with a second one.
  const batchIds = recent.map((u) => u.id);
  await prisma.marketDataUpload.updateMany({
    where: { id: { in: batchIds }, backfillEmailedAt: null },
    data: { backfillEmailedAt: new Date() },
  });

  await sendBackfillCompletionEmail({
    to: user.email,
    memberName: user.fullName,
    successCount: succeeded.length,
    failedCount: failed.length,
    succeededMonths: succeeded.map((u) => ({
      monthYear: u.monthYear,
      label: u.label,
    })),
    failedUploads: failed,
  });
}

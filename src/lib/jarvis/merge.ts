// Jarvis (AI Content Manager) — the ONE place a KB merge is ever applied from
// chat. Members never hand-edit the Knowledge Base; a merge run (dry-run ->
// apply) is the only mutation path. Both apply paths — the deterministic
// "Yes, clean it up" confirm action AND the apply_merge LLM tool — funnel
// through `applyConfirmedMerge`, which refuses unless the immediately-preceding
// member message is an explicit merge_confirmation for this exact merge run.
// Mirrors save.ts so the two-tap gate is identical for scripts and merges.

import prisma from "@/lib/prisma";
import { applyMergeRun, type ApplyResult } from "@/lib/kb-merge/merge-run";
import { isMarketReaggKillSwitchActiveForUser } from "@/lib/feature-flags";

export type ApplyMergeResult =
  | { ok: true; result: ApplyResult; alreadyApplied: boolean }
  | {
      ok: false;
      code: "not_found" | "forbidden" | "not_gated" | "bad_state" | "paused";
      message: string;
    };

/**
 * Apply a DRY_RUN merge run — gated.
 *
 * Gate: the latest member (role "user") message in the thread must be a
 * `merge_confirmation` whose `mergeRunId` matches the run being applied. The
 * confirm route inserts exactly that record immediately before calling this;
 * the apply_merge tool relies on the same record having been written by a prior
 * confirm action (it never writes one itself). Idempotent: an already-APPLIED
 * run returns ok with alreadyApplied=true rather than throwing.
 */
export async function applyConfirmedMerge(args: {
  userId: string;
  threadId: string;
  mergeRunId: string;
}): Promise<ApplyMergeResult> {
  const { userId, threadId, mergeRunId } = args;

  const thread = await prisma.contentManagerThread.findUnique({
    where: { id: threadId },
    select: { id: true, userId: true },
  });
  if (!thread) return { ok: false, code: "not_found", message: "Thread not found." };
  if (thread.userId !== userId) {
    return { ok: false, code: "forbidden", message: "Not your thread." };
  }

  const run = await prisma.mergeRun.findFirst({
    where: { id: mergeRunId, userId },
    select: { id: true, status: true },
  });
  if (!run) {
    return { ok: false, code: "not_found", message: "Merge run not found." };
  }

  // ── GATE: latest member message must be an explicit confirmation ──────────
  const latestMember = await prisma.contentManagerMessage.findFirst({
    where: { threadId, role: "user" },
    orderBy: { createdAt: "desc" },
    select: { content: true },
  });
  const content = latestMember?.content as
    | Record<string, unknown>
    | null
    | undefined;
  const isConfirmation =
    !!content &&
    content.kind === "merge_confirmation" &&
    content.mergeRunId === mergeRunId;
  if (!isConfirmation) {
    return {
      ok: false,
      code: "not_gated",
      message:
        "Applying a cleanup requires the member to approve this exact run " +
        "(Review merges -> Yes, clean it up).",
    };
  }

  // Idempotent: already applied -> report success without re-running.
  if (run.status === "APPLIED") {
    return {
      ok: true,
      alreadyApplied: true,
      result: {
        mergeRunId,
        uploadsReaggregated: 0,
        factsRelabelled: 0,
        canonicalCount: 0,
        floorClearing: {
          before: 0,
          after: 0,
          latestUploadId: null,
          estimated: true,
        },
      },
    };
  }
  if (run.status !== "DRY_RUN") {
    return {
      ok: false,
      code: "bad_state",
      message: `This merge run is ${run.status} and can no longer be applied.`,
    };
  }

  // Market re-aggregation break-glass — applying re-aggregates every upload onto
  // canonical areas (the same destructive path as the KB apply route). Covers
  // the in-chat apply_merge tool, which reaches this function via the orchestrator
  // WITHOUT passing through the guarded /api/jarvis/merge/confirm route. Returns
  // the graceful ok:false shape so the orchestrator surfaces a clean chat message
  // (applyMergeRun itself also self-guards as a hard backstop).
  if (await isMarketReaggKillSwitchActiveForUser(userId)) {
    return {
      ok: false,
      code: "paused",
      message:
        "Knowledge-Base cleanup is temporarily paused while we roll out an update. The member's data is unchanged — try again shortly.",
    };
  }

  const result = await applyMergeRun(userId, mergeRunId);
  return { ok: true, result, alreadyApplied: false };
}

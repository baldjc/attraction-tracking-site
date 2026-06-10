import { NextRequest } from "next/server";
import { requireKnowledgeBaseAccess } from "@/lib/knowledge-base-server";
import { applyMergeRun } from "@/lib/kb-merge/merge-run";
import { tryEnqueueKbMergeApply } from "@/lib/job-dispatch";

export const runtime = "nodejs";
// Apply re-aggregates every upload — give it room.
export const maxDuration = 300;

/**
 * POST /api/member/knowledge-base/merge/apply
 * body: { mergeRunId: string, selectedReviewKeys?: string[] }
 *
 * Confirms and applies a DRY_RUN merge: persists canonical areas/aliases,
 * re-aggregates every upload onto canonical names, relabels existing facts.
 * `selectedReviewKeys` (`${from}->${into}`) opts review-queue near-duplicates
 * into the merge. Non-destructive (raw CSVs + report retained).
 */
export async function POST(req: NextRequest) {
  const access = await requireKnowledgeBaseAccess();
  if (!access.ok) return access.response;

  let body: { mergeRunId?: unknown; selectedReviewKeys?: unknown };
  try {
    body = (await req.json()) as {
      mergeRunId?: unknown;
      selectedReviewKeys?: unknown;
    };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.mergeRunId !== "string" || !body.mergeRunId) {
    return Response.json(
      { error: "`mergeRunId` is required." },
      { status: 400 },
    );
  }
  const selectedReviewKeys = Array.isArray(body.selectedReviewKeys)
    ? body.selectedReviewKeys.filter((k): k is string => typeof k === "string")
    : [];

  try {
    // When the durable queue is on for this owner, hand the (potentially ~30 min)
    // apply to the always-on worker and return immediately so the browser never
    // waits it out. With the flag OFF (default) this returns false and we run the
    // proven in-request path below — zero behaviour change.
    const queued = await tryEnqueueKbMergeApply(
      body.mergeRunId,
      access.user.id,
      selectedReviewKeys,
    );
    if (queued) {
      return Response.json({ queued: true });
    }

    const result = await applyMergeRun(access.user.id, body.mergeRunId, {
      selectedReviewKeys,
    });
    return Response.json({ queued: false, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Apply failed";
    console.error("[kb-merge][api] apply failed", err);
    const status = /not found|cannot apply/i.test(message) ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}

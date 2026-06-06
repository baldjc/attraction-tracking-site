import { requireKnowledgeBaseAccess } from "@/lib/knowledge-base-server";
import {
  buildMergeRunReport,
  getLatestMergeRun,
} from "@/lib/kb-merge/merge-run";

export const runtime = "nodejs";
// The dry-run runs the Haiku fuzzy pass over the whole vocab — give it room.
export const maxDuration = 300;

/**
 * GET /api/member/knowledge-base/merge
 * Returns the member's most recent merge run (report + status) so the KB UI can
 * show "X fragments ready to clean up" or the outcome of the last apply. Null
 * when the member has never run a merge.
 */
export async function GET() {
  const access = await requireKnowledgeBaseAccess();
  if (!access.ok) return access.response;

  const latest = await getLatestMergeRun(access.user.id);
  return Response.json({ latest });
}

/**
 * POST /api/member/knowledge-base/merge
 * Computes a fresh DRY_RUN merge proposal (deterministic + conservative fuzzy)
 * and persists it for review. NO destructive writes — nothing is merged until
 * the member confirms via /merge/apply.
 */
export async function POST() {
  const access = await requireKnowledgeBaseAccess();
  if (!access.ok) return access.response;

  try {
    const { mergeRunId, report } = await buildMergeRunReport(access.user.id, {
      source: "manual",
    });
    return Response.json({ mergeRunId, report });
  } catch (err) {
    console.error("[kb-merge][api] dry-run failed", err);
    return Response.json(
      { error: "Could not compute a merge proposal. Please try again." },
      { status: 500 },
    );
  }
}

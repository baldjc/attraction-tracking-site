import { NextRequest } from "next/server";
import { requireKnowledgeBaseAccess } from "@/lib/knowledge-base-server";
import { applyMergeRun } from "@/lib/kb-merge/merge-run";

export const runtime = "nodejs";
// Apply re-aggregates every upload — give it room.
export const maxDuration = 300;

/**
 * POST /api/member/knowledge-base/merge/apply
 * body: { mergeRunId: string }
 *
 * Confirms and applies a DRY_RUN merge: persists canonical areas/aliases,
 * re-aggregates every upload onto canonical names, relabels existing facts.
 * Non-destructive (raw CSVs + report retained).
 */
export async function POST(req: NextRequest) {
  const access = await requireKnowledgeBaseAccess();
  if (!access.ok) return access.response;

  let body: { mergeRunId?: unknown };
  try {
    body = (await req.json()) as { mergeRunId?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.mergeRunId !== "string" || !body.mergeRunId) {
    return Response.json(
      { error: "`mergeRunId` is required." },
      { status: 400 },
    );
  }

  try {
    const result = await applyMergeRun(access.user.id, body.mergeRunId);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Apply failed";
    console.error("[kb-merge][api] apply failed", err);
    const status = /not found|cannot apply/i.test(message) ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}

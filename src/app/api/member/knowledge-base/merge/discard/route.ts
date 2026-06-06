import { NextRequest } from "next/server";
import { requireKnowledgeBaseAccess } from "@/lib/knowledge-base-server";
import { discardMergeRun } from "@/lib/kb-merge/merge-run";

export const runtime = "nodejs";

/**
 * POST /api/member/knowledge-base/merge/discard
 * body: { mergeRunId: string }
 *
 * Rejects a DRY_RUN merge proposal. Nothing was ever written, so this only
 * flips the run to DISCARDED for the audit trail.
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
    return Response.json({ error: "`mergeRunId` is required." }, { status: 400 });
  }

  try {
    await discardMergeRun(access.user.id, body.mergeRunId);
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Discard failed";
    const status = /not found|cannot discard/i.test(message) ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}

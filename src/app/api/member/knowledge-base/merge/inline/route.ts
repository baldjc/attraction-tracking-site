import { NextRequest } from "next/server";
import { requireKnowledgeBaseAccess } from "@/lib/knowledge-base-server";
import { buildMergeRunReport, mergeGroups } from "@/lib/kb-merge/merge-run";

export const runtime = "nodejs";
// Builds a fresh dry-run and folds one pair — a couple of DB reads + the
// deterministic proposal. No fuzzy LLM pass, so this stays quick.
export const maxDuration = 120;

/**
 * POST /api/member/knowledge-base/merge/inline
 * body: { source: string, target: string }
 *
 * Prepares a one-pair merge straight from the discovered/vocab list so the
 * member can combine two names ("Phase 1" → "Austin Waters") without opening
 * the full cleanup tool. Builds a DRY_RUN proposal with NO fuzzy guesses
 * (deterministic dedup only) and folds `source` into `target`, then returns the
 * `mergeRunId` for the caller to confirm via the existing guarded
 * /merge/apply route (which keeps the re-aggregation kill-switch and durable
 * queue handling). Non-destructive — nothing is applied here.
 */
export async function POST(req: NextRequest) {
  const access = await requireKnowledgeBaseAccess();
  if (!access.ok) return access.response;

  let body: { source?: unknown; target?: unknown };
  try {
    body = (await req.json()) as { source?: unknown; target?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const source = typeof body.source === "string" ? body.source.trim() : "";
  const target = typeof body.target === "string" ? body.target.trim() : "";
  if (!source || !target) {
    return Response.json(
      { error: "Both a source name and a target area are required." },
      { status: 400 },
    );
  }
  if (source.toLowerCase() === target.toLowerCase()) {
    return Response.json(
      { error: "Pick a different area to merge into." },
      { status: 400 },
    );
  }

  try {
    // Deterministic-only run (applyFuzzy:false) so this commits ONLY exact
    // duplicates plus the member's explicit pick — never an unreviewed fuzzy
    // guess.
    const { mergeRunId } = await buildMergeRunReport(access.user.id, {
      source: "manual",
      applyFuzzy: false,
    });
    if (!mergeRunId) {
      return Response.json(
        { error: "Could not prepare the merge. Please try again." },
        { status: 500 },
      );
    }

    const report = await mergeGroups(access.user.id, mergeRunId, {
      displays: [source, target],
      master: target,
    });

    return Response.json({ mergeRunId, report });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not prepare the merge.";
    console.error("[kb-merge][api] inline merge failed", err);
    const status = /not found/i.test(message) ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}

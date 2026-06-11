import { NextRequest } from "next/server";
import { requireKnowledgeBaseAccess } from "@/lib/knowledge-base-server";
import {
  renameGroupMaster,
  mergeGroups,
  moveVariant,
} from "@/lib/kb-merge/merge-run";

export const runtime = "nodejs";
// Edits re-estimate the floor (a couple of DB reads) — give modest room.
export const maxDuration = 60;

/**
 * POST /api/member/knowledge-base/merge/edit
 * body:
 *   { mergeRunId, action: "rename", groupDisplay, newDisplay }
 *   { mergeRunId, action: "merge",  displays: string[], master }
 *   { mergeRunId, action: "move",   variant, toDisplay }
 *
 * Edits a DRY_RUN merge run's plan (rename a group's master, merge groups, or
 * move/split a variant). Non-destructive — only mutates the stored proposal;
 * nothing is applied until /merge/apply. Returns the updated report.
 */
export async function POST(req: NextRequest) {
  const access = await requireKnowledgeBaseAccess();
  if (!access.ok) return access.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const mergeRunId = body.mergeRunId;
  const action = body.action;
  if (typeof mergeRunId !== "string" || !mergeRunId) {
    return Response.json({ error: "`mergeRunId` is required." }, { status: 400 });
  }

  try {
    let report;
    if (action === "rename") {
      report = await renameGroupMaster(access.user.id, mergeRunId, {
        groupDisplay: String(body.groupDisplay ?? ""),
        newDisplay: String(body.newDisplay ?? ""),
      });
    } else if (action === "merge") {
      const displays = Array.isArray(body.displays)
        ? body.displays.filter((d): d is string => typeof d === "string")
        : [];
      report = await mergeGroups(access.user.id, mergeRunId, {
        displays,
        master: String(body.master ?? ""),
      });
    } else if (action === "move") {
      report = await moveVariant(access.user.id, mergeRunId, {
        variant: String(body.variant ?? ""),
        toDisplay: String(body.toDisplay ?? ""),
      });
    } else {
      return Response.json(
        { error: "Unknown action. Expected rename | merge | move." },
        { status: 400 },
      );
    }
    return Response.json({ report });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Edit failed";
    // Member-facing validation errors map to 400; only genuinely unexpected
    // failures are 500.
    const status = /not found/i.test(message) ? 404 : 400;
    console.error("[kb-merge][api] edit failed", err);
    return Response.json({ error: message }, { status });
  }
}

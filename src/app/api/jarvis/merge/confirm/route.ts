/**
 * POST /api/jarvis/merge/confirm
 *
 * The deterministic trigger behind the member's "Yes, clean it up" tap inside
 * the Jarvis chat. Records an explicit merge_confirmation member message (the
 * gate signal) and then runs the ONE shared gated apply (merge.ts). This is the
 * only in-chat path that mutates the Knowledge Base — mirrors the script
 * proposal "save" action.
 */
import { type NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import { getFeatureFlags } from "@/lib/feature-flags";
import prisma from "@/lib/prisma";
import { applyConfirmedMerge } from "@/lib/jarvis/merge";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const resolved = await resolveUserFromSession();
  if (!resolved) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = resolved.id;

  const flags = await getFeatureFlags({ userId, userRole: resolved.role });
  if (!flags.tool_jarvis) return NextResponse.json({ error: "not_enabled" }, { status: 404 });

  let body: { threadId?: string; mergeRunId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const { threadId, mergeRunId } = body;
  if (!threadId || !mergeRunId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const thread = await prisma.contentManagerThread.findFirst({
    where: { id: threadId, userId },
    select: { id: true },
  });
  if (!thread) return NextResponse.json({ error: "thread_not_found" }, { status: 404 });

  const run = await prisma.mergeRun.findFirst({
    where: { id: mergeRunId, userId },
    select: { id: true, status: true },
  });
  if (!run) return NextResponse.json({ error: "merge_run_not_found" }, { status: 404 });

  // Idempotent: already applied → report success without re-recording.
  if (run.status === "APPLIED") {
    return NextResponse.json({ ok: true, alreadyApplied: true });
  }
  if (run.status !== "DRY_RUN") {
    return NextResponse.json(
      { error: "bad_state", message: `Merge run is ${run.status}.` },
      { status: 409 },
    );
  }

  // Record the explicit confirmation as the latest member message — this is
  // exactly the gate signal `applyConfirmedMerge` requires.
  await prisma.contentManagerMessage.create({
    data: {
      threadId,
      role: "user",
      content: { kind: "merge_confirmation", mergeRunId },
    },
  });

  const applied = await applyConfirmedMerge({ userId, threadId, mergeRunId });
  if (!applied.ok) {
    return NextResponse.json({ error: applied.code, message: applied.message }, { status: 409 });
  }
  return NextResponse.json({
    ok: true,
    alreadyApplied: applied.alreadyApplied,
    result: applied.result,
  });
}

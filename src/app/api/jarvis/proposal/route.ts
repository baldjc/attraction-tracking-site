/**
 * POST /api/jarvis/proposal
 *
 * Drives the script-save proposal lifecycle for one assistant message:
 *   action "confirming" → proposed → confirming (member tapped Approve & save)
 *   action "reopen"     → confirming → proposed (member backed out)
 *   action "decline"    → proposed/confirming → declined
 *   action "save"       → records an explicit save_confirmation member message,
 *                          then runs the ONE shared gated save (save.ts).
 *
 * The "save" action is the deterministic trigger behind the member's
 * "Yes, save it" tap — it is the only path that creates a DRAFT SavedScript.
 */
import { type NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import { getFeatureFlags } from "@/lib/feature-flags";
import prisma from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { saveConfirmedScript } from "@/lib/jarvis/save";
import type { ProposalState } from "@/lib/jarvis/types";

export const runtime = "nodejs";

type Action = "confirming" | "reopen" | "decline" | "save";

export async function POST(req: NextRequest) {
  const resolved = await resolveUserFromSession();
  if (!resolved) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = resolved.id;

  const flags = await getFeatureFlags({ userId, userRole: resolved.role });
  if (!flags.tool_jarvis) return NextResponse.json({ error: "not_enabled" }, { status: 404 });

  let body: { threadId?: string; messageId?: string; action?: Action };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const { threadId, messageId, action } = body;
  if (!threadId || !messageId || !action) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const thread = await prisma.contentManagerThread.findFirst({
    where: { id: threadId, userId },
    select: { id: true },
  });
  if (!thread) return NextResponse.json({ error: "thread_not_found" }, { status: 404 });

  const msg = await prisma.contentManagerMessage.findUnique({
    where: { id: messageId },
    select: { id: true, threadId: true, proposalState: true },
  });
  if (!msg || msg.threadId !== threadId) {
    return NextResponse.json({ error: "message_not_found" }, { status: 404 });
  }
  const proposal = msg.proposalState as ProposalState | null;
  if (!proposal) {
    return NextResponse.json({ error: "no_proposal" }, { status: 409 });
  }

  // ── save: gated draft creation ────────────────────────────────────────────
  if (action === "save") {
    // Idempotent: already saved → return the existing draft.
    if (proposal.status === "created" && proposal.savedScriptId) {
      return NextResponse.json({
        ok: true,
        savedScriptId: proposal.savedScriptId,
        alreadySaved: true,
        proposalState: proposal,
      });
    }
    // Enforce the two-tap gate server-side: the member must have first tapped
    // "Approve & save" (→ confirming) before "Yes, save it" (→ save).
    if (proposal.status !== "confirming") {
      return NextResponse.json(
        { error: "needs_confirmation", message: "Tap Approve & save first." },
        { status: 409 },
      );
    }
    // Record the explicit confirmation as the latest member message — this is
    // exactly the gate signal `saveConfirmedScript` requires.
    await prisma.contentManagerMessage.create({
      data: {
        threadId,
        role: "user",
        content: { kind: "save_confirmation", proposalMessageId: messageId },
      },
    });
    const saved = await saveConfirmedScript({ userId, threadId, proposalMessageId: messageId });
    if (!saved.ok) {
      return NextResponse.json({ error: saved.code, message: saved.message }, { status: 409 });
    }
    const updated = await prisma.contentManagerMessage.findUnique({
      where: { id: messageId },
      select: { proposalState: true },
    });
    return NextResponse.json({
      ok: true,
      savedScriptId: saved.savedScriptId,
      alreadySaved: saved.alreadySaved,
      proposalState: updated?.proposalState ?? null,
    });
  }

  // ── lifecycle-only transitions ────────────────────────────────────────────
  if (proposal.status === "created") {
    return NextResponse.json({ error: "already_saved" }, { status: 409 });
  }
  let nextStatus: ProposalState["status"] = proposal.status;
  if (action === "confirming") nextStatus = "confirming";
  else if (action === "reopen") nextStatus = "proposed";
  else if (action === "decline") nextStatus = "declined";
  else return NextResponse.json({ error: "bad_action" }, { status: 400 });

  const next: ProposalState = { ...proposal, status: nextStatus };
  // Atomic guarded transition: only flip if the persisted status is still what
  // we read. This prevents a stale lifecycle request (reopen/decline) from
  // clobbering a concurrent successful save that already moved the proposal to
  // "created" (and stamped savedScriptId) — which would sever the idempotency
  // marker and allow a duplicate draft on a later re-save.
  const claim = await prisma.contentManagerMessage.updateMany({
    where: {
      id: messageId,
      proposalState: { path: ["status"], equals: proposal.status },
    },
    data: { proposalState: next as unknown as Prisma.InputJsonValue },
  });
  if (claim.count === 0) {
    // Lost the race — return the current persisted state so the client resyncs.
    const fresh = await prisma.contentManagerMessage.findUnique({
      where: { id: messageId },
      select: { proposalState: true },
    });
    return NextResponse.json(
      { error: "stale_proposal", proposalState: fresh?.proposalState ?? null },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true, proposalState: next });
}

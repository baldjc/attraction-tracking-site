// Jarvis (AI Content Manager) — the ONE place a script is ever persisted.
//
// Saving only ever creates a DRAFT SavedScript (surfaced in My Work /
// Content Planner). Nothing is published, scheduled, or messaged. Every save
// path — the deterministic "Yes, save it" confirm action AND the save_script
// LLM tool — funnels through `saveConfirmedScript`, which refuses unless the
// immediately-preceding member message is an explicit save confirmation for
// this exact proposal. Idempotent: a proposal that already created a draft
// returns the existing id instead of writing twice.

import prisma from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { getStatusOptions } from "@/lib/content-plan-utils";
import { rotationSlotToTheme } from "@/lib/content-engine-validation";
import type {
  MessageContent,
  ProposalState,
  SaveConfirmationContent,
} from "@/lib/jarvis/types";

export type SaveResult =
  | {
      ok: true;
      savedScriptId: string;
      alreadySaved: boolean;
      contentPlanId?: string;
    }
  | { ok: false; code: "not_found" | "forbidden" | "not_gated" | "bad_state"; message: string };

/**
 * Persist a proposed script as a DRAFT SavedScript — gated.
 *
 * Gate: the latest member (role "user") message in the thread must be a
 * `save_confirmation` whose `proposalMessageId` matches the proposal being
 * saved. The proposal "save" action inserts exactly that record immediately
 * before calling this; the save_script tool relies on the same record having
 * been written by a prior confirm action (it never writes one itself).
 */
export async function saveConfirmedScript(args: {
  userId: string;
  threadId: string;
  proposalMessageId: string;
}): Promise<SaveResult> {
  const { userId, threadId, proposalMessageId } = args;

  const thread = await prisma.contentManagerThread.findUnique({
    where: { id: threadId },
    select: { id: true, userId: true },
  });
  if (!thread) {
    return { ok: false, code: "not_found", message: "Thread not found." };
  }
  if (thread.userId !== userId) {
    return { ok: false, code: "forbidden", message: "Not your thread." };
  }

  const proposalMsg = await prisma.contentManagerMessage.findUnique({
    where: { id: proposalMessageId },
    select: { id: true, threadId: true, role: true, proposalState: true },
  });
  if (!proposalMsg || proposalMsg.threadId !== threadId) {
    return { ok: false, code: "not_found", message: "Proposal not found." };
  }
  const proposal = proposalMsg.proposalState as ProposalState | null;
  if (!proposal || !proposal.script || !proposal.title) {
    return { ok: false, code: "bad_state", message: "This message has no script to save." };
  }

  // Idempotent: already saved → return the existing draft (+ its plan).
  if (proposal.status === "created" && proposal.savedScriptId) {
    return {
      ok: true,
      savedScriptId: proposal.savedScriptId,
      alreadySaved: true,
      contentPlanId: proposal.contentPlanId,
    };
  }

  // ── GATE: latest member message must be an explicit confirmation ──────────
  const latestMember = await prisma.contentManagerMessage.findFirst({
    where: { threadId, role: "user" },
    orderBy: { createdAt: "desc" },
    select: { content: true },
  });
  const content = latestMember?.content as MessageContent | null;
  const isConfirmation =
    !!content &&
    (content as SaveConfirmationContent).kind === "save_confirmation" &&
    (content as SaveConfirmationContent).proposalMessageId === proposalMessageId;
  if (!isConfirmation) {
    return {
      ok: false,
      code: "not_gated",
      message:
        "Saving requires the member to approve this exact draft (Approve & save → Yes, save it).",
    };
  }

  // ── Persist the DRAFT SavedScript (the only write Jarvis ever makes) ──────
  // Create the draft, then ATOMICALLY claim the proposal: the updateMany only
  // matches while the proposal is still "confirming" (the member's first tap),
  // so exactly one concurrent caller can flip it to "created". The loser
  // deletes its orphaned draft and returns the winner's id — no duplicate
  // drafts, and the two-tap requirement is enforced in the single write path.
  const saved = await prisma.savedScript.create({
    data: {
      userId,
      videoTitle: proposal.title,
      // Shape matches the saved-scripts list/detail extractors (fullScript).
      scriptOutline: {
        fullScript: proposal.script,
        source: "jarvis",
        rotationSlot: proposal.rotationSlot,
        linkedFactIds: proposal.linkedFactIds,
      },
      arcScores: proposal.metrics
        ? (proposal.metrics as Prisma.InputJsonValue)
        : undefined,
    },
    select: { id: true },
  });

  const claim = await prisma.contentManagerMessage.updateMany({
    where: {
      id: proposalMessageId,
      proposalState: { path: ["status"], equals: "confirming" },
    },
    data: {
      proposalState: {
        ...proposal,
        status: "created",
        savedScriptId: saved.id,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  if (claim.count === 0) {
    // Another caller already claimed this proposal (or it wasn't in the
    // "confirming" state). Drop our orphan and return idempotently.
    await prisma.savedScript.delete({ where: { id: saved.id } }).catch(() => {});
    const fresh = await prisma.contentManagerMessage.findUnique({
      where: { id: proposalMessageId },
      select: { proposalState: true },
    });
    const fp = fresh?.proposalState as ProposalState | null;
    if (fp?.status === "created" && fp.savedScriptId) {
      return {
        ok: true,
        savedScriptId: fp.savedScriptId,
        alreadySaved: true,
        contentPlanId: fp.contentPlanId,
      };
    }
    return {
      ok: false,
      code: "not_gated",
      message:
        "This draft isn't ready to save — tap Approve & save first, then confirm.",
    };
  }

  // ── Route the approved draft INTO the Content Planner ────────────────────
  // The Planner is the single home for member content: an approved script must
  // land there as a planned future video (leftmost backlog status, unscheduled)
  // with the full script attached (its "## Sources" footnote and 3 title options
  // ride along inside the script text). We only reach here on the WINNING claim,
  // so exactly one ContentPlan is ever created per proposal. Best-effort: if the
  // plan write fails the SavedScript draft is still saved (nothing is lost) —
  // routing is non-fatal so an approved draft never silently vanishes.
  let contentPlanId: string | undefined;
  try {
    const planUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { serviceTier: true },
    });
    const startingStatus = getStatusOptions(planUser?.serviceTier ?? "foundations")[0];
    const plan = await prisma.contentPlan.create({
      data: {
        userId,
        title: proposal.title,
        status: startingStatus,
        theme: rotationSlotToTheme(proposal.rotationSlot),
        rotationSlot: proposal.rotationSlot,
        script: proposal.script,
        linkedScriptId: saved.id,
        linkedFactIds: proposal.linkedFactIds ?? [],
      },
      select: { id: true },
    });
    contentPlanId = plan.id;
    // Stamp the plan id onto the (already-claimed) proposal so re-saves are
    // idempotent and the chat can deep-link to the planner item.
    await prisma.contentManagerMessage.update({
      where: { id: proposalMessageId },
      data: {
        proposalState: {
          ...proposal,
          status: "created",
          savedScriptId: saved.id,
          contentPlanId,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    // Non-fatal: the draft is saved; planner routing can be retried by editing
    // the saved script into a plan manually. Log for observability.
    console.error("[jarvis/save] Content Planner routing failed", err);
  }

  return { ok: true, savedScriptId: saved.id, alreadySaved: false, contentPlanId };
}

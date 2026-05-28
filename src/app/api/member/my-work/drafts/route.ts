/**
 * Wave 4 — GET /api/member/my-work/drafts
 *
 * Returns the caller's in-progress Content Engine wizard drafts for the
 * "Drafts in progress" section on My Work. Multi-draft (Wave 4 beta —
 * Finding 12): a member may have several concurrent drafts (two tabs,
 * parallel idea explorations). We return up to 3, newest-first, plus
 * the per-id route handles delete/PATCH for each.
 *
 * Same TTL/expired-sweep policy as the wizard's draft endpoint.
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";

export const runtime = "nodejs";

export async function GET() {
  // Impersonation-aware so drafts resolve to the impersonated member.
  const resolved = await resolveUserFromSession();
  const userId = resolved?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Delete-on-read cleanup so My Work never shows a stale (expired) draft.
  const now = new Date();
  await prisma.contentEngineDraft.deleteMany({
    where: { expiresAt: { lt: now } },
  });

  const drafts = await prisma.contentEngineDraft.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 3,
    select: {
      id: true,
      currentStep: true,
      propertyTypeFocus: true,
      storyLeadId: true,
      rotationSlot: true,
      validatedIdea: true,
      pickedKey: true,
      expiresAt: true,
      updatedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ drafts });
}

/**
 * Wave 4 — GET /api/member/my-work/drafts
 *
 * Returns the caller's in-progress Content Engine wizard drafts for the
 * "Drafts in progress" section on My Work. There's only ever one row per
 * user (unique constraint on userId), so the list will be 0 or 1 — we
 * still return an array so the UI is forward-compatible if we ever allow
 * named drafts.
 *
 * Same TTL/expired-sweep policy as the wizard's draft endpoint.
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
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

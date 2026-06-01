import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";
import { ensureVideoFolderForPlan, classifyDriveError, DRIVE_ERROR_STATUS } from "@/lib/google-drive";
import { hasDriveFolderAccess } from "@/lib/service-tier";

export const runtime = "nodejs";

// POST — create (or return the existing) Google Drive folder for this plan.
// Drive folders are a Production-tier feature; Foundations members store assets
// in Object Storage only and never get a folder, so they're rejected here.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const plan = await prisma.contentPlan.findFirst({
    where: { id, userId: user.id, deletedAt: null },
    select: { id: true },
  });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { serviceTier: true },
  });
  if (!hasDriveFolderAccess(dbUser?.serviceTier)) {
    return NextResponse.json({ error: "tier_restricted" }, { status: 403 });
  }

  try {
    const ensured = await ensureVideoFolderForPlan(id, user.id);
    if (!ensured) {
      // Null means "not applicable" (plan vanished or member isn't on a
      // Drive-enabled tier) rather than a Drive failure — treat as unavailable.
      return NextResponse.json(
        { error: "unknown", message: "Couldn't create a Drive folder for this plan." },
        { status: 502 },
      );
    }
    return NextResponse.json({ driveFolderLink: ensured.folderUrl });
  } catch (err) {
    const de = classifyDriveError(err);
    return NextResponse.json(
      { error: de.category, message: de.userMessage },
      { status: DRIVE_ERROR_STATUS[de.category] },
    );
  }
}

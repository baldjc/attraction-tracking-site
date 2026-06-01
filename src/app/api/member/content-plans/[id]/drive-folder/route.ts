import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";
import { ensureVideoFolderForPlan } from "@/lib/google-drive";
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
    where: { id, userId: user.id },
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

  const ensured = await ensureVideoFolderForPlan(id, user.id);
  if (!ensured) {
    return NextResponse.json({ error: "Could not create Drive folder." }, { status: 502 });
  }

  return NextResponse.json({ driveFolderLink: ensured.folderUrl });
}

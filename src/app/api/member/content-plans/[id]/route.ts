import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { isValidStatus, PRODUCTION_TIERS } from "@/lib/content-plan-utils";
import { createVideoFolder } from "@/lib/google-drive";
import { getFeatureFlags } from "@/lib/feature-flags";

const DRIVE_TRIGGER_STATUSES_LEGACY = ["Ready to Shoot", "Shooting", "Shot - In Post"];
const DRIVE_TRIGGER_STATUSES_WITH_SCRIPTED = ["Scripted", "Ready to Shoot", "Shooting", "Shot - In Post"];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const plan = await prisma.contentPlan.findFirst({ where: { id, userId: user.id } });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ plan });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.contentPlan.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { serviceTier: true, fullName: true, email: true, assetsDriveLink: true },
  });
  const serviceTier = dbUser?.serviceTier ?? "foundations";

  const body = await req.json();
  const { title, status, theme, shootDate, publishDate, editDueDate, priority, dramaMode, notes, script, researchNotes, thumbnailWords, footageLink, driveFolderLink, youtubeDescription, linkedCampaignId, linkedScriptId } = body;

  if (linkedScriptId !== undefined && linkedScriptId !== null) {
    const owned = await prisma.savedScript.findFirst({ where: { id: linkedScriptId, userId: user.id }, select: { id: true } });
    if (!owned) {
      return NextResponse.json({ error: "Script not found" }, { status: 404 });
    }
  }

  if (status !== undefined && !isValidStatus(status, serviceTier)) {
    return NextResponse.json({ error: "Invalid status for your membership tier" }, { status: 400 });
  }

  let plan = await prisma.contentPlan.update({
    where: { id },
    data: {
      ...(title !== undefined && { title: title.trim() }),
      ...(status !== undefined && { status }),
      ...(theme !== undefined && { theme: theme ?? null }),
      ...(shootDate !== undefined && { shootDate: shootDate ? new Date(shootDate) : null }),
      ...(publishDate !== undefined && { publishDate: publishDate ? new Date(publishDate) : null }),
      ...(editDueDate !== undefined && { editDueDate: editDueDate ? new Date(editDueDate) : null }),
      ...(priority !== undefined && { priority: priority ?? null }),
      ...(dramaMode !== undefined && { dramaMode: Boolean(dramaMode) }),
      ...(notes !== undefined && { notes: notes ?? null }),
      ...(script !== undefined && { script: script ?? null }),
      ...(researchNotes !== undefined && { researchNotes: researchNotes ?? null }),
      ...(thumbnailWords !== undefined && { thumbnailWords: thumbnailWords ?? null }),
      ...(footageLink !== undefined && { footageLink: footageLink ?? null }),
      ...(driveFolderLink !== undefined && { driveFolderLink: driveFolderLink ?? null }),
      ...(youtubeDescription !== undefined && { youtubeDescription: youtubeDescription ?? null }),
      ...(linkedCampaignId !== undefined && { linkedCampaignId: linkedCampaignId ?? null }),
      ...(linkedScriptId !== undefined && { linkedScriptId: linkedScriptId ?? null }),
    },
  });

  const driveFlags = await getFeatureFlags();
  const triggerStatuses = driveFlags.drive_auto_upload
    ? DRIVE_TRIGGER_STATUSES_WITH_SCRIPTED
    : DRIVE_TRIGGER_STATUSES_LEGACY;

  if (
    status !== undefined &&
    PRODUCTION_TIERS.includes(serviceTier) &&
    triggerStatuses.includes(status) &&
    (!plan.driveFolderLink || !plan.driveFolderLink.startsWith("http"))
  ) {
    try {
      const memberName = dbUser?.fullName || dbUser?.email || user.id;
      const { videoFolderUrl, memberFolderUrl } = await createVideoFolder(memberName, plan.title);
      const driveUpdates: Promise<unknown>[] = [
        prisma.contentPlan.update({ where: { id }, data: { driveFolderLink: videoFolderUrl } }),
      ];
      if (!dbUser?.assetsDriveLink) {
        driveUpdates.push(prisma.user.update({ where: { id: user.id }, data: { assetsDriveLink: memberFolderUrl } }));
      }
      await Promise.all(driveUpdates);
      plan = { ...plan, driveFolderLink: videoFolderUrl };
    } catch (err) {
      console.error("[content-plans/[id]] Drive folder creation failed:", err);
    }
  }

  return NextResponse.json({ plan });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.contentPlan.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.contentPlan.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

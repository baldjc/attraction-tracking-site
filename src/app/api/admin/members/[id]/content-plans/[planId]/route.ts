import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canStaffAccessMember } from "@/lib/staff-access";
import { createVideoFolder, isFileInFolder } from "@/lib/google-drive";

// "Needs Research" is the earliest production status — kicking off the Drive
// folder + Video Research doc here gives the member a place to drop research
// links from the very start of the workflow. Later statuses remain triggers
// because Drive creation is idempotent (skipped when a folder already exists).
const DRIVE_TRIGGER_STATUSES = ["Needs Research", "Ready to Shoot", "Shooting", "Shot - In Post"];

async function checkAdmin() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  return session?.user && (role === "admin" || role === "editor") ? session : null;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; planId: string }> }) {
  const session = await checkAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, planId } = await params;
  if (!(await canStaffAccessMember((session.user as any).id, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const existing = await prisma.contentPlan.findFirst({ where: { id: planId, userId: id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { title, status, theme, shootDate, publishDate, editDueDate, priority, notes, script, researchNotes, thoughts, thumbnailWords, footageLink, driveFolderLink, thumbnailFileId, thumbnailFileName, manualSteps } = body;
  // Whitelist manual step keys (mirror member route).
  const VALID_STEP_KEYS = new Set(["idea","script","review","title","description","repurpose","ready"]);
  let manualStepsClean: string[] | undefined;
  if (manualSteps !== undefined) {
    manualStepsClean = Array.isArray(manualSteps)
      ? Array.from(new Set(manualSteps.filter((k: unknown): k is string => typeof k === "string" && VALID_STEP_KEYS.has(k))))
      : [];
  }
  // Coerce empty-string `bingeVideoId` ("") to null so non-modal clients can
  // clear the link without tripping the ownership lookup (which would 404 on
  // an empty id). Treat `undefined` (field omitted) distinctly from null
  // (explicit clear) so partial updates only touch what the caller sent.
  const bingeVideoId: string | null | undefined =
    body.bingeVideoId === undefined ? undefined : (body.bingeVideoId || null);

  // Binge-link validation: a video cannot point to itself, and the target must
  // belong to the same member (no cross-account links even when admin edits).
  if (bingeVideoId !== undefined && bingeVideoId !== null) {
    if (bingeVideoId === planId) {
      return NextResponse.json({ error: "A video can't binge to itself." }, { status: 400 });
    }
    const target = await prisma.contentPlan.findFirst({
      where: { id: bingeVideoId, userId: id },
      select: { id: true },
    });
    if (!target) {
      return NextResponse.json({ error: "Binge target not found" }, { status: 404 });
    }
  }

  // Constrain thumbnail picks to a Drive file that actually lives inside
  // this plan's project folder — otherwise a forged PUT could repoint the
  // proxy at any file the service account can read.
  if (thumbnailFileId) {
    const folderLink = driveFolderLink ?? existing.driveFolderLink;
    if (!folderLink) {
      return NextResponse.json({ error: "Plan has no Drive folder" }, { status: 400 });
    }
    const inFolder = await isFileInFolder(thumbnailFileId, folderLink);
    if (!inFolder) {
      return NextResponse.json({ error: "Thumbnail must be a file in this plan's Drive folder" }, { status: 400 });
    }
  }

  let plan = await prisma.contentPlan.update({
    where: { id: planId },
    data: {
      ...(title !== undefined && { title: title.trim() }),
      ...(status !== undefined && { status }),
      ...(theme !== undefined && { theme: theme ?? null }),
      ...(shootDate !== undefined && { shootDate: shootDate ? new Date(shootDate) : null }),
      ...(publishDate !== undefined && { publishDate: publishDate ? new Date(publishDate) : null }),
      ...(editDueDate !== undefined && { editDueDate: editDueDate ? new Date(editDueDate) : null }),
      ...(priority !== undefined && { priority: priority ?? null }),
      ...(notes !== undefined && { notes: notes ?? null }),
      ...(script !== undefined && { script: script ?? null }),
      ...(researchNotes !== undefined && { researchNotes: researchNotes ?? null }),
      ...(thoughts !== undefined && { thoughts: thoughts ?? null }),
      ...(thumbnailWords !== undefined && { thumbnailWords: thumbnailWords ?? null }),
      ...(footageLink !== undefined && { footageLink: footageLink ?? null }),
      ...(driveFolderLink !== undefined && { driveFolderLink: driveFolderLink ?? null }),
      ...(bingeVideoId !== undefined && { bingeVideoId: bingeVideoId ?? null }),
      ...(thumbnailFileId !== undefined && { thumbnailFileId: thumbnailFileId ?? null }),
      ...(thumbnailFileName !== undefined && { thumbnailFileName: thumbnailFileName ?? null }),
      ...(manualStepsClean !== undefined && { manualSteps: manualStepsClean }),
    },
    include: {
      bingeVideo: { select: { id: true, title: true, theme: true, status: true } },
      bingedFromList: {
        select: { id: true, title: true, theme: true, status: true },
        orderBy: { updatedAt: "desc" },
      },
    },
  });

  if (
    status !== undefined &&
    DRIVE_TRIGGER_STATUSES.includes(status) &&
    !plan.driveFolderLink
  ) {
    try {
      const member = await prisma.user.findUnique({ where: { id }, select: { fullName: true, email: true, assetsDriveLink: true } });
      const memberName = member?.fullName || member?.email || id;
      const { videoFolderUrl, memberFolderUrl } = await createVideoFolder(memberName, plan.title);
      const updates: Promise<unknown>[] = [
        // Persist the new Drive folder link, but spread it onto the existing
        // `plan` object instead of replacing it — otherwise we'd drop the
        // `bingeVideo`/`bingedFromList` relations the modal needs to refresh
        // its state after save.
        prisma.contentPlan
          .update({ where: { id: planId }, data: { driveFolderLink: videoFolderUrl } })
          .then(() => { plan = { ...plan, driveFolderLink: videoFolderUrl }; }),
      ];
      if (!member?.assetsDriveLink) {
        updates.push(prisma.user.update({ where: { id }, data: { assetsDriveLink: memberFolderUrl } }));
      }
      await Promise.all(updates);
    } catch {
    }
  }

  return NextResponse.json({ plan });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; planId: string }> }) {
  const session = await checkAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, planId } = await params;
  if (!(await canStaffAccessMember((session.user as any).id, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const existing = await prisma.contentPlan.findFirst({ where: { id: planId, userId: id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.contentPlan.delete({ where: { id: planId } });
  return NextResponse.json({ success: true });
}

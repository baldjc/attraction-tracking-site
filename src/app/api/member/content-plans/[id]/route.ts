import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import {
  PRODUCTION_TIERS,
  getStatusOptions,
  FOUNDATIONS_STATUSES,
} from "@/lib/content-plan-utils";
import { createVideoFolder, isFileInFolder } from "@/lib/google-drive";
import { getFeatureFlags } from "@/lib/feature-flags";

// "Needs Research" is the earliest production status — kicking off the Drive
// folder + Video Research doc here gives the member a place to drop research
// links from day one. Later statuses remain triggers because folder creation
// is idempotent (skipped when a folder already exists).
const DRIVE_TRIGGER_STATUSES_LEGACY = ["Needs Research", "Ready to Shoot", "Shooting", "Shot - In Post"];
const DRIVE_TRIGGER_STATUSES_WITH_SCRIPTED = ["Needs Research", "Scripted", "Ready to Shoot", "Shooting", "Shot - In Post"];

// Shape of the related-plan summaries surfaced via `bingeVideo` and
// `bingedFromList`. Kept small (id/title/theme/status) so the planner UI can
// render the chip + "Binged FROM" rows without a second roundtrip.
const BINGE_RELATION_SELECT = { id: true, title: true, theme: true, status: true } as const;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const plan = await prisma.contentPlan.findFirst({
    where: { id, userId: user.id },
    include: {
      bingeVideo: { select: BINGE_RELATION_SELECT },
      bingedFromList: {
        select: BINGE_RELATION_SELECT,
        orderBy: { updatedAt: "desc" },
      },
    },
  });
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
  const { title, status, theme, shootDate, shootLocation, publishDate, editDueDate, priority, dramaMode, notes, script, researchNotes, thoughts, thumbnailWords, footageLink, driveFolderLink, youtubeDescription, linkedCampaignId, linkedScriptId, thumbnailFileId, thumbnailFileName, manualSteps, propertyTypeFocus } = body;
  // Wave 4 — same whitelist as POST. Treat undefined as "field omitted"
  // (partial PATCH semantics, no write), empty string as "clear", and any
  // other off-list string as "clear" (safer than persisting garbage).
  const ALLOWED_PROPERTY_TYPE_FOCUS = new Set(["Detached", "Row/Townhouse", "Semi-Detached", "Apartment", "All"]);
  let cleanPropertyTypeFocus: string | null | undefined;
  if (propertyTypeFocus === undefined) {
    cleanPropertyTypeFocus = undefined;
  } else if (!propertyTypeFocus) {
    cleanPropertyTypeFocus = null;
  } else if (typeof propertyTypeFocus === "string" && ALLOWED_PROPERTY_TYPE_FOCUS.has(propertyTypeFocus)) {
    cleanPropertyTypeFocus = propertyTypeFocus;
  } else {
    cleanPropertyTypeFocus = null;
  }
  // Whitelist manual step keys so a forged payload can't dump arbitrary JSON
  // into the column. Anything off-list is dropped silently.
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

  if (linkedScriptId !== undefined && linkedScriptId !== null) {
    const owned = await prisma.savedScript.findFirst({ where: { id: linkedScriptId, userId: user.id }, select: { id: true } });
    if (!owned) {
      return NextResponse.json({ error: "Script not found" }, { status: 404 });
    }
  }

  // Binge-link validation: a video cannot point to itself, and the target must
  // belong to the same user (no cross-account links).
  if (bingeVideoId !== undefined && bingeVideoId !== null) {
    if (bingeVideoId === id) {
      return NextResponse.json({ error: "A video can't binge to itself." }, { status: 400 });
    }
    const target = await prisma.contentPlan.findFirst({
      where: { id: bingeVideoId, userId: user.id },
      select: { id: true },
    });
    if (!target) {
      return NextResponse.json({ error: "Binge target not found" }, { status: 404 });
    }
  }

  // PATCH semantics: only validate `status` against the tier when the
  // caller is actually changing it. The modal always echoes the current
  // status back in every save, and legacy plans can carry a status that
  // pre-dates a tier change (e.g. a DwY member whose plan still says
  // "Idea" from the Wave 2 wizard default). Rejecting unchanged values
  // here turns every unrelated edit — lead magnet, binge target, notes —
  // into a 400, even though the user never touched the status field.
  if (status !== undefined && status !== existing.status) {
    const tierStatuses = getStatusOptions(serviceTier);
    let allowedStatuses = tierStatuses;
    // v2-flag override: any user the admin has enrolled in the Wave 2
    // content-engine flag gets `FOUNDATIONS_STATUSES` ("Idea", etc.)
    // unioned onto whatever their paid tier normally allows — the Wave 2
    // wizard defaults new plans to "Idea" regardless of tier, so a DwY
    // member with v2 access needs both lists or the wizard's output is
    // unreachable from the editor.
    if (!tierStatuses.includes(status)) {
      const flags = await getFeatureFlags({ userId: user.id, userRole: user.role });
      if (flags.tool_content_engine_v2) {
        allowedStatuses = Array.from(new Set([...tierStatuses, ...FOUNDATIONS_STATUSES]));
      }
    }
    if (!allowedStatuses.includes(status)) {
      return NextResponse.json(
        {
          error: `Status "${status}" is not allowed for your tier (${serviceTier}). Allowed statuses: ${allowedStatuses.join(", ")}.`,
          field: "status",
          value: status,
          tier: serviceTier,
          allowed: allowedStatuses,
        },
        { status: 400 },
      );
    }
  }
  // Constrain thumbnail picks to a Drive file that actually lives inside
  // this plan's project folder — otherwise a forged PUT could repoint the
  // proxy at any file the service account can read.
  if (thumbnailFileId) {
    if (!existing.driveFolderLink) {
      return NextResponse.json({ error: "Plan has no Drive folder" }, { status: 400 });
    }
    const inFolder = await isFileInFolder(thumbnailFileId, existing.driveFolderLink);
    if (!inFolder) {
      return NextResponse.json({ error: "Thumbnail must be a file in this plan's Drive folder" }, { status: 400 });
    }
  }

  let plan = await prisma.contentPlan.update({
    where: { id },
    data: {
      ...(title !== undefined && { title: title.trim() }),
      ...(status !== undefined && { status }),
      ...(theme !== undefined && { theme: theme ?? null }),
      ...(shootDate !== undefined && { shootDate: shootDate ? new Date(shootDate) : null }),
      ...(shootLocation !== undefined && { shootLocation: shootLocation || null }),
      ...(publishDate !== undefined && { publishDate: publishDate ? new Date(publishDate) : null }),
      ...(editDueDate !== undefined && { editDueDate: editDueDate ? new Date(editDueDate) : null }),
      ...(priority !== undefined && { priority: priority ?? null }),
      ...(dramaMode !== undefined && { dramaMode: Boolean(dramaMode) }),
      ...(notes !== undefined && { notes: notes ?? null }),
      ...(script !== undefined && { script: script ?? null }),
      ...(researchNotes !== undefined && { researchNotes: researchNotes ?? null }),
      ...(thoughts !== undefined && { thoughts: thoughts ?? null }),
      ...(thumbnailWords !== undefined && { thumbnailWords: thumbnailWords ?? null }),
      ...(footageLink !== undefined && { footageLink: footageLink ?? null }),
      ...(driveFolderLink !== undefined && { driveFolderLink: driveFolderLink ?? null }),
      ...(youtubeDescription !== undefined && { youtubeDescription: youtubeDescription ?? null }),
      ...(linkedCampaignId !== undefined && { linkedCampaignId: linkedCampaignId ?? null }),
      ...(linkedScriptId !== undefined && { linkedScriptId: linkedScriptId ?? null }),
      ...(bingeVideoId !== undefined && { bingeVideoId: bingeVideoId ?? null }),
      ...(cleanPropertyTypeFocus !== undefined && { propertyTypeFocus: cleanPropertyTypeFocus }),
      ...(thumbnailFileId !== undefined && { thumbnailFileId: thumbnailFileId ?? null }),
      ...(thumbnailFileName !== undefined && { thumbnailFileName: thumbnailFileName ?? null }),
      ...(manualStepsClean !== undefined && { manualSteps: manualStepsClean }),
    },
    include: {
      bingeVideo: { select: BINGE_RELATION_SELECT },
      bingedFromList: {
        select: BINGE_RELATION_SELECT,
        orderBy: { updatedAt: "desc" },
      },
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

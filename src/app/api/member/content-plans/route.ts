import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { getStatusOptions, isValidStatus, PRODUCTION_TIERS, PRE_PRODUCTION_STATUSES } from "@/lib/content-plan-utils";
import { createVideoFolder } from "@/lib/google-drive";

export async function GET(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status");
  const themeFilter = searchParams.get("theme");

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { serviceTier: true },
  });

  const plans = await prisma.contentPlan.findMany({
    where: {
      userId: user.id,
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(themeFilter ? { theme: themeFilter } : {}),
    },
    orderBy: { publishDate: "desc" },
  });

  return NextResponse.json({ plans, serviceTier: dbUser?.serviceTier ?? "foundations" });
}

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { serviceTier: true, fullName: true, assetsDriveLink: true },
  });
  const serviceTier = dbUser?.serviceTier ?? "foundations";

  const body = await req.json();
  const { title, status, theme, shootDate, publishDate, editDueDate, priority, notes, script, thumbnailWords, footageLink, linkedIdeaId, linkedScriptId, youtubeVideoId } = body;

  if (!title || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const requestedStatus = status ?? "Idea";
  const finalStatus = isValidStatus(requestedStatus, serviceTier)
    ? requestedStatus
    : getStatusOptions(serviceTier)[0] ?? "Idea";

  const plan = await prisma.contentPlan.create({
    data: {
      userId: user.id,
      title: title.trim(),
      status: finalStatus,
      theme: theme ?? null,
      shootDate: shootDate ? new Date(shootDate) : null,
      publishDate: publishDate ? new Date(publishDate) : null,
      editDueDate: editDueDate ? new Date(editDueDate) : null,
      priority: priority ?? null,
      notes: notes ?? null,
      script: script ?? null,
      thumbnailWords: thumbnailWords ?? null,
      footageLink: footageLink ?? null,
      linkedIdeaId: linkedIdeaId ?? null,
      linkedScriptId: linkedScriptId ?? null,
      youtubeVideoId: youtubeVideoId ?? null,
    },
  });

  // Auto-create Google Drive folder for Production/Growth/DWY members — only once the plan is in production (Ready to Shoot or beyond)
  if (PRODUCTION_TIERS.includes(serviceTier) && dbUser?.fullName && !PRE_PRODUCTION_STATUSES.includes(plan.status)) {
    try {
      const { videoFolderUrl, memberFolderUrl } = await createVideoFolder(dbUser.fullName, plan.title);
      const updates: Promise<unknown>[] = [
        prisma.contentPlan.update({ where: { id: plan.id }, data: { driveFolderLink: videoFolderUrl } }),
      ];
      if (!dbUser.assetsDriveLink) {
        updates.push(prisma.user.update({ where: { id: user.id }, data: { assetsDriveLink: memberFolderUrl } }));
      }
      await Promise.all(updates);
      (plan as any).driveFolderLink = videoFolderUrl;
    } catch (err) {
      console.error("[content-plans] Drive folder creation failed:", err);
    }
  }

  return NextResponse.json({ plan, serviceTier }, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { isValidStatus } from "@/lib/content-plan-utils";
import { createVideoFolder } from "@/lib/google-drive";

const DRIVE_TRIGGER_STATUSES = ["Ready to Shoot", "Shooting", "Shot - In Post"];

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
    select: { serviceTier: true },
  });
  const serviceTier = dbUser?.serviceTier ?? "foundations";

  const body = await req.json();
  const { title, status, theme, shootDate, publishDate, editDueDate, priority, notes, script, researchNotes, thumbnailWords, footageLink, driveFolderLink } = body;

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
      ...(notes !== undefined && { notes: notes ?? null }),
      ...(script !== undefined && { script: script ?? null }),
      ...(researchNotes !== undefined && { researchNotes: researchNotes ?? null }),
      ...(thumbnailWords !== undefined && { thumbnailWords: thumbnailWords ?? null }),
      ...(footageLink !== undefined && { footageLink: footageLink ?? null }),
      ...(driveFolderLink !== undefined && { driveFolderLink: driveFolderLink ?? null }),
    },
  });

  if (
    status !== undefined &&
    DRIVE_TRIGGER_STATUSES.includes(status) &&
    !plan.driveFolderLink
  ) {
    try {
      const member = await prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true, email: true } });
      const memberName = member?.fullName || member?.email || user.id;
      const link = await createVideoFolder(memberName, plan.title);
      plan = await prisma.contentPlan.update({ where: { id }, data: { driveFolderLink: link } });
    } catch {
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

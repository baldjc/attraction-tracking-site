import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { createVideoFolder } from "@/lib/google-drive";

const DRIVE_TRIGGER_STATUSES = ["Ready to Shoot", "Shooting", "Shot - In Post"];

async function checkAdmin() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  return session?.user && (role === "admin" || role === "editor") ? session : null;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; planId: string }> }) {
  const session = await checkAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, planId } = await params;
  const existing = await prisma.contentPlan.findFirst({ where: { id: planId, userId: id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { title, status, theme, shootDate, publishDate, editDueDate, priority, notes, script, researchNotes, thumbnailWords, footageLink, driveFolderLink } = body;

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
      const member = await prisma.user.findUnique({ where: { id }, select: { fullName: true, email: true } });
      const memberName = member?.fullName || member?.email || id;
      const link = await createVideoFolder(memberName, plan.title);
      plan = await prisma.contentPlan.update({ where: { id: planId }, data: { driveFolderLink: link } });
    } catch {
    }
  }

  return NextResponse.json({ plan });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; planId: string }> }) {
  const session = await checkAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, planId } = await params;
  const existing = await prisma.contentPlan.findFirst({ where: { id: planId, userId: id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.contentPlan.delete({ where: { id: planId } });
  return NextResponse.json({ success: true });
}

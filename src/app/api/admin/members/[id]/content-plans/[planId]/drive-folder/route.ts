import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canStaffAccessMember } from "@/lib/staff-access";
import { createVideoFolder, classifyDriveError, DRIVE_ERROR_STATUS } from "@/lib/google-drive";

async function checkAdmin() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  return session?.user && (role === "admin" || role === "editor") ? session : null;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; planId: string }> }
) {
  const session = await checkAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { id, planId } = await params;
  if (!(await canStaffAccessMember((session.user as any).id, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const plan = await prisma.contentPlan.findFirst({ where: { id: planId, userId: id, deletedAt: null } });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const member = await prisma.user.findUnique({ where: { id }, select: { fullName: true, email: true, assetsDriveLink: true } });
  const memberName = member?.fullName || member?.email || id;

  let videoFolderUrl: string;
  let memberFolderUrl: string;
  try {
    const result = await createVideoFolder(memberName, plan.title);
    videoFolderUrl = result.videoFolderUrl;
    memberFolderUrl = result.memberFolderUrl;
  } catch (err: unknown) {
    const de = classifyDriveError(err);
    return NextResponse.json(
      { error: de.category, message: de.userMessage },
      { status: DRIVE_ERROR_STATUS[de.category] },
    );
  }

  const saves: Promise<unknown>[] = [];
  if (!plan.driveFolderLink) {
    saves.push(prisma.contentPlan.update({ where: { id: planId }, data: { driveFolderLink: videoFolderUrl } }));
  }
  if (!member?.assetsDriveLink) {
    saves.push(prisma.user.update({ where: { id }, data: { assetsDriveLink: memberFolderUrl } }));
  }
  await Promise.all(saves);

  return NextResponse.json({ driveFolderLink: plan.driveFolderLink ?? videoFolderUrl });
}

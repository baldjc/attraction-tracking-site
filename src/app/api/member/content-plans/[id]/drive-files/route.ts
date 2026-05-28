import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { resolveUserFromSession } from "@/lib/session-utils";
import { canStaffAccessMember } from "@/lib/staff-access";
import { listFilesInFolder } from "@/lib/google-drive";
import { getFeatureFlags } from "@/lib/feature-flags";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // auth() here is intentional and complements resolveUserFromSession above:
  // we need the ACTUAL signed-in account's role for the staff-bypass check
  // (canStaffAccessMember), not the impersonated member's.
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const isStaff = role === "admin" || role === "editor";

  const { id } = await params;
  const plan = await prisma.contentPlan.findUnique({
    where: { id },
    select: { userId: true, driveFolderLink: true },
  });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Access ordering must mirror thumbnail/route.ts so it can't regress:
  // 1) plan owner always passes;
  // 2) non-staff non-owner → 404 (don't reveal the plan exists);
  // 3) staff non-owner → must ALSO pass canStaffAccessMember (scoped sub-admins
  //    are restricted to their allowedMemberIds) → otherwise explicit 403 so the
  //    denial is logged, rather than a silent role-only bypass.
  if (plan.userId !== user.id) {
    if (!isStaff) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const staffId = (session?.user as { id?: string } | undefined)?.id;
    if (!staffId || !(await canStaffAccessMember(staffId, plan.userId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const flags = await getFeatureFlags();
  if (!flags.drive_auto_upload) return NextResponse.json({ files: [], folderUrl: plan.driveFolderLink ?? null });

  if (!plan.driveFolderLink) return NextResponse.json({ files: [], folderUrl: null });

  const files = await listFilesInFolder(plan.driveFolderLink);
  return NextResponse.json({ files, folderUrl: plan.driveFolderLink });
}

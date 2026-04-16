import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { resolveUserFromSession } from "@/lib/session-utils";
import { listFilesInFolder } from "@/lib/google-drive";
import { getFeatureFlags } from "@/lib/feature-flags";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const isStaff = role === "admin" || role === "editor";

  const { id } = await params;
  const plan = await prisma.contentPlan.findUnique({
    where: { id },
    select: { userId: true, driveFolderLink: true },
  });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isStaff && plan.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const flags = await getFeatureFlags();
  if (!flags.drive_auto_upload) return NextResponse.json({ files: [], folderUrl: plan.driveFolderLink ?? null });

  if (!plan.driveFolderLink) return NextResponse.json({ files: [], folderUrl: null });

  const files = await listFilesInFolder(plan.driveFolderLink);
  return NextResponse.json({ files, folderUrl: plan.driveFolderLink });
}

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { listFilesInFolder } from "@/lib/google-drive";
import { getFeatureFlags } from "@/lib/feature-flags";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string; role?: string } | undefined)?.id;
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const plan = await prisma.contentPlan.findUnique({
    where: { id },
    select: { userId: true, driveFolderLink: true },
  });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isStaff = role === "admin" || role === "editor";
  if (!isStaff && plan.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const flags = await getFeatureFlags();
  if (!flags.drive_auto_upload) return NextResponse.json({ files: [], folderUrl: plan.driveFolderLink ?? null });

  if (!plan.driveFolderLink) return NextResponse.json({ files: [], folderUrl: null });

  const files = await listFilesInFolder(plan.driveFolderLink);
  return NextResponse.json({ files, folderUrl: plan.driveFolderLink });
}

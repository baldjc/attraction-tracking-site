import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";
import { pullChannelVideos, calculateOutliers } from "@/lib/radar/pipeline";

/** GET /api/admin/radar/channels/[id] — get channel details with outlier stats */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdmin(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const channel = await prisma.radarChannel.findUnique({
    where: { id },
    include: {
      videos: {
        where: { outlierTier: { not: null } },
        orderBy: { outlierMultiplier: "desc" },
        take: 20,
        include: { analysis: true },
      },
      _count: { select: { videos: true } },
    },
  });

  if (!channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  return NextResponse.json({ channel });
}

/** POST /api/admin/radar/channels/[id] — sync videos & recalculate outliers */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdmin(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const channel = await prisma.radarChannel.findUnique({ where: { id } });
  if (!channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  const videosFound = await pullChannelVideos(id);
  const { avgViews, outliersFound } = await calculateOutliers(id);

  return NextResponse.json({ videosFound, avgViews, outliersFound });
}

/** DELETE /api/admin/radar/channels/[id] — remove a channel */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdmin(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  await prisma.radarChannel.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

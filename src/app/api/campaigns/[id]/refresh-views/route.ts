import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { refreshCampaignViews } from "@/lib/youtube-scheduler";
import prisma from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const result = await refreshCampaignViews(id);

  const updatedLinks = await prisma.trackingLink.findMany({
    where: { campaignId: id, deletedAt: null },
    select: { id: true, youtubeViewCount: true, youtubeViewsUpdatedAt: true },
  });

  return NextResponse.json({ ...result, links: updatedLinks });
}

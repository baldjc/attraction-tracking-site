import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { nanoid } from "nanoid";

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { websiteUrl } = await req.json() as { websiteUrl: string };
  if (!websiteUrl) return NextResponse.json({ error: "websiteUrl required" }, { status: 400 });

  const refCode = "test_" + nanoid(8);

  const campaign = await prisma.campaign.create({
    data: {
      userId: user.id,
      name: "__test_installation__",
      destinationUrl: websiteUrl,
      sourceType: "OTHER",
    },
  });

  const link = await prisma.trackingLink.create({
    data: {
      campaignId: campaign.id,
      name: "Test Link",
      refCode,
    },
  });

  const sep = websiteUrl.includes("?") ? "&" : "?";
  const testUrl = `${websiteUrl}${sep}ref=${refCode}`;

  return NextResponse.json({ refCode, testUrl, linkId: link.id, campaignId: campaign.id });
}

export async function DELETE(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { linkId, campaignId } = await req.json() as { linkId: string; campaignId: string };

  if (linkId) {
    const link = await prisma.trackingLink.findFirst({
      where: { id: linkId, campaign: { userId: user.id } },
      include: { clicks: { include: { pageViews: true } } },
    });
    if (link) {
      for (const click of link.clicks) {
        await prisma.pageView.deleteMany({ where: { clickId: click.id } });
        await prisma.lead.deleteMany({ where: { clickId: click.id } });
      }
      await prisma.click.deleteMany({ where: { trackingLinkId: linkId } });
      await prisma.trackingLink.delete({ where: { id: linkId } });
    }
  }

  if (campaignId) {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, userId: user.id, name: "__test_installation__" },
    });
    if (campaign) {
      await prisma.campaign.delete({ where: { id: campaignId } });
    }
  }

  return NextResponse.json({ ok: true });
}

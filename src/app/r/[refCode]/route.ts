import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ refCode: string }> }
) {
  const { refCode } = await params;

  const link = await prisma.trackingLink.findFirst({
    where: { refCode, deletedAt: null },
    select: {
      refCode: true,
      campaign: { select: { destinationUrl: true } },
    },
  });

  if (!link) {
    return new NextResponse("Link not found", { status: 404 });
  }

  const dest = link.campaign.destinationUrl;
  const separator = dest.includes("?") ? "&" : "?";
  const redirectUrl = `${dest}${separator}ref=${link.refCode}`;

  return NextResponse.redirect(redirectUrl, { status: 302 });
}

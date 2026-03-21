import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { randomUUID } from "crypto";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ refCode: string }> }
) {
  const { refCode } = await params;

  const link = await prisma.trackingLink.findFirst({
    where: { refCode, deletedAt: null },
    select: {
      id: true,
      refCode: true,
      campaign: { select: { destinationUrl: true } },
    },
  });

  if (!link) {
    return new NextResponse("Link not found", { status: 404 });
  }

  const headers = req.headers;
  const ipAddress =
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    null;
  const userAgent = headers.get("user-agent") ?? null;
  const referrer = headers.get("referer") ?? null;
  const sessionId = randomUUID();

  prisma.click
    .create({
      data: {
        trackingLinkId: link.id,
        refCode: link.refCode,
        sessionId,
        ipAddress,
        userAgent,
        referrer,
      },
    })
    .catch(console.error);

  const dest = link.campaign.destinationUrl;
  const separator = dest.includes("?") ? "&" : "?";
  const redirectUrl = `${dest}${separator}ref=${link.refCode}`;

  return NextResponse.redirect(redirectUrl, { status: 302 });
}

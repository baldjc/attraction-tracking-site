import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> }
) {
  const { id, linkId } = await params;
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const link = await prisma.trackingLink.findFirst({
    where: {
      id: linkId,
      campaignId: id,
      deletedAt: null,
      campaign: { userId: user.id, deletedAt: null },
    },
  });
  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const deleted = await prisma.click.deleteMany({
    where: { refCode: link.refCode },
  });

  return NextResponse.json({ success: true, deletedClicks: deleted.count });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> }
) {
  const { id, linkId } = await params;
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await auth();
  const isAdmin = (session?.user as { role?: string })?.role === "admin";

  const link = await prisma.trackingLink.findFirst({
    where: {
      id: linkId,
      campaignId: id,
      deletedAt: null,
      campaign: { deletedAt: null, ...(isAdmin ? {} : { userId: user.id }) },
    },
  });
  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.trackingLink.update({ where: { id: linkId }, data: { deletedAt: new Date() } });
  return NextResponse.json({ success: true });
}

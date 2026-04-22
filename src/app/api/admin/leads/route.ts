import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminOrEditor } from "@/lib/auth-utils";

export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdminOrEditor(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const leads = await prisma.user.findMany({
    where: { role: "audit_lead" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      youtubeChannelUrl: true,
      youtubeChannelName: true,
      youtubeHandle: true,
      youtubeChannelThumbnail: true,
      leadStatus: true,
      createdAt: true,
      audits: {
        where: { auditType: "lead" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, overallScore: true, createdAt: true },
      },
    },
  });

  return NextResponse.json({ leads });
}

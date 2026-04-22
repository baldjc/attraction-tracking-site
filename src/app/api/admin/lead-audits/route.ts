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

  // Lead Audits = either auditType="lead" OR audit owner is an audit_lead.
  const audits = await prisma.audit.findMany({
    where: {
      OR: [
        { auditType: "lead" },
        { user: { is: { role: "audit_lead" } } },
      ],
    },
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          serviceTier: true,
          leadStatus: true,
          youtubeChannelThumbnail: true,
          youtubeChannelName: true,
        },
      },
    },
  });

  return NextResponse.json({ audits });
}

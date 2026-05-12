import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminOrEditor } from "@/lib/auth-utils";
import { staffMemberIdFilter } from "@/lib/staff-access";

export async function GET() {
  const session = await auth();
  const sessionUser = session?.user as { id?: string; role?: string } | undefined;
  const role = sessionUser?.role;
  const userId = sessionUser?.id;
  if (!session?.user || !isAdminOrEditor(role ?? "") || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowedFilter = await staffMemberIdFilter(userId);

  // Member Audits view excludes lead audits and audits owned by audit_lead users.
  const baseWhere: any = {
    auditType: { not: "lead" },
    user: {
      is: {
        role: { not: "audit_lead" },
        ...(allowedFilter ? { id: allowedFilter } : {}),
      },
    },
  };

  const audits = await prisma.audit.findMany({
    where: baseWhere,
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          serviceTier: true,
          youtubeChannelThumbnail: true,
          youtubeChannelName: true,
        },
      },
    },
  });

  return NextResponse.json({ audits });
}

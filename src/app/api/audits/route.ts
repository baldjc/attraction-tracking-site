import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminOrEditor, editorTierFilter } from "@/lib/auth-utils";
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
  // If the sub-admin has an explicit member list, the legacy editor tier
  // whitelist is bypassed — otherwise members on the list whose tier isn't
  // editing/mastery would silently disappear from the audits view.
  const tierFilter = allowedFilter ? undefined : editorTierFilter(role ?? "");

  // Member Audits view excludes lead audits and audits owned by audit_lead users.
  const baseWhere: any = {
    auditType: { not: "lead" },
    user: {
      is: {
        role: { not: "audit_lead" },
        ...(tierFilter ?? {}),
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

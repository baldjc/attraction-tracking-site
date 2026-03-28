import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminOrEditor, editorTierFilter } from "@/lib/auth-utils";

export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdminOrEditor(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tierFilter = editorTierFilter(role);

  const members = await prisma.user.findMany({
    where: {
      role: "foundations_member",
      ...tierFilter,
    },
    orderBy: { fullName: "asc" },
    include: {
      _count: { select: { audits: true } },
      audits: {
        where: { auditType: { in: ["baseline", "monthly"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { overallScore: true, createdAt: true },
      },
    },
  });

  const formatted = members.map((m) => ({
    id: m.id,
    email: m.email,
    fullName: m.fullName,
    youtubeHandle: m.youtubeHandle,
    youtubeChannelUrl: m.youtubeChannelUrl,
    serviceTier: m.serviceTier,
    slackUserId: m.slackUserId,
    skoolProfile: m.skoolProfile,
    ghlContactId: m.ghlContactId,
    createdAt: m.createdAt.toISOString(),
    _count: m._count,
    latestAuditScore: m.audits[0]?.overallScore ?? null,
    latestAuditDate: m.audits[0]?.createdAt?.toISOString() ?? null,
    stripeCustomerId: m.stripeCustomerId ?? null,
    stripeSubscriptionId: m.stripeSubscriptionId ?? null,
    subscriptionStatus: m.subscriptionStatus ?? null,
    stripePlanName: m.stripePlanName ?? null,
    stripeCurrentPeriodEnd: m.stripeCurrentPeriodEnd?.toISOString() ?? null,
  }));

  return NextResponse.json({ members: formatted });
}

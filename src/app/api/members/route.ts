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

  const tierFilter = editorTierFilter(role ?? "");
  const allowedFilter = await staffMemberIdFilter(userId);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const userWhere: Record<string, unknown> = tierFilter
    ? { ...tierFilter }
    : { role: "foundations_member" as const };
  if (allowedFilter) userWhere.id = allowedFilter;

  const members = await prisma.user.findMany({
    where: userWhere,
    orderBy: { fullName: "asc" },
    include: {
      _count: { select: { audits: true } },
      audits: {
        where: { auditType: { in: ["baseline", "monthly"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { overallScore: true, createdAt: true },
      },
      youtubeVideos: {
        where: { publishedAt: { gte: sevenDaysAgo } },
        select: { id: true },
      },
    },
  });

  const recentVideos = await prisma.youTubeVideo.findMany({
    where: {
      publishedAt: { gte: sevenDaysAgo },
      user: userWhere,
    },
    orderBy: { publishedAt: "desc" },
    take: 20,
    include: {
      user: { select: { id: true, fullName: true } },
      audits: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, overallScore: true },
      },
    },
  });

  const clicksResult = await prisma.click.aggregate({
    where: {
      timestamp: { gte: sevenDaysAgo },
      link: { campaign: { user: userWhere } },
    },
    _count: true,
  });

  let topLead: { userId: string; fullName: string; conversions: number } | null = null;
  const leads = await prisma.lead.findMany({
    where: {
      timestamp: { gte: sevenDaysAgo },
      click: { link: { campaign: { user: userWhere } } },
    },
    include: { click: { include: { link: { include: { campaign: { select: { userId: true } } } } } } },
  });

  if (leads.length > 0) {
    const byUser: Record<string, number> = {};
    for (const l of leads) {
      const uid = l.click.link.campaign.userId;
      byUser[uid] = (byUser[uid] || 0) + 1;
    }
    const topEntry = Object.entries(byUser).sort((a, b) => b[1] - a[1])[0];
    if (topEntry) {
      const topUser = await prisma.user.findUnique({
        where: { id: topEntry[0] },
        select: { fullName: true },
      });
      topLead = { userId: topEntry[0], fullName: topUser?.fullName || "Unknown", conversions: topEntry[1] };
    }
  }

  const memberRows = await Promise.all(
    members.map(async (member) => {
      const latestVideo = await prisma.youTubeVideo.findFirst({
        where: { userId: member.id },
        orderBy: { publishedAt: "desc" },
        select: { publishedAt: true },
      });

      const latestAudit = await prisma.audit.findFirst({
        where: { userId: member.id, overallScore: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { overallScore: true },
      });

      const [scripts, titles, analyses, reviews] = await Promise.all([
        prisma.savedScript.count({ where: { userId: member.id, createdAt: { gte: sevenDaysAgo } } }),
        prisma.savedTitle.count({ where: { userId: member.id, createdAt: { gte: sevenDaysAgo } } }),
        prisma.titleAnalysis.count({ where: { userId: member.id, createdAt: { gte: sevenDaysAgo } } }),
        prisma.scriptReview.count({ where: { userId: member.id, createdAt: { gte: sevenDaysAgo } } }),
      ]);
      const toolUses7d = scripts + titles + analyses + reviews;

      const clicks7d = await prisma.click.count({
        where: { link: { campaign: { userId: member.id } }, timestamp: { gte: sevenDaysAgo } },
      });
      const conversions7d = await prisma.lead.count({
        where: { click: { link: { campaign: { userId: member.id } } }, timestamp: { gte: sevenDaysAgo } },
      });

      const [scripts14, titles14, analyses14, reviews14] = await Promise.all([
        prisma.savedScript.count({ where: { userId: member.id, createdAt: { gte: fourteenDaysAgo } } }),
        prisma.savedTitle.count({ where: { userId: member.id, createdAt: { gte: fourteenDaysAgo } } }),
        prisma.titleAnalysis.count({ where: { userId: member.id, createdAt: { gte: fourteenDaysAgo } } }),
        prisma.scriptReview.count({ where: { userId: member.id, createdAt: { gte: fourteenDaysAgo } } }),
      ]);
      const toolUses14d = scripts14 + titles14 + analyses14 + reviews14;

      const clicks14d = await prisma.click.count({
        where: { link: { campaign: { userId: member.id } }, timestamp: { gte: fourteenDaysAgo } },
      });

      const lastVideoDate = latestVideo?.publishedAt;
      const hasRecentVideo = member.youtubeVideos.length > 0;
      const hasRecentTool = toolUses7d > 0;
      const hasRecentClicks = clicks7d > 0;

      let status = "inactive";
      if (hasRecentVideo || hasRecentTool || hasRecentClicks) {
        status = "active";
      } else if (
        (lastVideoDate && lastVideoDate >= fourteenDaysAgo) ||
        toolUses14d > 0 ||
        clicks14d > 0
      ) {
        status = "at_risk";
      }

      return {
        id: member.id,
        email: member.email,
        fullName: member.fullName,
        youtubeHandle: member.youtubeHandle,
        youtubeChannelUrl: member.youtubeChannelUrl,
        youtubeChannelThumbnail: member.youtubeChannelThumbnail ?? null,
        stripeCurrency: member.stripeCurrency ?? null,
        serviceTier: member.serviceTier,
        slackUserId: member.slackUserId,
        skoolProfile: member.skoolProfile,
        ghlContactId: member.ghlContactId,
        createdAt: member.createdAt.toISOString(),
        _count: member._count,
        latestAuditScore: latestAudit?.overallScore ?? member.audits[0]?.overallScore ?? null,
        latestAuditDate: member.audits[0]?.createdAt?.toISOString() ?? null,
        stripeCustomerId: member.stripeCustomerId ?? null,
        stripeSubscriptionId: member.stripeSubscriptionId ?? null,
        subscriptionStatus: member.subscriptionStatus ?? null,
        stripePlanName: member.stripePlanName ?? null,
        stripeCurrentPeriodEnd: member.stripeCurrentPeriodEnd?.toISOString() ?? null,
        stripePriceAmount: member.stripePriceAmount ?? null,
        stripeLineItems: member.stripeLineItems ?? null,
        lastVideoAt: lastVideoDate?.toISOString() ?? null,
        videos7d: member.youtubeVideos.length,
        clicks7d,
        conversions7d,
        toolUses7d,
        status,
        lastLoginAt: member.lastLoginAt?.toISOString() ?? null,
      };
    })
  );

  const latestSync = members
    .map((m) => m.lastYoutubeSyncAt)
    .filter(Boolean)
    .sort((a, b) => b!.getTime() - a!.getTime())[0];

  const activeMembers = memberRows.length;
  const inactiveMembers = memberRows.filter((m) => m.status === "inactive").length;
  const videosThisWeek = memberRows.reduce((sum, m) => sum + m.videos7d, 0);
  const rateSetting = await prisma.appSetting.findUnique({ where: { key: "usd_to_cad_rate" } });
  const USD_TO_CAD = rateSetting ? parseFloat(rateSetting.value) : 1.38;
  const mrr = memberRows
    .filter((m) => (m.subscriptionStatus === "active" || m.subscriptionStatus === "past_due") && m.stripePriceAmount)
    .reduce((sum, m) => {
      const amount = m.stripePriceAmount ?? 0;
      const currency = (m.stripeCurrency ?? "USD").toUpperCase();
      return sum + (currency === "USD" ? Math.round(amount * USD_TO_CAD) : amount);
    }, 0);

  const isAdminRole = role === "admin";
  const sanitizedMembers = isAdminRole
    ? memberRows
    : memberRows.map((m) => ({
        ...m,
        stripeCurrency: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        subscriptionStatus: null,
        stripePlanName: null,
        stripeCurrentPeriodEnd: null,
        stripePriceAmount: null,
      }));

  return NextResponse.json({
    members: sanitizedMembers,
    cards: {
      videosThisWeek,
      activeMembers,
      inactiveMembers,
      linkClicks7d: clicksResult._count,
      topLead,
      mrr: isAdminRole ? mrr : null,
      usdToCadRate: USD_TO_CAD,
    },
    recentVideos,
    lastSyncedAt: latestSync?.toISOString() ?? null,
  });
}

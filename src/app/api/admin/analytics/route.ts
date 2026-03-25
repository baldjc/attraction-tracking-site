import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminOrEditor, editorTierFilter } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdminOrEditor(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tierFilter = editorTierFilter(role);
  const userWhere = tierFilter ? tierFilter : { role: { not: "admin" as const } };

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const members = await prisma.user.findMany({
    where: userWhere,
    select: {
      id: true,
      fullName: true,
      serviceTier: true,
      lastYoutubeSyncAt: true,
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

      const lastVideoDate = latestVideo?.publishedAt;
      const hasRecentVideo = member.youtubeVideos.length > 0;
      const hasRecentTool = toolUses7d > 0;
      const hasRecentClicks = clicks7d > 0;

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
        fullName: member.fullName,
        serviceTier: member.serviceTier,
        lastVideoAt: lastVideoDate?.toISOString() || null,
        videos7d: member.youtubeVideos.length,
        currentScore: latestAudit?.overallScore || null,
        toolUses7d,
        clicks7d,
        conversions7d,
        status,
      };
    })
  );

  const latestSync = members
    .map((m) => m.lastYoutubeSyncAt)
    .filter(Boolean)
    .sort((a, b) => b!.getTime() - a!.getTime())[0];

  const activeMembers = memberRows.filter((m) => m.status === "active").length;
  const inactiveMembers = memberRows.filter((m) => m.status === "inactive").length;
  const videosThisWeek = memberRows.filter((m) => m.videos7d > 0).length;

  return NextResponse.json({
    cards: {
      videosThisWeek,
      activeMembers,
      inactiveMembers,
      linkClicks7d: clicksResult._count,
      topLead,
    },
    recentVideos,
    members: memberRows,
    lastSyncedAt: latestSync?.toISOString() || null,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminOrEditor } from "@/lib/auth-utils";
import { canStaffAccessMember } from "@/lib/staff-access";
import prisma from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdminOrEditor(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!(await canStaffAccessMember((session.user as any).id, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      youtubeHandle: true,
      youtubeChannelUrl: true,
      serviceTier: true,
      createdAt: true,
      lastYoutubeSyncAt: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const latestAudit = await prisma.audit.findFirst({
    where: { userId: id, overallScore: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { overallScore: true, scores: true },
  });

  const latestSnapshot = await prisma.youTubeChannelSnapshot.findFirst({
    where: { userId: id },
    orderBy: { snapshotAt: "desc" },
  });

  const oldSnapshot = await prisma.youTubeChannelSnapshot.findFirst({
    where: { userId: id, snapshotAt: { lte: thirtyDaysAgo } },
    orderBy: { snapshotAt: "desc" },
  });

  const channelStats = latestSnapshot
    ? {
        subscriberCount: latestSnapshot.subscriberCount,
        subscriberChange30d: oldSnapshot
          ? latestSnapshot.subscriberCount - oldSnapshot.subscriberCount
          : null,
        totalViewCount: Number(latestSnapshot.totalViewCount),
        viewChange30d: oldSnapshot
          ? Number(latestSnapshot.totalViewCount) - Number(oldSnapshot.totalViewCount)
          : null,
        videosPerWeek30d: null as number | null,
      }
    : null;

  const videos = await prisma.youTubeVideo.findMany({
    where: { userId: id },
    orderBy: { publishedAt: "desc" },
    include: {
      audits: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, overallScore: true },
      },
    },
  });

  const videosLast30d = videos.filter((v) => v.publishedAt >= thirtyDaysAgo).length;
  if (channelStats) {
    channelStats.videosPerWeek30d = Math.round((videosLast30d / 4.3) * 10) / 10;
  }

  const [scripts7d, scriptsAll, titles7d, titlesAll, analyses7d, analysesAll, reviews7d, reviewsAll] =
    await Promise.all([
      prisma.savedScript.count({ where: { userId: id, createdAt: { gte: sevenDaysAgo } } }),
      prisma.savedScript.count({ where: { userId: id } }),
      prisma.savedTitle.count({ where: { userId: id, createdAt: { gte: sevenDaysAgo } } }),
      prisma.savedTitle.count({ where: { userId: id } }),
      prisma.titleAnalysis.count({ where: { userId: id, createdAt: { gte: sevenDaysAgo } } }),
      prisma.titleAnalysis.count({ where: { userId: id } }),
      prisma.scriptReview.count({ where: { userId: id, createdAt: { gte: sevenDaysAgo } } }),
      prisma.scriptReview.count({ where: { userId: id } }),
    ]);

  const [lastScript, lastTitle, lastAnalysis, lastReview] = await Promise.all([
    prisma.savedScript.findFirst({ where: { userId: id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.savedTitle.findFirst({ where: { userId: id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.titleAnalysis.findFirst({ where: { userId: id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.scriptReview.findFirst({ where: { userId: id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);

  const toolUsage = [
    { tool: "Script Review", uses7d: reviews7d, usesAllTime: reviewsAll, lastUsed: lastReview?.createdAt?.toISOString() || null },
    { tool: "Title Creator", uses7d: titles7d, usesAllTime: titlesAll, lastUsed: lastTitle?.createdAt?.toISOString() || null },
    { tool: "Title/Thumbnail Analyzer", uses7d: analyses7d, usesAllTime: analysesAll, lastUsed: lastAnalysis?.createdAt?.toISOString() || null },
    { tool: "ARC Script Builder", uses7d: scripts7d, usesAllTime: scriptsAll, lastUsed: lastScript?.createdAt?.toISOString() || null },
  ];

  const campaigns = await prisma.campaign.findMany({
    where: { userId: id },
    include: {
      links: {
        include: {
          _count: { select: { clicks: true } },
        },
      },
    },
  });

  const campaignData = await Promise.all(
    campaigns.map(async (campaign) => {
      const linksWithStats = await Promise.all(
        campaign.links.map(async (link) => {
          const clicks7d = await prisma.click.count({
            where: { trackingLinkId: link.id, timestamp: { gte: sevenDaysAgo } },
          });
          const conversions7d = await prisma.lead.count({
            where: { click: { trackingLinkId: link.id }, timestamp: { gte: sevenDaysAgo } },
          });
          const conversionsAll = await prisma.lead.count({
            where: { click: { trackingLinkId: link.id } },
          });
          return {
            id: link.id,
            name: link.name,
            destinationUrl: campaign.destinationUrl ?? "",
            clicks7d,
            clicksAllTime: link._count.clicks,
            conversions7d,
            conversionsAllTime: conversionsAll,
          };
        })
      );
      return { id: campaign.id, name: campaign.name, links: linksWithStats };
    })
  );

  const clicks30d = await prisma.click.findMany({
    where: { link: { campaign: { userId: id } }, timestamp: { gte: thirtyDaysAgo } },
    select: { timestamp: true },
    orderBy: { timestamp: "asc" },
  });

  const clicksByDay: Record<string, number> = {};
  for (const click of clicks30d) {
    const day = click.timestamp.toISOString().split("T")[0];
    clicksByDay[day] = (clicksByDay[day] || 0) + 1;
  }
  const clickTrend30d: { date: string; clicks: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayStr = d.toISOString().split("T")[0];
    clickTrend30d.push({ date: dayStr, clicks: clicksByDay[dayStr] || 0 });
  }

  const audits = await prisma.audit.findMany({
    where: { userId: id, overallScore: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true, overallScore: true },
  });
  const scoreHistory = audits.map((a) => ({
    date: a.createdAt.toISOString().split("T")[0],
    overallScore: a.overallScore,
  }));

  let dimensions = null;
  if (latestAudit?.scores && typeof latestAudit.scores === "object") {
    const s = latestAudit.scores as Record<string, any>;
    const avg = (keys: string[]) => {
      const vals = keys.map((k) => s[k]?.score).filter((v) => v != null);
      return vals.length ? Math.round((vals.reduce((a: number, b: number) => a + b, 0) / vals.length) * 10) / 10 : null;
    };
    dimensions = {
      channelStrategy: avg(["avatar_clarity", "themes_over_topics", "consistency"]),
      contentImpact: avg(["arc_attention", "arc_revelation", "arc_connection", "title_frameworks", "approve_the_click"]),
      viewerConnection: avg(["values_peppering", "connection_language", "story_proof", "grade_5_language"]),
      leadGeneration: avg(["lead_magnet_system", "curiosity_bridges"]),
    };
  }

  return NextResponse.json({
    user: {
      id: user.id,
      fullName: user.fullName,
      youtubeHandle: user.youtubeHandle,
      youtubeChannelUrl: user.youtubeChannelUrl,
      serviceTier: user.serviceTier,
      createdAt: user.createdAt.toISOString(),
      lastYoutubeSyncAt: user.lastYoutubeSyncAt?.toISOString() || null,
    },
    currentScore: latestAudit?.overallScore || null,
    channelStats,
    videos,
    toolUsage,
    campaigns: campaignData,
    clickTrend30d,
    scoreHistory,
    dimensions,
  });
}

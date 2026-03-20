import { NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

function nextThursday(): string {
  const now = new Date();
  const day = now.getDay();
  const daysUntil = ((4 - day) + 7) % 7 || 7;
  const next = new Date(now);
  next.setDate(now.getDate() + daysUntil);
  return next.toISOString().split("T")[0];
}

function monthBounds(offsetMonths = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - offsetMonths, 1);
  const end =
    offsetMonths === 0
      ? now
      : new Date(now.getFullYear(), now.getMonth() - offsetMonths + 1, 0, 23, 59, 59);
  return { start, end };
}

function pct(leads: number, clicks: number) {
  return clicks === 0 ? 0 : Math.round((leads / clicks) * 100);
}

export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { fullName: true },
  });

  const thisBounds = monthBounds(0);
  const lastBounds = monthBounds(1);

  const [audits, thisMthClicks, lastMthClicks, trackingLinks] = await Promise.all([
    prisma.audit.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        overallScore: true,
        scores: true,
        reportContent: true,
        videosAnalysed: true,
        createdAt: true,
      },
    }),
    prisma.click.findMany({
      where: {
        timestamp: { gte: thisBounds.start, lte: thisBounds.end },
        link: { campaign: { userId: user.id, deletedAt: null }, deletedAt: null },
      },
      select: { id: true, trackingLinkId: true, lead: { select: { id: true } } },
    }),
    prisma.click.findMany({
      where: {
        timestamp: { gte: lastBounds.start, lte: lastBounds.end },
        link: { campaign: { userId: user.id, deletedAt: null }, deletedAt: null },
      },
      select: { id: true, lead: { select: { id: true } } },
    }),
    prisma.trackingLink.findMany({
      where: {
        deletedAt: null,
        youtubeVideoId: { not: null },
        campaign: { userId: user.id, deletedAt: null },
      },
      select: {
        id: true,
        name: true,
        youtubeVideoUrl: true,
        youtubeThumbnailUrl: true,
        campaignId: true,
      },
    }),
  ]);

  const thisMonthClicks = thisMthClicks.length;
  const thisMonthLeads = thisMthClicks.filter((c) => c.lead).length;
  const lastMonthClicks = lastMthClicks.length;
  const lastMonthLeads = lastMthClicks.filter((c) => c.lead).length;

  const linkClickMap = new Map<string, number>();
  const linkLeadMap = new Map<string, number>();
  for (const c of thisMthClicks) {
    linkClickMap.set(c.trackingLinkId, (linkClickMap.get(c.trackingLinkId) ?? 0) + 1);
    if (c.lead) linkLeadMap.set(c.trackingLinkId, (linkLeadMap.get(c.trackingLinkId) ?? 0) + 1);
  }

  let bestVideo: {
    title: string;
    thumbnail: string | null;
    clicks: number;
    leads: number;
    convRate: number;
    campaignId: string;
  } | null = null;
  let bestClicks = 0;
  for (const link of trackingLinks) {
    const clicks = linkClickMap.get(link.id) ?? 0;
    if (clicks > bestClicks) {
      bestClicks = clicks;
      const leads = linkLeadMap.get(link.id) ?? 0;
      bestVideo = {
        title: link.name,
        thumbnail: link.youtubeThumbnailUrl,
        clicks,
        leads,
        convRate: pct(leads, clicks),
        campaignId: link.campaignId,
      };
    }
  }

  const latestAudit = audits[0] ?? null;
  const previousAudit = audits[1] ?? null;

  let strengths: { key: string; score: number }[] = [];
  let gaps: { key: string; score: number }[] = [];
  let oneSentenceDiagnosis: string | null = null;
  let daysSinceUpload: number | null = null;

  if (latestAudit) {
    const scores = latestAudit.scores as Record<string, { score: number | null }>;
    const report = latestAudit.reportContent as Record<string, any>;
    oneSentenceDiagnosis = report?.one_sentence_diagnosis ?? null;

    const scored = Object.entries(scores)
      .filter(([key, v]) => key !== "show_dont_tell" && v?.score != null)
      .map(([key, v]) => ({ key, score: v.score as number }))
      .sort((a, b) => b.score - a.score);

    strengths = scored.slice(0, 3);
    gaps = [...scored].reverse().slice(0, 3);

    const videos = (latestAudit.videosAnalysed as Array<{ uploadDate?: string }>) ?? [];
    const dates = videos
      .filter((v) => v.uploadDate)
      .map((v) => new Date(v.uploadDate!).getTime());
    if (dates.length > 0) {
      daysSinceUpload = Math.floor((Date.now() - Math.max(...dates)) / 86400000);
    }
  }

  const scoreHistory = [...audits]
    .reverse()
    .filter((a) => a.overallScore != null)
    .slice(-6)
    .map((a) => ({
      date: new Date(a.createdAt).toLocaleDateString("en-CA", { month: "short", day: "numeric" }),
      score: Number((a.overallScore as number).toFixed(1)),
    }));

  return NextResponse.json({
    firstName: fullUser?.fullName?.split(" ")[0] ?? null,
    latestAudit: latestAudit
      ? {
          id: latestAudit.id,
          score: latestAudit.overallScore != null
            ? Number((latestAudit.overallScore as number).toFixed(1))
            : null,
          date: latestAudit.createdAt,
          strengths,
          gaps,
          oneSentenceDiagnosis,
        }
      : null,
    previousAudit: previousAudit
      ? {
          score: previousAudit.overallScore != null
            ? Number((previousAudit.overallScore as number).toFixed(1))
            : null,
        }
      : null,
    campaignStats: {
      thisMonth: {
        clicks: thisMonthClicks,
        leads: thisMonthLeads,
        convRate: pct(thisMonthLeads, thisMonthClicks),
      },
      lastMonth: {
        clicks: lastMonthClicks,
        leads: lastMonthLeads,
        convRate: pct(lastMonthLeads, lastMonthClicks),
      },
    },
    bestVideo,
    daysSinceUpload,
    nextCoachingCall: nextThursday(),
    scoreHistory,
  });
}

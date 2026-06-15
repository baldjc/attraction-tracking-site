import Anthropic from "@anthropic-ai/sdk";
import prisma from "@/lib/prisma";
import { COACH_SYSTEM_PROMPT } from "@/lib/coach-voice";
import { logUsage } from "@/lib/ai-tool-cost";
import { SONNET_MODEL } from "@/lib/ai-models";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MARKET_UPDATE_THEME = "Market Updates";

async function buildPortfolioBalance(channelRef: string) {
  const { resolveUsersForChannel } = await import(
    "@/lib/reviewer-channel-resolver"
  );
  const userIds = await resolveUsersForChannel(channelRef);
  if (userIds.length === 0) return null;

  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );

  const plans = await prisma.contentPlan.findMany({
    where: {
      deletedAt: null,
      userId: { in: userIds },
      publishDate: { gte: start, lt: end },
    },
    select: {
      title: true,
      theme: true,
      publishDate: true,
    },
  });

  let marketUpdates = 0;
  let directStress = 0;
  let other = 0;
  for (const p of plans) {
    if (p.theme === MARKET_UPDATE_THEME) marketUpdates += 1;
    else if (p.theme && p.theme.length > 0) directStress += 1;
    else other += 1;
  }
  return {
    counts: { marketUpdates, directStress, other },
    target: { marketUpdates: 1, directStress: 2 },
    plans: plans.map((p) => ({
      title: p.title,
      theme: p.theme,
    })),
  };
}

export async function executeCoachRun(runId: string): Promise<void> {
  const run = await prisma.reviewerRun.findUnique({ where: { id: runId } });
  if (!run) return;

  await prisma.reviewerRun.update({
    where: { id: runId },
    data: { status: "running", startedAt: new Date() },
  });

  try {
    const since28 = new Date(Date.now() - 28 * 86400000);
    const since90 = new Date(Date.now() - 90 * 86400000);

    const [
      channelSnap,
      videoSnaps,
      portfolioBalance,
      recentPulses,
      recentGlance,
      topWinnerSnaps,
    ] = await Promise.all([
      prisma.channelAnalyticsSnapshot.findFirst({
        where: { channelRef: run.channelRef },
        orderBy: { date: "desc" },
      }),
      prisma.videoAnalyticsSnapshot.findMany({
        where: { channelRef: run.channelRef, date: { gte: since28 } },
        orderBy: { date: "desc" },
        take: 30,
      }),
      buildPortfolioBalance(run.channelRef),
      prisma.pulseSnapshot.findMany({
        where: { channelRef: run.channelRef },
        orderBy: { publishedAt: "desc" },
        take: 5,
      }),
      prisma.glanceTestResult.findMany({
        where: { channelRef: run.channelRef },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.videoAnalyticsSnapshot.findMany({
        where: { channelRef: run.channelRef, date: { gte: since90 } },
        orderBy: { watchTimeMin: "desc" },
        take: 5,
      }),
    ]);

    // Hydrate winners with titles
    const winnerIds = topWinnerSnaps.map((s) => s.videoId);
    const winnerMeta = winnerIds.length
      ? await prisma.youTubeVideo.findMany({
          where: { videoId: { in: winnerIds } },
          select: { videoId: true, title: true },
        })
      : [];
    const winnerTitleMap = new Map(winnerMeta.map((v) => [v.videoId, v.title]));
    const topWinners = topWinnerSnaps.map((s) => ({
      videoId: s.videoId,
      title: winnerTitleMap.get(s.videoId) ?? "(unknown)",
      avgViewPercentage: s.avgViewPercentage,
      watchTimeMin: s.watchTimeMin,
    }));

    // Hydrate pulses with titles
    const pulseIds = recentPulses.map((p) => p.videoId);
    const pulseMeta = pulseIds.length
      ? await prisma.youTubeVideo.findMany({
          where: { videoId: { in: pulseIds } },
          select: { videoId: true, title: true },
        })
      : [];
    const pulseTitleMap = new Map(pulseMeta.map((v) => [v.videoId, v.title]));
    const recentPulsesWithTitles = recentPulses.map((p) => ({
      videoId: p.videoId,
      title: pulseTitleMap.get(p.videoId) ?? "(unknown)",
      publishedAt: p.publishedAt,
      views: p.views,
      ctr: p.ctr,
      performanceRatio: p.performanceRatio,
    }));

    const inputContext = {
      channelSnap,
      videoSnaps: videoSnaps.map((v) => ({
        videoId: v.videoId,
        date: v.date,
        views: v.views,
        ctr: v.ctr,
        avgViewPercentage: v.avgViewPercentage,
        watchTimeMin: v.watchTimeMin,
      })),
      portfolioBalance,
      recentPulses: recentPulsesWithTitles,
      recentGlance: recentGlance.map((g) => ({
        videoId: g.videoId,
        title: g.title,
        overallScore: g.overallScore,
        observations: g.observations,
        improvements: g.improvements,
      })),
      topWinners,
    };

    const response = await client.messages.create({
      model: SONNET_MODEL,
      max_tokens: 4096,
      system: COACH_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Generate the coaching report based on this data:\n\n${JSON.stringify(
            inputContext,
            null,
            2,
          )}`,
        },
      ],
    });

    await logUsage(
      run.requestedById,
      "reviewer_coach_panel",
      response.usage.input_tokens,
      response.usage.output_tokens,
    );

    const report =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    await prisma.reviewerRun.update({
      where: { id: runId },
      data: {
        status: "complete",
        finishedAt: new Date(),
        reportMarkdown: report,
        inputContext: JSON.parse(JSON.stringify(inputContext)),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[reviewer-run] ${runId} failed:`, err);
    await prisma.reviewerRun.update({
      where: { id: runId },
      data: { status: "failed", finishedAt: new Date(), errorMessage: msg },
    });
  }
}

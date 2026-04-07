import Anthropic from "@anthropic-ai/sdk";
import prisma from "./prisma";
import { syncChannel, computeOutlierMultiples } from "./intel-channel";
import { getTranscript } from "./youtube";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const OUTLIER_THRESHOLD = 2.5;
const MAX_OUTLIERS_TO_ANALYSE = 5;

interface VideoSummary {
  ytVideoId: string;
  title: string;
  views: number;
  multiplier: number;
  publishedAt: string;
  thumbnailUrl: string | null;
}

async function analyseOutlierWithClaude(video: {
  title: string;
  views: number;
  multiplier: number;
  description: string | null;
  transcript: string | null;
}): Promise<{
  hookType: string;
  titleFramework: string;
  stressThemes: string[];
  whyItWorked: string;
  contentAngle: string;
  keyTakeaway: string;
}> {
  const truncatedTranscript = video.transcript
    ? video.transcript.slice(0, 3000)
    : null;

  const prompt = `You are an expert YouTube content analyst specialising in real estate and home buying/selling content.

Analyse this outlier video that performed ${video.multiplier.toFixed(1)}× the channel median:

TITLE: ${video.title}
VIEWS: ${video.views.toLocaleString()}
DESCRIPTION: ${video.description ? video.description.slice(0, 500) : "Not available"}
TRANSCRIPT EXCERPT: ${truncatedTranscript ?? "Not available"}

Respond in this exact JSON format (no markdown, no commentary):
{
  "hookType": "one of: Fear/Warning, Curiosity Gap, Social Proof, Data/Numbers, Controversy, How-To, Identity/Transformation, Urgency, Myth-Busting, Story",
  "titleFramework": "name the framework used in the title (e.g. 'Do NOT [X] Until...', 'What Nobody Tells You About...', 'The REALITY of...', etc.)",
  "stressThemes": ["max 3 themes from: Decision Paralysis, Timeline Pressure, Financial Fear, Market Uncertainty, Equity Anxiety, Moving Logistics, Neighbourhood Fit, First-Time Overwhelm, Seller Stress, Rate Shock"],
  "contentAngle": "one of: Educator, Advisor, Warning-Giver, Insider, Validator, Challenger",
  "whyItWorked": "2-3 sentences explaining why this video outperformed — what psychological trigger it hit, what the viewer felt when they saw the title",
  "keyTakeaway": "one sentence: the single most important strategic insight for a real estate agent watching this"
}`;

  try {
    const res = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });
    const text = res.content[0].type === "text" ? res.content[0].text : "{}";
    return JSON.parse(text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim());
  } catch {
    return {
      hookType: "Unknown",
      titleFramework: "Unknown",
      stressThemes: [],
      contentAngle: "Educator",
      whyItWorked: "Analysis unavailable.",
      keyTakeaway: "Analysis unavailable.",
    };
  }
}

async function generateReport(opts: {
  channelTitle: string;
  channelHandle: string | null;
  subscribers: number;
  totalVideos: number;
  outliers: VideoSummary[];
  analyses: Array<{ video: VideoSummary; analysis: ReturnType<typeof analyseOutlierWithClaude> extends Promise<infer T> ? T : never }>;
  clientName: string | null;
}): Promise<string> {
  const { channelTitle, channelHandle, subscribers, totalVideos, outliers, analyses, clientName } = opts;

  const lines: string[] = [];
  lines.push(`# Intelligence Report: ${channelTitle}`);
  if (clientName) lines.push(`**Client:** ${clientName}`);
  lines.push(`**Channel:** ${channelHandle ?? channelTitle} · ${subscribers.toLocaleString()} subscribers · ${totalVideos} videos analysed`);
  lines.push(`**Report Date:** ${new Date().toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" })}`);
  lines.push("");

  lines.push(`## Outlier Videos (${outliers.length} identified)`);
  lines.push(`> Threshold: ${OUTLIER_THRESHOLD}× channel median views`);
  lines.push("");

  for (const ov of outliers) {
    lines.push(`### ${ov.multiplier.toFixed(1)}× — ${ov.title}`);
    lines.push(`**Views:** ${ov.views.toLocaleString()} · **Published:** ${new Date(ov.publishedAt).toLocaleDateString("en-CA")}`);
    lines.push(`🔗 https://youtube.com/watch?v=${ov.ytVideoId}`);
    lines.push("");
  }

  if (analyses.length > 0) {
    lines.push("---");
    lines.push("## Deep Analysis — Top Outliers");
    lines.push("");

    const hookTypes: Record<string, number> = {};
    const frameworks: string[] = [];
    const stressThemesAll: string[] = [];

    for (const { video, analysis } of analyses) {
      lines.push(`### ${video.title}`);
      lines.push(`**${video.multiplier.toFixed(1)}× median** · ${video.views.toLocaleString()} views`);
      lines.push("");
      lines.push(`**Hook Type:** ${analysis.hookType}`);
      lines.push(`**Title Framework:** ${analysis.titleFramework}`);
      lines.push(`**Content Angle:** ${analysis.contentAngle}`);
      lines.push(`**Stress Themes:** ${analysis.stressThemes.join(", ")}`);
      lines.push("");
      lines.push(`**Why It Worked:** ${analysis.whyItWorked}`);
      lines.push("");
      lines.push(`**Key Takeaway:** ${analysis.keyTakeaway}`);
      lines.push("");

      hookTypes[analysis.hookType] = (hookTypes[analysis.hookType] ?? 0) + 1;
      frameworks.push(analysis.titleFramework);
      stressThemesAll.push(...analysis.stressThemes);
    }

    lines.push("---");
    lines.push("## Pattern Summary");
    lines.push("");
    lines.push("**Dominant Hook Types:**");
    for (const [hook, count] of Object.entries(hookTypes).sort(([, a], [, b]) => b - a)) {
      lines.push(`- ${hook}: ${count}×`);
    }
    lines.push("");
    lines.push("**Title Frameworks in Use:**");
    for (const f of [...new Set(frameworks)]) {
      lines.push(`- ${f}`);
    }
    lines.push("");
    lines.push("**Top Stress Themes:**");
    const themeCounts: Record<string, number> = {};
    for (const t of stressThemesAll) themeCounts[t] = (themeCounts[t] ?? 0) + 1;
    for (const [t, c] of Object.entries(themeCounts).sort(([, a], [, b]) => b - a)) {
      lines.push(`- ${t}: ${c}×`);
    }
  }

  lines.push("");
  lines.push("---");
  lines.push("*Generated by Attraction by Video SEO Intelligence Platform*");

  return lines.join("\n");
}

export async function executeRun(runId: string): Promise<void> {
  const run = await prisma.intelRun.findUnique({
    where: { id: runId },
    include: { client: { select: { name: true } } },
  });
  if (!run) throw new Error(`Run ${runId} not found`);

  await prisma.intelRun.update({ where: { id: runId }, data: { status: "RUNNING" } });

  try {
    const { channel, videoCount } = await syncChannel(run.inputChannelUrl);

    await prisma.intelRun.update({
      where: { id: runId },
      data: { resolvedChannelId: channel.ytChannelId },
    });

    const videos = await prisma.intelVideo.findMany({
      where: { channelId: channel.id },
      select: { id: true, ytVideoId: true, title: true, views: true, publishedAt: true, thumbnailUrl: true, description: true },
    });

    const multiplierMap = computeOutlierMultiples(videos.map((v) => ({ id: v.id, views: v.views })));

    for (const [id, mult] of multiplierMap) {
      await prisma.intelVideo.update({
        where: { id },
        data: { outlierMultiple: mult, isOutlier: mult >= OUTLIER_THRESHOLD },
      });
    }

    const outlierSummaries: VideoSummary[] = videos
      .map((v) => ({
        ytVideoId: v.ytVideoId,
        title: v.title,
        views: Number(v.views),
        multiplier: multiplierMap.get(v.id) ?? 0,
        publishedAt: v.publishedAt.toISOString(),
        thumbnailUrl: v.thumbnailUrl,
      }))
      .filter((v) => v.multiplier >= OUTLIER_THRESHOLD)
      .sort((a, b) => b.multiplier - a.multiplier);

    const toAnalyse = outlierSummaries.slice(0, MAX_OUTLIERS_TO_ANALYSE);

    const analyses: Array<{
      video: VideoSummary;
      analysis: {
        hookType: string;
        titleFramework: string;
        stressThemes: string[];
        whyItWorked: string;
        contentAngle: string;
        keyTakeaway: string;
      };
    }> = [];

    for (const ov of toAnalyse) {
      const dbVideo = videos.find((v) => v.ytVideoId === ov.ytVideoId);
      let transcript: string | null = null;
      try {
        transcript = await getTranscript(ov.ytVideoId);
      } catch {
        // transcript optional
      }
      const analysis = await analyseOutlierWithClaude({
        title: ov.title,
        views: ov.views,
        multiplier: ov.multiplier,
        description: dbVideo?.description ?? null,
        transcript,
      });
      analyses.push({ video: ov, analysis });

      const dbOv = videos.find((v) => v.ytVideoId === ov.ytVideoId);
      if (dbOv) {
        await prisma.intelVideoAnalysis.upsert({
          where: { videoId: dbOv.id },
          create: {
            videoId: dbOv.id,
            hookType: analysis.hookType,
            titleFramework: analysis.titleFramework,
            stressThemes: analysis.stressThemes as any,
            whyItWorked: analysis.whyItWorked,
            patternsDetected: analysis as any,
          },
          update: {
            hookType: analysis.hookType,
            titleFramework: analysis.titleFramework,
            stressThemes: analysis.stressThemes as any,
            whyItWorked: analysis.whyItWorked,
            patternsDetected: analysis as any,
          },
        });
      }
    }

    const reportMarkdown = await generateReport({
      channelTitle: channel.title,
      channelHandle: channel.handle,
      subscribers: channel.subscribers ?? 0,
      totalVideos: videoCount,
      outliers: outlierSummaries,
      analyses,
      clientName: run.client?.name ?? null,
    });

    const reportJson = {
      channelId: channel.id,
      channelTitle: channel.title,
      videoCount,
      outlierCount: outlierSummaries.length,
      outliers: outlierSummaries,
      analyses,
    };

    await prisma.intelRun.update({
      where: { id: runId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        reportMarkdown,
        reportJson: reportJson as any,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[intel-run] Run ${runId} failed:`, msg);
    await prisma.intelRun.update({
      where: { id: runId },
      data: { status: "FAILED", failedReason: msg },
    });
    throw err;
  }
}

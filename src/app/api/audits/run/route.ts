import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getChannelInfo, getVideosWithTranscripts } from "@/lib/youtube";
import { runAuditWithClaude, DEFAULT_SCORING_PROMPT } from "@/lib/audit-engine";

export const maxDuration = 60;

async function processAuditJob(jobId: string) {
  const job = await prisma.auditJob.findUnique({
    where: { id: jobId },
    include: { user: true },
  });
  if (!job || !job.user) return;

  const member = job.user;

  try {
    // Step 1: downloading
    await prisma.auditJob.update({
      where: { id: jobId },
      data: { status: "downloading" },
    });

    if (!member.youtubeHandle) {
      throw new Error("Member has no YouTube handle set");
    }

    const channelInfo = await getChannelInfo(member.youtubeHandle);

    let sinceDate: Date | undefined;
    if (job.auditType === "monthly") {
      const lastAudit = await prisma.audit.findFirst({
        where: { userId: member.id },
        orderBy: { createdAt: "desc" },
      });
      if (!lastAudit) {
        throw new Error("No baseline audit found. Run a Baseline audit first.");
      }
      sinceDate = lastAudit.createdAt;
    }

    const videoCount = job.auditType === "single_video" ? 1 : 5;
    const videos = await getVideosWithTranscripts(
      channelInfo.uploadsPlaylistId,
      videoCount,
      sinceDate
    );

    if (job.auditType === "monthly" && videos.length < 2) {
      throw new Error("Not enough new content for a meaningful monthly audit (fewer than 2 new videos)");
    }

    if (videos.length === 0) {
      throw new Error("No videos found on this channel");
    }

    // Step 2: analysing
    await prisma.auditJob.update({
      where: { id: jobId },
      data: { status: "analysing" },
    });

    const setting = await prisma.appSetting.findUnique({
      where: { key: "audit_prompt" },
    });
    const systemPrompt = setting?.value ?? DEFAULT_SCORING_PROMPT;

    const auditResult = await runAuditWithClaude(
      videos,
      member.fullName ?? member.email,
      systemPrompt
    );

    // Step 3: generating
    await prisma.auditJob.update({
      where: { id: jobId },
      data: { status: "generating" },
    });

    // Build baseline comparison for monthly audits
    let baselineScores = null;
    let lastMonthScores = null;
    if (job.auditType === "monthly") {
      const baseline = await prisma.audit.findFirst({
        where: { userId: member.id, auditType: "baseline" },
        orderBy: { createdAt: "asc" },
      });
      const lastMonth = await prisma.audit.findFirst({
        where: { userId: member.id, auditType: "monthly" },
        orderBy: { createdAt: "desc" },
      });
      baselineScores = (baseline?.scores as any) ?? null;
      lastMonthScores = (lastMonth?.scores as any) ?? null;
    }

    const videosAnalysed = videos.map((v) => ({
      videoId: v.videoId,
      title: v.title,
      duration: v.duration,
      durationSeconds: v.durationSeconds,
      uploadDate: v.uploadDate,
      viewCount: v.viewCount,
      hadTranscript: v.transcript !== null,
    }));

    // Save audit record
    const audit = await prisma.audit.create({
      data: {
        userId: member.id,
        auditType: job.auditType,
        overallScore: auditResult.overall_score,
        scores: auditResult.scores as any,
        reportContent: {
          ...auditResult,
          channelInfo: {
            title: channelInfo.title,
            handle: channelInfo.handle,
            bannerUrl: channelInfo.bannerUrl,
          },
          baselineScores,
          lastMonthScores,
        } as any,
        videosAnalysed: videosAnalysed as any,
      },
    });

    // Mark job complete
    await prisma.auditJob.update({
      where: { id: jobId },
      data: { status: "complete", auditId: audit.id },
    });
  } catch (err: any) {
    console.error(`[audit job ${jobId}] failed:`, err);
    await prisma.auditJob.update({
      where: { id: jobId },
      data: { status: "failed", errorMessage: err.message },
    });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { memberId, auditType } = await req.json();

  if (!memberId || !auditType) {
    return NextResponse.json({ error: "memberId and auditType required" }, { status: 400 });
  }

  const member = await prisma.user.findUnique({ where: { id: memberId } });
  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const job = await prisma.auditJob.create({
    data: {
      auditType,
      userId: memberId,
      status: "queued",
    },
  });

  // Fire and forget — process async
  processAuditJob(job.id).catch(console.error);

  return NextResponse.json({ jobId: job.id });
}

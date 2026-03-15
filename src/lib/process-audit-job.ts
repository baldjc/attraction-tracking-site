import prisma from "@/lib/prisma";
import { getChannelInfo, getVideosWithTranscripts, getVideoById } from "@/lib/youtube";
import { runAuditWithClaude, DEFAULT_SCORING_PROMPT, SINGLE_VIDEO_SCORING_PROMPT } from "@/lib/audit-engine";

export async function processAuditJob(jobId: string, selectedVideoId?: string) {
  const job = await prisma.auditJob.findUnique({
    where: { id: jobId },
    include: { user: true },
  });
  if (!job || !job.user) return;

  const member = job.user;

  try {
    await prisma.auditJob.update({ where: { id: jobId }, data: { status: "downloading" } });

    let channelInfo: Awaited<ReturnType<typeof getChannelInfo>> | null = null;
    let videos: Awaited<ReturnType<typeof getVideoById>>[] = [];

    if (job.auditType === "single_video" && selectedVideoId) {
      console.log(`[audit job ${jobId}] Single video mode — fetching videoId: ${selectedVideoId}`);
      const video = await getVideoById(selectedVideoId);
      if (!video) throw new Error("Could not fetch the selected video from YouTube.");
      videos = [video];
      const youtubeIdentifier = member.youtubeHandle || (() => {
        if (!member.youtubeChannelUrl) return null;
        const url = member.youtubeChannelUrl;
        const handleMatch = url.match(/@[\w-]+/);
        if (handleMatch) return handleMatch[0];
        const parts = url.replace(/\/$/, "").split("/");
        const last = parts[parts.length - 1];
        return last && last !== "youtube.com" ? (last.startsWith("@") || last.startsWith("UC") ? last : `@${last}`) : null;
      })();
      if (youtubeIdentifier) {
        try { channelInfo = await getChannelInfo(youtubeIdentifier); } catch { }
      }
    } else {
      let youtubeIdentifier = member.youtubeHandle;
      if (!youtubeIdentifier && member.youtubeChannelUrl) {
        const url = member.youtubeChannelUrl;
        const handleMatch = url.match(/@[\w-]+/);
        if (handleMatch) {
          youtubeIdentifier = handleMatch[0];
        } else {
          const parts = url.replace(/\/$/, "").split("/");
          const last = parts[parts.length - 1];
          if (last && last !== "youtube.com") {
            youtubeIdentifier = last.startsWith("@") ? last : last.startsWith("UC") ? last : `@${last}`;
          }
        }
      }

      if (!youtubeIdentifier) {
        throw new Error("Member has no YouTube handle or channel URL set.");
      }

      console.log(`[audit job ${jobId}] Using YouTube identifier: ${youtubeIdentifier}`);
      channelInfo = await getChannelInfo(youtubeIdentifier);

      let sinceDate: Date | undefined;
      if (job.auditType === "monthly") {
        const lastAudit = await prisma.audit.findFirst({
          where: { userId: member.id },
          orderBy: { createdAt: "desc" },
        });
        if (!lastAudit) throw new Error("No baseline audit found. Run a Baseline audit first.");
        sinceDate = lastAudit.createdAt;
      }

      const videoCount = 5;
      videos = await getVideosWithTranscripts(channelInfo.uploadsPlaylistId, videoCount, sinceDate);

      if (job.auditType === "monthly" && videos.length < 1) {
        throw new Error("Not enough new content for a meaningful monthly audit (no new videos found)");
      }
      if (videos.length === 0) throw new Error("No videos found on this channel");
    }

    await prisma.auditJob.update({ where: { id: jobId }, data: { status: "analysing" } });

    const setting = await prisma.appSetting.findUnique({ where: { key: "audit_prompt" } });
    const isSingleVideo = job.auditType === "single_video";

    let systemPrompt: string;
    if (isSingleVideo) {
      const avatarText = (member as any).avatarSummary
        || ((member as any).avatarProfile ? JSON.stringify((member as any).avatarProfile, null, 2) : null)
        || "No avatar profile saved for this member — infer the intended avatar from the video content.";
      systemPrompt = SINGLE_VIDEO_SCORING_PROMPT.replace("{{AVATAR_PROFILE}}", avatarText);
    } else {
      systemPrompt = setting?.value ?? DEFAULT_SCORING_PROMPT;
    }

    const auditResult = await runAuditWithClaude(
      videos.filter(Boolean) as any,
      member.fullName ?? member.email,
      systemPrompt,
      isSingleVideo
    );

    await prisma.auditJob.update({ where: { id: jobId }, data: { status: "generating" } });

    const videosAnalysed = (videos.filter(Boolean) as NonNullable<(typeof videos)[number]>[]).map((v) => ({
      videoId: v.videoId,
      title: v.title,
      duration: v.duration,
      durationSeconds: v.durationSeconds,
      uploadDate: v.uploadDate,
      viewCount: v.viewCount,
      hadTranscript: v.transcript !== null,
    }));

    let baselineScores = null;
    let lastMonthScores = null;
    if (job.auditType === "monthly" || job.auditType === "single_video") {
      const baseline = await prisma.audit.findFirst({
        where: { userId: member.id, auditType: "baseline" },
        orderBy: { createdAt: "asc" },
      });
      baselineScores = (baseline?.scores as any) ?? null;
    }
    if (job.auditType === "monthly") {
      const lastMonth = await prisma.audit.findFirst({
        where: { userId: member.id, auditType: "monthly" },
        orderBy: { createdAt: "desc" },
      });
      lastMonthScores = (lastMonth?.scores as any) ?? null;
    }

    const audit = await prisma.audit.create({
      data: {
        userId: member.id,
        auditType: job.auditType,
        overallScore: auditResult.overall_score,
        scores: auditResult.scores as any,
        reportContent: {
          ...auditResult,
          raw_average: auditResult.raw_average,
          channelInfo: channelInfo ? {
            title: channelInfo.title,
            handle: channelInfo.handle,
            bannerUrl: channelInfo.bannerUrl,
          } : null,
          baselineScores,
          lastMonthScores,
        } as any,
        videosAnalysed: videosAnalysed as any,
      },
    });

    await prisma.auditJob.update({ where: { id: jobId }, data: { status: "complete", auditId: audit.id } });
  } catch (err: any) {
    console.error(`[audit job ${jobId}] failed:`, err.message);
    await prisma.auditJob.update({ where: { id: jobId }, data: { status: "failed", errorMessage: err.message } });
    throw err;
  }
}

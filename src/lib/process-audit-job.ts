import prisma from "@/lib/prisma";
import { getChannelInfo, getVideosWithTranscripts, getVideoById, getLatestLongFormVideos } from "@/lib/youtube";
import { runAuditWithClaude, DEFAULT_SCORING_PROMPT, SINGLE_VIDEO_SCORING_PROMPT, LEAD_SCORING_PROMPT } from "@/lib/audit-engine";
import { sendAuditReadyEmail } from "@/lib/email";

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
      console.log(`[audit job ${jobId}] Video fetched: "${video.title}" — transcript: ${video.transcript ? `${video.transcript.length} chars` : "NULL (check SUPADATA_API_KEY)"}`);
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

      if (job.auditType === "monthly") {
        const lastAudit = await prisma.audit.findFirst({
          where: { userId: member.id, auditType: { in: ["baseline", "monthly"] } },
          orderBy: { createdAt: "desc" },
        });
        if (!lastAudit) throw new Error("No baseline audit found. Run a Baseline audit first.");

        // Gate check: does the channel have at least 1 new video since last audit?
        const sinceDate = lastAudit.createdAt;
        const newCheck = await getLatestLongFormVideos(channelInfo.uploadsPlaylistId, 1, sinceDate);
        if (newCheck.length === 0) {
          throw new Error("No new videos since last audit — skipping monthly audit");
        }
      }

      // Lead audits use 3 videos (faster + cheaper for non-members);
      // member audits use 5 videos for full Consistency + pattern data.
      const videoCount = job.auditType === "lead" ? 3 : 5;
      videos = await getVideosWithTranscripts(channelInfo.uploadsPlaylistId, videoCount);

      if (videos.length === 0) throw new Error("No videos found on this channel");
    }

    await prisma.auditJob.update({ where: { id: jobId }, data: { status: "analysing" } });

    const setting = await prisma.appSetting.findUnique({ where: { key: "audit_prompt" } });
    const isSingleVideo = job.auditType === "single_video";
    const isLead = job.auditType === "lead";

    let systemPrompt: string;
    if (isSingleVideo) {
      const avatarText = (member as any).avatarSummary
        || ((member as any).avatarProfile ? JSON.stringify((member as any).avatarProfile, null, 2) : null)
        || "No avatar profile saved for this member — infer the intended avatar from the video content.";
      systemPrompt = SINGLE_VIDEO_SCORING_PROMPT.replace("{{AVATAR_PROFILE}}", avatarText);
    } else if (isLead) {
      const leadSetting = await prisma.appSetting.findUnique({ where: { key: "lead_audit_prompt" } });
      systemPrompt = leadSetting?.value ?? LEAD_SCORING_PROMPT;
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
            thumbnailUrl: channelInfo.thumbnailUrl,
          } : null,
          baselineScores,
          lastMonthScores,
        } as any,
        videosAnalysed: videosAnalysed as any,
      },
    });

    // Persist channel thumbnail on the user record so it's available without re-fetching
    if (channelInfo?.thumbnailUrl) {
      await prisma.user.update({
        where: { id: member.id },
        data: { youtubeChannelThumbnail: channelInfo.thumbnailUrl },
      });
    }

    // Link audit to YouTubeVideo if it was a single_video audit
    if (job.auditType === "single_video" && selectedVideoId && member.id) {
      try {
        const ytVideo = await prisma.youTubeVideo.findUnique({
          where: { userId_videoId: { userId: member.id, videoId: selectedVideoId } },
        });
        if (ytVideo) {
          await prisma.audit.update({
            where: { id: audit.id },
            data: { youtubeVideoId: ytVideo.id },
          });
        }
      } catch {
        // non-critical — don't fail the audit job if linking fails
      }
    }

    await prisma.auditJob.update({ where: { id: jobId }, data: { status: "complete", auditId: audit.id } });

    // Auto-link completed audit to any pending AuditRequest for this user
    try {
      const pendingRequest = await prisma.auditRequest.findFirst({
        where: { userId: member.id, status: "pending", auditId: null },
      });
      if (pendingRequest) {
        await prisma.auditRequest.update({
          where: { id: pendingRequest.id },
          data: { auditId: audit.id, status: "audited" },
        });
      }
    } catch {
      // non-critical — don't fail the audit job if linking fails
    }

    // Notify the member that their audit is ready — paying members only, never leads.
    if (job.auditType !== "lead" && member.email) {
      try {
        const firstVideoTitle = (videos[0] as any)?.title ?? null;
        await sendAuditReadyEmail({
          to: member.email,
          memberName: member.fullName,
          auditId: audit.id,
          auditType: job.auditType as "baseline" | "monthly" | "single_video",
          videoTitle: job.auditType === "single_video" ? firstVideoTitle : null,
        });
      } catch (err) {
        console.error(`[audit job ${jobId}] email notify failed:`, err);
        // Non-critical — never fail the audit job because of an email send.
      }
    }
  } catch (err: any) {
    console.error(`[audit job ${jobId}] failed:`, err.message);
    await prisma.auditJob.update({ where: { id: jobId }, data: { status: "failed", errorMessage: err.message } });
    throw err;
  }
}

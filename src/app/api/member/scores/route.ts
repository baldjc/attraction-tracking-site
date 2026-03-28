import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { getChannelInfo } from "@/lib/youtube";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await resolveUserFromSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [dbUser, audits] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        youtubeHandle: true,
        youtubeChannelUrl: true,
        youtubeChannelName: true,
      },
    }),
    prisma.audit.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        auditType: true,
        overallScore: true,
        scores: true,
        createdAt: true,
        videosAnalysed: true,
      },
    }),
  ]);

  // Fetch YouTube channel banner if the member has a handle
  let channelBannerUrl: string | null = null;
  let channelName: string | null = dbUser?.youtubeChannelName ?? null;
  const handle = dbUser?.youtubeHandle ?? null;

  if (handle) {
    try {
      const info = await getChannelInfo(handle);
      channelBannerUrl = info.bannerUrl;
      if (!channelName) channelName = info.title;
    } catch {
      // Not critical — page still works without banner
    }
  }

  if (audits.length === 0) {
    return NextResponse.json({
      latestAudit: null,
      baselineAudit: null,
      audits: [],
      channelBannerUrl,
      channelName,
      youtubeHandle: handle,
      youtubeChannelUrl: dbUser?.youtubeChannelUrl ?? null,
    });
  }

  const latestAudit = audits[0];
  const baselineAudit = audits.find((a) => a.auditType === "baseline") ?? null;

  return NextResponse.json({
    latestAudit,
    baselineAudit,
    audits,
    channelBannerUrl,
    channelName,
    youtubeHandle: handle,
    youtubeChannelUrl: dbUser?.youtubeChannelUrl ?? null,
  });
}

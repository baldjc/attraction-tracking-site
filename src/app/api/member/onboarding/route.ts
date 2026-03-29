import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      onboardingComplete: true,
      onboardingDismissedAt: true,
      youtubeChannelUrl: true,
      youtubeHandle: true,
      youtubeChannelName: true,
      youtubeChannelThumbnail: true,
      city: true,
      niche: true,
      creatorCredentials: true,
      incomeGoal: true,
      postingRhythm: true,
      biggestChallenge: true,
      avatarProfile: true,
      avatarName: true,
      avatarSummary: true,
      contentThemes: true,
    },
  });

  return NextResponse.json(data);
}

export async function PUT(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    youtubeChannelUrl,
    city,
    niche,
    creatorCredentials,
    incomeGoal,
    postingRhythm,
    biggestChallenge,
    onboardingComplete,
    onboardingDismissedAt,
  } = body;

  const updateData: Record<string, unknown> = {};

  if (youtubeChannelUrl !== undefined) updateData.youtubeChannelUrl = youtubeChannelUrl;
  if (city !== undefined) updateData.city = city;
  if (niche !== undefined) updateData.niche = niche;
  if (creatorCredentials !== undefined) updateData.creatorCredentials = creatorCredentials;
  if (incomeGoal !== undefined) updateData.incomeGoal = incomeGoal;
  if (postingRhythm !== undefined) updateData.postingRhythm = postingRhythm !== null ? parseInt(String(postingRhythm), 10) : null;
  if (biggestChallenge !== undefined) updateData.biggestChallenge = biggestChallenge;
  if (onboardingComplete !== undefined) updateData.onboardingComplete = Boolean(onboardingComplete);
  if (onboardingDismissedAt !== undefined) updateData.onboardingDismissedAt = onboardingDismissedAt ? new Date() : null;

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: updateData,
    select: { onboardingComplete: true },
  });

  return NextResponse.json({ onboardingComplete: updated.onboardingComplete });
}

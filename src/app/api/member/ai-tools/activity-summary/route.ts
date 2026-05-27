import { NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

function relativeLabel(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const ms = Date.now() - new Date(d).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return "1 week ago";
  if (weeks < 5) return `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  if (months <= 1) return "1 month ago";
  return `${months} months ago`;
}

export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const weekAgo = new Date(Date.now() - 7 * 86_400_000);

  const [u, avatarConvo, ideasThisWeek, draftsInProgress, pendingTitleReports, lastScriptReview] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { avatarName: true, updatedAt: true },
    }),
    prisma.aIToolConversation.findFirst({
      where: { userId: user.id, toolType: "avatar_architect" },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    prisma.savedIdea.count({ where: { userId: user.id, createdAt: { gte: weekAgo } } }),
    prisma.savedScript.count({ where: { userId: user.id } }),
    prisma.titleAnalysis.count({ where: { userId: user.id, createdAt: { gte: weekAgo } } }),
    prisma.aIToolConversation.findFirst({
      where: { userId: user.id, toolType: "script_review" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  const avatarEditedAt = avatarConvo?.updatedAt ?? (u?.avatarName ? u.updatedAt : null);

  return NextResponse.json({
    avatar: {
      name: u?.avatarName ?? null,
      lastEditedAt: avatarEditedAt,
      lastEditedLabel: avatarEditedAt ? relativeLabel(avatarEditedAt) : null,
    },
    contentEngine: { ideasThisWeek },
    arcScript: { draftsInProgress },
    titleAnalyzer: { pendingReports: pendingTitleReports },
    scriptReview: {
      lastReviewAt: lastScriptReview?.createdAt ?? null,
      lastReviewLabel: lastScriptReview ? relativeLabel(lastScriptReview.createdAt) : null,
    },
  });
}

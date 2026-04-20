import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-utils";
import { isReviewerEnabled } from "@/lib/reviewer-flag";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || !isAdmin(role ?? "")) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!(await isReviewerEnabled())) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const members = await prisma.user.findMany({
    where: {
      OR: [
        { youtubeHandle: { not: null } },
        { youtubeChannelUrl: { not: null } },
      ],
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      youtubeHandle: true,
      youtubeChannelUrl: true,
      youtubeChannelName: true,
    },
    orderBy: { fullName: "asc" },
  });

  const tracked = await prisma.reviewerTrackedChannel.findMany({
    select: { userId: true },
  });
  const trackedUserIds = new Set(
    tracked.map((t) => t.userId).filter((x): x is string => !!x),
  );

  const eligible = members
    .filter((m) => !trackedUserIds.has(m.id))
    .map((m) => ({
      id: m.id,
      label:
        (m.fullName || m.email || "Unnamed") +
        (m.youtubeHandle ? ` (${m.youtubeHandle})` : ""),
      youtubeHandle: m.youtubeHandle,
      youtubeChannelUrl: m.youtubeChannelUrl,
      youtubeChannelName: m.youtubeChannelName,
    }));

  return NextResponse.json({ members: eligible });
}

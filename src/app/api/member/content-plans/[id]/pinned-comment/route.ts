import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";

export const runtime = "nodejs";

const MAX_COMMENT_CHARS = 1000;

// POST — draft the pinned first comment for a video. The pinned comment always
// points the viewer to this plan's "binge to" target as a single sentence:
//   👉 Watch this next: <Binge Video Title> <Binge Video URL>
// The URL is pulled in when the binge target has been published to YouTube
// (its raw youtubeVideoId is stored on the plan); otherwise we point to it by
// title alone. The output is deterministic so it always matches the format.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const plan = await prisma.contentPlan.findFirst({
    where: { id, userId: user.id, deletedAt: null },
    select: {
      bingeVideoId: true,
      bingeVideo: { select: { title: true, youtubeVideoId: true, deletedAt: true } },
    },
  });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // A soft-deleted binge target is treated as no target — never point viewers
  // at a video the member has deleted.
  if (!plan.bingeVideoId || !plan.bingeVideo || plan.bingeVideo.deletedAt) {
    return NextResponse.json(
      { error: "Set a binge target first — the pinned comment points viewers to that next video." },
      { status: 400 },
    );
  }

  const title = (plan.bingeVideo.title ?? "").trim() || "the next video";
  const url = plan.bingeVideo.youtubeVideoId
    ? `https://youtube.com/watch?v=${plan.bingeVideo.youtubeVideoId}`
    : "";

  const comment = `👉 Watch this next: ${title}${url ? ` ${url}` : ""}`.slice(0, MAX_COMMENT_CHARS);

  return NextResponse.json({ comment });
}

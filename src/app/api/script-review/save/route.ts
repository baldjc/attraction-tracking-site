import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionId = (session.user as any).id as string | undefined;
  const sessionEmail = session.user.email;
  console.log("[script-review/save] session userId:", sessionId, "email:", sessionEmail);

  // Resolve the actual DB user — look up by ID first, fall back to email
  let dbUser = sessionId
    ? await prisma.user.findUnique({ where: { id: sessionId }, select: { id: true } })
    : null;

  if (!dbUser && sessionEmail) {
    dbUser = await prisma.user.findUnique({ where: { email: sessionEmail }, select: { id: true } });
    if (dbUser) {
      console.log("[script-review/save] Resolved user by email fallback:", dbUser.id);
    }
  }

  if (!dbUser) {
    console.error("[script-review/save] Could not resolve user in DB. sessionId:", sessionId, "email:", sessionEmail);
    return NextResponse.json({ error: "User not found" }, { status: 400 });
  }

  const userId = dbUser.id;

  const { videoTitle, scriptText, scores, overallScore, reportContent } = await req.json();
  if (!videoTitle || !scriptText || !scores || overallScore == null) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const review = await prisma.scriptReview.create({
    data: {
      userId,
      videoTitle,
      scriptText,
      scores,
      overallScore,
      reportContent: reportContent ?? {},
    },
  });

  console.log("[script-review/save] Saved review:", review.id, "for userId:", userId);
  return NextResponse.json({ id: review.id, saved: true });
}

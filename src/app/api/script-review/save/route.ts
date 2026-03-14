import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = (session.user as any).id;

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

  return NextResponse.json({ id: review.id, saved: true });
}

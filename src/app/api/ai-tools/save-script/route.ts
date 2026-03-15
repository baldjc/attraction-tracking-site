import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { videoTitle, scriptOutline, arcScores } = await req.json();
  if (!videoTitle || !scriptOutline) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const script = await prisma.savedScript.create({
    data: { userId: user.id, videoTitle, scriptOutline, arcScores: arcScores ?? null },
  });

  return NextResponse.json({ id: script.id, saved: true });
}

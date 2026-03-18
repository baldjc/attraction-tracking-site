import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

function extractOpening(scriptOutline: unknown): string {
  if (!scriptOutline || typeof scriptOutline !== "object") return "";
  const outline = scriptOutline as Record<string, unknown>;
  const full =
    (outline.fullScript as string) ??
    ((outline.finalData as Record<string, unknown> | undefined)?.script as string) ??
    "";
  if (!full) return "";
  const trimmed = full.slice(0, 1600);
  return full.length > 1600 ? trimmed + "…" : trimmed;
}

export async function GET(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const requestedUserId = searchParams.get("userId");

  let targetUserId = user.id;

  if (requestedUserId && requestedUserId !== user.id) {
    const session = await auth();
    if (!session?.user || (session.user as { role?: string }).role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    targetUserId = requestedUserId;
  }

  const scripts = await prisma.savedScript.findMany({
    where: { userId: targetUserId },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, videoTitle: true, arcScores: true, createdAt: true, scriptOutline: true },
  });

  return NextResponse.json({
    scripts: scripts.map((s) => ({
      id: s.id,
      videoTitle: s.videoTitle,
      arcScores: s.arcScores,
      createdAt: s.createdAt,
      scriptOpening: extractOpening(s.scriptOutline),
    })),
  });
}

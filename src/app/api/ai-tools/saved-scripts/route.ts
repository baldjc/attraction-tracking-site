import { NextResponse } from "next/server";
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

export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scripts = await prisma.savedScript.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
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

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

function extractFullScript(scriptOutline: unknown): string {
  if (!scriptOutline || typeof scriptOutline !== "object") return "";
  const outline = scriptOutline as Record<string, unknown>;
  return (
    (outline.fullScript as string) ??
    ((outline.finalData as Record<string, unknown> | undefined)?.script as string) ??
    ""
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const script = await prisma.savedScript.findUnique({
    where: { id },
    select: { id: true, userId: true, videoTitle: true, scriptOutline: true, createdAt: true },
  });

  if (!script) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (script.userId !== user.id) {
    const session = await auth();
    if (!session?.user || (session.user as { role?: string }).role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return NextResponse.json({
    id: script.id,
    videoTitle: script.videoTitle,
    createdAt: script.createdAt,
    fullScript: extractFullScript(script.scriptOutline),
  });
}

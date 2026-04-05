import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";
import { analyzeVideo } from "@/lib/radar/pipeline";

/** GET /api/admin/radar/videos/[id]/analyze — get existing analysis */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdmin(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const video = await prisma.radarVideo.findUnique({
    where: { id },
    include: {
      analysis: true,
      channel: { select: { name: true, handle: true } },
    },
  });

  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  return NextResponse.json({ video });
}

/** POST /api/admin/radar/videos/[id]/analyze — run AI analysis */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdmin(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const analysis = await analyzeVideo(id);
    if (!analysis) {
      return NextResponse.json(
        { error: "No transcript available — pull transcript first" },
        { status: 422 }
      );
    }
    return NextResponse.json({ analysis });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Analysis failed" },
      { status: 500 }
    );
  }
}

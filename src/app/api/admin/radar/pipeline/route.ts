import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";
import { runFullPipeline } from "@/lib/radar/pipeline";

/** GET /api/admin/radar/pipeline — list recent pipeline runs */
export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdmin(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runs = await prisma.radarPipelineRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 20,
  });

  return NextResponse.json({ runs });
}

/** POST /api/admin/radar/pipeline — trigger a full pipeline run */
export async function POST() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdmin(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if there's already a running pipeline
  const running = await prisma.radarPipelineRun.findFirst({
    where: { status: "running" },
  });
  if (running) {
    return NextResponse.json(
      { error: "A pipeline run is already in progress", runId: running.id },
      { status: 409 }
    );
  }

  try {
    const runId = await runFullPipeline();
    return NextResponse.json({ runId });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Pipeline failed" },
      { status: 500 }
    );
  }
}

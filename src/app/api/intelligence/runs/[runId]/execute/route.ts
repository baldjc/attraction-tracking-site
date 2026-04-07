import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { executeRun } from "@/lib/intel-run";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { runId } = await params;

  executeRun(runId).catch((err) => {
    console.error(`[intel-run] Background execution failed for ${runId}:`, err);
  });

  return NextResponse.json({ started: true, runId }, { status: 202 });
}

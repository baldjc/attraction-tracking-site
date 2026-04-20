import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";
import { isReviewerEnabled } from "@/lib/reviewer-flag";
import { executeCoachRun } from "@/lib/reviewer-run";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ channelRef: string }> },
) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!session?.user || !isAdmin(role ?? "") || !userId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!(await isReviewerEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }

  const { channelRef } = await params;

  const run = await prisma.reviewerRun.create({
    data: {
      channelRef,
      requestedById: userId,
      status: "pending",
    },
    select: { id: true },
  });

  // Fire-and-forget
  void executeCoachRun(run.id).catch((err) => {
    console.error(`[coach-panel/run] ${run.id} crashed:`, err);
  });

  return NextResponse.json({ runId: run.id }, { status: 202 });
}

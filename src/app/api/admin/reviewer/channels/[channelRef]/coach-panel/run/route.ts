import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";
import { isReviewerEnabled } from "@/lib/reviewer-flag";
import { dispatchCoachRun } from "@/lib/job-dispatch";

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

  // Durable when the queue flag is on for the requesting admin; otherwise the
  // legacy in-process fire-and-forget. Never throws.
  await dispatchCoachRun(run.id, userId);

  return NextResponse.json({ runId: run.id }, { status: 202 });
}

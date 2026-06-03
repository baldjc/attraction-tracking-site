import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-utils";
import { isReviewerEnabled } from "@/lib/reviewer-flag";
import { dispatchGlanceTest } from "@/lib/job-dispatch";

export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ channelRef: string }> },
) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || !isAdmin(role ?? "")) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!(await isReviewerEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }

  const { channelRef } = await params;
  const runBy = (session.user as { id?: string }).id ?? "system";

  // Durable when the queue flag is on for the requesting admin; otherwise the
  // legacy in-process fire-and-forget. Never throws.
  await dispatchGlanceTest(channelRef, runBy);

  return NextResponse.json({ accepted: true }, { status: 202 });
}

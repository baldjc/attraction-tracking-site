import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-utils";
import { runGlanceTestForChannel } from "@/lib/glance-test-runner";

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

  const { channelRef } = await params;
  const runBy = (session.user as { id?: string }).id ?? "system";

  // Fire-and-forget — long-running job; client should poll the read API.
  void runGlanceTestForChannel(channelRef, runBy).catch((err) =>
    console.error(`[glance-test/run] channel ${channelRef}:`, err),
  );

  return NextResponse.json({ accepted: true }, { status: 202 });
}

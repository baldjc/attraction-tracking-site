import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-utils";
import { pullTranscript } from "@/lib/radar/pipeline";

/** POST /api/admin/radar/videos/[id]/transcript — pull transcript for a video */
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
    const transcript = await pullTranscript(id);
    if (!transcript) {
      return NextResponse.json(
        { error: "No transcript available for this video" },
        { status: 404 }
      );
    }
    return NextResponse.json({ transcript });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Failed to pull transcript" },
      { status: 500 }
    );
  }
}

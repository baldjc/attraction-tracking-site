import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminOrEditor } from "@/lib/auth-utils";
import { syncAllChannels, syncMemberChannel } from "@/lib/youtube-sync";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdminOrEditor(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { userId } = body;

    if (userId) {
      const result = await syncMemberChannel(userId);
      return NextResponse.json(result);
    }

    const summary = await syncAllChannels();
    return NextResponse.json(summary);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

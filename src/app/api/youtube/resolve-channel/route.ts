import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getChannelInfo } from "@/lib/youtube";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const channelId = req.nextUrl.searchParams.get("channelId");
  if (!channelId) {
    return NextResponse.json({ error: "channelId required" }, { status: 400 });
  }

  try {
    const info = await getChannelInfo(channelId);
    return NextResponse.json({ title: info.title, channelId: info.channelId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { syncChannel, computeOutlierMultiples } from "@/lib/intel-channel";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { channelHandle } = await req.json();
  if (!channelHandle?.trim()) return NextResponse.json({ error: "channelHandle required" }, { status: 400 });

  if (!process.env.YOUTUBE_API_KEY) {
    return NextResponse.json({ error: "YOUTUBE_API_KEY is not configured" }, { status: 503 });
  }

  try {
    const { channel, videoCount } = await syncChannel(channelHandle.trim());

    const videos = await prisma.intelVideo.findMany({
      where: { channelId: channel.id },
      select: { id: true, views: true },
    });

    const multiplierMap = computeOutlierMultiples(videos);
    for (const [id, mult] of multiplierMap) {
      await prisma.intelVideo.update({
        where: { id },
        data: { outlierMultiple: mult, isOutlier: mult >= 2.5 },
      });
    }

    const outlierCount = [...multiplierMap.values()].filter((m) => m >= 2.5).length;
    return NextResponse.json({ channel, videoCount, outlierCount });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

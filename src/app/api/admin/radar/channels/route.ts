import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";
import { syncChannel } from "@/lib/radar/pipeline";

/** GET /api/admin/radar/channels — list all tracked channels */
export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdmin(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const channels = await prisma.radarChannel.findMany({
    orderBy: { subscriberCount: "desc" },
    include: {
      _count: { select: { videos: true } },
    },
  });

  return NextResponse.json({ channels });
}

/** POST /api/admin/radar/channels — add a new channel by handle/URL */
export async function POST(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdmin(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { handle } = await req.json();
  if (!handle || typeof handle !== "string") {
    return NextResponse.json({ error: "handle is required" }, { status: 400 });
  }

  try {
    const channel = await syncChannel(handle.trim());
    return NextResponse.json({ channel });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Failed to add channel" },
      { status: 422 }
    );
  }
}

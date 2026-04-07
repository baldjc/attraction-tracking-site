import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");

  const runs = await prisma.intelRun.findMany({
    where: clientId ? { clientId } : undefined,
    orderBy: { startedAt: "desc" },
    take: 100,
    include: { client: { select: { name: true } } },
  });
  return NextResponse.json(runs);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { channelUrl, clientId } = body;
  if (!channelUrl?.trim()) return NextResponse.json({ error: "channelUrl is required" }, { status: 400 });

  const createdBy = (session!.user as any)?.email ?? "admin";

  const run = await prisma.intelRun.create({
    data: {
      inputChannelUrl: channelUrl.trim(),
      clientId: clientId || null,
      status: "PENDING",
      createdBy,
    },
  });

  return NextResponse.json(run, { status: 201 });
}

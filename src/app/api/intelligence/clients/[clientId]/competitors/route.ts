import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { syncChannel } from "@/lib/intel-channel";

async function adminOnly() {
  const session = await auth();
  return (session?.user as any)?.role === "admin" ? session : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  if (!await adminOnly()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { clientId } = await params;

  const competitors = await prisma.clientCompetitor.findMany({
    where: { clientId },
    include: { channel: true },
    orderBy: { addedAt: "desc" },
  });
  return NextResponse.json(competitors);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  if (!await adminOnly()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { clientId } = await params;
  const { channelHandle, notes } = await req.json();
  if (!channelHandle?.trim()) return NextResponse.json({ error: "channelHandle required" }, { status: 400 });

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "YOUTUBE_API_KEY not configured" }, { status: 503 });

  try {
    const { channel } = await syncChannel(channelHandle.trim());
    const comp = await prisma.clientCompetitor.upsert({
      where: { clientId_channelId: { clientId, channelId: channel.id } },
      create: { clientId, channelId: channel.id, notes: notes ?? null },
      update: { notes: notes ?? null },
    });
    return NextResponse.json({ competitor: comp, channel }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  if (!await adminOnly()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { clientId } = await params;
  const { searchParams } = new URL(req.url);
  const compId = searchParams.get("id");
  if (!compId) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.clientCompetitor.delete({ where: { id: compId } });
  return NextResponse.json({ ok: true });
}

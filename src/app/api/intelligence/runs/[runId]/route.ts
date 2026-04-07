import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { runId } = await params;
  const run = await prisma.intelRun.findUnique({
    where: { id: runId },
    include: { client: { select: { name: true, city: true } } },
  });

  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(run);
}

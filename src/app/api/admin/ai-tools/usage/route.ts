import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where: any = {};
  if (from) where.createdAt = { ...(where.createdAt || {}), gte: new Date(from) };
  if (to) where.createdAt = { ...(where.createdAt || {}), lte: new Date(to + "T23:59:59.999Z") };

  const conversations = await prisma.aIToolConversation.findMany({
    where,
    include: {
      user: { select: { id: true, fullName: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  return NextResponse.json({ conversations });
}

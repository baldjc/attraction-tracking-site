import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const audits = await prisma.audit.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, fullName: true, email: true } },
    },
  });

  return NextResponse.json({ audits });
}

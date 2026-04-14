import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entries = await prisma.changelogEntry.findMany({
    where: { published: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return NextResponse.json({ entries });
}

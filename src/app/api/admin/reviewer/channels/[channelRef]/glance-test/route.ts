import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ channelRef: string }> },
) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || !isAdmin(role ?? "")) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { channelRef } = await params;
  const results = await prisma.glanceTestResult.findMany({
    where: { channelRef },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return NextResponse.json({ results });
}

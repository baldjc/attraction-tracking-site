import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const views = await prisma.changelogEntryView.findMany({
    where: { entryId: id },
    orderBy: { seenAt: "desc" },
    include: {
      user: { select: { id: true, fullName: true, email: true } },
    },
  });

  return NextResponse.json({
    viewers: views.map((v) => ({
      userId: v.userId,
      fullName: v.user.fullName,
      email: v.user.email,
      seenAt: v.seenAt.toISOString(),
    })),
  });
}

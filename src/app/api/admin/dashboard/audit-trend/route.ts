import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { UserRole } from "@/generated/prisma/client";

export async function GET() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || (role !== "admin" && role !== "editor")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const members = await prisma.user.findMany({
    where: { role: { notIn: [UserRole.admin, UserRole.editor] } },
    select: {
      audits: {
        where: {
          overallScore: { not: null },
          auditType: { in: ["baseline", "monthly"] },
        },
        orderBy: { createdAt: "desc" },
        take: 2,
        select: { overallScore: true },
      },
    },
  });

  const withCurrent = members.filter((m) => m.audits.length > 0);
  const withBoth = members.filter((m) => m.audits.length >= 2);

  const currentAvg =
    withCurrent.length > 0
      ? parseFloat(
          (
            withCurrent.reduce((sum, m) => sum + (m.audits[0].overallScore ?? 0), 0) /
            withCurrent.length
          ).toFixed(1)
        )
      : null;

  const previousAvg =
    withBoth.length > 0
      ? parseFloat(
          (
            withBoth.reduce((sum, m) => sum + (m.audits[1].overallScore ?? 0), 0) /
            withBoth.length
          ).toFixed(1)
        )
      : null;

  let trend: "up" | "down" | "same" | null = null;
  if (currentAvg !== null && previousAvg !== null) {
    if (currentAvg > previousAvg + 0.05) trend = "up";
    else if (currentAvg < previousAvg - 0.05) trend = "down";
    else trend = "same";
  }

  return NextResponse.json({ currentAvg, previousAvg, trend, count: withCurrent.length });
}

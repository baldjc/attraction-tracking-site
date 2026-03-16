import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import Decimal from "decimal.js-light";

function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export async function GET() {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await prisma.aIToolUsage.findMany({
    where: { createdAt: { gte: startOfMonth() } },
    include: { user: { select: { id: true, fullName: true, email: true, role: true } } },
    orderBy: { createdAt: "asc" },
  });

  // Per-user aggregation
  const userMap = new Map<
    string,
    {
      id: string;
      name: string | null;
      email: string;
      role: string;
      tools: Record<string, Decimal>;
      total: Decimal;
    }
  >();

  // Per-tool aggregation
  const toolMap = new Map<
    string,
    { uses: number; userIds: Set<string>; lastUsed: Date; total: Decimal }
  >();

  let grandTotal = new Decimal(0);

  for (const row of rows) {
    const cost = new Decimal(row.costUsd.toString());
    grandTotal = grandTotal.add(cost);

    // User aggregation
    if (!userMap.has(row.userId)) {
      userMap.set(row.userId, {
        id: row.user.id,
        name: row.user.fullName,
        email: row.user.email,
        role: row.user.role,
        tools: {},
        total: new Decimal(0),
      });
    }
    const u = userMap.get(row.userId)!;
    u.tools[row.toolType] = (u.tools[row.toolType] ?? new Decimal(0)).add(cost);
    u.total = u.total.add(cost);

    // Tool aggregation
    if (!toolMap.has(row.toolType)) {
      toolMap.set(row.toolType, { uses: 0, userIds: new Set(), lastUsed: row.createdAt, total: new Decimal(0) });
    }
    const t = toolMap.get(row.toolType)!;
    t.uses += 1;
    t.userIds.add(row.userId);
    if (row.createdAt > t.lastUsed) t.lastUsed = row.createdAt;
    t.total = t.total.add(cost);
  }

  const memberUsage = Array.from(userMap.values()).map((u) => {
    const toolsOut: Record<string, string> = {};
    for (const [tool, cost] of Object.entries(u.tools)) {
      toolsOut[tool] = cost.toFixed(6);
    }
    return { id: u.id, name: u.name, email: u.email, role: u.role, tools: toolsOut, total: u.total.toFixed(6) };
  });

  const toolBreakdown: Record<string, { uses: number; uniqueMembers: number; lastUsed: string; total: string }> = {};
  for (const [tool, t] of toolMap.entries()) {
    toolBreakdown[tool] = {
      uses: t.uses,
      uniqueMembers: t.userIds.size,
      lastUsed: t.lastUsed.toISOString(),
      total: t.total.toFixed(6),
    };
  }

  return NextResponse.json({ memberUsage, toolBreakdown, totalCost: grandTotal.toFixed(6) });
}

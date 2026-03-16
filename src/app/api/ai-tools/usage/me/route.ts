import { NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import { getMonthlyUsage } from "@/lib/ai-tool-cost";

function resetsAtString(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const usage = await getMonthlyUsage(user.id);

  const breakdown: Record<string, string> = {};
  for (const [tool, cost] of Object.entries(usage.breakdown)) {
    breakdown[tool] = cost.toFixed(6);
  }

  return NextResponse.json({
    totalCost: usage.totalCost.toFixed(6),
    cap: usage.cap.toFixed(2),
    remaining: usage.remaining.toFixed(6),
    percentUsed: usage.percentUsed,
    breakdown,
    resetsAt: resetsAtString(),
  });
}

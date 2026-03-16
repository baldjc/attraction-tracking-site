import prisma from "@/lib/prisma";
import Decimal from "decimal.js-light";

// Sonnet pricing: $3 / 1M input tokens, $12 / 1M output tokens
const INPUT_COST_PER_TOKEN = new Decimal("0.000003");
const OUTPUT_COST_PER_TOKEN = new Decimal("0.000012");
const DEFAULT_MONTHLY_CAP = new Decimal("15.00");
const ADMIN_REMAINING = new Decimal("999999");

export function calculateCost(inputTokens: number, outputTokens: number): Decimal {
  return INPUT_COST_PER_TOKEN.mul(inputTokens).add(OUTPUT_COST_PER_TOKEN.mul(outputTokens));
}

function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function startOfNextMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

function resetsAtString(): string {
  const d = startOfNextMonth();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export async function getMonthlyUsage(userId: string): Promise<{
  totalCost: Decimal;
  cap: Decimal;
  remaining: Decimal;
  percentUsed: number;
  breakdown: Record<string, Decimal>;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, aiToolsMonthlyCapOverride: true },
  });

  if (user?.role === "admin") {
    return {
      totalCost: new Decimal(0),
      cap: ADMIN_REMAINING,
      remaining: ADMIN_REMAINING,
      percentUsed: 0,
      breakdown: {},
    };
  }

  const rows = await prisma.aIToolUsage.findMany({
    where: { userId, createdAt: { gte: startOfMonth() } },
    select: { toolType: true, costUsd: true },
  });

  const breakdown: Record<string, Decimal> = {};
  let totalCost = new Decimal(0);
  for (const row of rows) {
    const cost = new Decimal(row.costUsd.toString());
    totalCost = totalCost.add(cost);
    breakdown[row.toolType] = (breakdown[row.toolType] ?? new Decimal(0)).add(cost);
  }

  let cap = DEFAULT_MONTHLY_CAP;
  if (user?.aiToolsMonthlyCapOverride != null) {
    cap = new Decimal(user.aiToolsMonthlyCapOverride.toString());
  } else {
    const setting = await prisma.appSetting.findUnique({ where: { key: "ai_tools_monthly_cap" } });
    if (setting) cap = new Decimal(setting.value);
  }

  const diff = cap.sub(totalCost);
  const remaining = diff.greaterThan(0) ? diff : new Decimal(0);
  const percentUsed = cap.toNumber() > 0 ? Math.min(100, (totalCost.toNumber() / cap.toNumber()) * 100) : 0;

  return { totalCost, cap, remaining, percentUsed, breakdown };
}

export async function checkCostCap(userId: string): Promise<{
  allowed: boolean;
  percentUsed: number;
  resetsAt: string;
}> {
  const { remaining, percentUsed } = await getMonthlyUsage(userId);
  return {
    allowed: remaining.greaterThan(0),
    percentUsed,
    resetsAt: resetsAtString(),
  };
}

export async function logUsage(
  userId: string,
  toolType: string,
  inputTokens: number,
  outputTokens: number,
  conversationId?: string
): Promise<void> {
  const costUsd = calculateCost(inputTokens, outputTokens);
  await prisma.aIToolUsage.create({
    data: { userId, toolType, inputTokens, outputTokens, costUsd, conversationId },
  });
}

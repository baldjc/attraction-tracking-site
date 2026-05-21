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
    const setting = await prisma.appSetting.upsert({
      where: { key: "ai_tools_monthly_cap" },
      update: {},
      create: { key: "ai_tools_monthly_cap", value: DEFAULT_MONTHLY_CAP.toFixed(2) },
    });
    cap = new Decimal(setting.value);
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

// ─────────────────────────────────────────────────────────────────────────────
// Wave 0 (data-first rebuild) — v2 cost-cap helper.
//
// The v1 cap above (DEFAULT_MONTHLY_CAP = $15) and `checkCostCap()` are kept
// untouched so existing AI-tool routes behave byte-for-byte identically. The
// v2 pipeline (Wave 1+) uses the constants and helper below ($20 hard cap with
// a $15 soft-warning threshold). When v1 routes are retired in Wave 5, flip
// their callsites to `getCostCapStatus()` and remove this comment block.
// TODO(wave-5): collapse v1 `checkCostCap()` into `getCostCapStatus()` once
// the legacy AI-tool routes are removed.
// ─────────────────────────────────────────────────────────────────────────────

export const COST_CAPS = {
  MEMBER_MONTHLY_HARD_CAP_USD: 20,
  MEMBER_MONTHLY_SOFT_WARNING_USD: 15,
} as const;

export interface CostCapStatus {
  hardBlocked: boolean;
  softWarning: boolean;
  monthSpendUsd: number;
  capUsd: number;
}

/**
 * v2 cost-cap status for the data-first pipeline. Admins are never blocked.
 * Member per-user overrides on `aiToolsMonthlyCapOverride` are respected as
 * the effective hard cap (matches v1 behavior).
 */
export async function getCostCapStatus(userId: string): Promise<CostCapStatus> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, aiToolsMonthlyCapOverride: true },
  });

  if (user?.role === "admin") {
    return {
      hardBlocked: false,
      softWarning: false,
      monthSpendUsd: 0,
      capUsd: COST_CAPS.MEMBER_MONTHLY_HARD_CAP_USD,
    };
  }

  const usage = await prisma.aIToolUsage.aggregate({
    where: { userId, createdAt: { gte: startOfMonth() } },
    _sum: { costUsd: true },
  });

  const monthSpendUsd = usage._sum.costUsd
    ? new Decimal(usage._sum.costUsd.toString()).toNumber()
    : 0;

  const capUsd =
    user?.aiToolsMonthlyCapOverride != null
      ? new Decimal(user.aiToolsMonthlyCapOverride.toString()).toNumber()
      : COST_CAPS.MEMBER_MONTHLY_HARD_CAP_USD;

  return {
    hardBlocked: monthSpendUsd >= capUsd,
    softWarning: monthSpendUsd >= COST_CAPS.MEMBER_MONTHLY_SOFT_WARNING_USD,
    monthSpendUsd,
    capUsd,
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
    data: { userId, toolType, inputTokens, outputTokens, costUsd: costUsd.toString(), conversationId },
  });
}

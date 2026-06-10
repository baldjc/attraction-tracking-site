import prisma from "@/lib/prisma";
import Decimal from "decimal.js-light";
import { TIER_CONFIG, isServiceTier, tierBypassesAiCap } from "@/lib/service-tier";

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
    select: { role: true, aiToolsMonthlyCapOverride: true, serviceTier: true },
  });

  // Admins and AI-cap-bypass tiers (Done-With-You) are treated as unlimited.
  // The bypassed tier set is defined ONCE in service-tier.ts (tierBypassesAiCap)
  // so it stays in lockstep with the v2 getCostCapStatus() engine below.
  if (user?.role === "admin" || tierBypassesAiCap(user?.serviceTier)) {
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

// Fallback caps for users whose serviceTier can't be resolved to a canonical
// tier. Mirror the Foundations tier (the most restrictive paid-or-free floor).
export const COST_CAPS = {
  MEMBER_MONTHLY_HARD_CAP_USD: TIER_CONFIG.foundations.monthlyCapUsd,
  MEMBER_MONTHLY_SOFT_WARNING_USD: TIER_CONFIG.foundations.softWarningUsd,
} as const;

export interface CostCapStatus {
  hardBlocked: boolean;
  softWarning: boolean;
  monthSpendUsd: number;
  capUsd: number;
  softWarningUsd: number;
}

/**
 * v2 cost-cap status for the data-first pipeline. Admins are never blocked, and
 * neither are AI-cap-bypass tiers (Done-With-You) — see `tierBypassesAiCap()`.
 *
 * Hard cap + soft-warning threshold are driven by the member's canonical
 * service tier (see `TIER_CONFIG`): Foundations/Production cap at $25 (warn
 * $20), Growth caps at $100 (warn $80); Done-With-You bypasses the cap entirely.
 * A per-user `aiToolsMonthlyCapOverride` still wins over the tier default as the
 * hard cap for non-bypassed tiers.
 */
export async function getCostCapStatus(userId: string): Promise<CostCapStatus> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, aiToolsMonthlyCapOverride: true, serviceTier: true },
  });

  const tierConfig = isServiceTier(user?.serviceTier)
    ? TIER_CONFIG[user.serviceTier]
    : TIER_CONFIG.foundations;

  // Admins and AI-cap-bypass tiers (Done-With-You) are never blocked: treated
  // as unlimited (no hard block, no soft warning). The bypassed tier set lives
  // in ONE place — tierBypassesAiCap() in service-tier.ts — so every AI route
  // that gates on `cap.hardBlocked` honors it automatically.
  if (user?.role === "admin" || tierBypassesAiCap(user?.serviceTier)) {
    return {
      hardBlocked: false,
      softWarning: false,
      monthSpendUsd: 0,
      capUsd: tierConfig.monthlyCapUsd,
      softWarningUsd: tierConfig.softWarningUsd,
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
      : tierConfig.monthlyCapUsd;

  // Soft warning fires at the tier's threshold, but never above the effective
  // hard cap (an override could lower the cap below the tier soft threshold).
  const softWarningUsd = Math.min(tierConfig.softWarningUsd, capUsd);

  return {
    hardBlocked: monthSpendUsd >= capUsd,
    softWarning: monthSpendUsd >= softWarningUsd,
    monthSpendUsd,
    capUsd,
    softWarningUsd,
  };
}

/**
 * Average validationCostUsd over the user's most-recent successful market-data
 * uploads. Used to estimate the budget impact of a (re)upload batch BEFORE we
 * fire validation. Falls back to a $2.75 baseline when the user has no
 * validated history yet — matches the median observed Phase 1 cost.
 */
export async function averageRecentValidationCostUsd(
  userId: string,
  samples = 5,
): Promise<number> {
  const recent = await prisma.marketDataUpload.findMany({
    where: {
      userId,
      status: "validated",
      validationCostUsd: { not: null },
    },
    orderBy: { validatedAt: "desc" },
    take: samples,
    select: { validationCostUsd: true },
  });
  if (recent.length === 0) return 2.75;
  const sum = recent.reduce(
    (acc, r) => acc + Number(r.validationCostUsd ?? 0),
    0,
  );
  return sum / recent.length;
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

/**
 * Admin-impersonation hard-cap exemption.
 *
 * When a real admin is impersonating a member (the "Working for: …" mode), the
 * cost cap is evaluated against the MEMBER's id, so the admin's test generations
 * would otherwise hit the member's monthly hard cap. We exempt ONLY the hard
 * block in that case — tokens are still logged via `logUsage()`, the member's
 * spend still accrues, and real (non-impersonated) members stay fully capped.
 * Editors are intentionally NOT exempted (only `role === "admin"` actors, which
 * is what `ResolvedUser.isAdmin` reflects).
 *
 * Apply at every interactive AI-generation callsite as:
 *   if (cap.hardBlocked && !isHardCapExempt(resolved)) { …402… }
 * Keep the policy here (one predicate) so it never drifts across callsites.
 */
export function isHardCapExempt(
  actor: { isAdmin?: boolean; isImpersonating?: boolean } | null | undefined,
): boolean {
  return !!(actor && actor.isAdmin && actor.isImpersonating);
}

/**
 * Delete a member's `AIToolUsage` rows for the current calendar-month billing
 * period — the exact window `getCostCapStatus()` sums. Returns the number of
 * rows removed. Backs the admin "Reset AI usage (this period)" action so a
 * cost-capped pilot member can keep testing without waiting for the monthly
 * reset. Scoped to one user + the current period only.
 */
export async function resetCurrentPeriodUsage(userId: string): Promise<number> {
  const result = await prisma.aIToolUsage.deleteMany({
    where: { userId, createdAt: { gte: startOfMonth() } },
  });
  return result.count;
}

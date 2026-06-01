/**
 * Member-facing cost presentation.
 *
 * Members NEVER see raw dollar amounts for caps, spend, or cost estimates —
 * only percentages of their monthly Content Tools allowance. Admins (and
 * internal observability views) still see dollars; this module is only used on
 * member-facing surfaces. Impersonation-aware callers pass `isMemberView` so an
 * admin impersonating a member sees what the member sees.
 *
 * Don't introduce a "credits" noun — the pool is "monthly Content Tools".
 */

/** Percentage of the monthly allowance already used, clamped to 0–100. */
export function formatUsagePercent(usedUsd: number, capUsd: number): string {
  if (!(capUsd > 0)) return "0%";
  const pct = Math.min(100, Math.max(0, Math.round((usedUsd / capUsd) * 100)));
  return `${pct}%`;
}

/** Raw clamped percentage number (for progress bars etc). */
export function usagePercentValue(usedUsd: number, capUsd: number): number {
  if (!(capUsd > 0)) return 0;
  return Math.min(100, Math.max(0, (usedUsd / capUsd) * 100));
}

/**
 * Percentage of the monthly allowance a single action is estimated to consume.
 * e.g. a $0.30 action against a $25 cap → "~1%". Sub-1% rounds to "<1%".
 */
export function formatActionImpactPercent(
  actionCostUsd: number,
  capUsd: number,
): string {
  if (!(capUsd > 0) || actionCostUsd <= 0) return "<1%";
  const pct = (actionCostUsd / capUsd) * 100;
  if (pct < 1) return "<1%";
  return `~${Math.round(pct)}%`;
}

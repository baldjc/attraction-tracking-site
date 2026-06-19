/**
 * Routes the onboarding gate must NOT redirect away from while
 * `onboardingComplete` is false.
 *
 * The onboarding wizard deep-links OUT to these pages as part of its own steps
 * (e.g. Step 1 "Open market data setup", Step 5 knowledge base, the final
 * content-planner step, the Step 2 "pull avatar" link). Without this allowlist
 * the gate bounces members straight back to /member/onboarding the moment they
 * click one of those buttons — even in a new tab — making the wizard
 * impossible to complete.
 *
 * Matching is by path PREFIX (`startsWith`) so sub-routes are covered
 * (e.g. /member/market-data/setup, /member/market-data/config).
 *
 * Add a new prefix here whenever onboarding gains a step that links out to
 * another member page. Keep it as this single source of truth — do not scatter
 * the paths inline in the gate or the banner.
 */
export const ONBOARDING_ALLOWED_PREFIXES = [
  "/member/onboarding", // the wizard itself
  "/member/market-data", // Step 1 — market data setup/config
  "/member/knowledge-base", // Step 5 — research upload
  "/member/content-planner", // final step — first plan
  "/member/content-tools/avatar-architect", // Step 2 — "pull avatar"
] as const;

/**
 * True when `pathname` is one of the onboarding helper destinations the gate
 * must leave alone while onboarding is incomplete.
 */
export function isOnboardingAllowedPath(pathname: string): boolean {
  return ONBOARDING_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * True when `pathname` is an onboarding HELPER page (an allowed destination
 * other than the wizard itself) — i.e. where the "← Back to setup" affordance
 * should appear while onboarding is incomplete.
 */
export function isOnboardingHelperPath(pathname: string): boolean {
  if (pathname === "/member/onboarding") return false;
  return isOnboardingAllowedPath(pathname);
}

/**
 * Canonical email normalizer.
 *
 * Used as the matching key whenever members are looked up or created by email
 * (manual admin add, GHL sync, etc.) so that the same address always resolves
 * to the same member regardless of surrounding whitespace or letter case.
 * Reuse this everywhere — do NOT inline a slightly-different trim/lowercase.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

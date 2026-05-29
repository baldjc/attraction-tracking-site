export const IMPERSONATE_COOKIE = "abv-impersonate-id";
export const IMPERSONATE_LS_KEY = "abv_impersonate";

/**
 * Parse the impersonation cookie value. New format is "<ownerId>:<memberId>"
 * so a stale cookie left on a shared device cannot apply to whoever logs in
 * next. Legacy unprefixed cookies are treated as invalid.
 *
 * Returns the memberId only when the cookie's ownerId matches the
 * current signed-in account.
 */
export function parseImpersonateCookie(
  rawValue: string | null | undefined,
  currentUserId: string | null | undefined,
): string | null {
  if (!rawValue || !currentUserId) return null;
  if (!rawValue.includes(":")) return null;
  const [ownerId, memberId] = rawValue.split(":");
  if (!ownerId || !memberId) return null;
  if (ownerId !== currentUserId) return null;
  return memberId;
}

export const IMPERSONATE_COOKIE = "abv-impersonate-id";
export const IMPERSONATE_LS_KEY = "abv_impersonate";

/**
 * When an admin/editor is impersonating a member, this cookie (value "true")
 * re-enables the staff feature bypass so the admin can navigate v2 features to
 * debug/support — while still scoped to the member's data. Absent/anything-else
 * means "Member view": see exactly what the member sees.
 */
export const IMPERSONATE_ADMIN_VIEW_COOKIE = "impersonate_admin_view";

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

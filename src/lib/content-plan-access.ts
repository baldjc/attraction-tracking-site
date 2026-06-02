// Content-plan editor access diagnosis.
//
// The member editor route at /api/member/content-plans/[id] resolves the
// viewer via resolveUserFromSession() (which honours admin impersonation) and
// scopes the plan lookup to that user id. When the scoped lookup misses, the
// member must only ever see the generic "Plan not found" copy — but an admin
// (debugging a member's planner) deserves the actual cause so they can act:
//
//   - deleted     → the plan exists and is soft-deleted (offer Restore)
//   - wrong_owner → the plan exists but belongs to a different member than the
//                   resolved/impersonated user (impersonation context is off)
//   - not_found   → no such plan row at all
//
// This module is the single, pure decision point so the route and its tests
// agree on the mapping. The route performs the (admin-only) unscoped lookup
// and feeds both results in here.

export type PlanAccessReason = "ok" | "not_found" | "deleted" | "wrong_owner";

export interface PlanAccessInput {
  /** The plan as found by the owner-scoped query `{ id, userId }`, or null. */
  scopedPlan: { deletedAt: Date | null } | null;
  /**
   * The plan as found by an UNSCOPED lookup on the id alone. Only populated
   * for admins (member-privacy: never run this lookup for a non-admin viewer).
   */
  unscopedPlan: { userId: string; deletedAt: Date | null } | null;
  /** The resolved (possibly impersonated) viewer's user id. */
  resolvedUserId: string;
  /** True when the actual signed-in account is an admin. */
  isAdmin: boolean;
}

export interface PlanAccessResult {
  reason: PlanAccessReason;
  /** HTTP status the route should return: 200 (ok), 404, or 410 (deleted). */
  status: number;
  /** Admin-only diagnostic flag — drives the actionable editor copy. */
  admin?: boolean;
  /** ISO timestamp of soft-deletion, admin-only. */
  deletedAt?: string | null;
  /** Owner user id of the plan, admin-only (used to build the restore URL). */
  ownerUserId?: string;
}

export function resolvePlanAccess(input: PlanAccessInput): PlanAccessResult {
  const { scopedPlan, unscopedPlan, resolvedUserId, isAdmin } = input;

  // Visible to the resolved viewer. The scoped query intentionally does NOT
  // filter deletedAt, so a soft-deleted plan the viewer owns lands here.
  if (scopedPlan) {
    if (scopedPlan.deletedAt) {
      return {
        reason: "deleted",
        status: 410,
        ...(isAdmin
          ? {
              admin: true,
              deletedAt: scopedPlan.deletedAt.toISOString(),
              ownerUserId: resolvedUserId,
            }
          : {}),
      };
    }
    return { reason: "ok", status: 200 };
  }

  // Not visible to the resolved viewer. Members only ever get the generic
  // not-found — never reveal that a row exists or belongs to someone else.
  if (!isAdmin) {
    return { reason: "not_found", status: 404 };
  }

  // Admin diagnosis from the unscoped lookup.
  if (!unscopedPlan) {
    return { reason: "not_found", status: 404 };
  }
  if (unscopedPlan.userId !== resolvedUserId) {
    return {
      reason: "wrong_owner",
      status: 404,
      admin: true,
      ownerUserId: unscopedPlan.userId,
      deletedAt: unscopedPlan.deletedAt ? unscopedPlan.deletedAt.toISOString() : null,
    };
  }

  // Owned by the resolved viewer yet missed by the scoped query — only
  // reachable if that query gains a deletedAt filter in future. Treat as
  // deleted so the admin still gets a restore path rather than a dead end.
  return {
    reason: "deleted",
    status: 410,
    admin: true,
    deletedAt: unscopedPlan.deletedAt ? unscopedPlan.deletedAt.toISOString() : null,
    ownerUserId: unscopedPlan.userId,
  };
}

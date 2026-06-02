---
name: Content-plan editor 404 vs 410 semantics
description: Why a "Plan not found" 404 in the content-plan editor means ownership mismatch, not soft-delete; and how admin-only diagnostics must stay gated.
---

# Content-plan editor: 404 means wrong owner, not deleted

The member editor API `GET /api/member/content-plans/[id]` scopes its lookup to
`findFirst({ where: { id, userId: resolvedUserId } })` with **no** `deletedAt`
filter, then returns **410** if `plan.deletedAt` is set, else 200.

**Consequence:** a soft-deleted plan *owned by the resolved viewer* still returns
**410** (the friendly "This video was deleted" page). The generic **404**
("doesn't belong to your account") can therefore only mean the scoped lookup
missed — i.e. an **ownership mismatch**: the resolved (possibly impersonated)
`userId` ≠ the plan's owner.

**Why this matters for debugging:** when an admin hits the 404 while debugging a
member's planner, the cause is that impersonation didn't resolve to the plan's
owner (cookie not set / resolved to the admin's own id), NOT a migration that
soft-deleted archived plans. The deletedAt-migration hypothesis is contradicted
by the 410 path. `resolveUserFromSession` reads the impersonation cookie
(`"<ownerId>:<memberId>"`, ownerId must == session id) correctly.

**How to apply:** to diagnose the true cause for admins, run a second *unscoped*
`findUnique({ id })` ONLY when `user.isAdmin` and the scoped query missed, then
classify via `resolvePlanAccess()` (`src/lib/content-plan-access.ts`) into
`ok | not_found | deleted | wrong_owner`.

**Member-privacy invariant:** never run the unscoped lookup for a non-admin, and
never emit `deletedAt`/`ownerUserId`/`wrong_owner` to a non-admin — members must
always get the generic `not_found`. The admin Restore-from-404 action targets
`PUT /api/admin/members/<ownerUserId>/content-plans/<planId>` `{restore:true}`,
which is gated by raw `auth()` role (admin/editor) + `canStaffAccessMember`,
independent of impersonation state — so it is the correct trust boundary.

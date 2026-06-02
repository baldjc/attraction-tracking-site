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

## Admin content-calendar list reads admin API but editor needs impersonation

`/admin/content-calendar` shows a member's plans by passing an *admin* `apiBase`
(`/api/admin/members/<id>/content-plans`) to the shared `ContentPlannerClient` —
that list authorizes by raw session role and needs NO impersonation. But a row
click navigates to the *member-scoped* editor `/member/content-planner/<id>`,
which resolves the viewer via the impersonation cookie. So without impersonation
the admin hits the `wrong_owner` page on every video. Fix: set impersonation
(POST `/api/admin/impersonate {memberId}`) when the admin selects the member.

**Two-channel impersonation gotcha:** the server cookie drives
`resolveUserFromSession`, but the visible "Working for"/Sidebar indicators read
**`localStorage[IMPERSONATE_LS_KEY]`** (`{memberId, memberName, targetRole}`)
— a *separate* channel. Setting only the cookie creates hidden global state
(admin silently acts as the member elsewhere with no banner). Always write BOTH,
matching `WorkingForBanner.selectMember`. Do NOT clear impersonation on this
page's unmount — navigating to the editor unmounts it and the editor needs the
cookie. Gate the select flow on the impersonate `response.ok`, and guard rapid
member switches with a monotonic ref so a slow earlier select can't overwrite a
later one's state/localStorage.

---
name: Impersonation auth dual-behavior
description: How admin impersonation interacts with admin-only API routes vs. /member page feature-flag gating — the two behave oppositely.
---

Admin/editor impersonation is **cookie-based** (`abv-impersonate-id`, format `<ownerId>:<memberId>`), not a re-login. The raw NextAuth session is unchanged, so `session.user.role` stays the real account's role.

Two consequences pull in opposite directions:

1. **Admin-only API routes authorize during impersonation.** Routes that check `auth()` → `role === "admin"` (e.g. the market-data revalidate endpoint) WILL authorize while an admin impersonates a member, because the session role is still `admin`. `resolveUserFromSession()` likewise returns `isAdmin: true` while impersonating (it derives `isAdmin` from the real role) but swaps `id`/`email` to the impersonated member. Use `resolved.isAdmin` to gate admin-only UI that should remain visible while impersonating.

2. **/member pages drop the staff feature-flag bypass while impersonating.** `getFeatureFlags` intentionally evaluates the impersonated member's own allowlist (no staff bypass) so the admin sees exactly what the member sees — including hard redirects. So a `/member/*` page guarded by a member feature flag (e.g. `tool_market_data`) will redirect the impersonating admin away if that member lacks the flag.

**Why:** the impersonation philosophy (see `src/app/member/layout.tsx` comments) is "show exactly what the member sees" — so member-facing gating applies to the member's flags, while backend admin authority is unaffected.

**How to apply:** to make an admin action available on a member-facing page during impersonation, gate the UI on `resolveUserFromSession().isAdmin` and point it at an admin API route — do NOT rely on the page itself bypassing member feature flags. If an admin needs access regardless of the member's flags, use a dedicated admin surface instead of altering the /member page gating.

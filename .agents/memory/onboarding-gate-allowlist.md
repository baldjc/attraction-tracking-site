---
name: Onboarding gate allowlist coupling
description: The member onboarding gate redirects ALL /member routes to the wizard while incomplete; new wizard deep-links must be added to the allowlist or they bounce.
---

# Onboarding gate allowlist coupling

While `onboardingComplete === false`, a client gate (`OnboardingRedirect`, rendered in
`MemberLayoutShell`) redirects every `/member/*` route to `/member/onboarding` unless the
path is in `ONBOARDING_ALLOWED_PREFIXES` (`src/components/onboarding/onboarding-allowlist.ts`).
The wizard's own steps deep-link OUT to helper pages (market data, knowledge base, content
planner, avatar architect), so those prefixes are allowlisted.

**Why:** without the allowlist the gate bounced members off the very pages the wizard told
them to use — even in a new tab — making onboarding impossible to finish. The bug is
**invisible to admins** (their onboarding is complete), so it must be verified as an
incomplete-onboarding member.

**How to apply:** whenever you add an onboarding step that links to another `/member` page,
add that prefix to `ONBOARDING_ALLOWED_PREFIXES`. Prefix matching is exact-or-`startsWith(prefix + "/")`
so siblings like `/member/market-data-export` do NOT match `/member/market-data`. The
"← Back to setup" affordance (`BackToSetupBanner`) keys off `isOnboardingHelperPath` (allowlist
minus the wizard route itself), so a new helper page automatically gets the banner too.

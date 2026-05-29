import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { resolveUserFromSession } from "@/lib/session-utils";
import { getFeatureFlags, DEFAULT_FLAGS } from "@/lib/feature-flags";
import { IMPERSONATE_ADMIN_VIEW_COOKIE } from "@/lib/impersonate-constants";
import MemberLayoutShell from "@/components/onboarding/MemberLayoutShell";

export default async function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Impersonation-aware: userId resolves to the impersonated member so per-user
  // allowlist flags resolve for them, while role stays the real account's role
  // so the admin/editor feature bypass below still applies.
  const resolved = await resolveUserFromSession();

  if (!resolved) {
    redirect("/login");
  }

  const role = resolved.role as string;
  const userId = resolved.id;
  const isStaff = role === "admin" || role === "editor";

  // "Admin view" override: while impersonating a member, the admin can re-enable
  // the staff bypass to navigate v2 features for support/debugging.
  const adminViewOverride =
    isStaff && resolved.isImpersonating
      ? (await cookies()).get(IMPERSONATE_ADMIN_VIEW_COOKIE)?.value === "true"
      : false;

  // Staff browsing /member directly (not impersonating) always see every
  // feature. While impersonating, getFeatureFlags decides what to show: the
  // member's actual access in "Member view", or the full staff bypass in
  // "Admin view" (driven by the impersonation + admin-view cookies).
  const featureFlags =
    isStaff && !resolved.isImpersonating
      ? { ...DEFAULT_FLAGS }
      : await getFeatureFlags({ userId, userRole: role });

  return (
    <MemberLayoutShell
      role={role}
      userName={resolved.email || "Member"}
      featureFlags={featureFlags}
      adminViewOverride={adminViewOverride}
      actingAsTeamMember={resolved.actingAsTeamMember ?? false}
      teamPrimaryName={resolved.teamPrimaryName ?? null}
    >
      {children}
    </MemberLayoutShell>
  );
}

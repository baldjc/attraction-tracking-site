import { redirect } from "next/navigation";
import { resolveUserFromSession } from "@/lib/session-utils";
import { getFeatureFlags, DEFAULT_FLAGS } from "@/lib/feature-flags";
import MemberLayoutShell from "@/components/onboarding/MemberLayoutShell";
import { ToastProvider } from "@/components/ToastProvider";

export default async function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Impersonation-aware: userId resolves to the impersonated member so per-user
  // allowlist flags resolve for them. role stays the real account's role, but
  // while impersonating the staff feature bypass is intentionally dropped (see
  // featureFlags below) so the sidebar shows exactly what the member sees.
  const resolved = await resolveUserFromSession();

  if (!resolved) {
    redirect("/login");
  }

  const role = resolved.role as string;
  const userId = resolved.id;
  const isStaff = role === "admin" || role === "editor";

  // Staff browsing /member directly (not impersonating) see every feature —
  // visibility toggles only apply to regular members. While impersonating, we
  // resolve the IMPERSONATED member's actual access instead: getFeatureFlags
  // drops the staff bypass when the impersonation cookie is present and
  // evaluates the member's allowlist (via userId), so the sidebar shows exactly
  // what that member sees — including v2/beta features they're allowlisted for.
  const featureFlags =
    isStaff && !resolved.isImpersonating
      ? { ...DEFAULT_FLAGS }
      : await getFeatureFlags({ userId, userRole: role });

  return (
    <MemberLayoutShell
      role={role}
      userName={resolved.email || "Member"}
      featureFlags={featureFlags}
      actingAsTeamMember={resolved.actingAsTeamMember ?? false}
      teamPrimaryName={resolved.teamPrimaryName ?? null}
    >
      <ToastProvider>{children}</ToastProvider>
    </MemberLayoutShell>
  );
}

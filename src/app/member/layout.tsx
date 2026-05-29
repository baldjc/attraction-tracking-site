import { redirect } from "next/navigation";
import { resolveUserFromSession } from "@/lib/session-utils";
import { getFeatureFlags, DEFAULT_FLAGS } from "@/lib/feature-flags";
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

  // Admins and editors always see every feature — feature visibility
  // toggles only apply to regular members. We still pass userId/userRole so
  // per-user allowlist v2 flags resolve for the Jared Chamberlain member
  // account (a regular member with explicit allowlist entries).
  const featureFlags =
    role === "admin" || role === "editor"
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
      {children}
    </MemberLayoutShell>
  );
}

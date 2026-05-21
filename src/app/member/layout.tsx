import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getFeatureFlags, DEFAULT_FLAGS } from "@/lib/feature-flags";
import MemberLayoutShell from "@/components/onboarding/MemberLayoutShell";

export default async function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const role = (session.user as any).role as string;
  const userId = (session.user as any).id as string | undefined;

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
      userName={session.user.name || session.user.email || "Member"}
      featureFlags={featureFlags}
    >
      {children}
    </MemberLayoutShell>
  );
}

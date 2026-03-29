import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getFeatureFlags } from "@/lib/feature-flags";
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

  const featureFlags = await getFeatureFlags();

  return (
    <MemberLayoutShell
      role={(session.user as any).role}
      userName={session.user.name || session.user.email || "Member"}
      featureFlags={featureFlags}
    >
      {children}
    </MemberLayoutShell>
  );
}

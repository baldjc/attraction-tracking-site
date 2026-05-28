import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getFeatureFlags } from "@/lib/feature-flags";

export default async function CampaignsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Intentionally NOT impersonation-aware: this layout only gates feature
  // visibility off the actual signed-in account's role (admins/editors always
  // pass). Resolves to the real session, never the impersonated member.
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = (session.user as any).role;

  if (role !== "admin" && role !== "editor") {
    const flags = await getFeatureFlags();
    if (flags.campaigns === false) {
      redirect("/member/scores");
    }
  }

  return <>{children}</>;
}

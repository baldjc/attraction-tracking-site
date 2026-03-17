import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getFeatureFlags } from "@/lib/feature-flags";

export default async function CampaignsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isAdmin = (session.user as any).role === "admin";
  if (!isAdmin) {
    const flags = await getFeatureFlags();
    if (flags.campaigns === false) {
      redirect("/member/scores");
    }
  }

  return <>{children}</>;
}

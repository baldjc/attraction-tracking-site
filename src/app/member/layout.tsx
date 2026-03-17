import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import { getFeatureFlags } from "@/lib/feature-flags";

export default async function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const isAdmin = (session.user as any).role === "admin";
  const featureFlags = isAdmin ? null : await getFeatureFlags();

  return (
    <div className="min-h-screen bg-[#f1f1ef]">
      <Sidebar
        role={(session.user as any).role}
        userName={session.user.name || session.user.email || "Member"}
        featureFlags={featureFlags}
      />
      <main className="lg:pl-[260px]">
        <div className="pt-14 lg:pt-0">
          <div className="p-6 lg:p-8">{children}</div>
        </div>
      </main>
    </div>
  );
}

"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import OnboardingRedirect from "@/components/onboarding/OnboardingRedirect";
import { SidebarProvider, useSidebar } from "@/components/SidebarContext";
import AnnouncementModal from "@/components/announcements/AnnouncementModal";
import TeamAccessBanner from "@/components/team/TeamAccessBanner";

interface Props {
  children: React.ReactNode;
  role: string;
  userName: string;
  featureFlags: Record<string, boolean>;
  actingAsTeamMember?: boolean;
  teamPrimaryName?: string | null;
}

function MemberShellInner({
  children,
  role,
  userName,
  featureFlags,
  actingAsTeamMember,
  teamPrimaryName,
}: Props) {
  const pathname = usePathname();
  const { collapsed } = useSidebar();
  const isOnboarding = pathname === "/member/onboarding";

  if (isOnboarding) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[var(--abv-bg)] dark:bg-[#0f1419]">
      <Sidebar role={role} userName={userName} featureFlags={featureFlags} />
      <main className={`transition-all duration-300 ease-in-out ${collapsed ? "lg:pl-16" : "lg:pl-[260px]"}`}>
        {actingAsTeamMember && <TeamAccessBanner primaryName={teamPrimaryName} />}
        <div className="pt-14 lg:pt-0">
          <div className="p-6 lg:p-8">
            <div className="animate-fade-in-up">
              <OnboardingRedirect />
              {children}
            </div>
          </div>
        </div>
      </main>
      <AnnouncementModal />
    </div>
  );
}

export default function MemberLayoutShell(props: Props) {
  return (
    <SidebarProvider>
      <MemberShellInner {...props} />
    </SidebarProvider>
  );
}

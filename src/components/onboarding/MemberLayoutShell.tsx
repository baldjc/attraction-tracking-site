"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import OnboardingRedirect from "@/components/onboarding/OnboardingRedirect";
import HelpWidget from "@/components/help/HelpWidget";
import { SidebarProvider, useSidebar } from "@/components/SidebarContext";

interface Props {
  children: React.ReactNode;
  role: string;
  userName: string;
  featureFlags: Record<string, boolean>;
}

function MemberShellInner({ children, role, userName, featureFlags }: Props) {
  const pathname = usePathname();
  const { collapsed } = useSidebar();
  const isOnboarding = pathname === "/member/onboarding";

  if (isOnboarding) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[#f7f6f3] dark:bg-[#0f1419]">
      <Sidebar role={role} userName={userName} featureFlags={featureFlags} />
      <main className={`transition-all duration-300 ease-in-out ${collapsed ? "lg:pl-16" : "lg:pl-[260px]"}`}>
        <div className="pt-14 lg:pt-0">
          <div className="p-6 lg:p-8">
            <div className="animate-fade-in-up">
              <OnboardingRedirect />
              {children}
            </div>
          </div>
        </div>
      </main>
      <HelpWidget />
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

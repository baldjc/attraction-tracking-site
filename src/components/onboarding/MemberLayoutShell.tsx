"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import OnboardingRedirect from "@/components/onboarding/OnboardingRedirect";
import HelpWidget from "@/components/help/HelpWidget";

interface Props {
  children: React.ReactNode;
  role: string;
  userName: string;
  featureFlags: Record<string, boolean>;
}

export default function MemberLayoutShell({ children, role, userName, featureFlags }: Props) {
  const pathname = usePathname();
  const isOnboarding = pathname === "/member/onboarding";

  if (isOnboarding) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[#f7f6f3] dark:bg-[#0f1419]">
      <Sidebar role={role} userName={userName} featureFlags={featureFlags} />
      <main className="lg:pl-[260px]">
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

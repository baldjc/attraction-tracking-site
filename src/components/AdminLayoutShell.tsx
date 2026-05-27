"use client";

import Sidebar from "@/components/Sidebar";
import { SidebarProvider, useSidebar } from "@/components/SidebarContext";

interface Props {
  children: React.ReactNode;
  role: string;
  userName: string;
}

function AdminShellInner({ children, role, userName }: Props) {
  const { collapsed } = useSidebar();

  return (
    <div className="min-h-screen bg-[var(--abv-bg)] dark:bg-[#0f1419]">
      <div className="print:hidden">
        <Sidebar role={role} userName={userName} featureFlags={null} />
      </div>
      <main className={`transition-all duration-300 ease-in-out print:pl-0 ${collapsed ? "lg:pl-16" : "lg:pl-[260px]"}`}>
        <div className="pt-14 lg:pt-0 print:pt-0">
          <div className="p-6 lg:p-8 print:p-0">
            <div className="animate-fade-in-up">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function AdminLayoutShell(props: Props) {
  return (
    <SidebarProvider>
      <AdminShellInner {...props} />
    </SidebarProvider>
  );
}

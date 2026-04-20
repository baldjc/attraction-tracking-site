import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import { ToastProvider } from "@/components/ToastProvider";
import { isReviewerEnabled } from "@/lib/reviewer-flag";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const role = (session.user as any).role;

  if (role !== "admin" && role !== "editor") {
    redirect("/member/scores");
  }

  const reviewerEnabled = role === "admin" ? await isReviewerEnabled() : false;

  return (
    <div className="min-h-screen bg-[#f7f6f3] dark:bg-[#0f1419]">
      <div className="print:hidden">
        <Sidebar
          role={role}
          userName={session.user.name || session.user.email || "Admin"}
          featureFlags={{ tool_analytics_reviewer: reviewerEnabled }}
        />
      </div>
      <main className="lg:pl-[260px] print:pl-0">
        <div className="pt-14 lg:pt-0 print:pt-0">
          <div className="p-6 lg:p-8 print:p-0">
            <ToastProvider>
              <div className="animate-fade-in-up">{children}</div>
            </ToastProvider>
          </div>
        </div>
      </main>
    </div>
  );
}

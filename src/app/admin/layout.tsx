import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if ((session.user as any).role !== "admin") {
    redirect("/member/scores");
  }

  return (
    <div className="min-h-screen bg-[#f1f1ef]">
      <div className="print:hidden">
        <Sidebar
          role="admin"
          userName={session.user.name || session.user.email || "Admin"}
          featureFlags={null}
        />
      </div>
      <main className="lg:pl-[260px] print:pl-0">
        <div className="pt-14 lg:pt-0 print:pt-0">
          <div className="p-6 lg:p-8 print:p-0">{children}</div>
        </div>
      </main>
    </div>
  );
}

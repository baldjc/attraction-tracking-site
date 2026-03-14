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
      <Sidebar
        role="admin"
        userName={session.user.name || session.user.email || "Admin"}
      />
      <main className="lg:pl-[260px]">
        <div className="pt-14 lg:pt-0">
          <div className="p-6 lg:p-8">{children}</div>
        </div>
      </main>
    </div>
  );
}

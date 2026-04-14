import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import AdminDashboard from "./AdminDashboard";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = (session.user as any).role;
  if (role === "member" || role === "foundations_member") {
    redirect("/member/scores");
  }
  return <AdminDashboard />;
}
